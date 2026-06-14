import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { practiceSessions, practiceTurns, questionItems, aiFeedbackItems } from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { generateInstantFeedback } from '../ai/feedback.js';
import { scoreSession, type ScoreEntry } from '../scoring/session.js';
import { updateEma } from '../scoring/engine.js';
import { scoreToCEFR } from '../scoring/cefr.js';
import { userAbilityProfiles, expressionBankItems, dimensionSnapshots } from '../db/schema.js';
import { mistakePairFromFeedback } from '../expressions/service.js';
import { and } from 'drizzle-orm';

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

    // Auto-save the mistake as an expression (idempotent by user+type+content).
    let savedExpressionId: string | null = null;
    const pair = mistakePairFromFeedback(fb.payload, { sourceSessionId: id, sourceScenarioId: item.scenarioId });
    if (pair) {
      const dupe = await db.select().from(expressionBankItems).where(and(
        eq(expressionBankItems.userId, req.user!.sub),
        eq(expressionBankItems.type, 'mistake_pair'),
        eq(expressionBankItems.content, pair.content),
      ));
      if (dupe.length > 0) {
        savedExpressionId = dupe[0]!.id;
      } else {
        const [exp] = await db.insert(expressionBankItems).values({
          userId: req.user!.sub, type: pair.type, content: pair.content,
          userOriginal: pair.userOriginal, naturalExpression: pair.naturalExpression,
          sourceSessionId: pair.sourceSessionId, sourceScenarioId: pair.sourceScenarioId,
          reviewStatus: pair.reviewStatus,
        }).returning();
        savedExpressionId = exp!.id;
      }
    }

    return reply.send(ok({
      turnId: turn!.id,
      turnIndex,
      lowConfidence: false,
      feedback: fb.payload,
      savedExpressionId,
      saveCandidates: fb.payload.save_candidates,
    }));
  });

  // Finish a session → compute ScoreReport (rubric + deterministic CEFR), persist,
  // and fold the dimension scores into the long-term ability profile via EMA.
  app.post('/v1/sessions/:id/finish', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const session = await db.select().from(practiceSessions).where(eq(practiceSessions.id, id));
    if (session.length === 0) return reply.code(404).send(fail('not_found', 'Session not found'));
    if (session[0]!.userId !== req.user!.sub) return reply.code(403).send(fail('forbidden', 'Not your session'));

    const turns = await db.select().from(practiceTurns).where(eq(practiceTurns.sessionId, id));
    const entries: ScoreEntry[] = [];
    for (const t of turns) {
      const text = t.transcript ?? t.userText ?? '';
      if (!text) continue;
      let goal = 'Practice'; let cefr = 'B1'; let refs: string[] = [];
      if (t.itemId) {
        const items = await db.select().from(questionItems).where(eq(questionItems.id, t.itemId));
        if (items[0]) { goal = items[0].learningGoal; cefr = items[0].cefrLevel; refs = items[0].referenceAnswers; }
      }
      entries.push({
        text, isSpoken: t.inputType === 'audio', scenarioGoal: goal, cefrTarget: cefr,
        referenceAnswers: refs,
        features: (t.speechFeatures as ScoreEntry['features']) ?? undefined,
        asrConfidence: t.asrConfidence ?? undefined,
        lowConfidence: t.lowConfidence,
      });
    }

    const score = await scoreSession(entries);
    const report = { session_id: id, ...score, recommended_review: [], next_task: null, excluded_turns: [] };

    await db.update(practiceSessions)
      .set({ state: 'completed', endedAt: new Date(), scoreReport: report })
      .where(eq(practiceSessions.id, id));

    // Fold into the ability profile (EMA per dimension).
    const profiles = await db.select().from(userAbilityProfiles).where(eq(userAbilityProfiles.userId, req.user!.sub));
    const prev = profiles[0]?.dimensions ?? {};
    const nextDims: Record<string, { score: number; level: string; ema: number; n: number }> = {};
    for (const [k, v] of Object.entries(score.dimensions)) {
      const prevEma = (prev as Record<string, { ema?: number; n?: number }>)[k]?.ema;
      const prevN = (prev as Record<string, { n?: number }>)[k]?.n ?? 0;
      const ema = updateEma(prevEma, v.score);
      nextDims[k] = { score: Math.round(ema), level: scoreToCEFR(ema), ema, n: prevN + 1 };
    }
    const overall = Object.values(nextDims).length
      ? Math.round(Object.values(nextDims).reduce((a, d) => a + d.ema, 0) / Object.values(nextDims).length)
      : 0;
    await db.update(userAbilityProfiles)
      .set({ dimensions: nextDims, overallCefr: scoreToCEFR(overall), updatedAt: new Date() })
      .where(eq(userAbilityProfiles.userId, req.user!.sub));

    // Snapshot the profile for the 30-day trend (You surface).
    await db.insert(dimensionSnapshots).values({
      userId: req.user!.sub, total: score.total, overallCefr: score.cefr_estimate, dimensions: score.dimensions,
    });

    return reply.send(ok(report));
  });
}
