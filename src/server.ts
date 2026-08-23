import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
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

  // ---------------------------------------------------------------------------
  // Security plugins
  // ---------------------------------------------------------------------------

  await app.register(helmet, {
    contentSecurityPolicy: false, // API server, no HTML
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

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  app.get('/health', async () => ({
    status: 'ok',
    service: 'agent-commerce-gateway',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));
  
  // ---------------------------------------------------------------------------
  // Route modules
  // ---------------------------------------------------------------------------

  await app.register(merchantRoutes);
  await app.register(irRoutes);
  await app.register(razorpayWebhookRoutes);
  await app.register(merchantWebhookRoutes);
  
  // New ACP and Discovery endpoints
  await app.register(acpRouter, { prefix: '/acp' });
  await app.register(discoveryRouter);
  
  // Register MCP Server endpoints (/mcp/sse and /mcp/message)
  registerMcpServer(app);

  // ---------------------------------------------------------------------------
  // Global error handler
  // ---------------------------------------------------------------------------

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);

    const statusCode = error.statusCode ?? 500;
    const message = statusCode === 500 ? 'Internal server error.' : error.message;

    return reply.code(statusCode).send({ error: message });
  });

  return app;
}
