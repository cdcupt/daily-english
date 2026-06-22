import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  scenarios, questionItems, contentSources, topicSessions, practiceSessions,
} from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail, SCENARIO_CATEGORIES, type ScenarioCategory } from '../schemas.js';
import { env } from '../env.js';
import { getOrCreateActiveSession } from './study.js';
import { normalizeTopic, scaffoldTopic } from '../content/topic.js';
import { validateItemQuality } from '../content/quality.js';
import { generateItem } from '../content/generate.js';
import { moderateText } from '../ai/moderation.js';
import { DualWindowLimiter } from '../util/rateLimiter.js';

const DEFAULT_RUBRIC = { vocabulary: 20, grammar: 25, naturalness: 25, task_completion: 20, pronunciation: 10 };

// Suggested custom topics shown alongside the category chips.
const TOPIC_SUGGESTIONS = ['job interview', 'ordering at a café', 'doctor visit'];

// Per-USER new-generation limits (cache HITS are not charged): ~5 per 10 min,
// 30 per day. Both windows must pass.
const generationLimiter = new DualWindowLimiter(
  { max: 5, windowMs: 10 * 60_000 },
  { max: 30, windowMs: 24 * 60 * 60_000 },
);
let sweepTimer: ReturnType<typeof setInterval> | null = null;
function startSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => generationLimiter.sweep(), 60 * 60_000);
  sweepTimer.unref?.();
}
/** Test-only: reset the generation limiter. */
export function resetTopicRateLimit(): void { generationLimiter.reset(); }

// In-memory single-flight: collapse concurrent MISS requests for the same
// normalized topic so we don't double-insert / double-generate. Maps the
// normalized topic to the in-progress promise (resolving to the topic row id).
const inflight = new Map<string, Promise<string>>();

// How many items to generate in the background after the synchronous first item.
const BACKGROUND_BATCH = 3;

const ITEM_TYPE = 'scenario_translation' as const;

interface TopicBinding {
  topicSessionId: string;
  status: 'ready' | 'generating';
  itemCount: number;
  cefrBand: string;
}

/**
 * Generate one item for a topic, quality-gate it, and (if it passes) publish it
 * with topicSessionId set + a content_source. Returns true on a published item.
 * Errors are surfaced to the caller (the synchronous path fails the request; the
 * background path swallows + logs).
 */
async function generateAndPublishItem(args: {
  topicSessionId: string;
  scenarioId: string;
  scenarioSlug: string;
  scenarioTitle: string;
  scenarioGoal: string;
  category: string;
  cefrLevel: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const db = getDb();
  const gen = await generateItem({
    scenarioTitle: args.scenarioTitle, scenarioGoal: args.scenarioGoal,
    category: args.category, type: ITEM_TYPE, cefrLevel: args.cefrLevel,
  }, undefined, { timeoutMs: args.timeoutMs });

  const quality = validateItemQuality(gen.item, args.cefrLevel);
  if (!quality.ok) {
    console.warn(`[topic] quality gate parked an item for topicSession=${args.topicSessionId}: ${quality.reasons.join('; ')}`);
    return false;
  }

  const [source] = await db.insert(contentSources)
    .values({ type: 'ai_generated', license: 'owned', reviewedBy: null }).returning();
  // Custom items skip the operator lifecycle: gate-passed → published directly.
  await db.insert(questionItems).values({
    itemKey: `${args.scenarioSlug}_${ITEM_TYPE}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    scenarioId: args.scenarioId, type: ITEM_TYPE, status: 'published', version: 1,
    cefrLevel: args.cefrLevel, difficultyScore: gen.item.difficulty_score, learningGoal: args.scenarioGoal,
    promptCn: gen.item.prompt_cn, referenceAnswers: gen.item.reference_answers,
    targetPhrases: gen.item.target_phrases, commonMistakes: gen.item.common_mistakes,
    rubric: DEFAULT_RUBRIC, sourceId: source!.id, topicSessionId: args.topicSessionId,
  });
  return true;
}

/**
 * Full custom-topic generation: insert the topic_sessions row + a synthetic
 * scenario, scaffold, generate the FIRST item synchronously (tight deadline),
 * then fire-and-forget the rest. Returns the topic binding. Throws a tagged
 * error ('topic_off_domain' | 'topic_generation_failed') the route maps to a 422.
 */
async function generateCustomTopic(normalized: string, rawTopic: string, userId: string): Promise<TopicBinding> {
  const db = getDb();

  // 1) Create the cache row in 'generating' (moderation already allowed).
  const [topicRow] = await db.insert(topicSessions).values({
    normalizedTopic: normalized, rawTopic, cefrBand: 'A2', status: 'generating',
    moderationStatus: 'allowed', itemCount: 0, createdBy: userId,
  }).onConflictDoNothing({ target: topicSessions.normalizedTopic }).returning();
  // A racing request created the row first → reuse it (single-flight should
  // mostly prevent this, but the unique index is the real guard).
  const topic = topicRow ?? (await db.select().from(topicSessions).where(eq(topicSessions.normalizedTopic, normalized)))[0]!;
  const topicSessionId = topic.id;

  try {
    // 2) Scaffold the topic into an English scenario (on-domain gate).
    const { scaffold } = await scaffoldTopic(rawTopic, undefined, { timeoutMs: env.AI_TOPIC_TIMEOUT_MS });
    if (!scaffold.onDomain) {
      await db.update(topicSessions).set({ status: 'failed' }).where(eq(topicSessions.id, topicSessionId));
      throw new TopicError('topic_off_domain', scaffold.rejectReason ?? 'Topic is not an English-practice scenario');
    }
    const category: ScenarioCategory = scaffold.category;
    const cefrLevel = scaffold.cefrBand;

    // 3) Synthetic scenario (category 'custom', slug topic_<key>) so existing
    // joins keep working. onConflictDoNothing on slug → reuse if it exists.
    const slug = `topic_${normalized}`.slice(0, 200);
    const [scenRow] = await db.insert(scenarios).values({
      slug, title: scaffold.title, category: 'custom', cefrBand: cefrLevel,
      userRole: scaffold.userRole, aiRole: scaffold.aiRole, goal: scaffold.goal,
      keyPhrases: [], commonMistakes: [], practiceModes: ['translation'],
    }).onConflictDoNothing({ target: scenarios.slug }).returning();
    const scenario = scenRow ?? (await db.select().from(scenarios).where(eq(scenarios.slug, slug)))[0]!;

    await db.update(topicSessions).set({ cefrBand: cefrLevel }).where(eq(topicSessions.id, topicSessionId));

    const genArgs = {
      topicSessionId, scenarioId: scenario.id, scenarioSlug: scenario.slug,
      scenarioTitle: scaffold.title, scenarioGoal: scaffold.goal, category, cefrLevel,
    };

    // 4) FIRST item synchronously (tight deadline — the learner is waiting).
    const firstOk = await generateAndPublishItem({ ...genArgs, timeoutMs: env.AI_TOPIC_TIMEOUT_MS });
    if (!firstOk) {
      // Quality gate failed on the only synchronous item → mark failed.
      await db.update(topicSessions).set({ status: 'failed' }).where(eq(topicSessions.id, topicSessionId));
      throw new TopicError('topic_generation_failed', 'Could not generate a usable item for this topic');
    }
    await db.update(topicSessions).set({ status: 'ready', itemCount: 1 }).where(eq(topicSessions.id, topicSessionId));

    // 5) Background batch (fire-and-forget): generate a few more, publish passers.
    queueMicrotask(() => {
      void (async () => {
        for (let i = 0; i < BACKGROUND_BATCH; i += 1) {
          try {
            const published = await generateAndPublishItem(genArgs);
            if (published) {
              await db.update(topicSessions)
                .set({ itemCount: sql`${topicSessions.itemCount} + 1` })
                .where(eq(topicSessions.id, topicSessionId));
            }
          } catch (e) {
            console.warn(`[topic] background item gen failed for topicSession=${topicSessionId}:`, e instanceof Error ? e.message : e);
          }
        }
      })();
    });

    return { topicSessionId, status: 'ready', itemCount: 1, cefrBand: cefrLevel };
  } catch (e) {
    // Mark failed on any unexpected error so the cache row isn't stuck 'generating'
    // forever (a later request can't reuse a broken row as ready). Re-throw.
    if (!(e instanceof TopicError)) {
      await db.update(topicSessions).set({ status: 'failed' }).where(eq(topicSessions.id, topicSessionId)).catch(() => {});
    }
    throw e;
  }
}

/** Tagged error so the route can map a known failure to a 422 with its code. */
class TopicError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TopicError';
  }
}

/**
 * Topic Sessions routes (Topic Sessions design): list topics, set/read/clear the
 * active session's topic. Custom topics moderate → scaffold → generate → cache.
 */
export async function topicRoutes(app: FastifyInstance): Promise<void> {
  startSweep();

  // GET /v1/topics — category chips (only categories with ≥1 published item) +
  // a few custom suggestions.
  app.get('/v1/topics', { preHandler: requireAuth }, async (_req, reply) => {
    const db = getDb();
    const rows = await db.select({
      category: scenarios.category,
      scenarioCount: sql<number>`count(distinct ${scenarios.id})`,
      publishedItemCount: sql<number>`count(${questionItems.id})`,
    })
      .from(scenarios)
      .innerJoin(questionItems, and(eq(questionItems.scenarioId, scenarios.id), eq(questionItems.status, 'published')))
      .groupBy(scenarios.category);

    const categories = rows
      // ≥1 published item, and exclude the synthetic 'custom' bucket (custom-topic
      // scenarios are bound by topicSessionId, never offered as a category chip).
      .filter((r) => Number(r.publishedItemCount) >= 1 && isScenarioCategory(r.category))
      .map((r) => ({
        key: r.category,
        label: categoryLabel(r.category),
        scenarioCount: Number(r.scenarioCount),
        publishedItemCount: Number(r.publishedItemCount),
      }));

    return reply.send(ok({ categories, suggestions: TOPIC_SUGGESTIONS }));
  });

  // POST /v1/study/topic — set the active session's topic.
  app.post('/v1/study/topic', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.sub;
    const b = (req.body ?? {}) as { kind?: string; category?: string; topic?: string };
    const db = getDb();
    const session = await getOrCreateActiveSession(db, userId);

    if (b.kind === 'category') {
      if (!b.category || !isScenarioCategory(b.category)) {
        return reply.code(422).send(fail('bad_request', `category must be one of ${SCENARIO_CATEGORIES.join(', ')}`));
      }
      // Validate the category actually has published items.
      const exists = await db.select({ n: sql<number>`count(${questionItems.id})` })
        .from(scenarios)
        .innerJoin(questionItems, and(eq(questionItems.scenarioId, scenarios.id), eq(questionItems.status, 'published')))
        .where(eq(scenarios.category, b.category));
      if (Number(exists[0]?.n ?? 0) === 0) {
        return reply.code(422).send(fail('topic_unavailable', 'No published items for that category yet'));
      }
      await db.update(practiceSessions).set({
        topicKind: 'category', topicCategory: b.category, topicSessionId: null, topicLabel: categoryLabel(b.category),
      }).where(eq(practiceSessions.id, session.id));
      return reply.send(ok({
        sessionId: session.id,
        topic: { kind: 'category', label: categoryLabel(b.category), category: b.category, status: 'ready' },
      }));
    }

    if (b.kind === 'custom') {
      const norm = normalizeTopic(b.topic ?? '');
      if (!norm.ok) return reply.code(422).send(fail('bad_request', norm.reason));

      // Cache lookup by normalized topic ONLY (level-agnostic shared cache).
      const cached = (await db.select().from(topicSessions)
        .where(eq(topicSessions.normalizedTopic, norm.cacheKey)))[0];
      if (cached && cached.status === 'ready') {
        // HIT → bind + return ready. No regeneration, NOT rate-limited.
        await bindCustom(db, session.id, cached.id, cached.rawTopic);
        return reply.send(ok({
          sessionId: session.id,
          topic: { kind: 'custom', label: cached.rawTopic, topicId: cached.id, status: 'ready', itemCount: cached.itemCount },
        }));
      }

      // MISS → rate-limit NEW generations per user (cache hits above are free).
      if (generationLimiter.isLimited(userId)) {
        return reply.code(429).send(fail('rate_limited', 'Too many new topics, try again later'));
      }

      // Moderate (fail-CLOSED: flagged OR any moderation error → reject).
      try {
        const mod = await moderateText(norm.normalized);
        if (mod.flagged) {
          return reply.code(422).send(fail('topic_rejected', 'That topic is not allowed'));
        }
      } catch {
        // Moderation outage → reject rather than let unmoderated text into the
        // shared cache. Nothing is persisted.
        return reply.code(422).send(fail('topic_rejected', 'Could not verify the topic right now'));
      }

      // Single-flight: collapse concurrent MISS for the same normalized topic so
      // we generate (and insert) exactly once. Followers await the same promise.
      let binding: TopicBinding;
      try {
        const existing = inflight.get(norm.cacheKey);
        if (existing) {
          const topicSessionId = await existing;
          const ts = (await db.select().from(topicSessions).where(eq(topicSessions.id, topicSessionId)))[0]!;
          binding = { topicSessionId, status: ts.status === 'ready' ? 'ready' : 'generating', itemCount: ts.itemCount, cefrBand: ts.cefrBand };
        } else {
          const promise = generateCustomTopic(norm.cacheKey, norm.normalized, userId);
          // Followers only need the id; store an id-resolving view of the promise.
          // The leader (below) owns error handling; swallow on the stored view so a
          // rejection with no concurrent follower isn't an unhandled rejection.
          const idView = promise.then((b2) => b2.topicSessionId);
          idView.catch(() => {});
          inflight.set(norm.cacheKey, idView);
          try {
            binding = await promise;
          } finally {
            inflight.delete(norm.cacheKey);
          }
        }
      } catch (e) {
        if (e instanceof TopicError) {
          return reply.code(422).send(fail(e.code, e.message));
        }
        throw e;
      }

      await bindCustom(db, session.id, binding.topicSessionId, norm.normalized);
      return reply.send(ok({
        sessionId: session.id,
        topic: { kind: 'custom', label: norm.normalized, topicId: binding.topicSessionId, status: binding.status, itemCount: binding.itemCount },
      }));
    }

    return reply.code(422).send(fail('bad_request', "kind must be 'category' or 'custom'"));
  });

  // GET /v1/study/topic — read the active session's topic.
  app.get('/v1/study/topic', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb();
    const session = await getOrCreateActiveSession(db, req.user!.sub);
    if (!session.topicKind) return reply.send(ok({ sessionId: session.id, topic: null }));
    if (session.topicKind === 'category') {
      return reply.send(ok({
        sessionId: session.id,
        topic: { kind: 'category', label: session.topicLabel, category: session.topicCategory, status: 'ready' },
      }));
    }
    // custom
    const ts = session.topicSessionId
      ? (await db.select().from(topicSessions).where(eq(topicSessions.id, session.topicSessionId)))[0]
      : null;
    return reply.send(ok({
      sessionId: session.id,
      topic: {
        kind: 'custom', label: session.topicLabel, topicId: session.topicSessionId,
        status: ts?.status ?? 'failed', itemCount: ts?.itemCount ?? 0,
      },
    }));
  });

  // DELETE /v1/study/topic — clear the active session's topic.
  app.delete('/v1/study/topic', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb();
    const session = await getOrCreateActiveSession(db, req.user!.sub);
    await db.update(practiceSessions).set({
      topicKind: null, topicCategory: null, topicSessionId: null, topicLabel: null,
    }).where(eq(practiceSessions.id, session.id));
    return reply.send(ok({ sessionId: session.id, topic: null }));
  });
}

async function bindCustom(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  topicSessionId: string,
  label: string,
): Promise<void> {
  await db.update(practiceSessions).set({
    topicKind: 'custom', topicCategory: null, topicSessionId, topicLabel: label,
  }).where(eq(practiceSessions.id, sessionId));
}

function isScenarioCategory(s: string): s is ScenarioCategory {
  return (SCENARIO_CATEGORIES as readonly string[]).includes(s);
}

const CATEGORY_LABELS: Record<string, string> = {
  daily_life: 'Daily Life',
  education_growth: 'Education & Growth',
  express_yourself: 'Express Yourself',
  health_services: 'Health & Services',
  shopping_money: 'Shopping & Money',
  social: 'Social',
  travel: 'Travel',
  work: 'Work',
};
function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
