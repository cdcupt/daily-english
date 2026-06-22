import { scoreToCEFR } from '../scoring/cefr.js';
import type { ItemGen } from '../schemas.js';

/**
 * Pure quality gate for a generated question item (Topic Sessions safety). The
 * SHAPE is already guaranteed by ItemGenSchema (runStructured re-validates), so
 * this layer adds SEMANTIC sanity that schema validation can't express, before a
 * custom item is published into the shared bank:
 *  - CEFR/difficulty agreement (the difficulty must map near the declared band),
 *  - language sanity (prompt_cn is Chinese; reference answers are English),
 *  - length caps, and
 *  - reference answers must differ from the prompt.
 * Returns { ok, reasons[] } — failures are PARKED (not published), never served.
 */

const CJK_RE = /[㐀-䶿一-鿿]/;
const LATIN_RE = /[A-Za-z]/;

const MAX_PROMPT_LEN = 400;
const MAX_REFERENCE_LEN = 400;
// How far the difficulty-implied band may sit from the declared band (in ranks)
// before we treat the item as miscalibrated. 1 = adjacent band tolerated.
const MAX_BAND_DISTANCE = 1;

// Ordinal ranking for the bands scoreToCEFR can emit + the seed/scaffold bands.
// Intermediate variants share their base rank's neighbourhood.
const BAND_RANK: Record<string, number> = {
  A1: 0, A2: 1, 'A2+': 1.5, 'B1-': 1.75, B1: 2, B2: 3, C1: 4, C2: 5,
};

/** Normalize a declared CEFR level ('A2-B1', 'b1', 'B1 ') to a rank, or null. */
export function bandRank(level: string): number | null {
  const first = level.trim().toUpperCase().split(/[-–\s/]/)[0] ?? '';
  // Re-attach a trailing '+' that the split above would drop (e.g. 'A2+').
  const withPlus = level.trim().toUpperCase().startsWith(`${first}+`) ? `${first}+` : first;
  const rank = BAND_RANK[withPlus] ?? BAND_RANK[first];
  return rank ?? null;
}

export interface QualityResult { ok: boolean; reasons: string[] }

export function validateItemQuality(item: ItemGen, cefrLevel: string): QualityResult {
  const reasons: string[] = [];

  // 1) CEFR / difficulty agreement.
  const declared = bandRank(cefrLevel);
  const implied = bandRank(scoreToCEFR(item.difficulty_score));
  if (declared === null) {
    reasons.push(`unparseable cefr level "${cefrLevel}"`);
  } else if (implied !== null && Math.abs(declared - implied) > MAX_BAND_DISTANCE) {
    reasons.push(`difficulty ${item.difficulty_score} (${scoreToCEFR(item.difficulty_score)}) is far from declared band ${cefrLevel}`);
  }

  // 2) Language sanity: the Chinese prompt must contain CJK.
  if (!item.prompt_cn || !CJK_RE.test(item.prompt_cn)) {
    reasons.push('prompt_cn must contain Chinese characters');
  }
  if (item.prompt_cn && item.prompt_cn.length > MAX_PROMPT_LEN) {
    reasons.push(`prompt_cn exceeds ${MAX_PROMPT_LEN} characters`);
  }

  // 3) Reference answers: English (Latin script, no CJK), capped, distinct from prompt.
  for (const ref of item.reference_answers) {
    if (!LATIN_RE.test(ref) || CJK_RE.test(ref)) {
      reasons.push('reference answers must be in English (Latin script)');
      break;
    }
  }
  if (item.reference_answers.some((ref) => ref.length > MAX_REFERENCE_LEN)) {
    reasons.push(`a reference answer exceeds ${MAX_REFERENCE_LEN} characters`);
  }
  if (item.prompt_cn) {
    const promptNorm = item.prompt_cn.trim();
    if (item.reference_answers.some((ref) => ref.trim() === promptNorm)) {
      reasons.push('a reference answer is identical to the prompt');
    }
  }

  return { ok: reasons.length === 0, reasons };
}
