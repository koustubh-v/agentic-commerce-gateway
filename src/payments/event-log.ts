import { prisma } from '../db/client.js';
import type { EventType, Prisma } from '@prisma/client';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Append-only Transaction Event Log
//
// DESIGN: Every state change is INSERT only, never UPDATE.
// Current status = latest event. Full history = ordered event list.
// Optional tamper-evidence hash chain (prev_hash).
// ---------------------------------------------------------------------------

export interface AppendEventData {
  paymentIntentId: string;
  orderId: string;
  eventType: EventType;
  actor: string;
  payload: Record<string, unknown>;
  correlationId: string;
  pspEventId?: string; // For dedup — unique constraint prevents double-processing
}

/**
 * Append a single event to the transaction log.
 * Computes prev_hash for tamper evidence.
 * Idempotent on pspEventId — duplicate webhook calls are silently ignored.
 */
export async function appendTransactionEvent(data: AppendEventData): Promise<string> {
  // Get the previous event for hash chaining
  const prevEvent = await prisma.transactionEvent.findFirst({
    where: { paymentIntentId: data.paymentIntentId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, payload: true },
  });

  let prevHash: string | undefined;
  if (prevEvent) {
    const chainInput = `${prevEvent.id}${JSON.stringify(prevEvent.payload)}`;
    prevHash = crypto.createHash('sha256').update(chainInput).digest('hex');
  }

  try {
    const event = await prisma.transactionEvent.create({
      data: {
        paymentIntentId: data.paymentIntentId,
        orderId: data.orderId,
        eventType: data.eventType,
        actor: data.actor,
        payload: data.payload as Prisma.InputJsonValue,
        correlationId: data.correlationId,
        ...(data.pspEventId ? { pspEventId: data.pspEventId } : {}),
        ...(prevHash ? { prevHash } : {}),
      },
    });

    return event.id;
  } catch (err: unknown) {
    // Unique constraint on pspEventId — silently ignore duplicates
    if (
      err instanceof Error &&
      err.message.includes('Unique constraint') &&
      data.pspEventId
    ) {
      console.info(`[EventLog] Duplicate pspEventId ${data.pspEventId} — idempotent, skipping.`);
      const existing = await prisma.transactionEvent.findUnique({
        where: { pspEventId: data.pspEventId },
      });
      return existing?.id ?? '';
    }
    throw err;
  }
}

/**
 * Get the full event log for a payment intent (ordered chronologically).
 */
export async function getEventLog(paymentIntentId: string) {
  return prisma.transactionEvent.findMany({
    where: { paymentIntentId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      eventType: true,
      actor: true,
      payload: true,
      correlationId: true,
      pspEventId: true,
      prevHash: true,
      createdAt: true,
    },
  });
}

/**
 * Get the current effective status of a payment intent
 * by reading the latest event (fold pattern).
 */
export async function getCurrentTransactionStatus(paymentIntentId: string): Promise<string | null> {
  const latest = await prisma.transactionEvent.findFirst({
    where: { paymentIntentId },
    orderBy: { createdAt: 'desc' },
    select: { eventType: true },
  });

  return latest?.eventType ?? null;
}

/**
 * Verify the hash chain integrity of a payment intent's event log.
 * Returns true if the chain is intact, false if tampered.
 */
export async function verifyEventChain(paymentIntentId: string): Promise<{
  valid: boolean;
  brokenAt?: string;
}> {
  const events = await prisma.transactionEvent.findMany({
    where: { paymentIntentId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, payload: true, prevHash: true },
  });

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    if (!curr || !prev) continue;

    if (curr.prevHash) {
      const expected = crypto
        .createHash('sha256')
        .update(`${prev.id}${JSON.stringify(prev.payload)}`)
        .digest('hex');

      if (curr.prevHash !== expected) {
        return { valid: false, brokenAt: curr.id };
      }
    }
  }

  return { valid: true };
}
