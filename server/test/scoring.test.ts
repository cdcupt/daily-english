import { describe, it, expect } from 'vitest';
import { scoreToCEFR } from '../src/scoring/cefr.js';
import { aggregate, updateEma } from '../src/scoring/engine.js';
import { computeSpeechFeatures, fluencyFromFeatures } from '../src/scoring/features.js';
import { averageSessions } from '../src/scoring/session.js';
import type { RubricScore } from '../src/schemas.js';

const RUBRIC = (over: Partial<RubricScore> = {}): RubricScore => ({
  vocabulary: 70, grammar: 65, coherence: 60, interaction: 75, fluency: 72, pronunciation: 68,
  summary: 'Solid B1 attempt.', weak_points: ['article usage'], ...over,
});

describe('scoreToCEFR (deterministic mapping)', () => {
  it('maps band boundaries exactly', () => {
    expect(scoreToCEFR(0)).toBe('A1');
    expect(scoreToCEFR(29)).toBe('A1');
    expect(scoreToCEFR(30)).toBe('A2');
    expect(scoreToCEFR(44)).toBe('A2');
    expect(scoreToCEFR(45)).toBe('A2+');
    expect(scoreToCEFR(55)).toBe('B1-');
    expect(scoreToCEFR(68)).toBe('B1');
    expect(scoreToCEFR(78)).toBe('B2');
    expect(scoreToCEFR(88)).toBe('C1');
    expect(scoreToCEFR(100)).toBe('C1');
  });
  it('clamps out-of-range', () => {
    expect(scoreToCEFR(-10)).toBe('A1');
    expect(scoreToCEFR(999)).toBe('C1');
  });
});

describe('aggregate', () => {
  it('is deterministic — identical input → identical output', () => {
    const a = aggregate({ rubric: RUBRIC() });
    const b = aggregate({ rubric: RUBRIC() });
    expect(a).toEqual(b);
  });
  it('text turn excludes pronunciation (5 dims), audio includes it (6 dims)', () => {
    const text = aggregate({ rubric: RUBRIC() });
    expect(Object.keys(text.dimensions).sort()).toEqual(['coherence', 'fluency', 'grammar', 'interaction', 'vocabulary']);
    const audio = aggregate({
      rubric: RUBRIC(),
      features: { rate_wpm: 140, pause_ratio: 0.1, repetition_rate: 0 },
      asrConfidence: 0.9,
    });
    expect(Object.keys(audio.dimensions)).toContain('pronunciation');
  });
  it('always carries the AI-estimate disclaimer + a CEFR band', () => {
    const r = aggregate({ rubric: RUBRIC() });
    expect(r.disclaimer).toMatch(/AI estimate/i);
    expect(r.cefr_estimate).toMatch(/^[ABC]/);
  });

  // Golden set: fixed rubric → expected total + band (regression guard, TECH §B5).
  const GOLDEN: Array<{ rubric: Partial<RubricScore>; total: number; band: string }> = [
    { rubric: { vocabulary: 30, grammar: 30, coherence: 30, interaction: 30, fluency: 30, pronunciation: 30 }, total: 30, band: 'A2' },
    { rubric: { vocabulary: 70, grammar: 70, coherence: 70, interaction: 70, fluency: 70, pronunciation: 70 }, total: 70, band: 'B1' },
    { rubric: { vocabulary: 90, grammar: 90, coherence: 90, interaction: 90, fluency: 90, pronunciation: 90 }, total: 90, band: 'C1' },
  ];
  it.each(GOLDEN)('golden text-turn total %#', ({ rubric, total, band }) => {
    const r = aggregate({ rubric: RUBRIC(rubric) });
    expect(r.total).toBe(total);       // uniform dims → weighted avg equals the value
    expect(r.cefr_estimate).toBe(band);
  });
});

describe('speech features', () => {
  it('computes rate/pause/repetition from words', () => {
    const f = computeSpeechFeatures(
      [{ word: 'I', start: 0, end: 0.3 }, { word: 'like', start: 0.4, end: 0.8 }, { word: 'like', start: 0.9, end: 1.2 }],
      2,
    );
    expect(f.rate_wpm).toBeGreaterThan(0);
    expect(f.pause_ratio).toBeGreaterThanOrEqual(0);
    expect(f.repetition_rate).toBeGreaterThan(0); // "like like"
  });
  it('fluency peaks near 140 wpm', () => {
    const near = fluencyFromFeatures({ rate_wpm: 140, pause_ratio: 0, repetition_rate: 0 });
    const slow = fluencyFromFeatures({ rate_wpm: 40, pause_ratio: 0.5, repetition_rate: 0.2 });
    expect(near).toBeGreaterThan(slow);
  });
});

describe('updateEma', () => {
  it('seeds with the first sample', () => expect(updateEma(undefined, 80)).toBe(80));
  it('smooths toward new samples', () => {
    const e = updateEma(60, 90); // 0.3*90 + 0.7*60 = 69
    expect(e).toBeCloseTo(69, 5);
  });
  it('a single noisy session cannot swing the level', () => {
    const e = updateEma(50, 100);
    expect(e).toBeLessThan(70); // stays B1- region, not B2
  });
});

describe('averageSessions', () => {
  it('averages dimensions + totals across turns', () => {
    const a = aggregate({ rubric: RUBRIC({ vocabulary: 60, grammar: 60, coherence: 60, interaction: 60, fluency: 60, pronunciation: 60 }) });
    const b = aggregate({ rubric: RUBRIC({ vocabulary: 80, grammar: 80, coherence: 80, interaction: 80, fluency: 80, pronunciation: 80 }) });
    const avg = averageSessions([a, b]);
    expect(avg.total).toBe(70);
    expect(avg.dimensions['vocabulary']!.score).toBe(70);
  });
});
