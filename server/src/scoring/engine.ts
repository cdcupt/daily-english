import { scoreToCEFR, CEFR_DISCLAIMER } from './cefr.js';
import { fluencyFromFeatures, pronunciationFromConfidence, type SpeechFeatures } from './features.js';
import type { RubricScore } from '../schemas.js';

/**
 * Score aggregation (TECH §B5). Code-computed speech features blend with the
 * LLM rubric; a deterministic mapping yields CEFR; the long-term profile is a
 * per-dimension EMA that excludes low-confidence turns. Pure functions →
 * golden-set testable.
 */
export interface DimensionScore { score: number; level: string }
export interface SessionScore {
  total: number;
  cefr_estimate: string;
  dimensions: Record<string, DimensionScore>;
  summary: string;
  weak_points: string[];
  disclaimer: string;
}

export interface AggregateInput {
  rubric: RubricScore;
  features?: SpeechFeatures;   // present only for audio turns
  asrConfidence?: number;      // present only for audio turns
}

const BASE_WEIGHTS: Record<string, number> = {
  vocabulary: 0.20, grammar: 0.20, fluency: 0.18, coherence: 0.14, interaction: 0.14, pronunciation: 0.14,
};

function dim(score: number): DimensionScore {
  const s = Math.round(Math.max(0, Math.min(100, score)));
  return { score: s, level: scoreToCEFR(s) };
}

export function aggregate(input: AggregateInput): SessionScore {
  const { rubric, features, asrConfidence } = input;
  const hasAudio = features !== undefined && asrConfidence !== undefined;

  const fluency = hasAudio
    ? 0.6 * fluencyFromFeatures(features) + 0.4 * rubric.fluency
    : rubric.fluency;

  const raw: Record<string, number> = {
    vocabulary: rubric.vocabulary,
    grammar: rubric.grammar,
    coherence: rubric.coherence,
    interaction: rubric.interaction,
    fluency,
  };
  if (hasAudio) {
    raw['pronunciation'] = 0.5 * pronunciationFromConfidence(asrConfidence) + 0.5 * rubric.pronunciation;
  }

  // Weighted total, renormalized over the dimensions actually present.
  let weightSum = 0;
  let acc = 0;
  for (const [k, v] of Object.entries(raw)) {
    const w = BASE_WEIGHTS[k] ?? 0;
    weightSum += w;
    acc += w * v;
  }
  const total = Math.round(acc / (weightSum || 1));

  const dimensions: Record<string, DimensionScore> = {};
  for (const [k, v] of Object.entries(raw)) dimensions[k] = dim(v);

  return {
    total,
    cefr_estimate: scoreToCEFR(total),
    dimensions,
    summary: rubric.summary,
    weak_points: rubric.weak_points,
    disclaimer: CEFR_DISCLAIMER,
  };
}

/** EMA update for the long-term profile; low-confidence turns are excluded upstream. */
export const EMA_ALPHA = 0.3;
export function updateEma(prevEma: number | undefined, sample: number, alpha = EMA_ALPHA): number {
  if (prevEma === undefined) return sample;
  return alpha * sample + (1 - alpha) * prevEma;
}
