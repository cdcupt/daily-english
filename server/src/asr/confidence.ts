/**
 * ASR confidence + gate (TECH §B6). Pure functions over whisper verbose_json
 * segments so they're unit-testable. Low-confidence turns are flagged for a
 * non-blocking retry and excluded from long-term scoring.
 */
export interface AsrSegment { avg_logprob: number; no_speech_prob: number }
export const ASR_CONFIDENCE_THRESHOLD = 0.55;

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

export function computeAsrConfidence(segments: AsrSegment[]): number {
  if (segments.length === 0) return 0;
  const meanWordConf = segments.reduce((a, s) => a + Math.exp(s.avg_logprob), 0) / segments.length;
  const meanNoSpeech = segments.reduce((a, s) => a + s.no_speech_prob, 0) / segments.length;
  return clamp01(meanWordConf * (1 - meanNoSpeech));
}

export function isLowConfidence(confidence: number, threshold = ASR_CONFIDENCE_THRESHOLD): boolean {
  return confidence < threshold;
}
