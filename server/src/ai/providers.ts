import { env } from '../env.js';

/**
 * Provider registry (TECH §B4 + AI-config blueprint). Each provider is an
 * OpenAI-compatible endpoint identified by a base URL + an API key from env.
 * Adding a provider = one entry here. Model-level capabilities (e.g. whether a
 * model accepts a custom `temperature`) are declared separately because they
 * vary by model, not provider.
 */
export const PROVIDER_IDS = ['openai', 'gemini'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface Provider {
  id: ProviderId;
  baseUrl: string;
  apiKey: string | undefined;
}

export function getProvider(id: ProviderId): Provider {
  switch (id) {
    case 'gemini':
      return { id, baseUrl: env.GEMINI_BASE_URL, apiKey: env.GEMINI_API_KEY };
    case 'openai':
    default:
      return { id: 'openai', baseUrl: env.OPENAI_BASE_URL, apiKey: env.OPENAI_API_KEY };
  }
}

export function providerAvailable(id: ProviderId): boolean {
  return Boolean(getProvider(id).apiKey);
}

export function isProviderId(s: string): s is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(s);
}

/**
 * Some models reject a custom `temperature` (e.g. gpt-5.5 returns HTTP 400
 * "only the default 1 is supported" — confirmed in the model eval). The client
 * must omit `temperature` for these. Default: a model supports temperature
 * unless it matches a known reject pattern.
 */
const TEMPERATURE_REJECT = [/^gpt-5\.5/i];
export function supportsTemperature(model: string): boolean {
  return !TEMPERATURE_REJECT.some((re) => re.test(model));
}
