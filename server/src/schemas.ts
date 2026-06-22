import { z } from 'zod';

/**
 * Zod schemas = the runtime truth for AI I/O and API payloads. Every AI output
 * is re-validated against these even when the model used strict json_schema
 * (TECH §B4). JSON-Schema mirrors (for response_format) are derived below.
 */

export const FeedbackIssueSchema = z.object({
  type: z.enum(['grammar', 'vocabulary', 'naturalness', 'coherence', 'register', 'task_completion']),
  explanation: z.string().min(1),
});

export const FeedbackPayloadSchema = z.object({
  original: z.string(),
  corrected: z.string().min(1),
  natural_version: z.string().min(1),
  issues: z.array(FeedbackIssueSchema).max(3),
  save_candidates: z.array(z.string().min(1)).max(6),
});
export type FeedbackPayload = z.infer<typeof FeedbackPayloadSchema>;

export const DimensionScoreSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.string(),
});
export const ScoreReportSchema = z.object({
  total: z.number().min(0).max(100),
  cefr_estimate: z.string(),
  dimensions: z.record(DimensionScoreSchema),
  summary: z.string(),
  weak_points: z.array(z.string()),
  recommended_review: z.array(z.string()),
});
export type ScoreReport = z.infer<typeof ScoreReportSchema>;

// ---------- Rubric scoring (LLM language judgement, 0–100 per dimension) ----------
export const RubricScoreSchema = z.object({
  vocabulary: z.number().min(0).max(100),
  grammar: z.number().min(0).max(100),
  coherence: z.number().min(0).max(100),
  interaction: z.number().min(0).max(100),
  fluency: z.number().min(0).max(100),
  pronunciation: z.number().min(0).max(100),
  summary: z.string(),
  weak_points: z.array(z.string()).max(4),
});
export type RubricScore = z.infer<typeof RubricScoreSchema>;

export const RUBRIC_JSON_SCHEMA = {
  name: 'rubric_score',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      vocabulary: { type: 'number' },
      grammar: { type: 'number' },
      coherence: { type: 'number' },
      interaction: { type: 'number' },
      fluency: { type: 'number' },
      pronunciation: { type: 'number' },
      summary: { type: 'string' },
      weak_points: { type: 'array', items: { type: 'string' } },
    },
    required: ['vocabulary', 'grammar', 'coherence', 'interaction', 'fluency', 'pronunciation', 'summary', 'weak_points'],
  },
} as const;

/** JSON Schema for OpenAI response_format (strict). Kept in sync with the Zod above. */
export const FEEDBACK_JSON_SCHEMA = {
  name: 'feedback_payload',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      original: { type: 'string' },
      corrected: { type: 'string' },
      natural_version: { type: 'string' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: {
              type: 'string',
              enum: ['grammar', 'vocabulary', 'naturalness', 'coherence', 'register', 'task_completion'],
            },
            explanation: { type: 'string' },
          },
          required: ['type', 'explanation'],
        },
      },
      save_candidates: { type: 'array', items: { type: 'string' } },
    },
    required: ['original', 'corrected', 'natural_version', 'issues', 'save_candidates'],
  },
} as const;

// ---------- AI item generation (admin content pipeline) ----------
export const ItemGenSchema = z.object({
  prompt_cn: z.string().min(1),
  reference_answers: z.array(z.string().min(1)).min(1).max(3),
  target_phrases: z.array(z.string().min(1)).max(6),
  common_mistakes: z.array(z.object({ wrong: z.string(), explanation: z.string() })).max(4),
  difficulty_score: z.number().int().min(0).max(100),
});
export type ItemGen = z.infer<typeof ItemGenSchema>;

export const ITEM_GEN_JSON_SCHEMA = {
  name: 'item_gen',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      prompt_cn: { type: 'string' },
      reference_answers: { type: 'array', items: { type: 'string' } },
      target_phrases: { type: 'array', items: { type: 'string' } },
      common_mistakes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: { wrong: { type: 'string' }, explanation: { type: 'string' } },
          required: ['wrong', 'explanation'],
        },
      },
      difficulty_score: { type: 'number' },
    },
    required: ['prompt_cn', 'reference_answers', 'target_phrases', 'common_mistakes', 'difficulty_score'],
  },
} as const;

// ---------- Topic scaffold (custom free-text Topic Sessions) ----------
// The existing seed scenario categories. The scaffold MUST classify a custom
// topic into one of these so every category-based join keeps working.
export const SCENARIO_CATEGORIES = [
  'daily_life', 'education_growth', 'express_yourself', 'health_services',
  'shopping_money', 'social', 'travel', 'work',
] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

// The CEFR bands the scaffold may pick for a generated scenario. Kept aligned
// with the seed cefrBand granularity (single band, not a range).
export const TOPIC_CEFR_BANDS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

export const TopicScaffoldSchema = z.object({
  // A concise English scenario title built FROM the (possibly Chinese) topic.
  title: z.string().min(1).max(120),
  category: z.enum(SCENARIO_CATEGORIES),
  cefrBand: z.enum(TOPIC_CEFR_BANDS),
  userRole: z.string().min(1).max(80),
  aiRole: z.string().min(1).max(80),
  goal: z.string().min(1).max(300),
  // Safety gate: false for non-English-practice / injection / nonsense topics.
  onDomain: z.boolean(),
  // Short reason when onDomain is false (null when on-domain). Surfaced in logs.
  rejectReason: z.string().max(300).nullable(),
});
export type TopicScaffold = z.infer<typeof TopicScaffoldSchema>;

export const TOPIC_SCAFFOLD_JSON_SCHEMA = {
  name: 'topic_scaffold',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      category: { type: 'string', enum: [...SCENARIO_CATEGORIES] },
      cefrBand: { type: 'string', enum: [...TOPIC_CEFR_BANDS] },
      userRole: { type: 'string' },
      aiRole: { type: 'string' },
      goal: { type: 'string' },
      onDomain: { type: 'boolean' },
      rejectReason: { type: ['string', 'null'] },
    },
    required: ['title', 'category', 'cefrBand', 'userRole', 'aiRole', 'goal', 'onDomain', 'rejectReason'],
  },
} as const;

/** Standard response envelope helpers. */
export function ok<T>(data: T, meta: unknown = null) {
  return { data, error: null, meta };
}
export function fail(code: string, message: string) {
  return { data: null, error: { code, message }, meta: null };
}
