/**
 * Code-computed speech features from ASR word timestamps (TECH §B5). These are
 * objective and never asked of the LLM. For text turns there is no audio, so
 * these are skipped and fluency/pronunciation fall back to the LLM rubric.
 */
export interface AsrWord { word: string; start: number; end: number; confidence?: number }
export interface SpeechFeatures { rate_wpm: number; pause_ratio: number; repetition_rate: number }

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

export function computeSpeechFeatures(words: AsrWord[], totalSeconds: number): SpeechFeatures {
  if (words.length === 0 || totalSeconds <= 0) {
    return { rate_wpm: 0, pause_ratio: 1, repetition_rate: 0 };
  }
  const speechSeconds = words.reduce((acc, w) => acc + Math.max(0, w.end - w.start), 0);
  const rate_wpm = words.length / (Math.max(speechSeconds, 0.001) / 60);
  const pause_ratio = clamp01((totalSeconds - speechSeconds) / totalSeconds);

  const tokens = words.map((w) => w.word.toLowerCase().replace(/[^a-z']/g, ''));
  let repeats = 0;
  for (let i = 1; i < tokens.length; i += 1) if (tokens[i] && tokens[i] === tokens[i - 1]) repeats += 1;
  const repetition_rate = clamp01(repeats / tokens.length);

  return { rate_wpm, pause_ratio, repetition_rate };
}

/** Map features to a 0–100 fluency estimate. ~140 wpm is the comfortable target. */
export function fluencyFromFeatures(f: SpeechFeatures): number {
  const rateScore = clamp01(1 - Math.abs(f.rate_wpm - 140) / 140); // peaks near 140 wpm
  const raw = 0.6 * rateScore - 0.25 * f.pause_ratio - 0.15 * f.repetition_rate;
  return Math.round(clamp01(0.4 + raw) * 100);
}

/** ASR confidence → intelligibility proxy for pronunciation (0–100). */
export function pronunciationFromConfidence(asrConfidence: number): number {
  return Math.round(clamp01(asrConfidence) * 100);
}
