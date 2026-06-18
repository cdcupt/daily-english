import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { getDb } from '../db/client.js';
import { aiTaskConfig } from '../db/schema.js';
import { getProvider, providerAvailable, supportsTemperature, isProviderId, type ProviderId } from './providers.js';

/**
 * Per-task AI config registry (AI-config blueprint). Each task resolves a
 * provider + model with precedence: DB override (operator, no-redeploy) > env
 * override (AI_<TASK>_PROVIDER/MODEL) > eval-based default. Unavailable
 * providers (missing key) degrade gracefully so a misconfig never 500s the loop.
 */
export const TASK_KEYS = ['feedback', 'dialogue', 'scoring', 'item_gen', 'asr'] as const;
export type TaskKey = (typeof TASK_KEYS)[number];

export function isTaskKey(s: string): s is TaskKey {
  return (TASK_KEYS as readonly string[]).includes(s);
}

export interface TaskDefault { provider: ProviderId; model: string; fallback?: { provider: ProviderId; model: string } }
export interface TaskSource { provider?: ProviderId; model?: string; fallbackModel?: string | null }
export interface ResolvedTask {
  task: TaskKey;
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string | undefined;
  supportsTemp: boolean;
  fallback?: { provider: ProviderId; model: string };
  source: 'db' | 'env' | 'default' | 'degraded';
}

/** Eval-based defaults (MODEL-EVAL-v2). AI_TEXT_MODEL stays the openai text default for back-compat. */
export function defaults(): Record<TaskKey, TaskDefault> {
  const openaiText = env.AI_TEXT_MODEL;
  return {
    feedback: { provider: 'openai', model: openaiText },
    dialogue: { provider: 'openai', model: openaiText },
    // scoring runs on the SYNCHRONOUS finish path, so latency + reliability win.
    // QA (2026-06-18) measured gemini-3-flash-preview at 12–86s (frequent stalls)
    // vs openai gpt-5.4-mini at ~1.4s with equivalent scores → openai primary,
    // gemini-flash kept as the cross-provider fallback.
    scoring: { provider: 'openai', model: openaiText, fallback: { provider: 'gemini', model: 'gemini-3-flash-preview' } },
    item_gen: { provider: 'gemini', model: 'gemini-3-flash-preview', fallback: { provider: 'openai', model: openaiText } },
    asr: { provider: 'openai', model: env.ASR_MODEL },
  };
}

/** Per-task env override, read from process.env (keeps the Zod schema lean). */
export function envOverride(task: TaskKey): TaskSource {
  const up = task.toUpperCase();
  const p = process.env[`AI_${up}_PROVIDER`];
  const m = process.env[`AI_${up}_MODEL`];
  return {
    provider: p && isProviderId(p) ? p : undefined,
    model: m || undefined,
  };
}

/**
 * Pure precedence + availability resolution (unit-tested without a DB).
 * db > env > default; if the chosen provider has no key, fall back to the
 * default provider, then to openai+AI_TEXT_MODEL as a last resort.
 */
export function pickConfig(
  def: TaskDefault,
  envOv: TaskSource,
  dbRow: TaskSource | null,
  isAvail: (p: ProviderId) => boolean,
): { provider: ProviderId; model: string; fallback?: { provider: ProviderId; model: string }; source: ResolvedTask['source'] } {
  let source: ResolvedTask['source'] = 'default';
  let provider = def.provider;
  let model = def.model;
  if (envOv.provider || envOv.model) { source = 'env'; provider = envOv.provider ?? provider; model = envOv.model ?? model; }
  if (dbRow && (dbRow.provider || dbRow.model)) { source = 'db'; provider = dbRow.provider ?? provider; model = dbRow.model ?? model; }

  // A DB row that is present but has fallbackModel=null explicitly suppresses the
  // default fallback; absence of a DB row keeps def.fallback.
  const fallback = dbRow
    ? (dbRow.fallbackModel ? { provider: 'openai' as ProviderId, model: dbRow.fallbackModel } : undefined)
    : def.fallback;

  if (!isAvail(provider)) {
    if (fallback && isAvail(fallback.provider)) { provider = fallback.provider; model = fallback.model; source = 'degraded'; }
    else if (isAvail(def.provider) && def.provider !== provider) { provider = def.provider; model = def.model; source = 'degraded'; }
    else { provider = 'openai'; model = env.AI_TEXT_MODEL; source = 'degraded'; }
  }
  return { provider, model, fallback, source };
}

// --- DB override cache (TTL) so runtime changes propagate without a per-call DB hit ---
const CACHE_TTL_MS = 30_000;
let cache: { at: number; rows: Map<string, TaskSource> } | null = null;
let inflight: Promise<Map<string, TaskSource>> | null = null;

export function invalidateConfigCache(): void { cache = null; inflight = null; }

async function loadDbOverrides(nowMs: number): Promise<Map<string, TaskSource>> {
  if (cache && nowMs - cache.at < CACHE_TTL_MS) return cache.rows;
  if (inflight) return inflight; // single-flight: concurrent callers share one query
  inflight = (async () => {
    const rows = new Map<string, TaskSource>();
    if (env.DATABASE_URL) {
      try {
        const list = await getDb().select().from(aiTaskConfig);
        for (const r of list) {
          rows.set(r.task, {
            provider: isProviderId(r.provider) ? r.provider : undefined,
            model: r.model,
            fallbackModel: r.fallbackModel,
          });
        }
      } catch {
        // DB unavailable → fall through to env/defaults (don't break the loop).
      }
    }
    cache = { at: nowMs, rows };
    return rows;
  })().finally(() => { inflight = null; });
  return inflight;
}

export async function resolveTask(task: TaskKey, nowMs = Date.now()): Promise<ResolvedTask> {
  const def = defaults()[task];
  const dbRows = await loadDbOverrides(nowMs);
  const picked = pickConfig(def, envOverride(task), dbRows.get(task) ?? null, providerAvailable);
  const prov = getProvider(picked.provider);
  return {
    task,
    provider: picked.provider,
    model: picked.model,
    baseUrl: prov.baseUrl,
    apiKey: prov.apiKey,
    supportsTemp: supportsTemperature(picked.model),
    fallback: picked.fallback,
    source: picked.source,
  };
}

export async function resolveAll(nowMs = Date.now()): Promise<ResolvedTask[]> {
  return Promise.all(TASK_KEYS.map((t) => resolveTask(t, nowMs)));
}
