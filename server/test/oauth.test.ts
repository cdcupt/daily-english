import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { generateKeyPairSync, createSign, type JsonWebKey } from 'node:crypto';
import { decideLink } from '../src/auth/linking.js';
import {
  verifyGoogle, verifyApple, setJwksFetcher, clearJwksCache, OAuthError,
} from '../src/auth/oauth.js';
import {
  appleConfigured, upsertIdentity, isRateLimited, resetRateLimit, type IdentityStore,
} from '../src/routes/oauth.js';
import { buildApp } from '../src/app.js';
import type { VerifiedIdentity } from '../src/auth/oauth.js';
import { issueToken, verifyToken, tokenVersionOf } from '../src/auth/tokens.js';

// These must match test/setup.ts (loaded before src/env.ts).
const GOOGLE_AUD = 'test-google-client.apps.googleusercontent.com';
const APPLE_AUD = 'com.cdcupt.dailyenglish.web';
const GOOGLE_ISS = 'https://accounts.google.com';
const APPLE_ISS = 'https://appleid.apple.com';

// ---------- In-test RSA keypair + JWS minting (hermetic, no network) ----------
const KID = 'test-key-1';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_JWK: JsonWebKey & { kid: string; alg: string; use: string } = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KID,
  alg: 'RS256',
  use: 'sig',
};

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

interface MintOpts {
  kid?: string;
  alg?: string;
  iss: string;
  aud: string;
  sub?: string;
  email?: string;
  emailVerified?: boolean | string;
  exp?: number;
  iat?: number;
  nonce?: string;
  tamper?: boolean;
}

function mintIdToken(opts: MintOpts): string {
  const header = { alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: opts.iss,
    aud: opts.aud,
    sub: opts.sub ?? 'provider-sub-123',
    exp: opts.exp ?? now + 3600,
    iat: opts.iat ?? now,
  };
  if (opts.email !== undefined) payload['email'] = opts.email;
  if (opts.emailVerified !== undefined) payload['email_verified'] = opts.emailVerified;
  if (opts.nonce !== undefined) payload['nonce'] = opts.nonce;

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(privateKey).toString('base64url');
  const finalSig = opts.tamper ? sig.slice(0, -2) + (sig.endsWith('a') ? 'b' : 'a') : sig;
  return `${signingInput}.${finalSig}`;
}

beforeEach(() => {
  clearJwksCache();
  setJwksFetcher(async () => [PUBLIC_JWK]); // stub the provider JWKS
});

afterAll(() => {
  setJwksFetcher(); // restore the real fetcher
});

// ---------- verifyGoogle / verifyApple ----------
describe('verifyGoogle', () => {
  it('accepts a valid Google ID token and captures sub + email', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, sub: 'g-1', email: 'a@example.com', emailVerified: true });
    const identity = await verifyGoogle(token);
    expect(identity).toEqual({ provider: 'google', sub: 'g-1', email: 'a@example.com', emailVerified: true });
  });

  it('accepts the bare-host issuer variant', async () => {
    const token = mintIdToken({ iss: 'accounts.google.com', aud: GOOGLE_AUD, sub: 'g-2' });
    const identity = await verifyGoogle(token);
    expect(identity.sub).toBe('g-2');
  });

  it('rejects a wrong audience', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: 'someone-elses-client', sub: 'g-3' });
    await expect(verifyGoogle(token)).rejects.toThrow(OAuthError);
  });

  it('rejects a wrong issuer', async () => {
    const token = mintIdToken({ iss: 'https://evil.example.com', aud: GOOGLE_AUD });
    await expect(verifyGoogle(token)).rejects.toThrow(/issuer/);
  });

  it('rejects an expired token', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, exp: Math.floor(Date.now() / 1000) - 600 });
    await expect(verifyGoogle(token)).rejects.toThrow(/expired/);
  });

  it('rejects a token issued in the future beyond clock skew (F5)', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600; // 1h ahead, well past the 60s skew
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, iat: future });
    await expect(verifyGoogle(token)).rejects.toThrow(/not yet valid/);
  });

  it('accepts an iat within the clock-skew tolerance', async () => {
    const slightlyAhead = Math.floor(Date.now() / 1000) + 30; // inside the 60s skew window
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, sub: 'g-skew', iat: slightlyAhead });
    await expect(verifyGoogle(token)).resolves.toMatchObject({ sub: 'g-skew' });
  });

  it('rejects a non-RSA signing key (key type mismatch, F6)', async () => {
    // JWKS returns an EC key under the token's kid → reject before verifying.
    setJwksFetcher(async () => [{ ...PUBLIC_JWK, kty: 'EC' }]);
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD });
    await expect(verifyGoogle(token)).rejects.toThrow(/key type mismatch/);
  });

  it('rejects a JWK whose declared use is not "sig" (F6)', async () => {
    setJwksFetcher(async () => [{ ...PUBLIC_JWK, use: 'enc' }]);
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD });
    await expect(verifyGoogle(token)).rejects.toThrow(/key type mismatch/);
  });

  it('rejects a tampered signature', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, tamper: true });
    await expect(verifyGoogle(token)).rejects.toThrow(/signature/);
  });

  it('rejects an unknown kid (no matching signing key)', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, kid: 'unknown-kid' });
    await expect(verifyGoogle(token)).rejects.toThrow(/signing key/);
  });

  it('rejects a non-RS256 alg', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, alg: 'HS256' });
    await expect(verifyGoogle(token)).rejects.toThrow(/alg/);
  });

  it('rejects a malformed token', async () => {
    await expect(verifyGoogle('not.a.valid')).rejects.toThrow(OAuthError);
    await expect(verifyGoogle('only-one-segment')).rejects.toThrow(/malformed/);
  });

  it('enforces nonce when provided', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, nonce: 'n-123' });
    await expect(verifyGoogle(token, 'n-123')).resolves.toMatchObject({ sub: 'provider-sub-123' });
    await expect(verifyGoogle(token, 'wrong-nonce')).rejects.toThrow(/nonce/);
  });
});

describe('verifyApple', () => {
  it('accepts a valid Apple identity token', async () => {
    const token = mintIdToken({ iss: APPLE_ISS, aud: APPLE_AUD, sub: 'apple-1', email: 'relay@privaterelay.appleid.com', emailVerified: true });
    const identity = await verifyApple(token);
    expect(identity).toEqual({
      provider: 'apple', sub: 'apple-1', email: 'relay@privaterelay.appleid.com', emailVerified: true,
    });
  });

  it("treats Apple's string email_verified 'true' as verified", async () => {
    const token = mintIdToken({ iss: APPLE_ISS, aud: APPLE_AUD, sub: 'apple-2', email: 'x@example.com', emailVerified: 'true' });
    const identity = await verifyApple(token);
    expect(identity.emailVerified).toBe(true);
  });

  it('accepts the iOS bundle id audience (native flow)', async () => {
    const token = mintIdToken({ iss: APPLE_ISS, aud: 'com.cdcupt.DailyEnglish', sub: 'apple-ios' });
    const identity = await verifyApple(token);
    expect(identity.sub).toBe('apple-ios');
  });

  it('rejects a Google-issued token (wrong issuer for Apple)', async () => {
    const token = mintIdToken({ iss: GOOGLE_ISS, aud: APPLE_AUD });
    await expect(verifyApple(token)).rejects.toThrow(/issuer/);
  });

  it('returns emailVerified=false when the provider omits the claim', async () => {
    const token = mintIdToken({ iss: APPLE_ISS, aud: APPLE_AUD, email: 'x@example.com' });
    const identity = await verifyApple(token);
    expect(identity.emailVerified).toBe(false);
  });
});

// ---------- F2: JWKS fetch amplification guards ----------
describe('JWKS refetch cooldown + in-flight de-dup', () => {
  it('does not refetch the same JWKS URL again within the 30s cooldown (F2)', async () => {
    // Fetcher always returns a key whose kid never matches the token → every
    // verify is a kid-miss. Without the cooldown, each verify would refetch
    // forever; with it, the second verify (cache already populated) must NOT.
    const fetcher = vi.fn(async () => [{ ...PUBLIC_JWK, kid: 'rotated-away' }]);
    setJwksFetcher(fetcher);

    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, kid: 'wanted-kid' });

    // First verify: cold cache → 1 fill fetch, then 1 allowed kid-miss refetch.
    await expect(verifyGoogle(token)).rejects.toThrow(/signing key/);
    const callsAfterFirst = fetcher.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

    // Second verify (ms later, within cooldown): cache is warm and the refetch
    // is suppressed → fetch count must not grow.
    await expect(verifyGoogle(token)).rejects.toThrow(/signing key/);
    expect(fetcher.mock.calls.length).toBe(callsAfterFirst);
  });

  it('shares one in-flight fetch across concurrent verifies for the same URL (F2)', async () => {
    let resolveFetch: (keys: typeof PUBLIC_JWK[]) => void = () => {};
    const fetcher = vi.fn(() => new Promise<typeof PUBLIC_JWK[]>((res) => { resolveFetch = res; }));
    setJwksFetcher(fetcher);

    const token = mintIdToken({ iss: GOOGLE_ISS, aud: GOOGLE_AUD, sub: 'g-concurrent' });
    const p1 = verifyGoogle(token);
    const p2 = verifyGoogle(token);
    // Both verifies are awaiting the SAME in-flight fetch — only one network call.
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFetch([PUBLIC_JWK]);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.sub).toBe('g-concurrent');
    expect(r2.sub).toBe('g-concurrent');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// ---------- Linking state machine (OAuth v1: attach + sign-in, no merge) ----------
describe('decideLink', () => {
  const base = {
    provider: 'google' as const,
    sub: 'sub-1',
    email: 'a@example.com',
    emailVerified: true,
    deviceUserId: null as string | null,
    identityUserId: null as string | null,
    emailUser: null as { id: string; email: string | null } | null,
    deviceUser: null as { id: string; email: string | null } | null,
  };

  it('signs in when the (provider, sub) identity already exists', () => {
    const plan = decideLink({ ...base, identityUserId: 'acct-7' });
    expect(plan).toEqual({ kind: 'sign_in', userId: 'acct-7', outcome: 'login' });
  });

  it('identity match wins even when a device + email user are present', () => {
    const plan = decideLink({
      ...base, identityUserId: 'acct-7',
      deviceUserId: 'dev-1', deviceUser: { id: 'dev-1', email: null },
      emailUser: { id: 'acct-9', email: 'a@example.com' },
    });
    expect(plan).toEqual({ kind: 'sign_in', userId: 'acct-7', outcome: 'login' });
  });

  it('links a new identity to a verified-email account', () => {
    const plan = decideLink({ ...base, emailUser: { id: 'acct-9', email: 'a@example.com' } });
    expect(plan).toEqual({ kind: 'link_to_email_user', userId: 'acct-9', outcome: 'linked_provider' });
  });

  it('does NOT auto-link by email when the email is unverified', () => {
    const plan = decideLink({
      ...base, emailVerified: false, emailUser: { id: 'acct-9', email: 'a@example.com' },
      deviceUserId: 'dev-1', deviceUser: { id: 'dev-1', email: null },
    });
    // Falls through to device attach instead of linking on an unverified email.
    expect(plan).toEqual({ kind: 'attach_device', userId: 'dev-1', outcome: 'attached' });
  });

  it('attaches to an anonymous device with no email yet', () => {
    const plan = decideLink({ ...base, deviceUserId: 'dev-1', deviceUser: { id: 'dev-1', email: null } });
    expect(plan).toEqual({ kind: 'attach_device', userId: 'dev-1', outcome: 'attached' });
  });

  it('does NOT attach when the device user already has an email (creates fresh)', () => {
    const plan = decideLink({
      ...base, deviceUserId: 'dev-1', deviceUser: { id: 'dev-1', email: 'other@example.com' },
    });
    expect(plan).toEqual({ kind: 'create_account', outcome: 'attached' });
  });

  it('creates a fresh account with no device and no existing email user', () => {
    const plan = decideLink(base);
    expect(plan).toEqual({ kind: 'create_account', outcome: 'attached' });
  });
});

// ---------- token_version round-trip through JWT claims ----------
describe('token_version in JWT claims', () => {
  it('embeds the version in both access and refresh', () => {
    expect(tokenVersionOf(verifyToken(issueToken('u1', 'user', 'access', 7), 'access'))).toBe(7);
    expect(tokenVersionOf(verifyToken(issueToken('u1', 'user', 'refresh', 7), 'refresh'))).toBe(7);
  });

  it('defaults to version 0 when omitted', () => {
    expect(tokenVersionOf(verifyToken(issueToken('u1', 'user', 'access'), 'access'))).toBe(0);
  });

  it('an OLD-version token no longer matches the bumped user version', () => {
    const claims = verifyToken(issueToken('u1', 'user', 'refresh', 0), 'refresh');
    const userVersionAfterSignout = 1;
    expect(tokenVersionOf(claims) !== userVersionAfterSignout).toBe(true);
  });
});

// ---------- F1: Apple "configured" gate (must NOT auto-enable) ----------
describe('appleConfigured', () => {
  it('is NOT configured when neither APPLE_CLIENT_ID nor APPLE_IOS_CLIENT_ID is set', () => {
    // Empty audience set ⇒ endpoint must 503 (provider_not_configured) rather
    // than trust tokens against an empty allow-list.
    expect(appleConfigured(undefined, undefined)).toBe(false);
  });

  it('is configured when only the web Services ID is set', () => {
    expect(appleConfigured('com.cdcupt.dailyenglish.web', undefined)).toBe(true);
  });

  it('is configured when only the iOS bundle id is set', () => {
    expect(appleConfigured(undefined, 'com.cdcupt.DailyEnglish')).toBe(true);
  });

  it('is configured when both are set', () => {
    expect(appleConfigured('com.cdcupt.dailyenglish.web', 'com.cdcupt.DailyEnglish')).toBe(true);
  });
});

// ---------- F7: idempotent identity insert under concurrency ----------
describe('upsertIdentity (onConflictDoNothing race)', () => {
  const identity: VerifiedIdentity = {
    provider: 'google', sub: 'race-sub', email: 'race@example.com', emailVerified: true,
  };

  it('returns our user id on a clean insert (no conflict)', async () => {
    const store: IdentityStore = {
      insertIdentity: async (userId) => userId,        // insert won the race
      findIdentityUserId: async () => null,            // never consulted
    };
    await expect(upsertIdentity(store, 'me', identity)).resolves.toBe('me');
  });

  it('resolves to the concurrent winner without throwing when the insert conflicts (F7)', async () => {
    const findSpy = vi.fn(async () => 'concurrent-winner');
    const store: IdentityStore = {
      insertIdentity: async () => null,                // onConflictDoNothing → 0 rows
      findIdentityUserId: findSpy,                      // re-select the existing row
    };
    // Must NOT throw (no 500) — it re-selects and returns the winning user id.
    await expect(upsertIdentity(store, 'me', identity)).resolves.toBe('concurrent-winner');
    expect(findSpy).toHaveBeenCalledTimes(1);
  });

  it('throws only if the row is genuinely missing after a conflict', async () => {
    const store: IdentityStore = {
      insertIdentity: async () => null,
      findIdentityUserId: async () => null,            // conflict but no row → integrity error
    };
    await expect(upsertIdentity(store, 'me', identity)).rejects.toThrow(OAuthError);
  });
});

// ---------- F4: per-IP fixed-window rate limit ----------
describe('isRateLimited (fixed-window per-IP)', () => {
  beforeEach(() => resetRateLimit());

  it('allows the first 10 requests then limits the 11th in one window', () => {
    const t = 1_000_000; // frozen instant → all requests share the window
    for (let i = 0; i < 10; i += 1) {
      expect(isRateLimited('1.2.3.4', t)).toBe(false);
    }
    expect(isRateLimited('1.2.3.4', t)).toBe(true); // 11th
  });

  it('tracks buckets per IP independently', () => {
    const t = 2_000_000;
    for (let i = 0; i < 11; i += 1) isRateLimited('a', t);
    expect(isRateLimited('a', t)).toBe(true);
    expect(isRateLimited('b', t)).toBe(false); // a fresh IP is unaffected
  });

  it('resets after the 60s window rolls over', () => {
    const t = 3_000_000;
    for (let i = 0; i < 11; i += 1) isRateLimited('c', t);
    expect(isRateLimited('c', t)).toBe(true);
    expect(isRateLimited('c', t + 60_001)).toBe(false); // new window
  });
});

describe('OAuth POST rate limiting (route preHandler, F4)', () => {
  beforeEach(() => resetRateLimit());

  it('returns 429 after the per-IP threshold on POST /v1/auth/oauth/google', async () => {
    const app = await buildApp();
    try {
      // Bodyless POSTs short-circuit at the 400 (idToken required) BEFORE any DB
      // call, so we exercise the preHandler limiter without a live database.
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await app.inject({ method: 'POST', url: '/v1/auth/oauth/google', payload: {} });
        statuses.push(res.statusCode);
      }
      // First 10 reach the handler (400); the 11th is rate-limited at the gate.
      expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
      const last = await app.inject({ method: 'POST', url: '/v1/auth/oauth/google', payload: {} });
      expect(last.statusCode).toBe(429);
      expect(last.json().error.code).toBe('rate_limited');
    } finally {
      await app.close();
    }
  });
});
