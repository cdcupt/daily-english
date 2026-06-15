/**
 * Model evaluation harness for the AI Scenario English Trainer.
 *
 * For each candidate model x task it:
 *  - builds the REAL system/user prompt (reused from src/ai/prompts, src/scoring/rubric,
 *    src/content/generate — no re-authoring),
 *  - POSTs directly to {baseURL}/chat/completions capturing usage tokens + latency,
 *  - tries response_format=json_schema first; on a 400 that looks schema-related,
 *    retries WITHOUT it and flags jsonSchema:'unsupported',
 *  - validates the output with the task's Zod schema -> valid_first_try / repaired
 *    (one repair retry feeding the zod error back) / failed,
 *  - for rubric scoring runs 3x and computes stability (stdev of the 6 dims + stdev
 *    of an app-style total),
 *  - records latency_ms, prompt/completion tokens, $/run, and a truncated sample.
 *
 * Real data only. No fabricated numbers. Keys come from env; never written to disk.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

import {
  instantFeedbackSystem,
  instantFeedbackUser,
} from '../src/ai/prompts.js';
import {
  FeedbackPayloadSchema,
  FEEDBACK_JSON_SCHEMA,
  RubricScoreSchema,
  RUBRIC_JSON_SCHEMA,
  ItemGenSchema,
  ITEM_GEN_JSON_SCHEMA,
} from '../src/schemas.js';
import { FEEDBACK_CASES, RUBRIC_CASE, RUBRIC_RUNS, ITEM_GEN_CASE } from './dataset.js';

// ---- Rubric + item-gen prompts: re-derive the exact strings the app sends. ----
// rubric.ts / generate.ts keep these private (built inline), so we mirror them here
// verbatim to keep the eval faithful without changing app source.
const RUBRIC_SYSTEM = [
  'You are a strict, consistent English assessor. Score the learner response on six 0–100 dimensions:',
  'vocabulary, grammar, coherence, interaction, fluency, pronunciation.',
  'Use these calibration anchors: 30 = beginner with frequent breakdowns; 55 = understandable with errors;',
  '70 = solid B1; 85 = strong B2/C1; 95 = near-native. Be reproducible — identical input must score identically.',
  'Also return a one-sentence summary and up to 4 concrete weak_points. Return JSON only.',
].join(' ');

function rubricUser(): string {
  const i = RUBRIC_CASE;
  return [
    `Scenario goal: ${i.scenarioGoal}`,
    `Target CEFR: ${i.cefrTarget}`,
    `Modality: ${i.isSpoken ? 'spoken (transcribed)' : 'written'}`,
    i.referenceAnswers.length ? `Reference: ${i.referenceAnswers.join(' | ')}` : '',
    '',
    `Learner: "${i.transcriptOrText}"`,
  ].filter(Boolean).join('\n');
}

function itemGenSystem(): string {
  const input = ITEM_GEN_CASE;
  return [
    'You generate ONE high-quality English-practice item for a real-world scenario.',
    `Type: ${input.type}. Target CEFR: ${input.cefrLevel}.`,
    'For translation items, prompt_cn is a natural Chinese sentence the learner must render in idiomatic English;',
    'reference_answers are 1–3 natural English versions; target_phrases are reusable patterns; common_mistakes are',
    'realistic learner errors with short fixes; difficulty_score is 0–100 matching the CEFR. Return JSON only.',
  ].join(' ');
}
function itemGenUser(): string {
  const input = ITEM_GEN_CASE;
  return `Scenario: ${input.scenarioTitle} (${input.category}). Goal: ${input.scenarioGoal}.`;
}

// ---------------------------- candidates ----------------------------
interface Candidate {
  key: string;
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
  note?: string;
}

const OPENAI_KEY = process.env.EVAL_OPENAI_KEY ?? process.env.OPENAI_API_KEY ?? '';
const GEMINI_KEY = process.env.EVAL_GEMINI_KEY ?? '';
const OPENAI_BASE = 'https://api.openai.com/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

// The spec's requested model IDs. Some may not exist on the provider yet — we
// attempt them so a 404 becomes a real finding, and ALSO test the closest
// shipping model so the PM gets actionable data.
const CANDIDATES: Candidate[] = [
  { key: 'openai-flagship', provider: 'OpenAI', baseURL: OPENAI_BASE, model: 'gpt-5.5', apiKey: OPENAI_KEY, note: 'spec model id' },
  { key: 'openai-flagship-real', provider: 'OpenAI', baseURL: OPENAI_BASE, model: 'gpt-5.4', apiKey: OPENAI_KEY, note: 'closest shipping flagship' },
  { key: 'openai-mini', provider: 'OpenAI', baseURL: OPENAI_BASE, model: 'gpt-5.4-mini', apiKey: OPENAI_KEY, note: 'spec model id' },
  { key: 'openai-mini-real', provider: 'OpenAI', baseURL: OPENAI_BASE, model: 'gpt-5-mini', apiKey: OPENAI_KEY, note: 'closest shipping mini' },
  { key: 'gemini-flash', provider: 'Gemini', baseURL: GEMINI_BASE, model: 'gemini-3-flash-preview', apiKey: GEMINI_KEY },
  { key: 'gemini-pro', provider: 'Gemini', baseURL: GEMINI_BASE, model: 'gemini-3.1-pro-preview', apiKey: GEMINI_KEY },
];

// ---------------------------- pricing (USD / 1M tokens) ----------------------------
// Public list prices as of 2026-06. Gemini preview prices marked est.
interface Price { in: number; out: number; est?: boolean }
const PRICES: Record<string, Price> = {
  'gpt-5.5': { in: 1.25, out: 10.0, est: true },          // not yet released; placeholder at gpt-5 flagship tier
  'gpt-5.4': { in: 1.25, out: 10.0 },                      // OpenAI flagship tier (gpt-5.x standard)
  'gpt-5.4-mini': { in: 0.25, out: 2.0, est: true },       // not released; mini tier estimate
  'gpt-5-mini': { in: 0.25, out: 2.0 },                    // OpenAI gpt-5-mini public price
  'gemini-3-flash-preview': { in: 0.30, out: 2.50, est: true },   // est. (preview, ~Gemini Flash tier)
  'gemini-3.1-pro-preview': { in: 2.00, out: 12.0, est: true },   // est. (preview, ~Gemini Pro tier)
};

// ---------------------------- low-level call ----------------------------
interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
interface CallOk {
  ok: true;
  content: string;
  usage: Usage;
  latencyMs: number;
  usedResponseFormat: boolean;
  temperatureDropped: boolean;
}
interface CallErr {
  ok: false;
  status: number;
  body: string;
  latencyMs: number;
  schemaUnsupported: boolean;
  temperatureRejected: boolean;
}
type CallResult = CallOk | CallErr;

function looksSchemaRelated(status: number, body: string): boolean {
  if (status !== 400) return false;
  const b = body.toLowerCase();
  // temperature rejection is its own flag (handled separately), not schema.
  if (b.includes('temperature')) return false;
  return (
    b.includes('response_format') ||
    b.includes('json_schema') ||
    b.includes('schema') ||
    b.includes('strict')
  );
}

function looksTemperatureRelated(status: number, body: string): boolean {
  return status === 400 && body.toLowerCase().includes('temperature');
}
function isTransient(status: number): boolean {
  return status === 429 || status === 500 || status === 503 || status === 502 || status === 0;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Single HTTP attempt. temperature=null omits the field entirely. */
async function rawCallOnce(
  cand: Candidate,
  messages: Array<{ role: string; content: string }>,
  temperature: number | null,
  jsonSchema: { name: string; strict: boolean; schema: unknown } | null,
): Promise<CallResult> {
  const body: Record<string, unknown> = { model: cand.model, messages };
  if (temperature !== null) body['temperature'] = temperature;
  if (jsonSchema) body['response_format'] = { type: 'json_schema', json_schema: jsonSchema };

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${cand.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cand.apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, body: `network: ${(e as Error).message}`, latencyMs: Date.now() - t0, schemaUnsupported: false, temperatureRejected: false };
  }
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      ok: false, status: res.status, body: text.slice(0, 500), latencyMs,
      schemaUnsupported: looksSchemaRelated(res.status, text),
      temperatureRejected: looksTemperatureRelated(res.status, text),
    };
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: Usage };
  const content = json.choices?.[0]?.message?.content ?? '';
  return { ok: true, content, usage: json.usage ?? {}, latencyMs, usedResponseFormat: !!jsonSchema, temperatureDropped: temperature === null };
}

/**
 * Robust call: (1) if the model rejects the temperature value, retry WITHOUT
 * temperature (production clients must do this for gpt-5.x reasoning models);
 * (2) retry transient 429/5xx up to 2x with backoff.
 */
async function rawCall(
  cand: Candidate,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  jsonSchema: { name: string; strict: boolean; schema: unknown } | null,
): Promise<CallResult> {
  let attempt = await rawCallOnce(cand, messages, temperature, jsonSchema);
  if (!attempt.ok && attempt.temperatureRejected) {
    attempt = await rawCallOnce(cand, messages, null, jsonSchema);
  }
  let tries = 0;
  while (!attempt.ok && isTransient(attempt.status) && tries < 2) {
    tries++;
    await sleep(1500 * tries);
    const temp = attempt.temperatureRejected ? null : temperature;
    attempt = await rawCallOnce(cand, messages, temp, jsonSchema);
  }
  return attempt;
}

/**
 * Call with response_format first; if the provider 400s on it (schema-related),
 * retry WITHOUT it and flag jsonSchema:'unsupported'.
 */
async function callWithFallback(
  cand: Candidate,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  jsonSchema: { name: string; strict: boolean; schema: unknown },
): Promise<CallResult & { jsonSchemaStatus: 'used' | 'unsupported' }> {
  const first = await rawCall(cand, messages, temperature, jsonSchema);
  if (first.ok) return { ...first, jsonSchemaStatus: 'used' };
  if (first.schemaUnsupported) {
    const retry = await rawCall(cand, messages, temperature, null);
    return { ...retry, jsonSchemaStatus: 'unsupported' } as CallResult & { jsonSchemaStatus: 'used' | 'unsupported' };
  }
  return { ...first, jsonSchemaStatus: 'used' };
}

// ---------------------------- validation + repair ----------------------------
function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  else if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  return t.trim();
}
function tryParse<T>(text: string, schema: z.ZodType<T>):
  | { ok: true; value: T }
  | { ok: false; error: string } {
  let obj: unknown;
  try { obj = JSON.parse(stripFences(text)); }
  catch (e) { return { ok: false, error: `invalid JSON: ${(e as Error).message}` }; }
  const r = schema.safeParse(obj);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}

interface TaskRunResult {
  caseId: string;
  validity: 'valid_first_try' | 'repaired' | 'failed' | 'call_failed';
  jsonSchema: 'used' | 'unsupported';
  temperatureDropped?: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  error?: string;
  sample?: string;
  parsed?: unknown; // kept for rubric stability math
}

function cost(cand: Candidate, usage: Usage): number {
  const p = PRICES[cand.model];
  if (!p) return 0;
  const pt = usage.prompt_tokens ?? 0;
  const ct = usage.completion_tokens ?? 0;
  return (pt / 1e6) * p.in + (ct / 1e6) * p.out;
}

/** One structured task: call (with fallback) + validate + one repair retry. */
async function runTask<T>(
  cand: Candidate,
  caseId: string,
  system: string,
  user: string,
  temperature: number,
  schema: z.ZodType<T>,
  jsonSchema: { name: string; strict: boolean; schema: unknown },
): Promise<TaskRunResult> {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const first = await callWithFallback(cand, messages, temperature, jsonSchema);
  if (!first.ok) {
    return {
      caseId, validity: 'call_failed', jsonSchema: first.jsonSchemaStatus,
      latencyMs: first.latencyMs, promptTokens: 0, completionTokens: 0, costUsd: 0,
      error: `HTTP ${first.status}: ${first.body}`,
    };
  }
  const tempDropped = first.temperatureDropped;
  const parsed1 = tryParse(first.content, schema);
  const baseCost = cost(cand, first.usage);
  if (parsed1.ok) {
    return {
      caseId, validity: 'valid_first_try', jsonSchema: first.jsonSchemaStatus, temperatureDropped: tempDropped,
      latencyMs: first.latencyMs, promptTokens: first.usage.prompt_tokens ?? 0,
      completionTokens: first.usage.completion_tokens ?? 0, costUsd: baseCost,
      sample: first.content.slice(0, 600), parsed: parsed1.value,
    };
  }
  // one repair retry feeding the zod error back
  const repairMessages = [
    ...messages,
    { role: 'assistant', content: first.content },
    { role: 'system', content: `Your previous output failed schema validation:\n${parsed1.error}\nReturn ONLY corrected JSON that matches the schema. No prose, no markdown fences.` },
  ];
  const useSchema = first.jsonSchemaStatus === 'used' ? jsonSchema : null;
  const second = await rawCall(cand, repairMessages, temperature, useSchema);
  if (!second.ok) {
    return {
      caseId, validity: 'failed', jsonSchema: first.jsonSchemaStatus,
      latencyMs: first.latencyMs + second.latencyMs, promptTokens: first.usage.prompt_tokens ?? 0,
      completionTokens: first.usage.completion_tokens ?? 0, costUsd: baseCost,
      error: `repair HTTP ${second.status}: ${second.body}`, sample: first.content.slice(0, 600),
    };
  }
  const parsed2 = tryParse(second.content, schema);
  const totalLatency = first.latencyMs + second.latencyMs;
  const totalCost = baseCost + cost(cand, second.usage);
  const totalPt = (first.usage.prompt_tokens ?? 0) + (second.usage.prompt_tokens ?? 0);
  const totalCt = (first.usage.completion_tokens ?? 0) + (second.usage.completion_tokens ?? 0);
  if (parsed2.ok) {
    return {
      caseId, validity: 'repaired', jsonSchema: first.jsonSchemaStatus, temperatureDropped: tempDropped,
      latencyMs: totalLatency, promptTokens: totalPt, completionTokens: totalCt, costUsd: totalCost,
      sample: second.content.slice(0, 600), parsed: parsed2.value,
    };
  }
  return {
    caseId, validity: 'failed', jsonSchema: first.jsonSchemaStatus,
    latencyMs: totalLatency, promptTokens: totalPt, completionTokens: totalCt, costUsd: totalCost,
    error: `after repair: ${parsed2.error}`, sample: second.content.slice(0, 600),
  };
}

// ---------------------------- stability math ----------------------------
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}
const RUBRIC_DIMS = ['vocabulary', 'grammar', 'coherence', 'interaction', 'fluency', 'pronunciation'] as const;
/** App-style total: simple mean of the 6 dimensions (engine blends speech features on top; for text-only eval the LLM mean is the comparable signal). */
function appTotal(r: Record<string, number>): number {
  return RUBRIC_DIMS.reduce((s, d) => s + (r[d] ?? 0), 0) / RUBRIC_DIMS.length;
}

// ---------------------------- main ----------------------------
async function main() {
  if (!OPENAI_KEY) console.error('WARN: no OpenAI key in env (EVAL_OPENAI_KEY / OPENAI_API_KEY)');
  if (!GEMINI_KEY) console.error('WARN: no Gemini key in env (EVAL_GEMINI_KEY)');

  const results: Record<string, unknown> = {
    meta: {
      generatedAt: new Date().toISOString(),
      ranFrom: 'local (macOS) — both providers reachable; OpenAI key sourced from BWH box via SSH into env only',
      prices: PRICES,
      candidates: CANDIDATES.map((c) => ({ key: c.key, provider: c.provider, model: c.model, note: c.note })),
      rubricRuns: RUBRIC_RUNS,
    },
    models: {},
  };
  const models = results.models as Record<string, unknown>;

  for (const cand of CANDIDATES) {
    console.error(`\n=== ${cand.key} (${cand.model}) ===`);
    const entry: Record<string, unknown> = { key: cand.key, provider: cand.provider, model: cand.model, note: cand.note };

    // --- instant feedback: 3 cases ---
    const fbResults: TaskRunResult[] = [];
    for (const c of FEEDBACK_CASES) {
      const system = instantFeedbackSystem(c.input.cefrLevel);
      const user = instantFeedbackUser(c.input);
      const r = await runTask(cand, c.id, system, user, 0.2, FeedbackPayloadSchema, FEEDBACK_JSON_SCHEMA);
      console.error(`  feedback ${c.id}: ${r.validity} (${r.latencyMs}ms, schema:${r.jsonSchema})${r.error ? ' — ' + r.error.slice(0, 120) : ''}`);
      fbResults.push(r);
    }
    entry.instantFeedback = fbResults;

    // --- rubric scoring: 3 runs, stability ---
    const rubricResults: TaskRunResult[] = [];
    for (let i = 0; i < RUBRIC_RUNS; i++) {
      const r = await runTask(cand, `rubric-run-${i + 1}`, RUBRIC_SYSTEM, rubricUser(), 0, RubricScoreSchema, RUBRIC_JSON_SCHEMA);
      console.error(`  rubric run ${i + 1}: ${r.validity} (${r.latencyMs}ms)${r.error ? ' — ' + r.error.slice(0, 120) : ''}`);
      rubricResults.push(r);
    }
    const valid = rubricResults.filter((r) => r.parsed) as Array<TaskRunResult & { parsed: Record<string, number> }>;
    const perDimStdev: Record<string, number> = {};
    for (const d of RUBRIC_DIMS) perDimStdev[d] = stdev(valid.map((r) => r.parsed[d] ?? 0));
    const totals = valid.map((r) => appTotal(r.parsed));
    entry.rubric = {
      runs: rubricResults,
      stability: {
        validRuns: valid.length,
        totals,
        totalStdev: stdev(totals),
        perDimStdev,
        maxDimStdev: Math.max(0, ...Object.values(perDimStdev)),
      },
    };
    console.error(`  rubric stability: totalStdev=${stdev(totals).toFixed(2)} over ${valid.length} valid runs`);

    // --- item generation: 1 ---
    const ig = await runTask(cand, ITEM_GEN_CASE.scenarioTitle, itemGenSystem(), itemGenUser(), 0.4, ItemGenSchema, ITEM_GEN_JSON_SCHEMA);
    console.error(`  item-gen: ${ig.validity} (${ig.latencyMs}ms)${ig.error ? ' — ' + ig.error.slice(0, 120) : ''}`);
    entry.itemGen = ig;

    models[cand.key] = entry;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const out = join(__dirname, 'results.json');
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.error(`\nWrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
