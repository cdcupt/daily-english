import { describe, it, expect } from 'vitest';
import { issueToken, verifyToken } from '../src/auth/tokens.js';

describe('JWT tokens', () => {
  it('round-trips an access token with claims', () => {
    const tok = issueToken('user-1', 'user', 'access');
    const claims = verifyToken(tok, 'access');
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('user');
    expect(claims.typ).toBe('access');
  });

  it('rejects a tampered token', () => {
    const tok = issueToken('user-1', 'user', 'access');
    const tampered = tok.slice(0, -2) + (tok.endsWith('a') ? 'b' : 'a');
    expect(() => verifyToken(tampered, 'access')).toThrow();
  });

  it('rejects an access token used as refresh (wrong type/secret)', () => {
    const access = issueToken('user-1', 'user', 'access');
    expect(() => verifyToken(access, 'refresh')).toThrow();
  });

  it('rejects an expired token', () => {
    const past = Math.floor(Date.now() / 1000) - 10_000;
    const tok = issueToken('user-1', 'user', 'access', 0, past);
    expect(() => verifyToken(tok, 'access')).toThrow(/expired/);
  });

  it('carries the operator role', () => {
    const tok = issueToken('op-1', 'operator', 'access');
    expect(verifyToken(tok, 'access').role).toBe('operator');
  });
});
