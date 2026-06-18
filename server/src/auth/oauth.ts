import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';
import { env } from '../env.js';

/**
 * Provider ID-token verification with node:crypto only (no new deps). We fetch +
 * cache the provider's JWKS, verify the compact RS256 JWS signature against the
 * key named by the token's `kid`, then validate iss / aud / exp. The provider
 * (Google/Apple) does the identity proof; we only verify their signed token and
 * then issue our own JWT. Mirrors the fetch idiom in ai/client.ts.
 */

export type OAuthProvider = 'google' | 'apple';

export interface VerifiedIdentity {
  provider: OAuthProvider;
  sub: string;
  email: string | null;
  emailVerified: boolean;
}

/** All verification failures map to a 401 invalid_token at the route. */
export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthError';
  }
}

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_ISS = ['https://appleid.apple.com'];

const JWKS_TTL_MS = 60 * 60 * 1000; // 1h — providers rotate keys slowly; keep it short
const JWKS_FETCH_TIMEOUT_MS = 8_000;
const CLOCK_SKEW_SEC = 60; // tolerate small clock drift on exp/iat

// ---------- JWKS fetch + cache ----------
interface JwkKey extends JsonWebKey { kid?: string; alg?: string; use?: string }
interface CachedJwks { keys: JwkKey[]; fetchedAt: number }

const jwksCache = new Map<string, CachedJwks>();

// Seam for hermetic tests: stub the network fetch without touching globals.
type JwksFetcher = (url: string) => Promise<JwkKey[]>;
let jwksFetcher: JwksFetcher = defaultJwksFetcher;

/** Override the JWKS fetcher (tests only). Pass nothing to restore the default. */
export function setJwksFetcher(fn?: JwksFetcher): void {
  jwksFetcher = fn ?? defaultJwksFetcher;
}

/** Clear the JWKS cache (tests only — keeps cases isolated). */
export function clearJwksCache(): void {
  jwksCache.clear();
}

async function defaultJwksFetcher(url: string): Promise<JwkKey[]> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new OAuthError(`JWKS fetch failed: ${msg}`);
  }
  if (!res.ok) throw new OAuthError(`JWKS fetch error ${res.status}`);
  const json = (await res.json().catch(() => null)) as { keys?: JwkKey[] } | null;
  if (!json?.keys || !Array.isArray(json.keys)) throw new OAuthError('JWKS response malformed');
  return json.keys;
}

async function getJwks(url: string, now = Date.now()): Promise<JwkKey[]> {
  const cached = jwksCache.get(url);
  if (cached && now - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const keys = await jwksFetcher(url);
  jwksCache.set(url, { keys, fetchedAt: now });
  return keys;
}

// ---------- Compact JWS (RS256) ----------
interface JwsHeader { alg?: string; kid?: string; typ?: string }
interface IdTokenClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean | string;
  nonce?: string;
}

function decodeJsonSegment<T>(segment: string, label: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new OAuthError(`malformed token ${label}`);
  }
}

/** Apple may send email_verified as the string 'true'; treat provider-verified as verified. */
function coerceEmailVerified(value: boolean | string | undefined): boolean {
  return value === true || value === 'true';
}

function audienceMatches(aud: string | string[] | undefined, allowed: string[]): boolean {
  if (!aud) return false;
  const list = Array.isArray(aud) ? aud : [aud];
  return list.some((a) => allowed.includes(a));
}

/**
 * Verify a compact RS256 ID token against a provider's JWKS + claim rules.
 * Returns the captured identity, or throws OAuthError (→ 401 invalid_token).
 */
async function verifyIdToken(
  idToken: string,
  opts: {
    provider: OAuthProvider;
    jwksUrl: string;
    allowedIss: string[];
    allowedAud: string[];
    nonce?: string;
    now?: number;
  },
): Promise<VerifiedIdentity> {
  if (typeof idToken !== 'string' || idToken.length === 0) throw new OAuthError('missing id token');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OAuthError('malformed token');
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const header = decodeJsonSegment<JwsHeader>(headerB64, 'header');
  if (header.alg !== 'RS256') throw new OAuthError(`unsupported alg: ${header.alg ?? 'none'}`);
  if (!header.kid) throw new OAuthError('token missing kid');

  // Find the signing key by kid (refetch once if a rotated kid misses the cache).
  let keys = await getJwks(opts.jwksUrl, opts.now);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    clearJwksCacheFor(opts.jwksUrl);
    keys = await getJwks(opts.jwksUrl, opts.now);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new OAuthError('no matching signing key');

  // Verify the signature over `header.payload` with the JWK as an RSA public key.
  let publicKey;
  try {
    publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    throw new OAuthError('invalid signing key');
  }
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signatureOk = verifier.verify(publicKey, Buffer.from(sigB64, 'base64url'));
  if (!signatureOk) throw new OAuthError('bad signature');

  // Signature valid → now trust + validate the claims.
  const claims = decodeJsonSegment<IdTokenClaims>(payloadB64, 'payload');
  const now = opts.now ? Math.floor(opts.now / 1000) : Math.floor(Date.now() / 1000);

  if (!claims.iss || !opts.allowedIss.includes(claims.iss)) throw new OAuthError('bad issuer');
  if (!audienceMatches(claims.aud, opts.allowedAud)) throw new OAuthError('bad audience');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC < now) throw new OAuthError('token expired');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw new OAuthError('token missing sub');
  if (opts.nonce !== undefined && claims.nonce !== opts.nonce) throw new OAuthError('nonce mismatch');

  return {
    provider: opts.provider,
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    emailVerified: coerceEmailVerified(claims.email_verified),
  };
}

function clearJwksCacheFor(url: string): void {
  jwksCache.delete(url);
}

/** Allowed Google audiences (web + iOS client ids, whichever are configured). */
function googleAudiences(): string[] {
  return [env.GOOGLE_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID].filter((x): x is string => Boolean(x));
}

/** Allowed Apple audiences (Services ID for web + iOS bundle id). */
function appleAudiences(): string[] {
  return [env.APPLE_CLIENT_ID, env.APPLE_IOS_CLIENT_ID].filter((x): x is string => Boolean(x));
}

/** Verify a Google-issued ID token. */
export function verifyGoogle(idToken: string, nonce?: string): Promise<VerifiedIdentity> {
  return verifyIdToken(idToken, {
    provider: 'google',
    jwksUrl: GOOGLE_JWKS_URL,
    allowedIss: GOOGLE_ISS,
    allowedAud: googleAudiences(),
    nonce,
  });
}

/** Verify an Apple-issued identity token. */
export function verifyApple(idToken: string, nonce?: string): Promise<VerifiedIdentity> {
  return verifyIdToken(idToken, {
    provider: 'apple',
    jwksUrl: APPLE_JWKS_URL,
    allowedIss: APPLE_ISS,
    allowedAud: appleAudiences(),
    nonce,
  });
}
