/**
 * Adaptive next-item selection (TECH §B7). Pure + testable. Picks the candidate
 * whose difficulty is closest to a target (the learner's level nudged slightly
 * up for ~70–80% success), with a recency penalty so the same item isn't served
 * back-to-back. Spaced-repetition review selection lands in a later slice.
 */
export interface Candidate {
  id: string;
  difficultyScore: number;
  recentlyPracticed?: boolean;
}

const CHALLENGE_NUDGE = 5;
const RECENCY_PENALTY = 25;

export function selectNextItem<T extends Candidate>(candidates: T[], profileScore: number): T | null {
  if (candidates.length === 0) return null;
  const target = Math.max(0, Math.min(100, profileScore + CHALLENGE_NUDGE));
  let best: T | null = null;
  let bestCost = Infinity;
  for (const c of candidates) {
    const cost = Math.abs(c.difficultyScore - target) + (c.recentlyPracticed ? RECENCY_PENALTY : 0);
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return best;
}

/** Average of present dimension scores → a 0–100 level proxy (default A2-ish). */
export function profileScoreFromDimensions(dimensions: Record<string, { score: number }>): number {
  const vals = Object.values(dimensions).map((d) => d.score);
  if (vals.length === 0) return 35;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
