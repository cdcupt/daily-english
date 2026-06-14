import { env } from '../env.js';
import { computeAsrConfidence, isLowConfidence, type AsrSegment } from './confidence.js';
import type { AsrWord } from '../scoring/features.js';

/**
 * Server-side ASR via the OFFICIAL OpenAI transcription API (whisper-1,
 * verbose_json) — canonical so scoring is identical across web + iOS (TECH §B6).
 * Accepts both WebM/Opus and MP4/AAC (Safari). A self-hosted faster-whisper
 * endpoint can replace this behind the same interface (WHISPER_URL).
 */
export interface TranscriptionResult {
  transcript: string;
  words: AsrWord[];
  confidence: number;
  lowConfidence: boolean;
  durationSeconds: number;
}

export interface Transcriber {
  transcribe(audio: Buffer, filename: string, mime: string): Promise<TranscriptionResult>;
}

interface WhisperVerbose {
  text: string;
  duration?: number;
  segments?: AsrSegment[];
  words?: Array<{ word: string; start: number; end: number }>;
}

export function parseWhisperVerbose(json: WhisperVerbose): TranscriptionResult {
  const segments = json.segments ?? [];
  const confidence = computeAsrConfidence(segments);
  const words: AsrWord[] = (json.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
  return {
    transcript: json.text ?? '',
    words,
    confidence,
    lowConfidence: isLowConfidence(confidence),
    durationSeconds: json.duration ?? 0,
  };
}

export class OpenAITranscriber implements Transcriber {
  constructor(
    private readonly apiKey = env.OPENAI_API_KEY,
    private readonly baseUrl = env.OPENAI_BASE_URL,
    private readonly model = env.ASR_MODEL,
  ) {}

  async transcribe(audio: Buffer, filename: string, mime: string): Promise<TranscriptionResult> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not set');
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mime }), filename);
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('timestamp_granularities[]', 'word');

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ASR error ${res.status}: ${text.slice(0, 300)}`);
    }
    return parseWhisperVerbose((await res.json()) as WhisperVerbose);
  }
}
