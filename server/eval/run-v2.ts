/**
 * Rigorous quality + error-rate benchmark (v2) for the AI Scenario English Trainer.
 *
 * Builds the REAL production prompts (src/ai/prompts, src/scoring/rubric mirror,
 * src/content/generate mirror) and Zod contracts (src/schemas), POSTs directly
 * to {baseURL}/chat/completions, and for each call records:
 *   - validity: valid_first_try | repaired | failed | call_failed
 *     (one repair retry feeding the Zod error back; "failed"/"call_failed" = HARD FAIL)
 *   - jsonSchema used vs unsupported (response_format fallback)
 *   - temperatureDropped (gpt-5.5 rejects custom temperature → retried w/o it)
 *   - latency_ms, prompt/completion tokens, $/call, truncated sample, parsed object
 *
 * Coverage (rigorous):
 *   - instant feedback: 16 inputs × each model
 *   - rubric scoring:    8 inputs × 3 runs × each model (stability) + 4 ordering pairs
 *   - item generation:   6 scenario×level combos × each model
 *
 * Quality: a single FIXED, BLIND LLM-as-judge (gemini-3.1-pro-preview) scores
 * each successful output 1–5 on task-specific dims. The judge never sees which
 * model produced the output. Deterministic checks (schema valid, original echoed,
 * ≥1 save_candidate, target phrases) run alongside.
 *
 * Real data only. Keys from env; never written to disk.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

import { instantFeedbackSystem, instantFeedbackUser } from '../src/ai/prompts.js';
import {
  FeedbackPayloadSchema, FEEDBACK_JSON_SCHEMA,
  RubricScoreSchema, RUBRIC_JSON_SCHEMA,
  ItemGenSchema, ITEM_GEN_JSON_SCHEMA,
} from '../src/schemas.js';
import {
  FEEDBACK_CASES, RUBRIC_CASES, RUBRIC_RUNS, RUBRIC_ORDERING_PAIRS, ITEM_GEN_CASES,
  type FeedbackCase, type RubricCase, type ItemGenCase,
} from './dataset-v2.js';

// ---- rubric + item-gen prompts: mirror the exact strings the app sends ----
const RUBRIC_SYSTEM = [
  'You are a strict, consistent English assessor. Score the learner response on six 0–100 dimensions:',
  'vocabulary, grammar, coherence, interaction, fluency, pronunciation.',
  'Use these calibration anchors: 30 = beginner with frequent breakdowns; 55 = understandable with errors;',
  '70 = solid B1; 85 = strong B2/C1; 95 = near-native. Be reproducible — identical input must score identically.',
  'Also return a one-sentence summary and up to 4 concrete weak_points. Return JSON only.',
].join(' ');

function rubricUser(c: RubricCase): string {
  const i = c.input;
  return [
    `Scenario goal: ${i.scenarioGoal}`,
    `Target CEFR: ${i.cefrTarget}`,
    `Modality: ${i.isSpoken ? 'spoken (transcribed)' : 'written'}`,
    i.referenceAnswers.length ? `Reference: ${i.referenceAnswers.join(' | ')}` : '',
    '',
    `Learner: "${i.transcriptOrText}"`,
  ].filter(Boolean).join('\n');
}

function itemGenSystem(c: ItemGenCase): string {
  const input = c.input;
  return [
    'You generate ONE high-quality English-practice item for a real-world scenario.',
    `Type: ${input.type}. Target CEFR: ${input.cefrLevel}.`,
    'For translation items, prompt_cn is a natural Chinese sentence the learner must render in idiomatic English;',
    'reference_answers are 1–3 natural English versions; target_phrases are reusable patterns; common_mistakes are',
    'realistic learner errors with short fixes; difficulty_score is 0–100 matching the CEFR. Return JSON only.',
  ].join(' ');
}
function itemGenUser(c: ItemGenCase): string {
  const input = c.input;
  return `Scenario: ${input.scenarioTitle} (${input.category}). Goal: ${input.scenarioGoal}.`;
}

// ---------------------------- candidates (the spec's 4) ----------------------------
interface Candidate { key: string; provider: string; baseURL: string; model: string; apiKey: string; note?: string }

const OPENAI_KEY = process.env.EVAL_OPENAI_KEY ?? process.env.OPENAI_API_KEY ?? '';
const GEMINI_KEY = process.env.EVAL_GEMINI_KEY ?? '';
const OPENAI_BASE = 'https://api.openai.com/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

const CANDIDATES: Candidate[] = [
  { key: 'gpt-5.5', provider: 'OpenAI', baseURL: OPENAI_BASE, model: 'gpt-5.5', apiKey: OPENAI_KEY, note: 'rejects custom temperature → called WITHOUT temperature' },
  { key: 'gpt-5.4-mini', provider: 'OpenAI', baseURL: OPENAI_BASE, model: 'gpt-5.4-mini', apiKey: OPENAI_KEY },
  { key: 'gemini-3-flash-preview', provider: 'Gemini', baseURL: GEMINI_BASE, model: 'gemini-3-flash-preview', apiKey: GEMINI_KEY },
  { key: 'gemini-3.1-pro-preview', provider: 'Gemini', baseURL: GEMINI_BASE, model: 'gemini-3.1-pro-preview', apiKey: GEMINI_KEY },
];

// FIXED, BLIND judge held constant across all candidates.
const JUDGE: Candidate = {
  key: 'judge', provider: 'Gemini', baseURL: GEMINI_BASE, model: 'gemini-3.1-pro-preview', apiKey: GEMINI_KEY,
  note: 'fixed blind judge for LLM-as-judge quality scoring',
};

// ---------------------------- pricing (USD / 1M tokens) ----------------------------
interface Price { in: number; out: number; est?: boolean }
const PRICES: Record<string, Price> = {
  'gpt-5.5': { in: 1.25, out: 10.0, est: true },                 // flagship tier; treat as est. pending official list
  'gpt-5.4-mini': { in: 0.25, out: 2.0, est: true },             // mini tier estimate
  'gemini-3-flash-preview': { in: 0.30, out: 2.50, est: true },  // est. (preview, ~Flash tier)
  'gemini-3.1-pro-preview': { in: 2.00, out: 12.0, est: true },  // est. (preview, ~Pro tier)
};

// ---------------------------- pass bar ----------------------------
const BAR = {
  hardFailMaxPct: 2,        // hard-fail rate must be < 2%
  meanQualityMin: 4.0,      // mean LLM-judge quality >= 4.0 / 5
  scoringStdevMax: 3.0,     // rubric app-total stdev <= ~3
  orderingMinPct: 90,       // ordering-correctness >= 90%
};

// ---------------------------- low-level call ----------------------------
interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
interface CallOk { ok: true; content: string; usage: Usage; latencyMs: number; usedResponseFormat: boolean; temperatureDropped: boolean }
interface CallErr { ok: false; status: number; body: string; latencyMs: number; schemaUnsupported: boolean; temperatureRejected: boolean }
type CallResult = CallOk | CallErr;

function looksSchemaRelated(status: number, body: string): boolean {
  if (status !== 400) return false;
  const b = body.toLowerCase();
  if (b.includes('temperature')) return false;
  return b.includes('response_format') || b.includes('json_schema') || b.includes('schema') || b.includes('strict');
}
function looksTemperatureRelated(status: number, body: string): boolean {
  return status === 400 && body.toLowerCase().includes('temperature');
}
function isTransient(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 0;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function rawCall(
  cand: Candidate,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  jsonSchema: { name: string; strict: boolean; schema: unknown } | null,
): Promise<CallResult> {
  let attempt = await rawCallOnce(cand, messages, temperature, jsonSchema);
  if (!attempt.ok && attempt.temperatureRejected) attempt = await rawCallOnce(cand, messages, null, jsonSchema);
  let tries = 0;
  while (!attempt.ok && isTransient(attempt.status) && tries < 2) {
    tries++;
    await sleep(1500 * tries);
    const temp = attempt.temperatureRejected ? null : temperature;
    attempt = await rawCallOnce(cand, messages, temp, jsonSchema);
  }
  return attempt;
}

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
function tryParse<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  let obj: unknown;
  try { obj = JSON.parse(stripFences(text)); }
  catch (e) { return { ok: false, error: `invalid JSON: ${(e as Error).message}` }; }
  const r = schema.safeParse(obj);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}

type Validity = 'valid_first_try' | 'repaired' | 'failed' | 'call_failed';
interface TaskRunResult {
  caseId: string;
  validity: Validity;
  jsonSchema: 'used' | 'unsupported';
  temperatureDropped?: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  error?: string;
  sample?: string;
  parsed?: unknown;
}

function cost(cand: Candidate, usage: Usage): number {
  const p = PRICES[cand.model];
  if (!p) return 0;
  return ((usage.prompt_tokens ?? 0) / 1e6) * p.in + ((usage.completion_tokens ?? 0) / 1e6) * p.out;
}

async function runTask<T>(
  cand: Candidate, caseId: string, system: string, user: string, temperature: number,
  schema: z.ZodType<T>, jsonSchema: { name: string; strict: boolean; schema: unknown },
): Promise<TaskRunResult> {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const first = await callWithFallback(cand, messages, temperature, jsonSchema);
  if (!first.ok) {
    return { caseId, validity: 'call_failed', jsonSchema: first.jsonSchemaStatus, latencyMs: first.latencyMs, promptTokens: 0, completionTokens: 0, costUsd: 0, error: `HTTP ${first.status}: ${first.body}` };
  }
  const tempDropped = first.temperatureDropped;
  const parsed1 = tryParse(first.content, schema);
  const baseCost = cost(cand, first.usage);
  if (parsed1.ok) {
    return { caseId, validity: 'valid_first_try', jsonSchema: first.jsonSchemaStatus, temperatureDropped: tempDropped, latencyMs: first.latencyMs, promptTokens: first.usage.prompt_tokens ?? 0, completionTokens: first.usage.completion_tokens ?? 0, costUsd: baseCost, sample: first.content.slice(0, 900), parsed: parsed1.value };
  }
  const repairMessages = [
    ...messages,
    { role: 'assistant', content: first.content },
    { role: 'system', content: `Your previous output failed schema validation:\n${parsed1.error}\nReturn ONLY corrected JSON that matches the schema. No prose, no markdown fences.` },
  ];
  const useSchema = first.jsonSchemaStatus === 'used' ? jsonSchema : null;
  const second = await rawCall(cand, repairMessages, temperature, useSchema);
  if (!second.ok) {
    return { caseId, validity: 'failed', jsonSchema: first.jsonSchemaStatus, latencyMs: first.latencyMs + second.latencyMs, promptTokens: first.usage.prompt_tokens ?? 0, completionTokens: first.usage.completion_tokens ?? 0, costUsd: baseCost, error: `repair HTTP ${second.status}: ${second.body}`, sample: first.content.slice(0, 900) };
  }
  const parsed2 = tryParse(second.content, schema);
  const totalLatency = first.latencyMs + second.latencyMs;
  const totalCost = baseCost + cost(cand, second.usage);
  const totalPt = (first.usage.prompt_tokens ?? 0) + (second.usage.prompt_tokens ?? 0);
  const totalCt = (first.usage.completion_tokens ?? 0) + (second.usage.completion_tokens ?? 0);
  if (parsed2.ok) {
    return { caseId, validity: 'repaired', jsonSchema: first.jsonSchemaStatus, temperatureDropped: tempDropped, latencyMs: totalLatency, promptTokens: totalPt, completionTokens: totalCt, costUsd: totalCost, sample: second.content.slice(0, 900), parsed: parsed2.value };
  }
  return { caseId, validity: 'failed', jsonSchema: first.jsonSchemaStatus, latencyMs: totalLatency, promptTokens: totalPt, completionTokens: totalCt, costUsd: totalCost, error: `after repair: ${parsed2.error}`, sample: second.content.slice(0, 900) };
}

// ---------------------------- LLM-as-judge (fixed, blind) ----------------------------
const JudgeFeedbackSchema = z.object({
  corrected_fixes_errors: z.number().min(1).max(5),
  natural_is_natural: z.number().min(1).max(5),
  focus_right_issues: z.number().min(1).max(5),
  comment: z.string(),
});
const JUDGE_FEEDBACK_SCHEMA = {
  name: 'judge_feedback', strict: true,
  schema: { type: 'object', additionalProperties: false, properties: {
    corrected_fixes_errors: { type: 'number' }, natural_is_natural: { type: 'number' },
    focus_right_issues: { type: 'number' }, comment: { type: 'string' },
  }, required: ['corrected_fixes_errors', 'natural_is_natural', 'focus_right_issues', 'comment'] },
} as const;

const JudgeItemGenSchema = z.object({
  prompt_cn_natural: z.number().min(1).max(5),
  references_idiomatic: z.number().min(1).max(5),
  difficulty_plausible: z.number().min(1).max(5),
  comment: z.string(),
});
const JUDGE_ITEMGEN_SCHEMA = {
  name: 'judge_itemgen', strict: true,
  schema: { type: 'object', additionalProperties: false, properties: {
    prompt_cn_natural: { type: 'number' }, references_idiomatic: { type: 'number' },
    difficulty_plausible: { type: 'number' }, comment: { type: 'string' },
  }, required: ['prompt_cn_natural', 'references_idiomatic', 'difficulty_plausible', 'comment'] },
} as const;

const JUDGE_SYSTEM = [
  'You are a meticulous, impartial English-teaching examiner judging the QUALITY of an AI tutor output.',
  'You do NOT know which model produced it; judge only the content. Score each dimension 1–5',
  '(1 = unacceptable, 3 = mediocre, 4 = good/shippable, 5 = excellent). Be calibrated and consistent.',
  'Return JSON only.',
].join(' ');

async function judgeFeedback(c: FeedbackCase, output: unknown): Promise<{ scores: z.infer<typeof JudgeFeedbackSchema> | null; raw?: string }> {
  const user = [
    `Scenario goal: ${c.input.learningGoal}`,
    `Learner CEFR: ${c.input.cefrLevel}`,
    `Learner's original response: "${c.input.userText}"`,
    `Intended error(s) to fix: ${c.errorFocus}`,
    '',
    'AI tutor output (JSON):',
    JSON.stringify(output),
    '',
    'Judge:',
    '(a) corrected_fixes_errors: does `corrected` actually fix the learner\'s real error(s)?',
    '(b) natural_is_natural: is `natural_version` genuinely natural AND appropriate for this scenario/register?',
    '(c) focus_right_issues: are the flagged `issues` the RIGHT ones and appropriately few (≤3, no nitpicking, no over-correction of already-correct text)?',
  ].join('\n');
  const r = await rawCall(JUDGE, [{ role: 'system', content: JUDGE_SYSTEM }, { role: 'user', content: user }], 0, JUDGE_FEEDBACK_SCHEMA);
  if (!r.ok) return { scores: null, raw: `judge HTTP ${r.status}: ${r.body}` };
  const p = tryParse(r.content, JudgeFeedbackSchema);
  return p.ok ? { scores: p.value, raw: r.content.slice(0, 400) } : { scores: null, raw: `judge parse: ${p.error}` };
}

async function judgeItemGen(c: ItemGenCase, output: unknown): Promise<{ scores: z.infer<typeof JudgeItemGenSchema> | null; raw?: string }> {
  const user = [
    `Scenario: ${c.input.scenarioTitle} (${c.input.category}). Goal: ${c.input.scenarioGoal}.`,
    `Type: ${c.input.type}. Target CEFR: ${c.input.cefrLevel}.`,
    '',
    'AI-generated item (JSON):',
    JSON.stringify(output),
    '',
    'Judge:',
    '(a) prompt_cn_natural: is prompt_cn a natural, idiomatic Chinese sentence for this scenario?',
    '(b) references_idiomatic: are reference_answers idiomatic, natural English that fit the scenario?',
    '(c) difficulty_plausible: is the difficulty (content + difficulty_score) plausible for the target CEFR?',
  ].join('\n');
  const r = await rawCall(JUDGE, [{ role: 'system', content: JUDGE_SYSTEM }, { role: 'user', content: user }], 0, JUDGE_ITEMGEN_SCHEMA);
  if (!r.ok) return { scores: null, raw: `judge HTTP ${r.status}: ${r.body}` };
  const p = tryParse(r.content, JudgeItemGenSchema);
  return p.ok ? { scores: p.value, raw: r.content.slice(0, 400) } : { scores: null, raw: `judge parse: ${p.error}` };
}

// ---------------------------- deterministic checks ----------------------------
function phrasesPresent(text: string, phrases: string[]): number {
  if (!phrases.length) return 1;
  const t = text.toLowerCase();
  const hit = phrases.filter((p) => t.includes(p.toLowerCase().split(' ').slice(0, 2).join(' '))).length;
  return hit / phrases.length;
}

// ---------------------------- stats ----------------------------
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx]!;
}
const RUBRIC_DIMS = ['vocabulary', 'grammar', 'coherence', 'interaction', 'fluency', 'pronunciation'] as const;
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
      version: 'v2-quality+error-rate',
      ranFrom: 'local (macOS) — both providers reachable; keys from ~/.openai/keys.env + ~/.claude/commands/gemini.md (never persisted)',
      prices: PRICES,
      bar: BAR,
      judge: { model: JUDGE.model, blind: true, note: JUDGE.note },
      candidates: CANDIDATES.map((c) => ({ key: c.key, provider: c.provider, model: c.model, note: c.note })),
      coverage: { feedbackInputs: FEEDBACK_CASES.length, rubricInputs: RUBRIC_CASES.length, rubricRunsEach: RUBRIC_RUNS, orderingPairs: RUBRIC_ORDERING_PAIRS.length, itemGenCombos: ITEM_GEN_CASES.length },
    },
    models: {},
  };
  const models = results.models as Record<string, unknown>;

  for (const cand of CANDIDATES) {
    console.error(`\n=== ${cand.key} (${cand.model}) ===`);
    const entry: Record<string, unknown> = { key: cand.key, provider: cand.provider, model: cand.model, note: cand.note };
    const allCalls: TaskRunResult[] = []; // for global error-rate

    // ---------- INSTANT FEEDBACK (16) ----------
    const fb: Array<TaskRunResult & { judge?: unknown; checks?: unknown; errorFocus?: string }> = [];
    for (const c of FEEDBACK_CASES) {
      const system = instantFeedbackSystem(c.input.cefrLevel);
      const user = instantFeedbackUser(c.input);
      const r = await runTask(cand, c.id, system, user, 0.2, FeedbackPayloadSchema, FEEDBACK_JSON_SCHEMA);
      allCalls.push(r);
      const rec: TaskRunResult & { judge?: unknown; checks?: unknown; errorFocus?: string } = { ...r, errorFocus: c.errorFocus };
      if (r.parsed) {
        const p = r.parsed as z.infer<typeof FeedbackPayloadSchema>;
        rec.checks = {
          originalEchoed: p.original.trim().length > 0,
          hasSaveCandidate: p.save_candidates.length >= 1,
          issuesWithinMax: p.issues.length <= 3,
          targetPhraseCoverage: phrasesPresent(`${p.corrected} ${p.natural_version}`, c.input.targetPhrases),
        };
        const j = await judgeFeedback(c, r.parsed);
        rec.judge = j.scores ?? { error: j.raw };
      }
      console.error(`  fb ${c.id}: ${r.validity} (${r.latencyMs}ms)${r.error ? ' — ' + r.error.slice(0, 100) : ''}`);
      fb.push(rec);
    }
    entry.instantFeedback = fb;

    // ---------- RUBRIC SCORING (8 × 3) ----------
    const rubricByCase: Record<string, { runs: TaskRunResult[]; totals: number[]; totalStdev: number; meanTotal: number; perDimStdev: Record<string, number>; maxDimStdev: number }> = {};
    const rubricJudge: Array<TaskRunResult & { judge?: unknown }> = [];
    for (const c of RUBRIC_CASES) {
      const runs: TaskRunResult[] = [];
      for (let i = 0; i < RUBRIC_RUNS; i++) {
        const r = await runTask(cand, `${c.id}-run${i + 1}`, RUBRIC_SYSTEM, rubricUser(c), 0, RubricScoreSchema, RUBRIC_JSON_SCHEMA);
        allCalls.push(r);
        runs.push(r);
      }
      const valid = runs.filter((r) => r.parsed) as Array<TaskRunResult & { parsed: Record<string, number> }>;
      const totals = valid.map((r) => appTotal(r.parsed));
      const perDimStdev: Record<string, number> = {};
      for (const d of RUBRIC_DIMS) perDimStdev[d] = stdev(valid.map((r) => r.parsed[d] ?? 0));
      rubricByCase[c.id] = { runs, totals, totalStdev: stdev(totals), meanTotal: mean(totals), perDimStdev, maxDimStdev: Math.max(0, ...Object.values(perDimStdev)) };
      console.error(`  rubric ${c.id}: meanTotal=${mean(totals).toFixed(1)} stdev=${stdev(totals).toFixed(2)} (${valid.length}/${RUBRIC_RUNS} valid)`);
    }
    // ordering correctness: compare meanTotal of better vs worse
    const ordering = RUBRIC_ORDERING_PAIRS.map((p) => {
      const w = rubricByCase[p.worse]?.meanTotal ?? NaN;
      const b = rubricByCase[p.better]?.meanTotal ?? NaN;
      const correct = Number.isFinite(w) && Number.isFinite(b) && b > w;
      return { id: p.id, worse: p.worse, better: p.better, worseMean: w, betterMean: b, correct };
    });
    const orderingPct = (ordering.filter((o) => o.correct).length / ordering.length) * 100;
    const stdevs = Object.values(rubricByCase).map((r) => r.totalStdev);
    entry.rubric = {
      byCase: rubricByCase,
      ordering,
      orderingCorrectPct: orderingPct,
      worstCaseStdev: Math.max(0, ...stdevs),
      meanStdev: mean(stdevs),
    };
    console.error(`  rubric ordering: ${orderingPct.toFixed(0)}%  worstStdev=${Math.max(0, ...stdevs).toFixed(2)}`);

    // ---------- ITEM GENERATION (6) ----------
    const ig: Array<TaskRunResult & { judge?: unknown; checks?: unknown }> = [];
    for (const c of ITEM_GEN_CASES) {
      const r = await runTask(cand, c.id, itemGenSystem(c), itemGenUser(c), 0.4, ItemGenSchema, ITEM_GEN_JSON_SCHEMA);
      allCalls.push(r);
      const rec: TaskRunResult & { judge?: unknown; checks?: unknown } = { ...r };
      if (r.parsed) {
        const p = r.parsed as z.infer<typeof ItemGenSchema>;
        rec.checks = {
          hasReference: p.reference_answers.length >= 1,
          hasTargetPhrase: p.target_phrases.length >= 1,
          difficultyInRange: p.difficulty_score >= 0 && p.difficulty_score <= 100,
        };
        const j = await judgeItemGen(c, r.parsed);
        rec.judge = j.scores ?? { error: j.raw };
      }
      console.error(`  item-gen ${c.id}: ${r.validity} (${r.latencyMs}ms)${r.error ? ' — ' + r.error.slice(0, 100) : ''}`);
      ig.push(rec);
    }
    entry.itemGen = ig;

    // ---------- AGGREGATES ----------
    const total = allCalls.length;
    const firstTry = allCalls.filter((r) => r.validity === 'valid_first_try').length;
    const repaired = allCalls.filter((r) => r.validity === 'repaired').length;
    const hardFail = allCalls.filter((r) => r.validity === 'failed' || r.validity === 'call_failed').length;
    const latencies = allCalls.filter((r) => r.validity !== 'call_failed').map((r) => r.latencyMs);
    const totalCost = allCalls.reduce((s, r) => s + r.costUsd, 0);
    const tempDropped = allCalls.some((r) => r.temperatureDropped);
    const schemaUnsupported = allCalls.some((r) => r.jsonSchema === 'unsupported');

    // quality means (judge), per task
    const fbJudged = fb.map((r) => r.judge).filter((j): j is z.infer<typeof JudgeFeedbackSchema> => !!j && typeof (j as Record<string, unknown>).corrected_fixes_errors === 'number');
    const fbQuality = mean(fbJudged.flatMap((j) => [j.corrected_fixes_errors, j.natural_is_natural, j.focus_right_issues]));
    const igJudged = ig.map((r) => r.judge).filter((j): j is z.infer<typeof JudgeItemGenSchema> => !!j && typeof (j as Record<string, unknown>).prompt_cn_natural === 'number');
    const igQuality = mean(igJudged.flatMap((j) => [j.prompt_cn_natural, j.references_idiomatic, j.difficulty_plausible]));

    const aggregates = {
      totalCalls: total,
      validFirstTryPct: total ? (firstTry / total) * 100 : 0,
      repairRatePct: total ? (repaired / total) * 100 : 0,
      hardFailPct: total ? (hardFail / total) * 100 : 0,   // <-- the single "error rate"
      hardFailCount: hardFail,
      latencyP50: pct(latencies, 50),
      latencyP95: pct(latencies, 95),
      totalCostUsd: totalCost,
      avgCostPerCallUsd: total ? totalCost / total : 0,
      temperatureDropped: tempDropped,
      schemaUnsupported,
      quality: {
        feedbackMean: fbQuality,
        feedbackN: fbJudged.length,
        itemGenMean: igQuality,
        itemGenN: igJudged.length,
      },
    };
    entry.aggregates = aggregates;

    // PASS/FAIL vs the bar, per task
    entry.verdict = {
      feedback: {
        hardFailPct: aggregates.hardFailPct,
        quality: fbQuality,
        pass: aggregates.hardFailPct < BAR.hardFailMaxPct && fbQuality >= BAR.meanQualityMin,
      },
      rubric: {
        hardFailPct: aggregates.hardFailPct,
        worstStdev: (entry.rubric as { worstCaseStdev: number }).worstCaseStdev,
        orderingPct: orderingPct,
        pass: aggregates.hardFailPct < BAR.hardFailMaxPct
          && (entry.rubric as { worstCaseStdev: number }).worstCaseStdev <= BAR.scoringStdevMax
          && orderingPct >= BAR.orderingMinPct,
      },
      itemGen: {
        hardFailPct: aggregates.hardFailPct,
        quality: igQuality,
        pass: aggregates.hardFailPct < BAR.hardFailMaxPct && igQuality >= BAR.meanQualityMin,
      },
    };

    console.error(`  >> hardFail=${aggregates.hardFailPct.toFixed(1)}% repair=${aggregates.repairRatePct.toFixed(1)}% | fbQ=${fbQuality.toFixed(2)} igQ=${igQuality.toFixed(2)} | p50=${aggregates.latencyP50}ms p95=${aggregates.latencyP95}ms | $${totalCost.toFixed(4)}`);
    models[cand.key] = entry;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const out = join(__dirname, 'results-v2.json');
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.error(`\nWrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
