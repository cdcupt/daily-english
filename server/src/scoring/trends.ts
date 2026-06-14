/**
 * Per-day trend aggregation for the You surface (TECH §16/DESIGN). Pure +
 * testable: collapses raw snapshots into one point per day (the latest snapshot
 * of each day), over the last N days, newest last.
 */
export interface Snapshot {
  capturedAt: Date;
  total: number;
  dimensions: Record<string, { score: number }>;
}
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  total: number | null;
  dimensions: Record<string, number>;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildTrendSeries(snapshots: Snapshot[], days: number, now: Date): TrendPoint[] {
  // Latest snapshot per day.
  const byDay = new Map<string, Snapshot>();
  for (const s of snapshots) {
    const k = dayKey(s.capturedAt);
    const prev = byDay.get(k);
    if (!prev || s.capturedAt.getTime() > prev.capturedAt.getTime()) byDay.set(k, s);
  }

  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const k = dayKey(d);
    const snap = byDay.get(k);
    points.push({
      date: k,
      total: snap ? snap.total : null,
      dimensions: snap
        ? Object.fromEntries(Object.entries(snap.dimensions).map(([dim, v]) => [dim, v.score]))
        : {},
    });
  }
  return points;
}
