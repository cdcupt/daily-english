import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { scenarios, questionItems, practiceSessions, practiceTurns, userAbilityProfiles, expressionBankItems, dimensionSnapshots } from '../db/schema.js';
import { gte, and } from 'drizzle-orm';
import { buildTrendSeries } from '../scoring/trends.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { selectNextItem, profileScoreFromDimensions } from '../adaptive/select.js';
import { CEFR_DISCLAIMER } from '../scoring/cefr.js';
import { isDue } from '../review/sm2.js';
import { reviewPromptFor } from '../review/prompt.js';

const PRACTICE_MODE: Record<string, string> = {
  scenario_translation: 'translation', scenario_dialogue: 'dialogue', topic_description: 'description',
};

/**
 * Study + scenarios + profile read endpoints (TECH §B3/§B7). The Study feed
 * calls GET /v1/study/next; You calls GET /v1/profile.
 */
export async function studyRoutes(app: FastifyInstance): Promise<void> {
  // Adaptive next item (+ ensures an active session to attach turns to).
  app.get('/v1/study/next', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb();
    const userId = req.user!.sub;

    const profiles = await db.select().from(userAbilityProfiles).where(eq(userAbilityProfiles.userId, userId));
    const profileScore = profileScoreFromDimensions((profiles[0]?.dimensions as Record<string, { score: number }>) ?? {});

    // Reuse the latest active session or open a new one.
    const active = await db.select().from(practiceSessions)
      .where(eq(practiceSessions.userId, userId)).orderBy(desc(practiceSessions.startedAt)).limit(1);
    let sessionId: string;
    if (active[0] && active[0].state === 'active') sessionId = active[0].id;
    else sessionId = (await db.insert(practiceSessions).values({ userId, mode: 'mixed' }).returning())[0]!.id;

    // Resurface a due review item if one is waiting (spaced repetition).
    const exprs = await db.select().from(expressionBankItems).where(eq(expressionBankItems.userId, userId));
    const due = exprs.filter((e) => isDue(e.reviewStatus, new Date()));
    if (due.length > 0) {
      const e = due[0]!;
      const { prompt, kind } = reviewPromptFor(e);
      return reply.send(ok({
        kind: 'review', reason: 'due_review', sessionId,
        review: {
          expressionId: e.id, type: e.type, content: e.content,
          userOriginal: e.userOriginal, naturalExpression: e.naturalExpression,
          prompt, reviewKind: kind,
        },
      }));
    }

    const published = await db.select().from(questionItems).where(eq(questionItems.status, 'published'));
    // Don't serve the same item back-to-back: exclude items practiced in the
    // user's recent turns; fall back to the full pool only once they're exhausted.
    const recentTurns = await db.select({ itemId: practiceTurns.itemId })
      .from(practiceTurns)
      .innerJoin(practiceSessions, eq(practiceTurns.sessionId, practiceSessions.id))
      .where(eq(practiceSessions.userId, userId))
      .orderBy(desc(practiceTurns.createdAt))
      .limit(8);
    const recentIds = new Set(recentTurns.map((r) => r.itemId).filter((x): x is string => Boolean(x)));
    const freshPool = published.filter((i) => !recentIds.has(i.id));
    const pool = freshPool.length > 0 ? freshPool : published;
    const chosen = selectNextItem(pool.map((i) => ({ id: i.id, difficultyScore: i.difficultyScore })), profileScore);
    if (!chosen) return reply.send(ok(null, { reason: 'empty_bank' }));
    const item = published.find((i) => i.id === chosen.id)!;
    const scen = (await db.select().from(scenarios).where(eq(scenarios.id, item.scenarioId)))[0];

    return reply.send(ok({
      kind: 'practice',
      reason: 'adaptive',
      sessionId,
      item: {
        itemId: item.id,
        type: item.type,
        mode: PRACTICE_MODE[item.type],
        cefrLevel: item.cefrLevel,
        promptCn: item.promptCn,
        learningGoal: item.learningGoal,
        targetPhrases: item.targetPhrases,
        scenario: scen ? { title: scen.title, category: scen.category, userRole: scen.userRole, aiRole: scen.aiRole, goal: scen.goal } : null,
      },
    }));
  });

  app.get('/v1/scenarios', { preHandler: requireAuth }, async (_req, reply) => {
    const db = getDb();
    const rows = await db.select().from(scenarios).orderBy(scenarios.category);
    return reply.send(ok(rows, { total: rows.length }));
  });

  app.get('/v1/scenarios/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const scen = await db.select().from(scenarios).where(eq(scenarios.id, id));
    if (scen.length === 0) return reply.code(404).send(fail('not_found', 'Scenario not found'));
    const items = await db.select().from(questionItems).where(eq(questionItems.scenarioId, id));
    return reply.send(ok({ scenario: scen[0], items: items.filter((i) => i.status === 'published') }));
  });

  // Long-term ability profile (You surface). Trends enriched in a later slice.
  app.get('/v1/profile', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb();
    const rows = await db.select().from(userAbilityProfiles).where(eq(userAbilityProfiles.userId, req.user!.sub));
    const p = rows[0];
    return reply.send(ok({
      overall_cefr: p?.overallCefr ?? 'A1',
      stable_range: p?.stableRange ?? ['A1', 'A1'],
      dimensions: p?.dimensions ?? {},
      weaknesses: p?.weaknesses ?? [],
      disclaimer: CEFR_DISCLAIMER,
    }));
  });

  // 30-day dimension trend series (You chart).
  app.get('/v1/profile/trends', { preHandler: requireAuth }, async (req, reply) => {
    const q = req.query as { days?: string };
    const days = Math.min(90, Math.max(7, Number.parseInt(q.days ?? '30', 10) || 30));
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const db = getDb();
    const snaps = await db.select().from(dimensionSnapshots).where(and(
      eq(dimensionSnapshots.userId, req.user!.sub), gte(dimensionSnapshots.capturedAt, since),
    ));
    const series = buildTrendSeries(
      snaps.map((s) => ({ capturedAt: s.capturedAt, total: s.total, dimensions: s.dimensions })),
      days, now,
    );
    return reply.send(ok({ days, series }, { points: series.length }));
  });
}
