import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { reviewTasks, expressionBankItems } from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { scheduleNext, isDue } from '../review/sm2.js';
import { reviewPromptFor } from '../review/prompt.js';

/**
 * Spaced-repetition review (TECH §B7). Due saved expressions are materialized
 * into review_tasks (templated prompts); completing one grades it and reschedules
 * the expression via SM-2.
 */
export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // Ensure pending tasks exist for due expressions, then return the queue.
  app.get('/v1/review/queue', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb();
    const userId = req.user!.sub;
    const now = new Date();

    const exprs = await db.select().from(expressionBankItems).where(eq(expressionBankItems.userId, userId));
    const due = exprs.filter((e) => isDue(e.reviewStatus, now));

    for (const e of due) {
      const pending = await db.select().from(reviewTasks).where(and(
        eq(reviewTasks.expressionId, e.id), eq(reviewTasks.state, 'pending'),
      ));
      if (pending.length === 0) {
        const { prompt, kind } = reviewPromptFor(e);
        await db.insert(reviewTasks).values({ userId, expressionId: e.id, prompt, kind, dueAt: now });
      }
    }

    const queue = await db.select().from(reviewTasks).where(and(
      eq(reviewTasks.userId, userId), eq(reviewTasks.state, 'pending'),
    ));
    return reply.send(ok(queue, { total: queue.length }));
  });

  // Grade a review → reschedule the expression (SM-2) + close the task.
  app.post('/v1/review/:id/complete', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { grade } = (req.body ?? {}) as { grade?: number };
    if (typeof grade !== 'number' || grade < 0 || grade > 5) {
      return reply.code(400).send(fail('bad_request', 'grade must be 0–5'));
    }
    const db = getDb();
    const tasks = await db.select().from(reviewTasks).where(eq(reviewTasks.id, id));
    if (tasks.length === 0) return reply.code(404).send(fail('not_found', 'Review task not found'));
    const task = tasks[0]!;
    if (task.userId !== req.user!.sub) return reply.code(404).send(fail('not_found', 'Not found'));

    const exprs = await db.select().from(expressionBankItems).where(eq(expressionBankItems.id, task.expressionId));
    if (exprs.length === 0) return reply.code(404).send(fail('not_found', 'Expression not found'));
    const next = scheduleNext(exprs[0]!.reviewStatus, grade, new Date());

    await db.update(expressionBankItems).set({ reviewStatus: next }).where(eq(expressionBankItems.id, task.expressionId));
    await db.update(reviewTasks).set({ state: 'completed' }).where(eq(reviewTasks.id, id));

    return reply.send(ok({ taskId: id, expressionId: task.expressionId, reviewStatus: next }));
  });
}
