import 'dotenv/config';
import { buildServer } from './server.js';
import { connectRedis, disconnectRedis } from './cache/client.js';
import { prisma } from './db/client.js';
import { bootstrapAllSyncJobs } from './ingestion/adapters/modeA/poller.js';
import { syncWorker, outboxWorker, webhookNotifyWorker, closeAllWorkers } from './jobs/workers.js';
import { closeAllQueues } from './jobs/queues.js';
import { startReconciler } from './payments/reconciler.js';
import { env } from './config/env.js';

async function main() {
  console.info(' Starting Agent Commerce Gateway...');

  await connectRedis();
  console.info(' Redis connected');

  await prisma.$connect();
  console.info(' PostgreSQL connected');

  await bootstrapAllSyncJobs();
  console.info(' Sync jobs bootstrapped');

  console.info(` Workers running: sync, outbox, webhook-notify`);
  void syncWorker; void outboxWorker; void webhookNotifyWorker; 

  const stopReconciler = startReconciler();
  console.info(' Reconciler started');

  const app = await buildServer();

  await app.listen({ port: env.PORT, host: env.HOST });
  console.info(` HTTP server listening on http://${env.HOST}:${env.PORT}`);

  const shutdown = async (signal: string) => {
    console.info(`\n Received ${signal}. Shutting down gracefully...`);

    stopReconciler();

    await app.close();
    await closeAllWorkers();
    await closeAllQueues();
    await disconnectRedis();
    await prisma.$disconnect();

    console.info(' Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(' Fatal startup error:', err);
  process.exit(1);
});
