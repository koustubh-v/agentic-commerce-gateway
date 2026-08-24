import { Worker } from 'bullmq';
import { redisBullMQ } from '../cache/client.js';
import { QUEUES } from '../config/constants.js';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { mapMerchantResponse } from '../ingestion/adapters/modeA/mapper.js';
import { normalizeProducts } from '../ingestion/normalizer.js';
import { upsertProductFromSync, markProductsStale } from '../ir/products.js';
import { addWebhookNotifyJob } from './queues.js';
import type { SyncJobPayload, OutboxJobPayload, WebhookNotifyPayload } from './queues.js';
import { createRazorpayOrder } from '../payments/razorpay.js';
import { appendTransactionEvent } from '../payments/event-log.js';
import { mapRazorpayError } from '../commerce/errors.js';
import { releaseAllLocksForCheckout } from '../commerce/inventory-lock.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Sync Worker — processes Mode A product sync jobs
// ---------------------------------------------------------------------------

export const syncWorker = new Worker<SyncJobPayload>(
  QUEUES.SYNC_PRODUCTS,
  async (job) => {
    const { merchantId, entityType } = job.data;
    const startedAt = new Date();

    const syncLog = await prisma.syncLog.create({
      data: { merchantId, status: 'RUNNING', entityType, startedAt },
    });

    try {
      const config = await prisma.merchantSyncConfig.findUniqueOrThrow({
        where: { merchantId },
        include: { merchant: { select: { currency: true } } },
      });

      if (!config.productsEndpoint) {
        throw new Error('No products endpoint configured for merchant.');
      }

      // Build auth headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentCommerceGateway/1.0',
      };

      if (config.authType === 'bearer' && config.authValueEncrypted) {
        headers['Authorization'] = `Bearer ${config.authValueEncrypted}`; // decrypted in prod
      } else if (config.authType === 'api_key_header' && config.authHeaderName && config.authValueEncrypted) {
        headers[config.authHeaderName] = config.authValueEncrypted;
      } else if (config.authType === 'basic' && config.authValueEncrypted) {
        headers['Authorization'] = `Basic ${config.authValueEncrypted}`;
      }

      // Fetch from merchant's API
      const response = await fetch(config.productsEndpoint, { headers });

      if (!response.ok) {
        throw new Error(`Merchant API returned ${response.status}: ${response.statusText}`);
      }

      const rawData: unknown = await response.json();

      // Map using JSONPath field mapping
      const fieldMap = config.fieldMap as Parameters<typeof mapMerchantResponse>[1];
      const rawProducts = mapMerchantResponse(rawData, fieldMap, config.productsArrayPath ?? '$');

      // Normalise to canonical IR
      const normalized = normalizeProducts(rawProducts, merchantId, config.merchant.currency);

      // Write to IR store
      let recordsProcessed = 0;
      let recordsFailed = 0;

      for (const product of normalized) {
        try {
          await upsertProductFromSync(merchantId, product);
          recordsProcessed++;
        } catch (err) {
          console.error(`[SyncWorker] Failed to upsert product ${product.externalId}:`, err);
          recordsFailed++;
        }
      }

      const durationMs = Date.now() - startedAt.getTime();

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS',
          recordsProcessed,
          recordsFailed,
          completedAt: new Date(),
          durationMs,
        },
      });

      console.info(
        `[SyncWorker] merchant=${merchantId} processed=${recordsProcessed} failed=${recordsFailed} duration=${durationMs}ms`,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
        },
      });

      // Mark products as stale so agents get the freshness warning
      await markProductsStale(merchantId, `Sync failed: ${errorMessage}`);

      throw err; // Re-throw so BullMQ retries
    }
  },
  {
    connection: redisBullMQ,
    concurrency: env.BULLMQ_SYNC_CONCURRENCY,
  },
);

syncWorker.on('completed', (job) => {
  console.info(`[SyncWorker] Job ${job.id} completed for merchant ${job.data.merchantId}`);
});

syncWorker.on('failed', (job, err) => {
  console.error(`[SyncWorker] Job ${job?.id} failed:`, err.message);
});

// ---------------------------------------------------------------------------
// Outbox Worker — drains outbox rows for PSP calls and notifications
// ---------------------------------------------------------------------------

export const outboxWorker = new Worker<OutboxJobPayload>(
  QUEUES.OUTBOX,
  async (job) => {
    const { outboxId } = job.data;

    const outboxEntry = await prisma.outbox.findUnique({ where: { id: outboxId } });
    if (!outboxEntry) {
      console.warn(`[OutboxWorker] Outbox entry ${outboxId} not found. Skipping.`);
      return;
    }

    if (outboxEntry.status === 'DONE') {
      console.info(`[OutboxWorker] Outbox entry ${outboxId} already processed. Skipping (idempotent).`);
      return;
    }

    // Mark as processing
    await prisma.outbox.update({
      where: { id: outboxId },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
    });

    try {
      const payload = outboxEntry.payload as Record<string, unknown>;

      switch (outboxEntry.actionType) {
        case 'NOTIFY_MERCHANT': {
          const targetUrl = payload['webhookUrl'] as string;
          const signingSecret = payload['signingSecret'] as string;

          if (targetUrl) {
            await addWebhookNotifyJob({
              targetUrl,
              event: 'order.created',
              payload: payload['orderData'] as Record<string, unknown>,
              signingSecret,
              correlationId: outboxEntry.correlationId,
            });
          }
          break;
        }

        case 'NOTIFY_AGENT': {
          const targetUrl = payload['webhookUrl'] as string;
          if (targetUrl) {
            const response = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
              throw new Error(`Failed to notify agent at ${targetUrl}: ${response.status}`);
            }
          }
          break;
        }

        case 'CREATE_RAZORPAY_ORDER': {
          let razorpayOrder: any;
          try {
            razorpayOrder = await createRazorpayOrder(payload as any);
          } catch (err: any) {
            await prisma.paymentIntent.update({
              where: { id: outboxEntry.paymentIntentId },
              data: { status: 'PSP_FAILED' },
            });
            const intent = await prisma.paymentIntent.findUniqueOrThrow({ 
              where: { id: outboxEntry.paymentIntentId }, 
              include: { order: { include: { cart: { include: { items: true } } } } } 
            });
            const variantIds = intent.order.cart.items.map(i => i.variantId).filter((v): v is string => v !== null);
            await releaseAllLocksForCheckout(variantIds, intent.order.cartId);
            const mapped = mapRazorpayError(err?.error?.code);
            throw new Error(mapped.message);
          }

          await prisma.paymentIntent.update({
            where: { id: outboxEntry.paymentIntentId },
            data: {
              status: 'PSP_INITIATED',
              pspOrderId: razorpayOrder.id,
            },
          });

          await appendTransactionEvent({
            paymentIntentId: outboxEntry.paymentIntentId,
            orderId: payload['receipt'] as string,
            eventType: 'PSP_INITIATED',
            actor: 'system:gateway',
            payload: {
              razorpayOrderId: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency,
              paymentCapture: 0,
            },
            correlationId: outboxEntry.correlationId,
          });
          break;
        }

        default:
          console.warn(`[OutboxWorker] Unknown action type: ${outboxEntry.actionType}`);
      }

      await prisma.outbox.update({
        where: { id: outboxId },
        data: { status: 'DONE', processedAt: new Date() },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const nextRetry = outboxEntry.attempts < outboxEntry.maxAttempts
        ? new Date(Date.now() + 2 ** outboxEntry.attempts * 2000)
        : null;

      await prisma.outbox.update({
        where: { id: outboxId },
        data: {
          status: nextRetry ? 'PENDING' : 'FAILED',
          errorMessage,
          nextRetryAt: nextRetry,
        },
      });

      throw err;
    }
  },
  {
    connection: redisBullMQ,
    concurrency: env.BULLMQ_OUTBOX_CONCURRENCY,
  },
);

// ---------------------------------------------------------------------------
// Webhook Notify Worker — fan-out signed webhooks to agents and merchants
// ---------------------------------------------------------------------------

export const webhookNotifyWorker = new Worker<WebhookNotifyPayload>(
  QUEUES.WEBHOOK_NOTIFY,
  async (job) => {
    const { targetUrl, event, payload, signingSecret, correlationId } = job.data;

    const body = JSON.stringify({ event, data: payload, correlationId, timestamp: Date.now() });

    // HMAC-SHA256 signature
    const signature = crypto.createHmac('sha256', signingSecret).update(body).digest('hex');

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ACG-Signature': `sha256=${signature}`,
        'X-ACG-Event': event,
        'X-Correlation-ID': correlationId,
      },
      body,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery to ${targetUrl} failed with ${response.status}`);
    }

    console.info(`[WebhookWorker] Delivered event "${event}" to ${targetUrl} (correlation: ${correlationId})`);
  },
  {
    connection: redisBullMQ,
    concurrency: 20,
  },
);

export function closeAllWorkers(): Promise<void[]> {
  return Promise.all([
    syncWorker.close(),
    outboxWorker.close(),
    webhookNotifyWorker.close(),
  ]);
}
