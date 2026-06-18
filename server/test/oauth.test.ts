import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { generateKeyPairSync, createSign, type JsonWebKey } from 'node:crypto';
import { decideLink } from '../src/auth/linking.js';
import {
  verifyGoogle, verifyApple, setJwksFetcher, clearJwksCache, OAuthError,
} from '../src/auth/oauth.js';
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
    iat: now,
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
