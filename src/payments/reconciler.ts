import { prisma } from '../db/client.js';
import { fetchRazorpayOrderStatus } from './razorpay.js';
import { handlePaymentAuthorized } from '../webhooks/razorpay.js';
import { appendTransactionEvent } from './event-log.js';
import { releaseAllLocksForCheckout } from '../commerce/inventory-lock.js';
import { env } from '../config/env.js';

export function startReconciler(): () => void {
  const interval = setInterval(async () => {
    try {
      const { processed, errors } = await runReconciliation();
      if (processed > 0 || errors > 0) {
        console.info(`[Reconciler] Processed ${processed} stuck intents. Errors: ${errors}`);
      }
    } catch (err) {
      console.error(`[Reconciler] Fatal error during run:`, err);
    }
  }, env.RECONCILER_POLL_INTERVAL_MS);

  return () => clearInterval(interval);
}

export async function runReconciliation(): Promise<{ processed: number; errors: number }> {
  const threshold = new Date(Date.now() - env.RECONCILER_THRESHOLD_SECONDS * 1000);

  const stuckIntents = await prisma.paymentIntent.findMany({
    where: {
      status: { in: ['PSP_INITIATED', 'UNCERTAIN', 'PSP_AUTHORIZED'] },
      createdAt: { lt: threshold },
    },
    include: { order: { include: { cart: { include: { items: true } } } } },
  });

  let processed = 0;
  let errors = 0;

  for (const intent of stuckIntents) {
    try {
      if (!intent.pspOrderId) {
        await prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'FAILED' },
        });
        processed++;
        continue;
      }

      const razorpayStatus = await fetchRazorpayOrderStatus(intent.pspOrderId);
      const correlationId = `reconciler:${intent.id}`;

      if (!razorpayStatus) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        if (intent.createdAt < fifteenMinutesAgo) {
          await handleNoPaymentFound(intent, correlationId);
        }
        processed++;
        continue;
      }

      switch (razorpayStatus.status) {
        case 'captured':
          await handleCapturedReconciliation(intent, razorpayStatus, correlationId);
          break;

        case 'authorized':
          await handleAuthorizedReconciliation(intent, razorpayStatus, correlationId);
          break;

        case 'failed':
          await handleFailedReconciliation(intent, razorpayStatus, correlationId);
          break;

        case 'created':
          const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
          if (intent.createdAt < fifteenMinsAgo) {
            await handleFailedReconciliation(intent, razorpayStatus, correlationId);
          }
          break;

        default:
          await handleFailedReconciliation(intent, razorpayStatus, correlationId);
          break;
      }

      processed++;
    } catch (err) {
      errors++;
    }
  }

  return { processed, errors };
}

async function handleNoPaymentFound(intent: any, correlationId: string) {
  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'RECONCILED',
    actor: 'system:reconciler',
    payload: { outcome: 'no_payment_found', originalStatus: intent.status },
    correlationId,
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'PSP_FAILED' },
  });

  await prisma.order.update({
    where: { id: intent.orderId },
    data: { status: 'FAILED' },
  });

  await releaseLocksForIntent(intent);
}

async function handleCapturedReconciliation(intent: any, payment: any, correlationId: string) {
  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'RECONCILED',
    actor: 'system:reconciler',
    payload: { outcome: 'captured', paymentId: payment.id, amount: payment.amount },
    correlationId,
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'PSP_SUCCEEDED', pspPaymentId: payment.id },
  });

  await prisma.order.update({
    where: { id: intent.orderId },
    data: { status: 'CONFIRMED' },
  });
}

async function handleAuthorizedReconciliation(intent: any, payment: any, correlationId: string) {
  try {
    // Replay through the same path as the webhook
    await handlePaymentAuthorized(
      intent,
      {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
        notes: payment.notes,
      },
      correlationId,
      correlationId
    );
  } catch {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'UNCERTAIN' },
    });
  }
}

async function handleFailedReconciliation(intent: any, payment: any, correlationId: string) {
  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'RECONCILED',
    actor: 'system:reconciler',
    payload: { outcome: 'failed', paymentId: payment.id, status: payment.status },
    correlationId,
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'PSP_FAILED', pspPaymentId: payment.id },
  });

  await prisma.order.update({
    where: { id: intent.orderId },
    data: { status: 'FAILED' },
  });

  await releaseLocksForIntent(intent);
}

async function releaseLocksForIntent(intent: any) {
  if (intent.order?.cart?.items) {
    const variantIds = intent.order.cart.items
      .map((i: any) => i.variantId)
      .filter((v: string | null): v is string => v !== null);

    if (variantIds.length > 0) {
      await releaseAllLocksForCheckout(variantIds, intent.order.cartId);
    }
  }
}
