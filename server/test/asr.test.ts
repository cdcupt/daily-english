import { describe, it, expect } from 'vitest';
import { computeAsrConfidence, isLowConfidence } from '../src/asr/confidence.js';
import { parseWhisperVerbose } from '../src/asr/client.js';

describe('computeAsrConfidence', () => {
  it('is high for confident, speech-y segments', () => {
    const c = computeAsrConfidence([{ avg_logprob: -0.1, no_speech_prob: 0.02 }]);
    expect(c).toBeGreaterThan(0.8);
    expect(isLowConfidence(c)).toBe(false);
  });
  it('is low for uncertain / silence-heavy segments', () => {
    const c = computeAsrConfidence([{ avg_logprob: -1.5, no_speech_prob: 0.6 }]);
    expect(c).toBeLessThan(0.55);
    expect(isLowConfidence(c)).toBe(true);
  });
  it('returns 0 (low) for no segments', () => {
    expect(computeAsrConfidence([])).toBe(0);
    expect(isLowConfidence(0)).toBe(true);
  });
  it('averages across segments', () => {
    const c = computeAsrConfidence([
      { avg_logprob: -0.05, no_speech_prob: 0.01 },
      { avg_logprob: -0.05, no_speech_prob: 0.01 },
    ]);
    expect(c).toBeGreaterThan(0.9);
  });
});

describe('parseWhisperVerbose', () => {
  it('maps transcript, words, duration and computes confidence', () => {
    const r = parseWhisperVerbose({
      text: "I'd like a coffee",
      duration: 2.1,
      segments: [{ avg_logprob: -0.2, no_speech_prob: 0.03 }],
      words: [{ word: 'I', start: 0, end: 0.2 }, { word: 'like', start: 0.3, end: 0.6 }],
    });
    expect(r.transcript).toContain('coffee');
    expect(r.words).toHaveLength(2);
    expect(r.durationSeconds).toBeCloseTo(2.1);
    expect(r.lowConfidence).toBe(false);
  });
  it('flags low confidence from poor segments', () => {
    const r = parseWhisperVerbose({ text: '...', segments: [{ avg_logprob: -2, no_speech_prob: 0.7 }] });
    expect(r.lowConfidence).toBe(true);
  });
});
