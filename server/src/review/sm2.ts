import type { ReviewStatus } from '../db/schema.js';

/**
 * SM-2-style spaced-repetition scheduler (TECH §B7). Pure + heavily tested.
 * grade q ∈ 0–5. Failing (<3) resets the interval and decays mastery; passing
 * grows the interval by ease (clamped) and mastery.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

function clampEase(e: number): number { return Math.max(MIN_EASE, Math.min(MAX_EASE, e)); }

export function scheduleNext(prev: ReviewStatus, grade: number, now: Date): ReviewStatus {
  const q = Math.max(0, Math.min(5, Math.round(grade)));
  const prevInterval = prev.intervalDays ?? (prev.reps >= 2 ? 3 : 1);

  if (q < 3) {
    const intervalDays = 1;
    return {
      next_review_at: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
      mastery: Math.max(0, prev.mastery * 0.6),
      ease: prev.ease,
      reps: 0,
      intervalDays,
    };
  }

  const ease = clampEase(prev.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const reps = prev.reps + 1;
  const intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(prevInterval * ease);
  return {
    next_review_at: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    mastery: Math.min(1, prev.mastery + 0.15),
    ease,
    reps,
    intervalDays,
  };
}

export function isDue(rs: ReviewStatus, now: Date): boolean {
  return new Date(rs.next_review_at).getTime() <= now.getTime();
}
