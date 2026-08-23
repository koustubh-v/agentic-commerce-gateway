import { prisma } from '../db/client.js';
import { appendTransactionEvent } from './event-log.js';
import { updateOrderStatus } from '../ir/orders.js';
import { env } from '../config/env.js';
import { fetchRazorpayOrderStatus } from './razorpay.js';

// ---------------------------------------------------------------------------
// Reconciler — polls for UNCERTAIN transactions and resolves them
//
// Called when Razorpay's HTTP response timed out but money may have moved.
// State = UNCERTAIN means "do not retry the charge — reconcile first."
// Cron interval: env.RECONCILER_POLL_INTERVAL_MS
// ---------------------------------------------------------------------------

/**
 * Reconcile all UNCERTAIN payment intents that have been pending
 * longer than RECONCILER_THRESHOLD_SECONDS.
 *
 * Phase 1: Logs that reconciliation would happen.
 * Payment Phase: Calls Razorpay GET /orders/{id} and updates status.
 */
export async function reconcileUncertainTransactions(): Promise<void> {
  const threshold = new Date(Date.now() - env.RECONCILER_THRESHOLD_SECONDS * 1000);

  const uncertainIntents = await prisma.paymentIntent.findMany({
    where: {
      status: 'UNCERTAIN',
      updatedAt: { lte: threshold },
    },
    include: { order: true },
    take: 50,
  });

  if (uncertainIntents.length === 0) return;

  console.info(`[Reconciler] Found ${uncertainIntents.length} UNCERTAIN transactions to reconcile.`);

  for (const intent of uncertainIntents) {
    const correlationId = `reconciler:${intent.id}:${Date.now()}`;

    try {
      // Payment Phase: Call Razorpay GET /orders/{pspOrderId}
      const razorpayStatus = await fetchRazorpayOrderStatus(intent.pspOrderId!);
      
      let newIntentStatus = intent.status;
      let newEvent: 'RECONCILED' | 'FAILED' = 'RECONCILED';
      
      if (razorpayStatus) {
        if (razorpayStatus.status === 'captured') {
          newIntentStatus = 'PSP_SUCCEEDED';
          newEvent = 'RECONCILED';
        } else if (razorpayStatus.status === 'failed') {
          newIntentStatus = 'PSP_FAILED';
          newEvent = 'FAILED';
        } else {
          // If it's created or authorized but not captured, we'll mark as failed to let agent retry, 
          // or we can leave it UNCERTAIN. In most merchant integrations, uncaptured after timeout = failed.
          newIntentStatus = 'PSP_FAILED';
          newEvent = 'FAILED';
        }
      } else {
        // Not found on Razorpay end, means it failed to even create
        newIntentStatus = 'PSP_FAILED';
        newEvent = 'FAILED';
      }

      await prisma.$transaction(async (tx) => {
        // Update intent
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: newIntentStatus },
        });

        // Append event
        await appendTransactionEvent({
          paymentIntentId: intent.id,
          orderId: intent.orderId,
          eventType: newEvent,
          actor: 'system:reconciler',
          payload: {
            message: `Reconciliation resolved to ${newIntentStatus}`,
            pspOrderId: intent.pspOrderId,
            razorpayStatus: razorpayStatus?.status,
            thresholdSeconds: env.RECONCILER_THRESHOLD_SECONDS,
          },
          correlationId,
        });

        // If succeeded, update order status to PROCESSING (or PAID)
        if (newIntentStatus === 'PSP_SUCCEEDED') {
          await tx.order.update({
            where: { id: intent.orderId },
            data: { status: 'PROCESSING' },
          });
        }
      });

      console.info(
        `[Reconciler] Resolved intent ${intent.id} to ${newIntentStatus} (pspOrderId: ${intent.pspOrderId}).`,
      );
    } catch (err) {
      console.error(`[Reconciler] Failed to reconcile intent ${intent.id}:`, err);
    }
  }
}

/**
 * Start the reconciler as a recurring setInterval.
 * Returns a cleanup function.
 */
export function startReconciler(): () => void {
  const interval = setInterval(() => {
    reconcileUncertainTransactions().catch((err) => {
      console.error('[Reconciler] Unexpected error:', err);
    });
  }, env.RECONCILER_POLL_INTERVAL_MS);

  console.info(`[Reconciler] Started — polling every ${env.RECONCILER_POLL_INTERVAL_MS}ms`);

  return () => clearInterval(interval);
}
