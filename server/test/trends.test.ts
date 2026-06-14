import { describe, it, expect } from 'vitest';
import { buildTrendSeries, type Snapshot } from '../src/scoring/trends.js';

const NOW = new Date('2026-06-14T12:00:00Z');
const day = (offset: number, total: number): Snapshot => ({
  capturedAt: new Date(NOW.getTime() - offset * 24 * 60 * 60 * 1000),
  total,
  dimensions: { vocabulary: { score: total }, grammar: { score: total - 5 } },
});

describe('buildTrendSeries', () => {
  it('returns exactly `days` points, newest last', () => {
    const series = buildTrendSeries([day(0, 70)], 30, NOW);
    expect(series).toHaveLength(30);
    expect(series[29]!.date).toBe('2026-06-14');
    expect(series[0]!.date).toBe('2026-05-16');
  });

  it('fills missing days with null total + empty dims', () => {
    const series = buildTrendSeries([day(0, 70)], 7, NOW);
    expect(series[6]!.total).toBe(70);
    expect(series[6]!.dimensions['vocabulary']).toBe(70);
    expect(series[0]!.total).toBeNull();
    expect(series[0]!.dimensions).toEqual({});
  });

  it('collapses multiple same-day snapshots to the latest', () => {
    const earlier: Snapshot = { capturedAt: new Date('2026-06-14T08:00:00Z'), total: 60, dimensions: { vocabulary: { score: 60 } } };
    const later: Snapshot = { capturedAt: new Date('2026-06-14T11:00:00Z'), total: 75, dimensions: { vocabulary: { score: 75 } } };
    const series = buildTrendSeries([earlier, later], 1, NOW);
    expect(series).toHaveLength(1);
    expect(series[0]!.total).toBe(75);
  });

  it('places snapshots on their correct day', () => {
    const series = buildTrendSeries([day(0, 80), day(3, 50)], 7, NOW);
    expect(series[6]!.total).toBe(80); // today
    expect(series[3]!.total).toBe(50); // 3 days ago
    expect(series[5]!.total).toBeNull();
  });
});
