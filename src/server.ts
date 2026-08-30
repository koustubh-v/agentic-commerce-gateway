import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import { env } from './config/env.js';
import { merchantRoutes } from './merchants/router.js';
import { irRoutes } from './ir/router.js';
import { razorpayWebhookRoutes } from './webhooks/razorpay.js';
import { merchantWebhookRoutes } from './webhooks/merchant.js';
import { acpRouter } from './acp/router.js';
import { discoveryRouter } from './discovery/router.js';
import { registerMcpServer } from './mcp/server.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, 
  });

  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please retry after a moment.',
    }),
  });

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'agent-commerce-gateway',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  await app.register(merchantRoutes);
  await app.register(irRoutes);
  await app.register(razorpayWebhookRoutes);
  await app.register(merchantWebhookRoutes);

  await app.register(acpRouter, { prefix: '/acp' });
  await app.register(discoveryRouter);

  registerMcpServer(app);

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);

    const statusCode = error.statusCode ?? 500;
    const message = statusCode === 500 ? 'Internal server error.' : error.message;

    return reply.code(statusCode).send({ error: message });
  });

  return app;
}
