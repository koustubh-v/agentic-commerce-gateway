import type { FastifyInstance } from 'fastify';
import { verifyRazorpayWebhookSignature } from '../payments/razorpay.js';
import { appendTransactionEvent } from '../payments/event-log.js';
import { env } from '../config/env.js';
import { API_PREFIX } from '../config/constants.js';

// ---------------------------------------------------------------------------
// Razorpay Inbound Webhook Handler
// POST /webhooks/razorpay
//
// Razorpay → ACG → IR update → fan-out to merchant + agent
// ---------------------------------------------------------------------------

export async function razorpayWebhookRoutes(app: FastifyInstance): Promise<void> {

  app.post(`${API_PREFIX}/webhooks/razorpay`, {
    config: { rawBody: true }, // Need raw body for HMAC verification
  }, async (req, reply) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;

    if (!signature) {
      return reply.code(400).send({ error: 'Missing X-Razorpay-Signature header.' });
    }

    const rawBody = (req as unknown as { rawBody: string }).rawBody ?? JSON.stringify(req.body);

    // HMAC-SHA256 signature verification — BEFORE processing any payload
    const isValid = verifyRazorpayWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET);

    if (!isValid) {
      return reply.code(401).send({ error: 'Invalid webhook signature.' });
    }

    const payload = req.body as {
      event: string;
      payload: {
        payment?: { entity: Record<string, unknown> };
        order?: { entity: Record<string, unknown> };
      };
    };

    const razorpayEventId = req.headers['x-razorpay-event-id'] as string | undefined;
    const event = payload.event;
    const correlationId = `rzp:${razorpayEventId ?? Date.now()}`;

    // Find the payment intent by Razorpay order ID
    const paymentEntity = payload.payload.payment?.entity;
    const pspOrderId = paymentEntity?.['order_id'] as string | undefined;

    if (!pspOrderId) {
      // Some events don't have order_id — acknowledge and skip
      return reply.code(200).send({ received: true });
    }

    const { prisma } = await import('../db/client.js');

    const intent = await prisma.paymentIntent.findFirst({
      where: { pspOrderId },
      include: { order: true },
    });

    if (!intent) {
      // Unknown order — still acknowledge to prevent Razorpay retries
      return reply.code(200).send({ received: true, note: 'Order not found in ACG.' });
    }

    // Map Razorpay event to ACG event type
    type EventType = import('@prisma/client').EventType;
    const eventTypeMap: Record<string, EventType> = {
      'payment.captured': 'PSP_WEBHOOK_RECEIVED',
      'payment.failed': 'PSP_WEBHOOK_RECEIVED',
      'order.paid': 'PSP_WEBHOOK_RECEIVED',
      'refund.created': 'REFUNDED',
    };

    const eventType: EventType = eventTypeMap[event] ?? 'PSP_WEBHOOK_RECEIVED';

    // Append event — idempotent via pspEventId unique constraint
    await appendTransactionEvent({
      paymentIntentId: intent.id,
      orderId: intent.orderId,
      eventType,
      actor: 'system:razorpay-webhook',
      payload: {
        razorpayEvent: event,
        paymentId: paymentEntity?.['id'],
        amount: paymentEntity?.['amount'],
        status: paymentEntity?.['status'],
        errorCode: paymentEntity?.['error_code'],
        errorDescription: paymentEntity?.['error_description'],
      },
      correlationId,
      ...(razorpayEventId ? { pspEventId: razorpayEventId } : {}),
    });

    // Update payment intent status
    // Full status-machine transitions in Payment Phase
    if (event === 'payment.captured' || event === 'order.paid') {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'PSP_SUCCEEDED',
          pspPaymentId: paymentEntity?.['id'] as string,
        },
      });
    } else if (event === 'payment.failed') {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PSP_FAILED' },
      });
    }

    return reply.code(200).send({ received: true });
  });
}
