import { prisma } from '../db/client.js';
import { updateOrderStatus } from '../ir/orders.js';
import { appendTransactionEvent } from '../payments/event-log.js';
import { addWebhookNotifyJob } from '../jobs/queues.js';
import { incrementStock } from '../ir/inventory.js';
import type { IROrder } from '../types/ir.js';
import { z } from 'zod';

//   POST /webhooks/merchant/:merchantId

//   Merchant → ACG → IR (order status updated) → Agent (callback/poll)

const MerchantWebhookPayloadSchema = z.object({
  event: z.enum([
    'order.cancelled',
    'order.fulfilled',
    'order.refunded',
    'order.shipment_updated',
    'order.partially_fulfilled',
  ]),
  externalOrderId: z.string(),
  data: z.object({
    status: z.string().optional(),
    fulfillmentStatus: z.string().optional(),
    trackingNumber: z.string().optional(),
    trackingUrl: z.string().optional(),
    estimatedDelivery: z.string().optional(),
    refundAmount: z.number().optional(),
    cancellationReason: z.string().optional(),
    lineItems: z.array(z.object({
      externalId: z.string(),
      quantity: z.number(),
    })).optional(),
  }),
  timestamp: z.number(),
  correlationId: z.string().optional(),
});

export type MerchantWebhookPayload = z.infer<typeof MerchantWebhookPayloadSchema>;

interface WebhookProcessResult {
  success: boolean;
  orderId?: string;
  message: string;
}

/**
 * Process an inbound webhook from a merchant system.
 * Updates IR order status and appends a TransactionEvent for full auditability.
 * Also notifies the agent if it registered a callback URL at checkout.
 */
export async function processMerchantWebhook(
  merchantId: string,
  rawPayload: unknown,
  correlationId: string,
): Promise<WebhookProcessResult> {
  const parsed = MerchantWebhookPayloadSchema.safeParse(rawPayload);

  if (!parsed.success) {
    return {
      success: false,
      message: `Invalid webhook payload: ${parsed.error.flatten().fieldErrors}`,
    };
  }

  const { event, externalOrderId, data } = parsed.data;

  const order = await prisma.order.findFirst({
    where: { merchantId, externalOrderId },
    include: { paymentIntents: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (!order) {
    return {
      success: false,
      message: `Order with externalOrderId ${externalOrderId} not found for merchant ${merchantId}.`,
    };
  }

  const paymentIntent = order.paymentIntents[0];

  const statusMap: Record<string, IROrder['status']> = {
    'order.cancelled': 'CANCELLED',
    'order.fulfilled': 'DELIVERED',
    'order.refunded': 'REFUNDED',
    'order.shipment_updated': 'SHIPPED',
    'order.partially_fulfilled': 'PROCESSING',
  };

  const fulfillmentMap: Record<string, IROrder['fulfillmentStatus']> = {
    'order.fulfilled': 'FULFILLED',
    'order.partially_fulfilled': 'PARTIALLY_FULFILLED',
    'order.refunded': 'RETURNED',
  };

  const newStatus = statusMap[event] ?? 'PROCESSING';
  const newFulfillmentStatus = fulfillmentMap[event];

  const updatedOrder = await updateOrderStatus(order.id, newStatus, {
    ...(newFulfillmentStatus ? { fulfillmentStatus: newFulfillmentStatus } : {}),
    ...(data.trackingNumber ? { trackingNumber: data.trackingNumber } : {}),
    ...(data.trackingUrl ? { trackingUrl: data.trackingUrl } : {}),
    ...(data.estimatedDelivery ? { estimatedDelivery: new Date(data.estimatedDelivery) } : {}),
    ...(data.cancellationReason ? { internalNotes: data.cancellationReason } : {}),
  });

  if (paymentIntent) {
    await appendTransactionEvent({
      paymentIntentId: paymentIntent.id,
      orderId: order.id,
      eventType: 'ORDER_UPDATE_RECEIVED',
      actor: `merchant:${merchantId}`,
      payload: { event, data, externalOrderId },
      correlationId,
    });
  }

  if (event === 'order.cancelled' || event === 'order.refunded') {
    const cartItems = await prisma.cartItem.findMany({ where: { cartId: order.cartId } });
    for (const item of cartItems) {
      if (item.variantId) {
        await incrementStock(item.variantId, item.quantity);
      }
    }
  }

  if (order.agentCallbackUrl) {
    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { webhookSigningSecret: true },
    });

    if (merchant.webhookSigningSecret) {
      await addWebhookNotifyJob({
        targetUrl: order.agentCallbackUrl,
        event: `acg.${event}`,
        payload: {
          orderId: order.id,
          status: newStatus,
          fulfillmentStatus: newFulfillmentStatus,
          trackingNumber: data.trackingNumber,
          trackingUrl: data.trackingUrl,
        },
        signingSecret: merchant.webhookSigningSecret,
        correlationId,
      });
    }
  }

  if (order.agentCallbackUrl && paymentIntent) {
    await appendTransactionEvent({
      paymentIntentId: paymentIntent.id,
      orderId: order.id,
      eventType: 'STATUS_PROPAGATED',
      actor: 'system:webhook-receiver',
      payload: { propagatedTo: order.agentCallbackUrl, status: newStatus },
      correlationId,
    });
  }

  return {
    success: true,
    orderId: updatedOrder.id,
    message: `Order ${externalOrderId} updated to status "${newStatus}".`,
  };
}
