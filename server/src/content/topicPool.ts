/**
 * Pure topic-aware pool narrowing for study/next (Topic Sessions). Extracted so
 * the topic-filter logic is unit-testable without a DB. study/next applies this
 * AFTER review resurfacing (global) and BEFORE recency-exclusion: a session's
 * active topic narrows the published pool, then recency-exclusion runs WITHIN
 * the narrowed pool.
 */

export interface PoolItem {
  id: string;
  difficultyScore: number;
  scenarioCategory: string;
  topicSessionId: string | null;
}

export interface SessionTopic {
  kind: 'category' | 'custom' | null;
  category: string | null;
  topicSessionId: string | null;
}

/**
 * Narrow a published pool to a session's active topic:
 *  - 'category' → items whose scenario.category matches;
 *  - 'custom'   → items linked to the session's topicSessionId;
 *  - no topic   → the full pool (unchanged behaviour).
 */
export function narrowPoolByTopic<T extends PoolItem>(pool: T[], topic: SessionTopic): T[] {
  if (topic.kind === 'category' && topic.category) {
    // Curated category content only — custom AI items (category 'custom') excluded.
    return pool.filter((i) => i.scenarioCategory === topic.category && i.topicSessionId === null);
  }
  if (topic.kind === 'custom' && topic.topicSessionId) {
    return pool.filter((i) => i.topicSessionId === topic.topicSessionId);
  }
  // No topic → the default adaptive feed serves CURATED/seeded items only. Custom
  // AI-generated items (quality-gated, not human-reviewed) must never leak into
  // everyone's general feed; they surface solely within their own topic.
  return pool.filter((i) => i.topicSessionId === null);
}
