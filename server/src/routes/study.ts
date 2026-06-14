import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { scenarios, questionItems, practiceSessions, userAbilityProfiles } from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { selectNextItem, profileScoreFromDimensions } from '../adaptive/select.js';
import { CEFR_DISCLAIMER } from '../scoring/cefr.js';

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

    const published = await db.select().from(questionItems).where(eq(questionItems.status, 'published'));
    const chosen = selectNextItem(published.map((i) => ({ id: i.id, difficultyScore: i.difficultyScore })), profileScore);
    if (!chosen) return reply.send(ok(null, { reason: 'empty_bank' }));
    const item = published.find((i) => i.id === chosen.id)!;
    const scen = (await db.select().from(scenarios).where(eq(scenarios.id, item.scenarioId)))[0];

    // Reuse the latest active session or open a new one.
    const active = await db.select().from(practiceSessions)
      .where(eq(practiceSessions.userId, userId)).orderBy(desc(practiceSessions.startedAt)).limit(1);
    let sessionId: string;
    if (active[0] && active[0].state === 'active') sessionId = active[0].id;
    else sessionId = (await db.insert(practiceSessions).values({ userId, mode: 'mixed' }).returning())[0]!.id;

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
}
