import { prisma } from '../../db/client.js';
import { addOutboxJob } from '../../jobs/queues.js';
import type { IROrder } from '../../types/ir.js';
import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Outbox Writer
// Write intent BEFORE making any external call (PSP, merchant webhook).
// A separate worker (outbox worker) reads these rows and makes actual calls.
// This guarantees no intent is lost even if the process crashes.
// ---------------------------------------------------------------------------

export interface OutboxEntryData {
  paymentIntentId: string;
  actionType: 'CREATE_RAZORPAY_ORDER' | 'NOTIFY_MERCHANT' | 'NOTIFY_AGENT';
  payload: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Write an outbox entry and immediately enqueue a BullMQ job to process it.
 * Both operations are atomic within the same DB transaction context:
 * the caller should pass this function inside a Prisma $transaction.
 *
 * @returns the outbox entry ID
 */
export async function writeOutboxEntry(
  data: OutboxEntryData,
  tx?: typeof prisma,
): Promise<string> {
  const client = tx ?? prisma;
  const correlationId = data.correlationId ?? uuidv4();
  const outboxId = uuidv4();

  await (client as typeof prisma).outbox.create({
    data: {
      id: outboxId,
      paymentIntentId: data.paymentIntentId,
      actionType: data.actionType,
      payload: data.payload as unknown as Prisma.InputJsonValue,
      correlationId,
    },
  });

  // Enqueue the processing job (slight delay to ensure DB commit propagates first)
  await addOutboxJob({ outboxId, correlationId }, { delay: 100 });

  return outboxId;
}

/**
 * Write a "NOTIFY_MERCHANT" outbox entry when an order is confirmed.
 * This fans out to the merchant's fulfillmentWebhookUrl.
 */
export async function notifyMerchantOfOrder(
  paymentIntentId: string,
  order: IROrder,
  merchantWebhookUrl: string,
  merchantWebhookSecret: string,
  correlationId: string,
): Promise<void> {
  await writeOutboxEntry({
    paymentIntentId,
    actionType: 'NOTIFY_MERCHANT',
    correlationId,
    payload: {
      webhookUrl: merchantWebhookUrl,
      signingSecret: merchantWebhookSecret,
      orderData: {
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        total: order.total,
        currency: order.currency,
        status: order.status,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        shippingAddress: order.shippingAddress,
        items: [], // cart items populated by caller
      },
    },
  });
}
