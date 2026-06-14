import { describe, it, expect } from 'vitest';
import { selectNextItem, profileScoreFromDimensions } from '../src/adaptive/select.js';

describe('selectNextItem', () => {
  const items = [
    { id: 'easy', difficultyScore: 30 },
    { id: 'mid', difficultyScore: 55 },
    { id: 'hard', difficultyScore: 85 },
  ];
  it('picks the item closest to level + challenge nudge', () => {
    expect(selectNextItem(items, 50)?.id).toBe('mid'); // target 55
    expect(selectNextItem(items, 25)?.id).toBe('easy'); // target 30
    expect(selectNextItem(items, 90)?.id).toBe('hard');
  });
  it('avoids a recently-practiced item when an alternative is close', () => {
    const withRecency = [
      { id: 'mid', difficultyScore: 55, recentlyPracticed: true },
      { id: 'mid2', difficultyScore: 58 },
    ];
    expect(selectNextItem(withRecency, 50)?.id).toBe('mid2');
  });
  it('returns null for an empty bank', () => expect(selectNextItem([], 50)).toBeNull());
});

describe('profileScoreFromDimensions', () => {
  it('defaults to ~A2 for new users', () => expect(profileScoreFromDimensions({})).toBe(35));
  it('averages present dimensions', () => {
    expect(profileScoreFromDimensions({ a: { score: 60 }, b: { score: 80 } })).toBe(70);
  });
});
