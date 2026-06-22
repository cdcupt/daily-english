import { describe, it, expect } from 'vitest';
import { validateItemQuality, bandRank } from '../src/content/quality.js';
import type { ItemGen } from '../src/schemas.js';

const GOOD = (over: Partial<ItemGen> = {}): ItemGen => ({
  prompt_cn: '我想要一杯不加糖的拿铁。',
  reference_answers: ["I'd like a latte with no sugar, please."],
  target_phrases: ["I'd like..."],
  common_mistakes: [{ wrong: 'I want latte no sugar', explanation: "needs 'a' and 'with no sugar'" }],
  difficulty_score: 45, // → A2-ish, near a B1 declared band
  ...over,
});

describe('bandRank', () => {
  it('parses single bands and ranges', () => {
    expect(bandRank('A2')).toBe(1);
    expect(bandRank('A2-B1')).toBe(1); // first of the range
    expect(bandRank('b1')).toBe(2);
    expect(bandRank('A2+')).toBe(1.5);
  });
  it('returns null for garbage', () => {
    expect(bandRank('ZZ')).toBeNull();
  });
});

describe('validateItemQuality', () => {
  it('passes a well-formed item at a matching band', () => {
    const r = validateItemQuality(GOOD(), 'A2');
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('flags a difficulty far from the declared band', () => {
    const r = validateItemQuality(GOOD({ difficulty_score: 95 }), 'A1'); // C1-ish vs A1
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/far from declared band/);
  });

  it('flags a prompt_cn with no Chinese characters', () => {
    const r = validateItemQuality(GOOD({ prompt_cn: 'this is english' }), 'A2');
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Chinese/);
  });

  it('flags reference answers that are not English (contain CJK)', () => {
    const r = validateItemQuality(GOOD({ reference_answers: ['我想要一杯拿铁'] }), 'A2');
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/English/);
  });

  it('flags a reference answer identical to the prompt', () => {
    const r = validateItemQuality(GOOD({ reference_answers: ['我想要一杯不加糖的拿铁。'] }), 'A2');
    expect(r.ok).toBe(false);
    // Caught by both the language check and the identical-to-prompt check.
    expect(r.reasons.join(' ')).toMatch(/identical to the prompt|English/);
  });

  it('flags an over-length reference answer', () => {
    const r = validateItemQuality(GOOD({ reference_answers: ['I '.repeat(300)] }), 'A2');
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/exceeds/);
  });
});
