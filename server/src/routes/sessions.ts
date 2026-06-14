import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { practiceSessions, practiceTurns, questionItems, aiFeedbackItems } from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { generateInstantFeedback } from '../ai/feedback.js';

/**
 * Practice session + turn engine (TECH §B3). Slice 2 covers text turns →
 * inline 3-tier feedback; the turn + AI feedback (with raw output for audit)
 * are persisted. Audio turns + scoring/finish arrive in later slices.
 */
export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // Start a session.
  app.post('/v1/sessions', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as { mode?: string };
    const db = getDb();
    const [row] = await db.insert(practiceSessions).values({
      userId: req.user!.sub,
      mode: body.mode ?? 'mixed',
    }).returning();
    return reply.send(ok({ sessionId: row!.id, state: row!.state }));
  });

  // Submit a TEXT turn → returns FeedbackPayload inline (slice 2).
  app.post('/v1/sessions/:id/turns', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { itemId?: string; userText?: string };
    if (!body.itemId || !body.userText) {
      return reply.code(400).send(fail('bad_request', 'itemId and userText are required'));
    }

    const db = getDb();
    const session = await db.select().from(practiceSessions).where(eq(practiceSessions.id, id));
    if (session.length === 0) return reply.code(404).send(fail('not_found', 'Session not found'));
    if (session[0]!.userId !== req.user!.sub) return reply.code(403).send(fail('forbidden', 'Not your session'));

    const items = await db.select().from(questionItems).where(eq(questionItems.id, body.itemId));
    if (items.length === 0) return reply.code(404).send(fail('not_found', 'Item not found'));
    const item = items[0]!;

    // Next turn index for this session.
    const existingTurns = await db.select().from(practiceTurns).where(eq(practiceTurns.sessionId, id));
    const turnIndex = existingTurns.length;

    const [turn] = await db.insert(practiceTurns).values({
      sessionId: id, itemId: item.id, turnIndex, inputType: 'text', userText: body.userText, lowConfidence: false,
    }).returning();

    const fb = await generateInstantFeedback({
      cefrLevel: item.cefrLevel,
      learningGoal: item.learningGoal,
      targetPhrases: item.targetPhrases,
      referenceAnswers: item.referenceAnswers,
      promptCn: item.promptCn,
      userText: body.userText,
    });

    await db.insert(aiFeedbackItems).values({
      turnId: turn!.id,
      payload: fb.payload,
      rawModelOutput: fb.raw,
      model: fb.model,
      promptVersion: fb.promptVersion,
      repaired: fb.repaired,
    });

    return reply.send(ok({
      turnId: turn!.id,
      turnIndex,
      lowConfidence: false,
      feedback: fb.payload,
    }));
  });
}
