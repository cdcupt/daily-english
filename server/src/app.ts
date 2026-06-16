import Fastify, { type FastifyInstance, type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { authRoutes } from './auth/plugin.js';
import { sessionRoutes } from './routes/sessions.js';
import { expressionRoutes } from './routes/expressions.js';
import { audioTurnRoutes } from './routes/audioTurns.js';
import { studyRoutes } from './routes/study.js';
import { adminRoutes } from './routes/admin.js';
import { reviewRoutes } from './routes/review.js';

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

  // Envelope handlers must be registered BEFORE routes so they apply to them.
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ data: null, error: { code: 'not_found', message: 'Not found' }, meta: null });
  });
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err); // full detail (incl. provider bodies) stays in logs only
    reply.code(status).send({
      data: null,
      error: {
        code: status >= 500 ? 'internal_error' : 'request_error',
        message: status >= 500 ? 'An internal error occurred' : err.message,
      },
      meta: null,
    });
  });

  // Standard envelope: { data, error, meta }
  app.get('/health', async () => ({
    data: { status: 'ok', service: 'scenario-english', ts: new Date().toISOString() },
    error: null,
    meta: null,
  }));

  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  await app.register(authRoutes);
  await app.register(sessionRoutes);
  await app.register(expressionRoutes);
  await app.register(audioTurnRoutes());
  await app.register(studyRoutes);
  await app.register(adminRoutes);
  await app.register(reviewRoutes);

  return app;
}
