import type { z } from 'zod';
import { env } from '../env.js';
import { OpenAIChatClient, AIError } from './client.js';
import { runStructured, AIContractError } from './runner.js';
import { resolveTask, type TaskKey } from './registry.js';
import { getProvider, supportsTemperature, type ProviderId } from './providers.js';

/**
 * Task execution with provider hardening (AI-config blueprint):
 * - resolves the configured provider+model for the task,
 * - omits `temperature` for models that reject it (e.g. gpt-5.5),
 * - aborts a stalled call at AI_REQUEST_TIMEOUT_MS (no hanging requests),
 * - retries transient 5xx / network / timeout errors with backoff, and
 * - falls back to the task's fallback model on persistent failure.
 * The resilience core (`runWithResilience`) is injectable for unit tests.
 */
export interface RunTaskArgs<T> {
  task: TaskKey;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  jsonSchema?: { name: string; strict: boolean; schema: unknown };
  temperature?: number;
  // Optional tighter per-attempt deadline (ms) overriding AI_REQUEST_TIMEOUT_MS.
  // Used by the synchronous first custom-topic item where the learner is waiting.
  timeoutMs?: number;
}
export interface RunTaskResult<T> { data: T; raw: string; repaired: boolean; model: string; provider: string }

export interface AttemptTarget { provider: ProviderId; model: string; baseUrl: string; apiKey: string | undefined }

const defaultSleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/**
 * Transient = worth retrying then falling over. Covers provider 5xx and any
 * status-less AIError (the client rewraps network failures / aborted-timeouts
 * as status-less AIErrors), plus bare AbortError/TimeoutError/TypeError in case
 * a raw fetch rejection ever reaches here unwrapped. A 4xx stays non-transient.
 */
export const isTransientErr = (e: unknown): boolean => {
  if (e instanceof AIError) return e.status === undefined || e.status >= 500;
  if (e instanceof Error) return e.name === 'AbortError' || e.name === 'TimeoutError' || e instanceof TypeError;
  return false;
};
const isContractErr = (e: unknown): boolean => e instanceof AIContractError;

/**
 * A timed-out / aborted call means the primary is *slow right now* — retrying the
 * same primary just burns another full timeout. So on a timeout we skip the
 * remaining primary retries and fail over to the fallback immediately. (A quick
 * 5xx, by contrast, is cheap to retry.) This bounds worst-case latency on the
 * synchronous scoring path to ~one timeout + the fallback call.
 */
export const isTimeoutErr = (e: unknown): boolean =>
  (e instanceof AIError && /timed out|AbortError|TimeoutError/i.test(e.message))
  || (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError'));

/** Retry primary on transient errors with backoff; fall back once on persistent transient/contract failure. */
export async function runWithResilience<T, R extends AttemptTarget>(opts: {
  primary: R;
  fallback?: R;
  run: (target: R) => Promise<T>;
  delays?: number[];
  sleep?: (ms: number) => Promise<void>;
  transient?: (e: unknown) => boolean;
  contract?: (e: unknown) => boolean;
  timedOut?: (e: unknown) => boolean;
}): Promise<{ result: T; used: R }> {
  const delays = opts.delays ?? [400, 1200];
  const sleep = opts.sleep ?? defaultSleep;
  const transient = opts.transient ?? isTransientErr;
  const contract = opts.contract ?? isContractErr;
  const timedOut = opts.timedOut ?? isTimeoutErr;
  let lastErr: unknown;
  for (let i = 0; i <= delays.length; i += 1) {
    try {
      return { result: await opts.run(opts.primary), used: opts.primary };
    } catch (e) {
      lastErr = e;
      if (timedOut(e)) break; // stalled primary — don't burn retries, fail over now
      if (transient(e) && i < delays.length) { await sleep(delays[i]!); continue; }
      break;
    }
  }
  if (opts.fallback && (transient(lastErr) || contract(lastErr))) {
    return { result: await opts.run(opts.fallback), used: opts.fallback };
  }
  throw lastErr;
}

export async function runTask<T>(args: RunTaskArgs<T>): Promise<RunTaskResult<T>> {
  const cfg = await resolveTask(args.task);
  const primary: AttemptTarget = { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
  const fallback: AttemptTarget | undefined = cfg.fallback
    ? { provider: cfg.fallback.provider, model: cfg.fallback.model, ...pick(cfg.fallback.provider) }
    : undefined;

  const run = async (t: AttemptTarget) => {
    const client = new OpenAIChatClient(t.apiKey, t.baseUrl, t.model);
    const temperature = supportsTemperature(t.model) ? args.temperature : undefined;
    // Fresh deadline per attempt (primary, each retry, fallback) so a stalled
    // provider is aborted and routed to the next attempt instead of hanging.
    const controller = new AbortController();
    const deadlineMs = args.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
    const timer = setTimeout(() => { controller.abort(); }, deadlineMs);
    try {
      return await runStructured<T>({ client, system: args.system, user: args.user, schema: args.schema, jsonSchema: args.jsonSchema, temperature, model: t.model, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const { result, used } = await runWithResilience({ primary, fallback, run });
  if (used.model !== primary.model || used.provider !== primary.provider) {
    // Surface fallbacks in `docker logs` — otherwise degradation is invisible.
    console.warn(`[ai] task=${args.task} fell back ${primary.provider}/${primary.model} -> ${used.provider}/${used.model}`);
  }
  return { data: result.data, raw: result.raw, repaired: result.repaired, model: used.model, provider: used.provider };
}

function pick(p: ProviderId): { baseUrl: string; apiKey: string | undefined } {
  const prov = getProvider(p);
  return { baseUrl: prov.baseUrl, apiKey: prov.apiKey };
}
