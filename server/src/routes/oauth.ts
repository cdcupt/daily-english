import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
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
 */

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
      await tx.insert(oauthIdentities).values({
        userId: account.id, provider: identity.provider, providerSub: identity.sub, email: identity.email,
      });
      return { account, outcome: plan.outcome };
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
      await tx.insert(oauthIdentities).values({
        userId: account.id, provider: identity.provider, providerSub: identity.sub, email: identity.email,
      });
      return { account: updated, outcome: plan.outcome };
    }

    // create_account: fresh user seeded like /anonymous, plus the identity.
    const [created] = await tx.insert(users).values({
      deviceId: randomUUID(),
      email: identity.email,
      emailVerified: identity.email ? identity.emailVerified : false,
    }).returning();
    if (!created) throw new OAuthError('failed to create account');
    await tx.insert(userAbilityProfiles).values({ userId: created.id }).onConflictDoNothing();
    await tx.insert(oauthIdentities).values({
      userId: created.id, provider: identity.provider, providerSub: identity.sub, email: identity.email,
    });
    return { account: created, outcome: plan.outcome };
  });
}

export function oauthRoutes() {
  return async function register(app: FastifyInstance): Promise<void> {
    // POST /v1/auth/oauth/google { idToken, nonce? }
    app.post('/v1/auth/oauth/google', async (req, reply) => {
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
    app.post('/v1/auth/oauth/apple', async (req, reply) => {
      const body = (req.body ?? {}) as { identityToken?: string; nonce?: string };
      if (!body.identityToken) return reply.code(400).send(fail('bad_request', 'identityToken is required'));
      if (!env.APPLE_CLIENT_ID && !env.APPLE_IOS_CLIENT_ID) {
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
