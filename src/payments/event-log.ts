import { prisma } from '../db/client.js';
import type { EventType, Prisma } from '@prisma/client';
import crypto from 'crypto';

export interface AppendEventData {
  paymentIntentId: string;
  orderId: string;
  eventType: EventType;
  actor: string;
  payload: Record<string, unknown>;
  correlationId: string;
  pspEventId?: string;
  cartStateHash?: string;
}

export async function appendTransactionEvent(data: AppendEventData): Promise<string> {
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
        ...(data.cartStateHash ? { cartStateHash: data.cartStateHash } : {}),
      },
    });
    return event.id;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Unique constraint') && data.pspEventId) {
      const existing = await prisma.transactionEvent.findUnique({
        where: { pspEventId: data.pspEventId },
      });
      return existing?.id ?? '';
    }
    throw err;
  }
}

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
      cartStateHash: true,
      createdAt: true,
    },
  });
}

export async function getCurrentTransactionStatus(paymentIntentId: string): Promise<string | null> {
  const latest = await prisma.transactionEvent.findFirst({
    where: { paymentIntentId },
    orderBy: { createdAt: 'desc' },
    select: { eventType: true },
  });
  return latest?.eventType ?? null;
}

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
