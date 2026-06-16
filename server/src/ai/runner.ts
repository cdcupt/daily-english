import type { z } from 'zod';
import type { ChatClient, ChatMessage } from './client.js';

/**
 * Structured-output runner (TECH §B4): force JSON via response_format, then
 * ALWAYS re-validate with Zod; on failure do exactly ONE repair retry feeding
 * the validation errors back; on a second failure throw a typed error. Returns
 * the parsed value plus audit fields (raw output, model, prompt version,
 * whether a repair was needed) so callers can persist them.
 */
export class AIContractError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'AIContractError';
  }
}

export interface StructuredResult<T> {
  data: T;
  raw: string;
  repaired: boolean;
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  else if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  return t.trim();
}

export interface RunStructuredArgs<T> {
  client: ChatClient;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  jsonSchema?: { name: string; strict: boolean; schema: unknown };
  temperature?: number;
  model?: string;
  signal?: AbortSignal;
}

export async function runStructured<T>(args: RunStructuredArgs<T>): Promise<StructuredResult<T>> {
  const { client, system, user, schema, jsonSchema, temperature, model, signal } = args;
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const first = await client.chat(messages, { jsonSchema, temperature, model, signal });
  const parsedFirst = tryParse(first, schema);
  if (parsedFirst.ok) return { data: parsedFirst.value, raw: first, repaired: false };

  // ONE repair retry: feed the validation error back and demand valid JSON only.
  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: first },
    {
      role: 'system',
      content: `Your previous output failed schema validation:\n${parsedFirst.error}\nReturn ONLY corrected JSON that matches the schema. No prose, no markdown fences.`,
    },
  ];
  const second = await client.chat(repairMessages, { jsonSchema, temperature, model, signal });
  const parsedSecond = tryParse(second, schema);
  if (parsedSecond.ok) return { data: parsedSecond.value, raw: second, repaired: true };

  throw new AIContractError(`AI output failed validation after repair: ${parsedSecond.error}`, second);
}

function tryParse<T>(text: string, schema: z.ZodType<T>):
  | { ok: true; value: T }
  | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(stripFences(text));
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  const result = schema.safeParse(obj);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
