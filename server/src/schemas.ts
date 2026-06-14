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

/** Standard response envelope helpers. */
export function ok<T>(data: T, meta: unknown = null) {
  return { data, error: null, meta };
}
export function fail(code: string, message: string) {
  return { data: null, error: { code, message }, meta: null };
}
