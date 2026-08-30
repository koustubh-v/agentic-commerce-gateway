import { Queue, type JobsOptions } from 'bullmq';
import { redisBullMQ } from '../cache/client.js';
import { QUEUES } from '../config/constants.js';

export const syncQueue = new Queue(QUEUES.SYNC_PRODUCTS, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

export const outboxQueue = new Queue(QUEUES.OUTBOX, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

export const webhookNotifyQueue = new Queue(QUEUES.WEBHOOK_NOTIFY, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
  },
});

export const reconcilerQueue = new Queue(QUEUES.RECONCILER, {
  connection: redisBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 100 },
  },
});

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
  outboxId: string;
  merchantId: string;
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
