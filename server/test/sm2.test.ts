import { describe, it, expect } from 'vitest';
import { scheduleNext, isDue } from '../src/review/sm2.js';
import type { ReviewStatus } from '../src/db/schema.js';

const NOW = new Date('2026-06-14T09:00:00Z');
const base = (over: Partial<ReviewStatus> = {}): ReviewStatus =>
  ({ next_review_at: NOW.toISOString(), mastery: 0.4, ease: 2.5, reps: 1, intervalDays: 1, ...over });

function daysBetween(iso: string, from: Date): number {
  return Math.round((new Date(iso).getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

describe('scheduleNext (SM-2)', () => {
  it('failing (q<3) resets reps, interval=1d, decays mastery', () => {
    const r = scheduleNext(base({ mastery: 0.8, reps: 4 }), 1, NOW);
    expect(r.reps).toBe(0);
    expect(r.intervalDays).toBe(1);
    expect(r.mastery).toBeCloseTo(0.48, 5); // 0.8 * 0.6
    expect(daysBetween(r.next_review_at, NOW)).toBe(1);
  });

  it('first pass → 1 day, second pass → 3 days', () => {
    const first = scheduleNext(base({ reps: 0 }), 4, NOW);
    expect(first.reps).toBe(1);
    expect(first.intervalDays).toBe(1);
    const second = scheduleNext(base({ reps: 1, intervalDays: 1 }), 4, NOW);
    expect(second.reps).toBe(2);
    expect(second.intervalDays).toBe(3);
  });

  it('third+ pass multiplies prior interval by ease', () => {
    const r = scheduleNext(base({ reps: 2, intervalDays: 3, ease: 2.5 }), 5, NOW);
    expect(r.reps).toBe(3);
    expect(r.intervalDays).toBe(Math.round(3 * r.ease));
    expect(r.intervalDays).toBeGreaterThan(3);
  });

  it('ease stays clamped within [1.3, 2.8]', () => {
    let rs = base({ ease: 1.3, reps: 3, intervalDays: 10 });
    for (let i = 0; i < 5; i += 1) rs = scheduleNext(rs, 0, NOW); // repeated fails
    // failing keeps ease unchanged; force passes at low grade to push ease down
    let low = base({ ease: 1.35 });
    for (let i = 0; i < 5; i += 1) low = scheduleNext(low, 3, NOW);
    expect(low.ease).toBeGreaterThanOrEqual(1.3);
    let high = base({ ease: 2.7 });
    for (let i = 0; i < 10; i += 1) high = scheduleNext(high, 5, NOW);
    expect(high.ease).toBeLessThanOrEqual(2.8);
  });

  it('mastery grows on pass, capped at 1', () => {
    let rs = base({ mastery: 0.9 });
    rs = scheduleNext(rs, 5, NOW);
    expect(rs.mastery).toBeLessThanOrEqual(1);
    expect(rs.mastery).toBeGreaterThan(0.9);
  });

  it('higher grades yield higher ease than lower passing grades', () => {
    const good = scheduleNext(base({ ease: 2.5 }), 5, NOW);
    const ok = scheduleNext(base({ ease: 2.5 }), 3, NOW);
    expect(good.ease).toBeGreaterThan(ok.ease);
  });
});

describe('isDue', () => {
  it('is due when next_review_at is in the past', () => {
    expect(isDue(base({ next_review_at: '2020-01-01T00:00:00Z' }), NOW)).toBe(true);
  });
  it('is not due when scheduled in the future', () => {
    expect(isDue(base({ next_review_at: '2099-01-01T00:00:00Z' }), NOW)).toBe(false);
  });
});
