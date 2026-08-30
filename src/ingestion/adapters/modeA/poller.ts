import { prisma } from '../../../db/client.js';
import { addSyncJob } from '../../../jobs/queues.js';

/**
 * Register (or re-register) a repeatable sync job for a merchant.
 * Called when a merchant is onboarded or their poll config changes.
 */
export async function registerMerchantSyncJob(merchantId: string): Promise<void> {
  const config = await prisma.merchantSyncConfig.findUnique({ where: { merchantId } });

  if (!config || !config.active) {
    console.info(`[Poller] Polling disabled or no config for merchant ${merchantId}. Skipping.`);
    return;
  }

  const repeatEveryMs = config.pollIntervalMs;

  await addSyncJob(
    { merchantId, entityType: 'products' },
    {
      repeat: { every: repeatEveryMs },
      jobId: `sync:products:${merchantId}`, 
    },
  );

  console.info(`[Poller] Registered sync job for merchant ${merchantId} every ${config.pollIntervalMs / 60000}min`);
}

/**
 * Remove repeatable sync job for a merchant (e.g., on suspension or config removal).
 */
export async function deregisterMerchantSyncJob(merchantId: string): Promise<void> {
  
  console.info(`[Poller] Deregistering sync job for merchant ${merchantId}`);
  
}

/**
 * On startup, bootstrap repeatable jobs for all active polling merchants.
 * Call this once during server startup.
 */
export async function bootstrapAllSyncJobs(): Promise<void> {
  const configs = await prisma.merchantSyncConfig.findMany({
    where: {
      active: true,
      merchant: { status: 'ACTIVE' },
    },
    include: { merchant: true },
  });

  console.info(`[Poller] Bootstrapping sync jobs for ${configs.length} active merchants...`);

  for (const config of configs) {
    await registerMerchantSyncJob(config.merchantId);
  }
}
