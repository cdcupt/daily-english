import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { resolveIdentity, buildAuthResponse, rateLimitGuard } from './oauth.js';
import type { VerifiedIdentity } from '../auth/oauth.js';
import { fail } from '../schemas.js';

/**
 * Secret-gated TEST-LOGIN — a way for E2E suites to obtain a REAL session JWT
 * for the OAuth-gated app WITHOUT a real Google/Apple account.
 *
 * SAFETY (this is auth code — every layer is deliberate):
 *  - Disabled by default: with no TEST_LOGIN_SECRET in the environment the route
 *    responds 404 (hides its existence — never 503, which would advertise it).
 *  - Secret is constant-time compared (timingSafeEqual over SHA-256 digests, so
 *    unequal lengths can't leak via an early return).
 *  - The minted email is forced into the *.dailingo.test domain, so this endpoint
 *    can NEVER mint a session for a real user's address.
 *  - The synthetic identity lives in its OWN provider namespace ('test') — it can
 *    never collide with a real 'google'/'apple' identity.
 *  - Shares the OAuth endpoints' per-IP rate limiter.
 *  - Reuses the OAuth flow's exact upsert/link path → idempotent on repeat.
 *  - The secret is env-only and is NEVER logged.
 */

// Default synthetic identity when the caller omits `email`. In the test domain.
const DEFAULT_TEST_EMAIL = 'e2e@dailingo.test';

// The ONLY emails this endpoint may mint a session for: the reserved test
// domain (optionally with sub-domains). A real address (gmail.com, etc.) is
// rejected with 400 — this is the hard guarantee that test-login can never
// impersonate a real user.
const TEST_EMAIL_PATTERN = /@([a-z0-9-]+\.)*dailingo\.test$/i;

// Minimum length for the configured secret; a shorter value is treated as unset
// so a weak/typo'd TEST_LOGIN_SECRET can't quietly enable a brute-forceable route.
const MIN_SECRET_LEN = 32;

/** True only for the reserved test domain. Belt-and-suspenders over the regex:
 *  re-assert the domain is pure ASCII so a Unicode/IDN homoglyph of "dailingo"
 *  can never slip through. */
function isTestEmail(email: string): boolean {
  if (!TEST_EMAIL_PATTERN.test(email)) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return /^[a-z0-9.-]+$/i.test(domain);
}

const TestLoginBody = z.object({
  secret: z.string().min(1).max(256),
  email: z.string().email().optional(),
});

/** Constant-time secret check. Compares fixed-length SHA-256 digests so a
 *  length difference between input and the real secret can't short-circuit. */
function secretMatches(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b); // digests are always 32 bytes → never throws on length
}

export async function testLoginRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/auth/test-login { secret, email? } — E2E session minting.
  // Shares the OAuth per-IP rate limiter (rateLimitGuard preHandler).
  app.post('/v1/auth/test-login', { preHandler: rateLimitGuard }, async (req, reply) => {
    // Disabled by default: no secret configured → pretend the route doesn't exist.
    const configured = process.env['TEST_LOGIN_SECRET'];
    if (!configured) return reply.code(404).send(fail('not_found', 'Not found'));
    if (configured.length < MIN_SECRET_LEN) {
      req.log.error(`[auth] TEST_LOGIN_SECRET is set but < ${MIN_SECRET_LEN} chars — refusing to enable test-login`);
      return reply.code(404).send(fail('not_found', 'Not found'));
    }

    const parsed = TestLoginBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(fail('bad_request', 'secret is required'));
    }
    const { secret } = parsed.data;
    const email = parsed.data.email ?? DEFAULT_TEST_EMAIL;

    // Constant-time secret comparison (no early-return length leak).
    if (!secretMatches(secret, configured)) {
      return reply.code(401).send(fail('invalid_secret', 'Invalid secret'));
    }

    // Hard gate: only the reserved test domain — never a real user's address.
    if (!isTestEmail(email)) {
      return reply.code(400).send(fail('invalid_test_email', 'email must be in the dailingo.test domain'));
    }

    // Synthetic identity in the 'test' namespace; provider_sub = email so the
    // same email is idempotent across repeat calls. Reuses the OAuth upsert/link
    // transaction (create on first call, sign-in on repeat). No device attach.
    const identity: VerifiedIdentity = {
      provider: 'test',
      sub: email,
      email,
      emailVerified: true,
    };
    const { account, outcome } = await resolveIdentity(identity, null);

    // Never log the secret; one success line with the (test-domain) email only.
    req.log.info(`[auth] test-login → ${email}`);

    return reply.send(buildAuthResponse(account, outcome, 'test'));
  });
}
