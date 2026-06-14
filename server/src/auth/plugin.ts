import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { users, userAbilityProfiles } from '../db/schema.js';
import { issueToken, verifyToken, type AccessClaims } from './tokens.js';
import { ok, fail } from '../schemas.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessClaims;
  }
}

/** Require a valid access token; attaches req.user. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send(fail('unauthorized', 'Missing bearer token'));
    return;
  }
  try {
    req.user = verifyToken(header.slice(7), 'access');
  } catch {
    reply.code(401).send(fail('unauthorized', 'Invalid or expired token'));
  }
}

/** Require operator role (admin surfaces). 404 — don't reveal the surface. */
export async function requireOperator(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (req.user?.role !== 'operator') {
    reply.code(404).send(fail('not_found', 'Not found'));
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Anonymous device account → access + refresh JWT.
  app.post('/v1/auth/anonymous', async (req, reply) => {
    const body = (req.body ?? {}) as { deviceId?: string };
    const deviceId = body.deviceId ?? randomUUID();
    const db = getDb();
    const existing = await db.select().from(users).where(eqDevice(deviceId));
    let userId: string;
    let role: 'user' | 'operator' = 'user';
    if (existing.length > 0) {
      userId = existing[0]!.id;
      role = existing[0]!.isOperator ? 'operator' : 'user';
    } else {
      const [row] = await db.insert(users).values({ deviceId }).returning();
      userId = row!.id;
      await db.insert(userAbilityProfiles).values({ userId }).onConflictDoNothing();
    }
    return reply.send(ok({
      userId,
      deviceId,
      access: issueToken(userId, role, 'access'),
      refresh: issueToken(userId, role, 'refresh'),
    }));
  });

  // Rotate refresh → new access + refresh.
  app.post('/v1/auth/refresh', async (req, reply) => {
    const body = (req.body ?? {}) as { refresh?: string };
    if (!body.refresh) return reply.code(400).send(fail('bad_request', 'refresh required'));
    try {
      const claims = verifyToken(body.refresh, 'refresh');
      return reply.send(ok({
        access: issueToken(claims.sub, claims.role, 'access'),
        refresh: issueToken(claims.sub, claims.role, 'refresh'),
      }));
    } catch {
      return reply.code(401).send(fail('unauthorized', 'Invalid refresh token'));
    }
  });
}

// Local import kept at bottom to avoid a circular import at module load.
import { eq } from 'drizzle-orm';
function eqDevice(deviceId: string) {
  return eq(users.deviceId, deviceId);
}
