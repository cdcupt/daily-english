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
    // temperature is included ONLY when explicitly set — some models (gpt-5.5)
    // reject a custom temperature with a 400; undefined means "omit the field".
    const base: Record<string, unknown> = { model: opts.model ?? this.defaultModel, messages };
    if (opts.temperature !== undefined) base['temperature'] = opts.temperature;

    // First try with json_schema response_format (strict). If the provider
    // rejects response_format (a 400 mentioning it — e.g. an endpoint that only
    // supports json_object), downgrade once and rely on the prompt + Zod.
    const send = async (withSchema: boolean) => {
      const body = { ...base };
      if (opts.jsonSchema && withSchema) body['response_format'] = { type: 'json_schema', json_schema: opts.jsonSchema };
      return fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: opts.signal ?? null,
      });
    };

    try {
      let res = await send(Boolean(opts.jsonSchema));
      if (!res.ok && res.status === 400 && opts.jsonSchema) {
        const peek = await res.clone().text().catch(() => '');
        if (/response_format|json_schema|schema/i.test(peek)) res = await send(false);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new AIError(`AI provider error ${res.status}: ${text.slice(0, 300)}`, res.status);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new AIError('AI response missing content');
      return content;
    } catch (e) {
      // Preserve typed provider errors (they carry an HTTP status). A raw
      // fetch rejection — network failure or an aborted/timed-out request —
      // is rewrapped as a status-less AIError so the resilience layer treats
      // it as transient and falls over to the fallback model.
      if (e instanceof AIError) throw e;
      const name = e instanceof Error ? e.name : 'Error';
      const msg = e instanceof Error ? e.message : String(e);
      const label = name === 'AbortError' || name === 'TimeoutError' ? 'request timed out' : 'request failed';
      throw new AIError(`AI ${label} (${name}): ${msg}`);
    }
  }
}
