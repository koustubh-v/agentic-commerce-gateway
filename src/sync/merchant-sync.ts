import { prisma } from '../db/client.js';
import { updateOrderStatus } from '../ir/orders.js';
import { appendTransactionEvent } from '../payments/event-log.js';
import { addWebhookNotifyJob, addSyncJob } from '../jobs/queues.js';
import type { IROrder } from '../types/ir.js';

// ---------------------------------------------------------------------------
// Bidirectional Merchant Sync — triggered from sync jobs and webhook receivers
// ---------------------------------------------------------------------------

export interface MerchantSyncResult {
  merchantId: string;
  syncLogId: string;
  productsProcessed: number;
  productsFailed: number;
  durationMs: number;
}

/**
 * Trigger a manual one-shot sync for a merchant.
 * Enqueues a BullMQ job that the sync worker processes immediately.
 */
export async function triggerManualSync(merchantId: string): Promise<{ jobId: string }> {
  await addSyncJob({ merchantId, entityType: 'products', triggeredBy: 'manual' });
  return { jobId: `manual:${merchantId}:${Date.now()}` };
}

/**
 * Get the latest sync status for a merchant.
 */
export async function getMerchantSyncStatus(merchantId: string) {
  const [latestLog, config] = await Promise.all([
    prisma.syncLog.findFirst({
      where: { merchantId },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.merchantSyncConfig.findUnique({ where: { merchantId } }),
  ]);

  return {
    merchantId,
    lastSync: latestLog
      ? {
          status: latestLog.status,
          entityType: latestLog.entityType,
          recordsProcessed: latestLog.recordsProcessed,
          recordsFailed: latestLog.recordsFailed,
          startedAt: latestLog.startedAt.toISOString(),
          completedAt: latestLog.completedAt?.toISOString(),
          errorMessage: latestLog.errorMessage,
        }
      : null,
    pollIntervalMinutes: config?.pollIntervalMinutes ?? null,
    isPollingEnabled: config?.isPollingEnabled ?? false,
    staleAfterSeconds: config?.staleAfterSeconds ?? null,
  };
}

/**
 * Push an order status update from ACG back to the merchant system.
 * This is the outbound direction: ACG → Merchant.
 * Called after payment settles (via Razorpay webhook) or gate rejection.
 */
export async function pushOrderStatusToMerchant(
  orderId: string,
  newStatus: IROrder['status'],
  correlationId: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      merchant: true,
      paymentIntents: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const merchant = order.merchant;

  // Update IR first
  await updateOrderStatus(orderId, newStatus);

  // Notify merchant via their fulfillment webhook
  if (merchant.fulfillmentWebhookUrl && merchant.webhookSigningSecret) {
    await addWebhookNotifyJob({
      targetUrl: merchant.fulfillmentWebhookUrl,
      event: 'acg.order.status_updated',
      payload: {
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        status: newStatus,
        correlationId,
      },
      signingSecret: merchant.webhookSigningSecret,
      correlationId,
    });
  }

  // Append event
  const paymentIntent = order.paymentIntents[0];
  if (paymentIntent) {
    await appendTransactionEvent({
      paymentIntentId: paymentIntent.id,
      orderId,
      eventType: 'STATUS_PROPAGATED',
      actor: 'system:sync',
      payload: { targetMerchantWebhook: merchant.fulfillmentWebhookUrl ?? 'none', newStatus },
      correlationId,
    });
  }
}
