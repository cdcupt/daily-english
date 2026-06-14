"use client";

/**
 * Lightweight inline-SVG area/line sparkline of the 30-day `total` ability
 * series. No chart dependency — keeps the bundle small and matches the app's
 * clean aesthetic. Null days render as gaps (the line breaks), never as zeros.
 * Teal line + soft area fill, violet dot on the latest real point.
 */
import { useId } from "react";
import type { TrendPoint } from "@/api/types";

interface Props {
  series: TrendPoint[];
}

// viewBox geometry — the SVG scales responsively to its container width.
const W = 320;
const H = 92;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;

interface Plotted {
  x: number;
  y: number;
  point: TrendPoint;
}

export function TrendChart({ series }: Props) {
  const gradientId = useId();

  const totals = series
    .map((p) => p.total)
    .filter((v): v is number => v !== null);

  if (totals.length < 2) {
    return (
      <div className="trend-empty">
        Not enough practice yet — your trend appears after a few days.
      </div>
    );
  }

  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const span = max - min || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  const plotted: (Plotted | null)[] = series.map((point, i) => {
    if (point.total === null) return null;
    const x = PAD_X + i * stepX;
    const y = PAD_TOP + innerH - ((point.total - min) / span) * innerH;
    return { x, y, point };
  });

  // Build line segments, breaking the path at gap (null) days.
  const segments: Plotted[][] = [];
  let current: Plotted[] = [];
  for (const p of plotted) {
    if (p === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push(p);
    }
  }
  if (current.length > 0) segments.push(current);

  const toLine = (seg: Plotted[]) =>
    seg.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Area fill follows the longest continuous segment only (keeps it readable).
  const longest = segments.reduce(
    (best, s) => (s.length > best.length ? s : best),
    segments[0] ?? [],
  );
  const areaPath =
    longest.length > 1
      ? `${toLine(longest)} L${longest[longest.length - 1].x.toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} L${longest[0].x.toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} Z`
      : "";

  const lastReal = [...plotted].reverse().find((p): p is Plotted => p !== null);
  const latestValue = lastReal?.point.total ?? null;

  return (
    <figure className="trend-fig">
      <svg
        className="trend-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Overall ability over the last ${series.length} days${latestValue !== null ? `, most recent ${latestValue}` : ""}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-teal)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-teal)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {segments.map((seg, i) => (
          <path
            key={i}
            d={toLine(seg)}
            fill="none"
            stroke="var(--color-teal)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {lastReal && (
          <circle
            cx={lastReal.x}
            cy={lastReal.y}
            r={3.6}
            fill="var(--color-violet)"
            stroke="var(--color-panel)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="trend-cap">
        Overall ability, last 30 days
        {latestValue !== null && (
          <span className="trend-latest">{latestValue}</span>
        )}
      </figcaption>
    </figure>
  );
}
