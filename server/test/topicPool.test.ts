import { describe, it, expect } from 'vitest';
import { narrowPoolByTopic, type PoolItem, type SessionTopic } from '../src/content/topicPool.js';
import { selectNextItem } from '../src/adaptive/select.js';

const items: PoolItem[] = [
  { id: 'a', difficultyScore: 40, scenarioCategory: 'work', topicSessionId: null },
  { id: 'b', difficultyScore: 50, scenarioCategory: 'travel', topicSessionId: null },
  { id: 'c', difficultyScore: 45, scenarioCategory: 'custom', topicSessionId: 'ts-1' },
  { id: 'd', difficultyScore: 55, scenarioCategory: 'custom', topicSessionId: 'ts-1' },
  { id: 'e', difficultyScore: 60, scenarioCategory: 'custom', topicSessionId: 'ts-2' },
];

const noTopic: SessionTopic = { kind: null, category: null, topicSessionId: null };

describe('narrowPoolByTopic', () => {
  it('no topic → curated/seeded items only (custom AI items never leak into the default feed)', () => {
    expect(narrowPoolByTopic(items, noTopic).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('narrows to a category', () => {
    const r = narrowPoolByTopic(items, { kind: 'category', category: 'work', topicSessionId: null });
    expect(r.map((i) => i.id)).toEqual(['a']);
  });

  it('narrows to a custom topic by topicSessionId', () => {
    const r = narrowPoolByTopic(items, { kind: 'custom', category: null, topicSessionId: 'ts-1' });
    expect(r.map((i) => i.id)).toEqual(['c', 'd']);
  });

  it('returns empty for a category with no items', () => {
    const r = narrowPoolByTopic(items, { kind: 'category', category: 'health_services', topicSessionId: null });
    expect(r).toEqual([]);
  });

  it('returns empty for a custom topic with no items (warming state)', () => {
    const r = narrowPoolByTopic(items, { kind: 'custom', category: null, topicSessionId: 'ts-empty' });
    expect(r).toEqual([]);
  });
});

describe('recency exclusion stays WITHIN the narrowed topic', () => {
  // Mirrors study/next: narrow first, then exclude recent ids within that pool.
  function pickWithinTopic(topic: SessionTopic, recentIds: Set<string>, profileScore: number) {
    const topicPool = narrowPoolByTopic(items, topic);
    const fresh = topicPool.filter((i) => !recentIds.has(i.id));
    const pool = fresh.length > 0 ? fresh : topicPool;
    return selectNextItem(pool.map((i) => ({ id: i.id, difficultyScore: i.difficultyScore })), profileScore);
  }

  it('excludes a recent item but only from within the topic', () => {
    // custom ts-1 = {c,d}; c is recent → must pick d, never an out-of-topic item.
    const chosen = pickWithinTopic({ kind: 'custom', category: null, topicSessionId: 'ts-1' }, new Set(['c']), 45);
    expect(chosen?.id).toBe('d');
  });

  it('falls back to the topic pool (not the global pool) when all are recent', () => {
    const chosen = pickWithinTopic({ kind: 'custom', category: null, topicSessionId: 'ts-1' }, new Set(['c', 'd']), 45);
    expect(['c', 'd']).toContain(chosen?.id); // never b/e from other topics
  });
});
