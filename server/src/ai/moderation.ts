import { env } from '../env.js';

/**
 * Content moderation for custom free-text topics (Topic Sessions safety gate).
 *
 * Calls the OFFICIAL OpenAI moderations endpoint directly — NEVER 9relay, and
 * NEVER the configurable OPENAI_BASE_URL (which may point at a proxy or an
 * incompatible gateway). The endpoint URL is hardcoded to api.openai.com and the
 * key is env.OPENAI_API_KEY; the moderations endpoint is free on standard keys.
 *
 * The caller fails CLOSED: this function THROWS on any transport/HTTP error (so
 * a moderation outage rejects the topic rather than silently letting unmoderated
 * free text into the shared content cache). A successful call returns the flag.
 */
export const MODERATION_URL = 'https://api.openai.com/v1/moderations';
export const MODERATION_MODEL = 'omni-moderation-latest';

const MODERATION_TIMEOUT_MS = 8000;

export class ModerationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ModerationError';
  }
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

interface OpenAIModerationResponse {
  results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
}

/**
 * Returns whether the text was flagged + the list of triggered categories.
 * Throws ModerationError on any failure (caller treats that as "reject").
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  if (!env.OPENAI_API_KEY) throw new ModerationError('OPENAI_API_KEY is not set');

  // Fresh deadline so a stalled moderation call is aborted (and the topic
  // rejected) instead of hanging the request.
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, MODERATION_TIMEOUT_MS);
  try {
    const res = await fetch(MODERATION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ModerationError(`moderation error ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
    const json = (await res.json()) as OpenAIModerationResponse;
    const result = json.results?.[0];
    if (!result || typeof result.flagged !== 'boolean') {
      throw new ModerationError('moderation response missing results');
    }
    const categories = Object.entries(result.categories ?? {})
      .filter(([, on]) => on === true)
      .map(([name]) => name);
    return { flagged: result.flagged, categories };
  } catch (e) {
    if (e instanceof ModerationError) throw e;
    const name = e instanceof Error ? e.name : 'Error';
    const msg = e instanceof Error ? e.message : String(e);
    const label = name === 'AbortError' || name === 'TimeoutError' ? 'request timed out' : 'request failed';
    throw new ModerationError(`moderation ${label} (${name}): ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}
