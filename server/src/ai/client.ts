import { env } from '../env.js';

/**
 * Minimal OpenAI-compatible chat client calling the OFFICIAL provider API
 * directly (no 9relay). Same wire shape the legacy iOS AIService used, so
 * Gemini/others can be swapped by config (AI_PROVIDER / OPENAI_BASE_URL).
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatJsonOptions {
  temperature?: number;
  jsonSchema?: { name: string; strict: boolean; schema: unknown };
  model?: string;
  signal?: AbortSignal;
}

export class AIError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AIError';
  }
}

export interface ChatClient {
  chat(messages: ChatMessage[], opts?: ChatJsonOptions): Promise<string>;
}

export class OpenAIChatClient implements ChatClient {
  constructor(
    private readonly apiKey = env.OPENAI_API_KEY,
    private readonly baseUrl = env.OPENAI_BASE_URL,
    private readonly defaultModel = env.AI_TEXT_MODEL,
  ) {}

  async chat(messages: ChatMessage[], opts: ChatJsonOptions = {}): Promise<string> {
    if (!this.apiKey) throw new AIError('OPENAI_API_KEY is not set');
    const body: Record<string, unknown> = {
      model: opts.model ?? this.defaultModel,
      messages,
      temperature: opts.temperature ?? 0.2,
    };
    if (opts.jsonSchema) {
      body['response_format'] = { type: 'json_schema', json_schema: opts.jsonSchema };
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: opts.signal ?? null,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AIError(`AI provider error ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new AIError('AI response missing content');
    return content;
  }
}
