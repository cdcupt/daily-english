import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { questionItems, questionQualityMetrics, scenarios, contentSources, aiTaskConfig } from '../db/schema.js';
import { requireOperator } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { canTransition, isItemStatus, allowedTransitions, type ItemStatus } from '../content/lifecycle.js';
import { generateItem } from '../content/generate.js';
import { resolveAll, invalidateConfigCache, isTaskKey } from '../ai/registry.js';
import { isProviderId, providerAvailable, PROVIDER_IDS } from '../ai/providers.js';

const DEFAULT_RUBRIC = { vocabulary: 20, grammar: 25, naturalness: 25, task_completion: 20, pronunciation: 10 };

/**
 * Operator content-management surface (TECH §B8). Non-operators are 404'd by
 * requireOperator (the surface is not revealed). Lifecycle transitions are
 * validated against the pure state machine.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Item list + status + quality metrics.
  app.get('/v1/admin/items', { preHandler: requireOperator }, async (_req, reply) => {
    const db = getDb();
    const rows = await db.select({
      id: questionItems.id, itemKey: questionItems.itemKey, type: questionItems.type,
      status: questionItems.status, version: questionItems.version, cefrLevel: questionItems.cefrLevel,
      difficultyScore: questionItems.difficultyScore, scenarioId: questionItems.scenarioId,
      metrics: questionQualityMetrics,
    }).from(questionItems)
      .leftJoin(questionQualityMetrics, eq(questionQualityMetrics.itemId, questionItems.id))
      .orderBy(desc(questionItems.createdAt));
    return reply.send(ok(rows, { total: rows.length }));
  });

  // Lifecycle transition (validated).
  app.post('/v1/admin/items/:id/transition', { preHandler: requireOperator }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { to } = (req.body ?? {}) as { to?: string };
    if (!to || !isItemStatus(to)) return reply.code(400).send(fail('bad_request', 'invalid target status'));
    const db = getDb();
    const rows = await db.select().from(questionItems).where(eq(questionItems.id, id));
    if (rows.length === 0) return reply.code(404).send(fail('not_found', 'Item not found'));
    const from = rows[0]!.status as ItemStatus;
    if (!canTransition(from, to)) {
      return reply.code(409).send(fail('illegal_transition', `Cannot go ${from} → ${to}. Allowed: ${allowedTransitions(from).join(', ') || 'none'}`));
    }
    const [row] = await db.update(questionItems).set({ status: to }).where(eq(questionItems.id, id)).returning();
    return reply.send(ok({ id: row!.id, status: row!.status }));
  });

  // Regenerate an item via AI → new draft version.
  app.post('/v1/admin/items/:id/regenerate', { preHandler: requireOperator }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const rows = await db.select().from(questionItems).where(eq(questionItems.id, id));
    if (rows.length === 0) return reply.code(404).send(fail('not_found', 'Item not found'));
    const item = rows[0]!;
    const scen = (await db.select().from(scenarios).where(eq(scenarios.id, item.scenarioId)))[0];
    if (!scen) return reply.code(404).send(fail('not_found', 'Scenario not found'));

    const gen = await generateItem({
      scenarioTitle: scen.title, scenarioGoal: scen.goal, category: scen.category,
      type: item.type, cefrLevel: item.cefrLevel,
    });
    const [row] = await db.update(questionItems).set({
      status: 'draft', version: item.version + 1,
      promptCn: gen.item.prompt_cn, referenceAnswers: gen.item.reference_answers,
      targetPhrases: gen.item.target_phrases, commonMistakes: gen.item.common_mistakes,
      difficultyScore: gen.item.difficulty_score,
    }).where(eq(questionItems.id, id)).returning();
    return reply.send(ok({ id: row!.id, status: row!.status, version: row!.version }));
  });

  // Generate a brand-new item draft for a scenario.
  app.post('/v1/admin/generate', { preHandler: requireOperator }, async (req, reply) => {
    const b = (req.body ?? {}) as { scenarioId?: string; type?: string; cefrLevel?: string };
    if (!b.scenarioId) return reply.code(400).send(fail('bad_request', 'scenarioId is required'));
    const db = getDb();
    const scen = (await db.select().from(scenarios).where(eq(scenarios.id, b.scenarioId)))[0];
    if (!scen) return reply.code(404).send(fail('not_found', 'Scenario not found'));
    const type = (b.type ?? 'scenario_translation') as 'scenario_translation' | 'scenario_dialogue' | 'topic_description';
    const cefrLevel = b.cefrLevel ?? scen.cefrBand.split('-')[0] ?? 'A2';

    const gen = await generateItem({ scenarioTitle: scen.title, scenarioGoal: scen.goal, category: scen.category, type, cefrLevel });
    const [source] = await db.insert(contentSources)
      .values({ type: 'ai_generated', license: 'owned', reviewedBy: null }).returning();
    const [row] = await db.insert(questionItems).values({
      itemKey: `${scen.slug}_${type}_${Date.now()}`, scenarioId: scen.id, type, status: 'generated', version: 1,
      cefrLevel, difficultyScore: gen.item.difficulty_score, learningGoal: scen.goal,
      promptCn: gen.item.prompt_cn, referenceAnswers: gen.item.reference_answers,
      targetPhrases: gen.item.target_phrases, commonMistakes: gen.item.common_mistakes,
      rubric: DEFAULT_RUBRIC, sourceId: source!.id,
    }).returning();
    return reply.code(201).send(ok({ id: row!.id, status: row!.status, itemKey: row!.itemKey }));
  });

  // --- Configurable AI models (per task), switchable at runtime, no redeploy ---

  // Current resolved config per task + which providers have a key configured.
  app.get('/v1/admin/ai-config', { preHandler: requireOperator }, async (_req, reply) => {
    const tasks = await resolveAll();
    return reply.send(ok({
      providers: PROVIDER_IDS.map((id) => ({ id, available: providerAvailable(id) })),
      tasks: tasks.map((t) => ({
        task: t.task, provider: t.provider, model: t.model,
        fallback: t.fallback ?? null, source: t.source, supportsTemperature: t.supportsTemp,
      })),
    }));
  });

  // Override a task's model at runtime (persisted; takes precedence over env/default).
  app.put('/v1/admin/ai-config/:task', { preHandler: requireOperator }, async (req, reply) => {
    const { task } = req.params as { task: string };
    if (!isTaskKey(task)) return reply.code(400).send(fail('bad_request', 'unknown task'));
    const b = (req.body ?? {}) as { provider?: string; model?: string; fallbackModel?: string | null };
    if (!b.provider || !isProviderId(b.provider)) return reply.code(400).send(fail('bad_request', `provider must be one of ${PROVIDER_IDS.join(', ')}`));
    if (!b.model) return reply.code(400).send(fail('bad_request', 'model is required'));
    const MODEL_RE = /^[\w.:\-/]{1,200}$/;
    if (!MODEL_RE.test(b.model)) return reply.code(400).send(fail('bad_request', 'model must be a valid model identifier (≤200 chars, [A-Za-z0-9._:/-])'));
    if (b.fallbackModel != null && !MODEL_RE.test(b.fallbackModel)) return reply.code(400).send(fail('bad_request', 'fallbackModel must be a valid model identifier'));
    if (!providerAvailable(b.provider)) return reply.code(409).send(fail('provider_unavailable', `${b.provider} has no API key configured`));

    const db = getDb();
    await db.insert(aiTaskConfig).values({
      task, provider: b.provider, model: b.model, fallbackModel: b.fallbackModel ?? null,
      updatedBy: req.user!.sub, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: aiTaskConfig.task,
      set: { provider: b.provider, model: b.model, fallbackModel: b.fallbackModel ?? null, updatedBy: req.user!.sub, updatedAt: new Date() },
    });
    invalidateConfigCache();
    return reply.send(ok({ task, provider: b.provider, model: b.model }));
  });

  // Revert a task to its env/default config.
  app.delete('/v1/admin/ai-config/:task', { preHandler: requireOperator }, async (req, reply) => {
    const { task } = req.params as { task: string };
    if (!isTaskKey(task)) return reply.code(400).send(fail('bad_request', 'unknown task'));
    const db = getDb();
    await db.delete(aiTaskConfig).where(eq(aiTaskConfig.task, task));
    invalidateConfigCache();
    return reply.send(ok({ task, reverted: true }));
  });
}
