import { z } from 'zod';

/**
 * Boot-time environment validation. The server refuses to start if required
 * secrets are missing (per TECH §B9/B10). DB + AI keys are only required when
 * actually used, so they are optional here but checked at point of use.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8101),
  HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1).optional(),

  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-only-insecure-refresh-change-me'),

  AI_PROVIDER: z.string().default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_TEXT_MODEL: z.string().default('gpt-5.4-mini'), // legacy default for openai text tasks (back-compat)
  ASR_MODEL: z.string().default('whisper-1'),
  WHISPER_URL: z.string().optional(),

  // Hard per-request deadline for AI calls. A stalled provider is aborted at
  // this cap, classified transient, and falls over to the task's fallback model
  // instead of hanging the (synchronous) request. Tunable per environment.
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Gemini provider (OpenAI-compatible endpoint). Optional — if the key is unset,
  // the registry won't route any task to gemini (falls back to openai defaults).
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta/openai'),

  // Per-task model overrides are read directly from process.env in the AI registry
  // (AI_<TASK>_PROVIDER / AI_<TASK>_MODEL, e.g. AI_SCORING_MODEL) so this schema
  // stays lean; DB overrides (admin) take precedence over both.

  RESEND_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

export const isProd = env.NODE_ENV === 'production';

// Never run production with the public dev-default JWT secrets (token forgery).
if (isProd && (env.JWT_SECRET === 'dev-only-insecure-secret-change-me'
  || env.JWT_REFRESH_SECRET === 'dev-only-insecure-refresh-change-me')) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set to strong random values in production');
}
