import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { scenarios, questionItems, practiceSessions, practiceTurns, userAbilityProfiles, expressionBankItems, dimensionSnapshots, topicSessions } from '../db/schema.js';
import { gte, and } from 'drizzle-orm';
import { buildTrendSeries } from '../scoring/trends.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { selectNextItem, profileScoreFromDimensions } from '../adaptive/select.js';
import { CEFR_DISCLAIMER } from '../scoring/cefr.js';
import { isDue } from '../review/sm2.js';
import { reviewPromptFor } from '../review/prompt.js';
import { narrowPoolByTopic, type SessionTopic } from '../content/topicPool.js';

const PRACTICE_MODE: Record<string, string> = {
  scenario_translation: 'translation', scenario_dialogue: 'dialogue', topic_description: 'description',
};

/**
 * Resolve the user's active practice session (reuse the latest active one, else
 * open a new mixed session). Shared by study/next and the topic routes so the
 * "active session" rule is identical across both surfaces.
 */
export async function getOrCreateActiveSession(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<typeof practiceSessions.$inferSelect> {
  const active = await db.select().from(practiceSessions)
    .where(eq(practiceSessions.userId, userId)).orderBy(desc(practiceSessions.startedAt)).limit(1);
  if (active[0] && active[0].state === 'active') return active[0];
  return (await db.insert(practiceSessions).values({ userId, mode: 'mixed' }).returning())[0]!;
}

/** Read a session row's topic into the pure SessionTopic shape. */
function sessionTopicOf(session: typeof practiceSessions.$inferSelect): SessionTopic {
  return {
    kind: session.topicKind === 'category' || session.topicKind === 'custom' ? session.topicKind : null,
    category: session.topicCategory,
    topicSessionId: session.topicSessionId,
  };
}

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
    const session = await getOrCreateActiveSession(db, userId);
    const sessionId = session.id;
    const topic = sessionTopicOf(session);

    // Resurface a due review item if one is waiting (spaced repetition).
    // Reviews are GLOBAL — they resurface regardless of the active topic.
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

    // Published pool joined to scenarios so the topic filter has the category.
    const publishedRows = await db.select({ item: questionItems, scenario: scenarios })
      .from(questionItems)
      .innerJoin(scenarios, eq(questionItems.scenarioId, scenarios.id))
      .where(eq(questionItems.status, 'published'));
    const published = publishedRows.map((r) => ({ ...r.item, scenario: r.scenario }));

    // Topic-aware: narrow the pool to the session's active topic (category or
    // custom). No topic → full published pool (unchanged behaviour). Narrowing
    // happens BEFORE recency-exclusion so recency is enforced WITHIN the topic.
    const topicPool = narrowPoolByTopic(
      published.map((i) => ({ id: i.id, difficultyScore: i.difficultyScore, scenarioCategory: i.scenario.category, topicSessionId: i.topicSessionId })),
      topic,
    );

    // A custom topic whose batch hasn't produced any item yet → tell the client
    // it's still warming up (rather than 'empty_bank' or a wrong-topic item).
    if (topic.kind === 'custom' && topic.topicSessionId && topicPool.length === 0) {
      const ts = (await db.select().from(topicSessions).where(eq(topicSessions.id, topic.topicSessionId)))[0];
      if (ts && ts.status === 'generating') return reply.send(ok(null, { reason: 'topic_warming' }));
    }

    // Don't serve the same item back-to-back: exclude items practiced in the
    // user's recent turns; fall back to the full (narrowed) pool only once
    // they're exhausted.
    const recentTurns = await db.select({ itemId: practiceTurns.itemId })
      .from(practiceTurns)
      .innerJoin(practiceSessions, eq(practiceTurns.sessionId, practiceSessions.id))
      .where(eq(practiceSessions.userId, userId))
      .orderBy(desc(practiceTurns.createdAt))
      .limit(8);
    const recentIds = new Set(recentTurns.map((r) => r.itemId).filter((x): x is string => Boolean(x)));
    const freshPool = topicPool.filter((i) => !recentIds.has(i.id));
    const pool = freshPool.length > 0 ? freshPool : topicPool;
    const chosen = selectNextItem(pool.map((i) => ({ id: i.id, difficultyScore: i.difficultyScore })), profileScore);
    if (!chosen) return reply.send(ok(null, { reason: 'empty_bank' }));
    const item = published.find((i) => i.id === chosen.id)!;
    const scen = item.scenario;

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
    }, topic.kind ? { topic: { kind: topic.kind, category: topic.category, topicSessionId: topic.topicSessionId, label: session.topicLabel } } : null));
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
