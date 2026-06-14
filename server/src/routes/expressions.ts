import type { FastifyInstance } from 'fastify';
import { and, eq, desc, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { expressionBankItems } from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import {
  defaultReviewStatus, parsePage, EXPRESSION_TYPES, type ExpressionType,
} from '../expressions/service.js';

/**
 * Personal expression bank (TECH §B3/§12). Save (idempotent), list (paginated,
 * filterable), update, delete — all ownership-scoped.
 */
export async function expressionRoutes(app: FastifyInstance): Promise<void> {
  // Save an expression (manual save, or a save-candidate the user kept).
  app.post('/v1/expressions', { preHandler: requireAuth }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      type?: string; content?: string; meaningCn?: string;
      userOriginal?: string; naturalExpression?: string;
      sourceSessionId?: string; sourceScenarioId?: string;
    };
    if (!b.type || !EXPRESSION_TYPES.includes(b.type as ExpressionType)) {
      return reply.code(400).send(fail('bad_request', `type must be one of ${EXPRESSION_TYPES.join(', ')}`));
    }
    if (!b.content) return reply.code(400).send(fail('bad_request', 'content is required'));

    const db = getDb();
    const userId = req.user!.sub;

    // Idempotency: same (user, type, content) returns the existing row.
    const existing = await db.select().from(expressionBankItems).where(and(
      eq(expressionBankItems.userId, userId),
      eq(expressionBankItems.type, b.type as ExpressionType),
      eq(expressionBankItems.content, b.content),
    ));
    if (existing.length > 0) return reply.send(ok(existing[0], { deduped: true }));

    const [row] = await db.insert(expressionBankItems).values({
      userId, type: b.type as ExpressionType, content: b.content,
      meaningCn: b.meaningCn ?? null, userOriginal: b.userOriginal ?? null,
      naturalExpression: b.naturalExpression ?? null,
      sourceSessionId: b.sourceSessionId ?? null, sourceScenarioId: b.sourceScenarioId ?? null,
      reviewStatus: defaultReviewStatus(),
    }).returning();
    return reply.code(201).send(ok(row));
  });

  // List the bank (filter by type, paginated).
  app.get('/v1/expressions', { preHandler: requireAuth }, async (req, reply) => {
    const q = req.query as { type?: string; page?: string; limit?: string };
    const { page, limit } = parsePage(q);
    const db = getDb();
    const userId = req.user!.sub;
    const where = q.type && EXPRESSION_TYPES.includes(q.type as ExpressionType)
      ? and(eq(expressionBankItems.userId, userId), eq(expressionBankItems.type, q.type as ExpressionType))
      : eq(expressionBankItems.userId, userId);

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(expressionBankItems).where(where);
    const rows = await db.select().from(expressionBankItems)
      .where(where).orderBy(desc(expressionBankItems.createdAt))
      .limit(limit).offset((page - 1) * limit);

    return reply.send(ok(rows, { total: count, page, limit }));
  });

  // Update (e.g. edit content / meaning).
  app.patch('/v1/expressions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { content?: string; meaningCn?: string };
    const db = getDb();
    const rows = await db.select().from(expressionBankItems).where(eq(expressionBankItems.id, id));
    if (rows.length === 0) return reply.code(404).send(fail('not_found', 'Not found'));
    if (rows[0]!.userId !== req.user!.sub) return reply.code(404).send(fail('not_found', 'Not found'));
    const [row] = await db.update(expressionBankItems)
      .set({ content: b.content ?? rows[0]!.content, meaningCn: b.meaningCn ?? rows[0]!.meaningCn })
      .where(eq(expressionBankItems.id, id)).returning();
    return reply.send(ok(row));
  });

  // Delete.
  app.delete('/v1/expressions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const rows = await db.select().from(expressionBankItems).where(eq(expressionBankItems.id, id));
    if (rows.length === 0) return reply.code(404).send(fail('not_found', 'Not found'));
    if (rows[0]!.userId !== req.user!.sub) return reply.code(404).send(fail('not_found', 'Not found'));
    await db.delete(expressionBankItems).where(eq(expressionBankItems.id, id));
    return reply.send(ok({ deleted: true }));
  });
}
