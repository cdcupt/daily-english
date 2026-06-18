import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, userAbilityProfiles, oauthIdentities } from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { issueToken, verifyToken, type AccessClaims } from '../auth/tokens.js';
import { decideLink, type LinkInput, type LinkOutcome } from '../auth/linking.js';
import { verifyGoogle, verifyApple, OAuthError, type VerifiedIdentity } from '../auth/oauth.js';
import { env } from '../env.js';
import { ok, fail } from '../schemas.js';

/**
 * Social sign-in (Sign in with Google / Apple) — v1: attach + sign-in, NO
 * cross-device data merge. The client gets a signed ID token from the provider
 * and POSTs it here; we verify it against the provider's JWKS (auth/oauth.ts),
 * run the linking state machine, and issue our normal JWT session. An optional
 * Bearer captures the anonymous device to attach (server-side, never trusted
 * from the client body), blocking takeover.
 *
 * NOTE (native/iOS clients): native flows MUST generate a cryptographically
 * random `nonce`, hash it into the provider authorization request, and send the
 * raw `nonce` here so verifyGoogle/verifyApple can bind the token to this
 * sign-in (anti-replay). No backend change is required now — the verifier
 * already enforces the nonce when the client supplies one.
 */

// ---------- Minimal per-IP rate limiter (no new deps) ----------
// @fastify/rate-limit is not a dependency, so we cap the two unauthenticated
// OAuth POSTs with a fixed-window in-memory limiter: an attacker can't burn the
// JWKS-fetch / provider-verify path (or hammer account creation) for free.
const RATE_LIMIT_MAX = 10;            // requests per window per IP
const RATE_LIMIT_WINDOW_MS = 60_000;  // 60s fixed window
const RATE_LIMIT_SWEEP_MS = 5 * 60_000; // drop stale buckets every 5 min

interface RateBucket { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>();
let rateSweepTimer: ReturnType<typeof setInterval> | null = null;

/** True when this IP is over the window budget (and should get a 429). */
export function isRateLimited(ip: string, now = Date.now()): boolean {
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

/** Periodically drop expired buckets so the map can't grow unbounded. */
function startRateSweep(): void {
  if (rateSweepTimer) return;
  rateSweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of rateBuckets) {
      if (now >= bucket.resetAt) rateBuckets.delete(ip);
    }
  }, RATE_LIMIT_SWEEP_MS);
  // Don't keep the event loop alive just for cleanup (lets the process exit).
  rateSweepTimer.unref?.();
}

/** Reset limiter state (tests only — keeps cases isolated). */
export function resetRateLimit(): void {
  rateBuckets.clear();
}

/** preHandler: 429 once an IP exceeds the OAuth window budget. */
async function rateLimitGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (isRateLimited(req.ip)) {
    reply.code(429).send(fail('rate_limited', 'Too many requests, slow down'));
  }
}

/**
 * Apple is "configured" only when a web Services ID OR an iOS bundle id is
 * explicitly set. This MUST match appleAudiences() in auth/oauth.ts: if neither
 * is set the accepted-audience list is empty, so the endpoint must 503 rather
 * than reach a verifier that would reject every token (or, worse, trust one).
 * APPLE_IOS_CLIENT_ID has no default (see env.ts) so it can't silently enable.
 */
export function appleConfigured(
  appleClientId: string | undefined,
  appleIosClientId: string | undefined,
): boolean {
  return Boolean(appleClientId) || Boolean(appleIosClientId);
}

/** Optional auth: if a valid access token is present, return its claims; else null. Never 401s. */
function optionalAuth(req: FastifyRequest): AccessClaims | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return verifyToken(header.slice(7), 'access');
  } catch {
    return null;
  }
}

/** Result of resolving a verified identity into an account (inside one tx). */
interface LinkedAccount {
  account: typeof users.$inferSelect;
  outcome: LinkOutcome;
}

// A Drizzle tx handle; typed loosely since the concrete type isn't exported.
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/**
 * The two identity-row operations the idempotent upsert needs, narrowed so the
 * conflict path is unit-testable without a live DB (see oauth.test.ts). The
 * route builds this from the live Drizzle tx in identityStore().
 */
export interface IdentityStore {
  // Insert (provider, sub); returns the inserted user_id, or null on conflict
  // (a concurrent request already created the row — onConflictDoNothing → 0 rows).
  insertIdentity(userId: string, identity: VerifiedIdentity): Promise<string | null>;
  // Re-select the existing identity's user_id by (provider, sub).
  findIdentityUserId(identity: VerifiedIdentity): Promise<string | null>;
}

function identityStore(tx: Tx): IdentityStore {
  return {
    async insertIdentity(userId, identity) {
      const inserted = await tx.insert(oauthIdentities).values({
        userId, provider: identity.provider, providerSub: identity.sub, email: identity.email,
      }).onConflictDoNothing({ target: [oauthIdentities.provider, oauthIdentities.providerSub] }).returning();
      return inserted.length > 0 ? userId : null;
    },
    async findIdentityUserId(identity) {
      const rows = await tx.select().from(oauthIdentities)
        .where(and(eq(oauthIdentities.provider, identity.provider), eq(oauthIdentities.providerSub, identity.sub)));
      return rows[0]?.userId ?? null;
    },
  };
}

/**
 * Insert the (provider, sub) identity idempotently under concurrency. The unique
 * index on (provider, provider_sub) means a racing same-user sign-in may have
 * already created the row; onConflictDoNothing makes the loser a no-op instead
 * of a 500, and we resolve the winning row's user_id by re-selecting. Returns
 * the user_id the identity points at (ours on win, the winner's on race).
 */
export async function upsertIdentity(
  store: IdentityStore,
  userId: string,
  identity: VerifiedIdentity,
): Promise<string> {
  const insertedId = await store.insertIdentity(userId, identity);
  if (insertedId !== null) return insertedId;

  // Lost the race: a concurrent request created this identity. Use its user.
  const existingId = await store.findIdentityUserId(identity);
  if (existingId === null) throw new OAuthError('identity insert conflicted but row is missing');
  return existingId;
}

/**
 * Map the identity's resolved owner back to an account. On a clean insert
 * (ownerId === ours) we keep the planned account + outcome; on a lost race the
 * identity already points at another account — re-select it and treat as a
 * normal sign-in so the racing request still gets a clean JWT, not a 500.
 */
async function resolveOwner(
  tx: Tx,
  ownerId: string,
  planned: typeof users.$inferSelect,
  outcome: LinkOutcome,
): Promise<LinkedAccount> {
  if (ownerId === planned.id) return { account: planned, outcome };
  const [winner] = await tx.select().from(users).where(eq(users.id, ownerId));
  if (!winner) throw new OAuthError('concurrent identity points at a missing user');
  return { account: winner, outcome: 'login' };
}

/**
 * Resolve a verified provider identity into a user account, creating/linking
 * rows as needed — all in ONE transaction so a partial link can't leave a
 * burned identity with no account.
 */
async function resolveIdentity(
  identity: VerifiedIdentity,
  deviceUserId: string | null,
): Promise<LinkedAccount> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Existing identity for (provider, sub)?
    const identityRows = await tx.select().from(oauthIdentities).where(eq(oauthIdentities.providerSub, identity.sub));
    // providerSub alone isn't unique across providers; narrow by provider too.
    const existingIdentity = identityRows.find((r) => r.provider === identity.provider) ?? null;

    // Verified email already owns a (non-merged) account?
    const emailUser = identity.emailVerified && identity.email
      ? (await tx.select().from(users).where(eq(users.email, identity.email))).find((u) => u.mergedInto === null) ?? null
      : null;

    const deviceRows = deviceUserId
      ? await tx.select().from(users).where(eq(users.id, deviceUserId))
      : [];
    const deviceUser = deviceRows[0] ?? null;

    const linkInput: LinkInput = {
      provider: identity.provider,
      sub: identity.sub,
      email: identity.email,
      emailVerified: identity.emailVerified,
      deviceUserId,
      identityUserId: existingIdentity?.userId ?? null,
      emailUser: emailUser ? { id: emailUser.id, email: emailUser.email } : null,
      deviceUser: deviceUser ? { id: deviceUser.id, email: deviceUser.email } : null,
    };
    const plan = decideLink(linkInput);

    if (plan.kind === 'sign_in') {
      const [account] = await tx.select().from(users).where(eq(users.id, plan.userId));
      if (!account) throw new OAuthError('identity points at a missing user');
      return { account, outcome: plan.outcome };
    }

    if (plan.kind === 'link_to_email_user') {
      const [account] = await tx.select().from(users).where(eq(users.id, plan.userId));
      if (!account) throw new OAuthError('email user missing');
      // Idempotent insert: a concurrent sign-in may already own this identity.
      const ownerId = await upsertIdentity(identityStore(tx), account.id, identity);
      return resolveOwner(tx, ownerId, account, plan.outcome);
    }

    if (plan.kind === 'attach_device') {
      const [account] = await tx.select().from(users).where(eq(users.id, plan.userId));
      if (!account) throw new OAuthError('device user missing');
      // Set email/email_verified only when the account has no email yet.
      const updated = account.email === null && identity.email
        ? (await tx.update(users)
            .set({ email: identity.email, emailVerified: identity.emailVerified })
            .where(eq(users.id, account.id))
            .returning())[0] ?? account
        : account;
      const ownerId = await upsertIdentity(identityStore(tx), updated.id, identity);
      return resolveOwner(tx, ownerId, updated, plan.outcome);
    }

    // create_account: fresh user seeded like /anonymous, plus the identity.
    const [created] = await tx.insert(users).values({
      deviceId: randomUUID(),
      email: identity.email,
      emailVerified: identity.email ? identity.emailVerified : false,
    }).returning();
    if (!created) throw new OAuthError('failed to create account');
    await tx.insert(userAbilityProfiles).values({ userId: created.id }).onConflictDoNothing();
    const ownerId = await upsertIdentity(identityStore(tx), created.id, identity);
    return resolveOwner(tx, ownerId, created, plan.outcome);
  });
}

export function oauthRoutes() {
  return async function register(app: FastifyInstance): Promise<void> {
    startRateSweep(); // begin periodic cleanup of stale rate-limit buckets

    // POST /v1/auth/oauth/google { idToken, nonce? }
    app.post('/v1/auth/oauth/google', { preHandler: rateLimitGuard }, async (req, reply) => {
      const body = (req.body ?? {}) as { idToken?: string; nonce?: string };
      if (!body.idToken) return reply.code(400).send(fail('bad_request', 'idToken is required'));
      if (!env.GOOGLE_CLIENT_ID) {
        return reply.code(503).send(fail('provider_not_configured', 'Google sign-in is not configured yet'));
      }

      let identity: VerifiedIdentity;
      try {
        identity = await verifyGoogle(body.idToken, body.nonce);
      } catch (err) {
        if (err instanceof OAuthError) return reply.code(401).send(fail('invalid_token', 'Invalid Google sign-in token'));
        throw err;
      }

      const deviceUserId = optionalAuth(req)?.sub ?? null;
      const { account, outcome } = await resolveIdentity(identity, deviceUserId);
      return reply.send(buildAuthResponse(account, outcome, 'google'));
    });

    // POST /v1/auth/oauth/apple { identityToken, nonce? }
    app.post('/v1/auth/oauth/apple', { preHandler: rateLimitGuard }, async (req, reply) => {
      const body = (req.body ?? {}) as { identityToken?: string; nonce?: string };
      if (!body.identityToken) return reply.code(400).send(fail('bad_request', 'identityToken is required'));
      if (!appleConfigured(env.APPLE_CLIENT_ID, env.APPLE_IOS_CLIENT_ID)) {
        return reply.code(503).send(fail('provider_not_configured', 'Apple sign-in is not configured yet'));
      }

      let identity: VerifiedIdentity;
      try {
        identity = await verifyApple(body.identityToken, body.nonce);
      } catch (err) {
        if (err instanceof OAuthError) return reply.code(401).send(fail('invalid_token', 'Invalid Apple sign-in token'));
        throw err;
      }

      const deviceUserId = optionalAuth(req)?.sub ?? null;
      const { account, outcome } = await resolveIdentity(identity, deviceUserId);
      return reply.send(buildAuthResponse(account, outcome, 'apple'));
    });

    // GET /v1/auth/config — public client ids so the web client knows which buttons to show.
    app.get('/v1/auth/config', async (_req, reply) => {
      return reply.send(ok({
        google: { clientId: env.GOOGLE_CLIENT_ID ?? null },
        apple: { clientId: env.APPLE_CLIENT_ID ?? null },
      }));
    });

    // GET /v1/auth/me — current identity (anonymous vs linked).
    app.get('/v1/auth/me', { preHandler: requireAuth }, async (req, reply) => {
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.id, req.user!.sub));
      if (rows.length === 0) return reply.code(404).send(fail('not_found', 'User not found'));
      const u = rows[0]!;
      return reply.send(ok({
        userId: u.id,
        deviceId: u.deviceId,
        email: u.email,
        emailVerified: u.emailVerified,
        isAnonymous: u.email == null,
        nativeLanguage: u.nativeLanguage,
        role: u.isOperator ? 'operator' : 'user',
      }));
    });

    // POST /v1/auth/signout — bump token_version (invalidates stale refresh tokens).
    app.post('/v1/auth/signout', { preHandler: requireAuth }, async (req, reply) => {
      const db = getDb();
      await db.update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, req.user!.sub));
      return reply.send(ok({ signedOut: true }));
    });
  };
}

/** Standard auth success body: fresh JWTs + the resolved identity. */
function buildAuthResponse(
  account: typeof users.$inferSelect,
  outcome: LinkOutcome,
  provider: 'google' | 'apple',
) {
  const role = account.isOperator ? 'operator' : 'user';
  return ok({
    userId: account.id,
    deviceId: account.deviceId,
    email: account.email,
    emailVerified: account.emailVerified,
    access: issueToken(account.id, role, 'access', account.tokenVersion),
    refresh: issueToken(account.id, role, 'refresh', account.tokenVersion),
    provider,
    linked: outcome,
  });
}
