import { aggregate, type SessionScore } from './engine.js';
import { scoreRubric } from './rubric.js';
import type { ChatClient } from '../ai/client.js';
import type { SpeechFeatures } from './features.js';

/**
 * Turn-level scoring → a single session ScoreReport. Each non-low-confidence
 * turn is rubric-scored + aggregated; the dimensions are then averaged across
 * turns. Low-confidence (ASR) turns are excluded (TECH §B5/§B6).
 */
export interface ScoreEntry {
  text: string;
  isSpoken: boolean;
  scenarioGoal: string;
  cefrTarget: string;
  referenceAnswers: string[];
  features?: SpeechFeatures;
  asrConfidence?: number;
  lowConfidence: boolean;
}

export async function scoreSession(entries: ScoreEntry[], client?: ChatClient): Promise<SessionScore> {
  const scored = entries.filter((e) => !e.lowConfidence && e.text.trim().length > 0);
  if (scored.length === 0) {
    const { CEFR_DISCLAIMER } = await import('./cefr.js');
    return { total: 0, cefr_estimate: 'A1', dimensions: {}, summary: 'No scorable turns.', weak_points: [], disclaimer: CEFR_DISCLAIMER };
  }

  const perTurn: SessionScore[] = [];
  for (const e of scored) {
    const { rubric } = await scoreRubric({
      scenarioGoal: e.scenarioGoal, cefrTarget: e.cefrTarget,
      referenceAnswers: e.referenceAnswers, transcriptOrText: e.text, isSpoken: e.isSpoken,
    }, client);
    perTurn.push(aggregate(e.features && e.asrConfidence !== undefined
      ? { rubric, features: e.features, asrConfidence: e.asrConfidence }
      : { rubric }));
  }

  return averageSessions(perTurn);
}

/** Average dimension + total scores across turns; union weak points (max 4). */
export function averageSessions(turns: SessionScore[]): SessionScore {
  const dimKeys = new Set<string>();
  turns.forEach((t) => Object.keys(t.dimensions).forEach((k) => dimKeys.add(k)));

  const dimensions: SessionScore['dimensions'] = {};
  for (const k of dimKeys) {
    const vals = turns.map((t) => t.dimensions[k]?.score).filter((v): v is number => v !== undefined);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    dimensions[k] = { score: avg, level: levelFor(avg) };
  }
  const total = Math.round(turns.reduce((a, t) => a + t.total, 0) / turns.length);
  const weak = Array.from(new Set(turns.flatMap((t) => t.weak_points))).slice(0, 4);

  return {
    total, cefr_estimate: levelFor(total), dimensions,
    summary: turns[0]!.summary, weak_points: weak, disclaimer: turns[0]!.disclaimer,
  };
}

import { scoreToCEFR } from './cefr.js';
function levelFor(s: number): string { return scoreToCEFR(s); }
