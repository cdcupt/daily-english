import type { ReviewStatus, FeedbackPayload } from '../db/schema.js';

/**
 * Expression-bank helpers (TECH §B7/§12). Pure builders kept separate from DB
 * I/O so they're unit-testable. New items start "due now" so spaced repetition
 * picks them up on the next review pass.
 */
export const EXPRESSION_TYPES = ['vocabulary', 'sentence_pattern', 'mistake_pair', 'saved', 'scenario_phrase'] as const;
export type ExpressionType = (typeof EXPRESSION_TYPES)[number];

export function defaultReviewStatus(now: Date = new Date()): ReviewStatus {
  return { next_review_at: now.toISOString(), mastery: 0, ease: 2.5, reps: 0 };
}

export interface NewExpression {
  type: ExpressionType;
  content: string;
  meaningCn?: string | null;
  userOriginal?: string | null;
  naturalExpression?: string | null;
  sourceSessionId?: string | null;
  sourceScenarioId?: string | null;
  reviewStatus: ReviewStatus;
}

/** Build the auto-saved mistake-pair from a turn's feedback (original→corrected→natural). */
export function mistakePairFromFeedback(
  fb: FeedbackPayload,
  opts: { sourceSessionId?: string; sourceScenarioId?: string; now?: Date } = {},
): NewExpression | null {
  // Only worth saving when the AI actually changed something.
  if (!fb.original || fb.original.trim() === fb.corrected.trim()) return null;
  return {
    type: 'mistake_pair',
    content: fb.corrected,
    userOriginal: fb.original,
    naturalExpression: fb.natural_version,
    sourceSessionId: opts.sourceSessionId ?? null,
    sourceScenarioId: opts.sourceScenarioId ?? null,
    reviewStatus: defaultReviewStatus(opts.now),
  };
}

export interface PageParams { page: number; limit: number }
export function parsePage(q: { page?: string; limit?: string }): PageParams {
  const page = Math.max(1, Number.parseInt(q.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? '20', 10) || 20));
  return { page, limit };
}
