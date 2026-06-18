import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/**
 * Tiny dependency-free HS256 JWT (TECH §B10). Access tokens are short-lived;
 * refresh tokens use the separate refresh secret. Enough for anonymous-device
 * auth + the operator claim; a library can replace this later without changing
 * callers.
 */
export interface AccessClaims {
  sub: string;        // user id
  role: 'user' | 'operator';
  typ: 'access' | 'refresh';
  ver?: number;       // user's token_version at issue time (sign-out/merge invalidation)
  iat: number;
  exp: number;
}

const ACCESS_TTL = 15 * 60;            // 15 minutes
const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadJson: string, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(payloadJson);
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function secretFor(typ: 'access' | 'refresh'): string {
  return typ === 'refresh' ? env.JWT_REFRESH_SECRET : env.JWT_SECRET;
}

export function issueToken(
  sub: string,
  role: 'user' | 'operator',
  typ: 'access' | 'refresh',
  tokenVersion = 0,
  now = Math.floor(Date.now() / 1000),
): string {
  const claims: AccessClaims = {
    sub, role, typ, ver: tokenVersion,
    iat: now, exp: now + (typ === 'refresh' ? REFRESH_TTL : ACCESS_TTL),
  };
  return sign(JSON.stringify(claims), secretFor(typ));
}

/** Read the user's token_version from claims (absent on legacy tokens → 0). */
export function tokenVersionOf(claims: AccessClaims): number {
  return claims.ver ?? 0;
}

export function verifyToken(
  token: string,
  typ: 'access' | 'refresh',
  now = Math.floor(Date.now() / 1000),
): AccessClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [header, body, sig] = parts as [string, string, string];
  const expected = createHmac('sha256', secretFor(typ)).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad signature');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessClaims;
  if (claims.typ !== typ) throw new Error('wrong token type');
  if (claims.exp < now) throw new Error('token expired');
  return claims;
}
