import Fastify, { type FastifyInstance, type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './env.js';

/**
 * Builds the Fastify app with the standard response envelope, security headers,
 * and CORS locked to the learner web origin (TECH §B10). Routes are registered
 * per slice; slice 1 ships /health only.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : 'info' },
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? [env.WEB_ORIGIN] : true,
    credentials: true,
  });

  // Standard envelope: { data, error, meta }
  app.get('/health', async () => ({
    data: { status: 'ok', service: 'scenario-english', ts: new Date().toISOString() },
    error: null,
    meta: null,
  }));

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ data: null, error: { code: 'not_found', message: 'Not found' }, meta: null });
  });

  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    const status = err.statusCode ?? 500;
    reply.code(status).send({
      data: null,
      error: { code: status === 500 ? 'internal_error' : 'request_error', message: err.message },
      meta: null,
    });
  });

  return app;
}
