/**
 * Deterministic score → CEFR band mapping (TECH §B5). Pure + table-driven so it
 * is fully testable and never asked of the LLM — this is the core of scoring
 * stability. CEFR is always an AI ESTIMATE, surfaced with the compliance copy.
 */
export const CEFR_DISCLAIMER =
  'Your current CEFR level is an AI estimate for learning reference only. It is not an official language test score or certification.';

const BANDS: Array<{ max: number; band: string }> = [
  { max: 30, band: 'A1' },
  { max: 45, band: 'A2' },
  { max: 55, band: 'A2+' },
  { max: 68, band: 'B1-' },
  { max: 78, band: 'B1' },
  { max: 88, band: 'B2' },
  { max: 101, band: 'C1' },
];

export function scoreToCEFR(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  for (const b of BANDS) if (s < b.max) return b.band;
  return 'C1';
}
