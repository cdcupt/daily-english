import type { z } from 'zod';
import { OpenAIChatClient, AIError } from './client.js';
import { runStructured, AIContractError } from './runner.js';
import { resolveTask, type TaskKey } from './registry.js';
import { getProvider, supportsTemperature, type ProviderId } from './providers.js';

/**
 * Task execution with provider hardening (AI-config blueprint):
 * - resolves the configured provider+model for the task,
 * - omits `temperature` for models that reject it (e.g. gpt-5.5),
 * - retries transient 5xx with backoff, and
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
}
export interface RunTaskResult<T> { data: T; raw: string; repaired: boolean; model: string; provider: string }

export interface AttemptTarget { provider: ProviderId; model: string; baseUrl: string; apiKey: string | undefined }

const defaultSleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
export const isTransientErr = (e: unknown): boolean => e instanceof AIError && (e.status === undefined || e.status >= 500);
const isContractErr = (e: unknown): boolean => e instanceof AIContractError;

/** Retry primary on transient errors with backoff; fall back once on persistent transient/contract failure. */
export async function runWithResilience<T, R extends AttemptTarget>(opts: {
  primary: R;
  fallback?: R;
  run: (target: R) => Promise<T>;
  delays?: number[];
  sleep?: (ms: number) => Promise<void>;
  transient?: (e: unknown) => boolean;
  contract?: (e: unknown) => boolean;
}): Promise<{ result: T; used: R }> {
  const delays = opts.delays ?? [400, 1200];
  const sleep = opts.sleep ?? defaultSleep;
  const transient = opts.transient ?? isTransientErr;
  const contract = opts.contract ?? isContractErr;
  let lastErr: unknown;
  for (let i = 0; i <= delays.length; i += 1) {
    try {
      return { result: await opts.run(opts.primary), used: opts.primary };
    } catch (e) {
      lastErr = e;
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
    return runStructured<T>({ client, system: args.system, user: args.user, schema: args.schema, jsonSchema: args.jsonSchema, temperature, model: t.model });
  };

  const { result, used } = await runWithResilience({ primary, fallback, run });
  return { data: result.data, raw: result.raw, repaired: result.repaired, model: used.model, provider: used.provider };
}

function pick(p: ProviderId): { baseUrl: string; apiKey: string | undefined } {
  const prov = getProvider(p);
  return { baseUrl: prov.baseUrl, apiKey: prov.apiKey };
}
