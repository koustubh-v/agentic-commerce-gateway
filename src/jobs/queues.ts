import { Queue, type JobsOptions } from 'bullmq';
import { redisBullMQ } from '../cache/client.js';
import { QUEUES } from '../config/constants.js';

// ---------------------------------------------------------------------------
// BullMQ Queue definitions
// ---------------------------------------------------------------------------

// Products sync queue — processes Mode A polling jobs
export const syncQueue = new Queue(QUEUES.SYNC_PRODUCTS, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// Outbox queue — drains outbox table for PSP calls and webhook notifications
export const outboxQueue = new Queue(QUEUES.OUTBOX, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

// Webhook notification queue — fan-out notifications to agents and merchants
export const webhookNotifyQueue = new Queue(QUEUES.WEBHOOK_NOTIFY, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
  },
});

// Reconciler queue — polling for UNCERTAIN transactions
export const reconcilerQueue = new Queue(QUEUES.RECONCILER, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 100 },
  },
});

// ---------------------------------------------------------------------------
// Job payload types
// ---------------------------------------------------------------------------

export interface SyncJobPayload {
  merchantId: string;
  entityType: 'products' | 'inventory';
  triggeredBy?: 'scheduler' | 'manual' | 'webhook';
}

export interface OutboxJobPayload {
  outboxId: string;
  correlationId: string;
}

export interface WebhookNotifyPayload {
  targetUrl: string;
  event: string;
  payload: Record<string, unknown>;
  signingSecret: string;
  correlationId: string;
  retryCount?: number;
}

export interface ReconcilerJobPayload {
  paymentIntentId: string;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

export async function addSyncJob(
  data: SyncJobPayload,
  opts?: JobsOptions,
): Promise<void> {
  await syncQueue.add('sync', data, opts);
}

export async function addOutboxJob(
  data: OutboxJobPayload,
  opts?: JobsOptions,
): Promise<void> {
  await outboxQueue.add('process', data, opts);
}

export async function addWebhookNotifyJob(
  data: WebhookNotifyPayload,
  opts?: JobsOptions,
): Promise<void> {
  await webhookNotifyQueue.add('notify', data, opts);
}

export async function addReconcilerJob(
  data: ReconcilerJobPayload,
  opts?: JobsOptions,
): Promise<void> {
  await reconcilerQueue.add('reconcile', data, opts);
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([
    syncQueue.close(),
    outboxQueue.close(),
    webhookNotifyQueue.close(),
    reconcilerQueue.close(),
  ]);
}
