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
  AI_TEXT_MODEL: z.string().default('gpt-5.4-mini'), // eval pick: quality wash vs flagship, accepts temperature, cheapest
  ASR_MODEL: z.string().default('whisper-1'),
  WHISPER_URL: z.string().optional(),

  RESEND_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

export const isProd = env.NODE_ENV === 'production';
