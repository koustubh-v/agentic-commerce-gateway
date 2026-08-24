import type { FastifyInstance } from 'fastify';
import { verifyRazorpayWebhookSignature, capturePayment } from '../payments/razorpay.js';
import { appendTransactionEvent } from '../payments/event-log.js';
import { runPreCaptureGate } from '../payments/gate.js';
import { releaseAllLocksForCheckout } from '../commerce/inventory-lock.js';
import { writeOutboxEntry } from '../sync/outbox/writer.js';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { API_PREFIX } from '../config/constants.js';

export async function razorpayWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(`${API_PREFIX}/webhooks/razorpay`, {
    config: { rawBody: true },
  }, async (req, reply) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    if (!signature) {
      return reply.code(400).send({ error: 'Missing signature header.' });
    }

    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
    if (!verifyRazorpayWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
      return reply.code(401).send({ error: 'Invalid signature.' });
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
    const paymentEntity = payload.payload.payment?.entity;
    const pspOrderId = paymentEntity?.['order_id'] as string | undefined;

    if (!pspOrderId) {
      return reply.code(200).send({ received: true });
    }

    const intent = await prisma.paymentIntent.findFirst({
      where: { pspOrderId },
      include: { order: true },
    });

    if (!intent) {
      return reply.code(200).send({ received: true });
    }

    const correlationId = `rzp:${razorpayEventId ?? Date.now()}`;

    if (event === 'payment.authorized') {
      await handlePaymentAuthorized(intent, paymentEntity!, correlationId, razorpayEventId);
    } else if (event === 'payment.captured') {
      await handlePaymentCaptured(intent, paymentEntity!, correlationId, razorpayEventId);
    } else if (event === 'payment.failed') {
      await handlePaymentFailed(intent, paymentEntity!, correlationId, razorpayEventId);
    } else if (event === 'refund.processed' || event === 'refund.created') {
      await handleRefund(intent, paymentEntity!, correlationId, razorpayEventId);
    }

    return reply.code(200).send({ received: true });
  });
}

export async function handlePaymentAuthorized(
  intent: any,
  paymentEntity: Record<string, unknown>,
  correlationId: string,
  pspEventId?: string,
) {
  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'PSP_AUTHORIZED',
    actor: 'system:razorpay-webhook',
    payload: {
      paymentId: paymentEntity['id'],
      amount: paymentEntity['amount'],
      status: paymentEntity['status'],
    },
    correlationId,
    ...(pspEventId ? { pspEventId: `${pspEventId}-auth` } : {}),
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: 'PSP_AUTHORIZED',
      pspPaymentId: paymentEntity['id'] as string,
    },
  });

  const orderNotes = paymentEntity['notes'] as Record<string, string> | undefined;
  const agentSessionId = orderNotes?.['agent_identity'] ?? 'unknown';
  const productIds = await prisma.cartItem.findMany({
    where: { cart: { order: { id: intent.orderId } } },
    select: { productId: true },
  });

  const preCaptureResult = await runPreCaptureGate(
    intent.merchantId,
    agentSessionId,
    Number(intent.amount),
    intent.currency,
    productIds.map(p => p.productId),
    correlationId,
  );

  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'GATE_DECISION_PRE_CAPTURE',
    actor: 'system:gateway',
    payload: {
      decision: preCaptureResult.decision,
      rule: preCaptureResult.rule,
      message: preCaptureResult.message,
    },
    correlationId,
  });

  if (preCaptureResult.decision === 'APPROVED') {
    try {
      await capturePayment(
        paymentEntity['id'] as string,
        paymentEntity['amount'] as number,
      );

      await appendTransactionEvent({
        paymentIntentId: intent.id,
        orderId: intent.orderId,
        eventType: 'PSP_CAPTURED',
        actor: 'system:gateway',
        payload: { paymentId: paymentEntity['id'], amount: paymentEntity['amount'] },
        correlationId,
      });

      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PSP_SUCCEEDED' },
      });

      await prisma.order.update({
        where: { id: intent.orderId },
        data: { status: 'CONFIRMED' },
      });

      await triggerFulfillmentSaga(intent, correlationId);
      await triggerAgentNotification(intent, 'PSP_SUCCEEDED', { paymentId: paymentEntity['id'] }, correlationId);
    } catch (err: any) {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'UNCERTAIN' },
      });
    }
  } else {
    await appendTransactionEvent({
      paymentIntentId: intent.id,
      orderId: intent.orderId,
      eventType: 'CAPTURE_SKIPPED',
      actor: 'system:gateway',
      payload: {
        reason: preCaptureResult.message,
        rule: preCaptureResult.rule,
      },
      correlationId,
    });

    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'CAPTURE_SKIPPED' },
    });

    const variantIds = await prisma.cartItem.findMany({
      where: { cart: { order: { id: intent.orderId } } },
      select: { variantId: true },
    });

    await releaseAllLocksForCheckout(
      variantIds.map(v => v.variantId).filter((v): v is string => v !== null),
      intent.order.cartId,
    );
  }
}

async function handlePaymentCaptured(
  intent: any,
  paymentEntity: Record<string, unknown>,
  correlationId: string,
  pspEventId?: string,
) {
  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'PSP_WEBHOOK_RECEIVED',
    actor: 'system:razorpay-webhook',
    payload: {
      event: 'payment.captured',
      paymentId: paymentEntity['id'],
      amount: paymentEntity['amount'],
    },
    correlationId,
    ...(pspEventId ? { pspEventId } : {}),
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: 'PSP_SUCCEEDED',
      pspPaymentId: paymentEntity['id'] as string,
    },
  });

  await prisma.order.update({
    where: { id: intent.orderId },
    data: { status: 'CONFIRMED' },
  });

  await triggerFulfillmentSaga(intent, correlationId);
  await triggerAgentNotification(intent, 'PSP_SUCCEEDED', { paymentId: paymentEntity['id'] }, correlationId);
}

async function handlePaymentFailed(
  intent: any,
  paymentEntity: Record<string, unknown>,
  correlationId: string,
  pspEventId?: string,
) {
  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'FAILED',
    actor: 'system:razorpay-webhook',
    payload: {
      event: 'payment.failed',
      paymentId: paymentEntity['id'],
      errorCode: paymentEntity['error_code'],
      errorDescription: paymentEntity['error_description'],
    },
    correlationId,
    ...(pspEventId ? { pspEventId } : {}),
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'PSP_FAILED' },
  });

  await prisma.order.update({
    where: { id: intent.orderId },
    data: { status: 'FAILED' },
  });

  await triggerAgentNotification(intent, 'PSP_FAILED', { error: paymentEntity['error_code'] }, correlationId);

  const variantIds = await prisma.cartItem.findMany({
    where: { cart: { order: { id: intent.orderId } } },
    select: { variantId: true },
  });

  await releaseAllLocksForCheckout(
    variantIds.map(v => v.variantId).filter((v): v is string => v !== null),
    intent.order.cartId,
  );
}

async function handleRefund(
  intent: any,
  paymentEntity: Record<string, unknown>,
  correlationId: string,
  pspEventId?: string,
) {
  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'REFUNDED',
    actor: 'system:razorpay-webhook',
    payload: { event: 'refund', paymentId: paymentEntity['id'] },
    correlationId,
    ...(pspEventId ? { pspEventId } : {}),
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'REFUNDED' },
  });

  await prisma.order.update({
    where: { id: intent.orderId },
    data: { status: 'REFUNDED' },
  });

  await triggerAgentNotification(intent, 'REFUNDED', { paymentId: paymentEntity['id'] }, correlationId);
}

async function triggerFulfillmentSaga(intent: any, correlationId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { id: intent.merchantId } });
  if (merchant?.fulfillmentWebhookUrl && merchant?.webhookSigningSecret) {
    const order = await prisma.order.findUnique({ where: { id: intent.orderId } });
    if (order) {
      await writeOutboxEntry({
        paymentIntentId: intent.id,
        actionType: 'NOTIFY_MERCHANT',
        correlationId,
        payload: {
          webhookUrl: merchant.fulfillmentWebhookUrl,
          signingSecret: merchant.webhookSigningSecret,
          orderData: order,
        },
      });
    }
  }
}

async function triggerAgentNotification(intent: any, eventType: string, payload: any, correlationId: string) {
  const order = await prisma.order.findUnique({ where: { id: intent.orderId } });
  if (order?.agentCallbackUrl) {
    await writeOutboxEntry({
      paymentIntentId: intent.id,
      actionType: 'NOTIFY_AGENT',
      correlationId,
      payload: {
        webhookUrl: order.agentCallbackUrl,
        transactionId: intent.id,
        status: eventType,
        reason: payload,
      },
    });
  }
}
