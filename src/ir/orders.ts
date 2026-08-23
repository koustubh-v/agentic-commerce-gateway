import { prisma } from '../db/client.js';
import { getCachedOrder, setCachedOrder, invalidateOrderCache } from '../cache/ir-cache.js';
import type { IROrder } from '../types/ir.js';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type OrderWithCart = Prisma.OrderGetPayload<{
  include: { cart: { include: { items: true } } };
}>;

function toIROrder(order: OrderWithCart): IROrder {
  return {
    id: order.id,
    merchantId: order.merchantId,
    cartId: order.cartId,
    ...(order.externalOrderId ? { externalOrderId: order.externalOrderId } : {}),
    status: order.status as IROrder['status'],
    fulfillmentStatus: order.fulfillmentStatus as IROrder['fulfillmentStatus'],
    subtotal: Number(order.subtotal),
    taxAmount: Number(order.taxAmount),
    discountAmount: Number(order.discountAmount),
    total: Number(order.total),
    currency: order.currency,
    ...(order.customerEmail ? { customerEmail: order.customerEmail } : {}),
    ...(order.customerName ? { customerName: order.customerName } : {}),
    ...(order.shippingAddress ? { shippingAddress: (order.shippingAddress as unknown as IROrder['shippingAddress']) } : {}),
    ...(order.trackingNumber ? { trackingNumber: order.trackingNumber } : {}),
    ...(order.trackingUrl ? { trackingUrl: order.trackingUrl } : {}),
    ...(order.estimatedDelivery ? { estimatedDelivery: order.estimatedDelivery.toISOString() } : {}),
    ...(order.agentSessionId ? { agentSessionId: order.agentSessionId } : {}),
    ...(order.notes ? { notes: order.notes } : {}),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// IR Orders Service
// ---------------------------------------------------------------------------

/**
 * Get an order by ID — Redis first, Postgres fallback.
 */
export async function getOrder(orderId: string): Promise<IROrder | null> {
  const cached = await getCachedOrder(orderId);
  if (cached) return cached;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { cart: { include: { items: true } } },
  });

  if (!order) return null;

  const irOrder = toIROrder(order);
  await setCachedOrder(orderId, irOrder);
  return irOrder;
}

/**
 * Get an order by external merchant order ID.
 */
export async function getOrderByExternalId(
  merchantId: string,
  externalOrderId: string,
): Promise<IROrder | null> {
  const order = await prisma.order.findFirst({
    where: { merchantId, externalOrderId },
    include: { cart: { include: { items: true } } },
  });

  if (!order) return null;
  return toIROrder(order);
}

/**
 * List orders for a merchant with optional status filter.
 */
export async function listOrders(
  merchantId: string,
  filters: { status?: IROrder['status']; agentSessionId?: string; limit?: number; offset?: number } = {},
): Promise<IROrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      merchantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.agentSessionId ? { agentSessionId: filters.agentSessionId } : {}),
    },
    include: { cart: { include: { items: true } } },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 20,
    skip: filters.offset ?? 0,
  });

  return orders.map(toIROrder);
}

/**
 * Create an order from a checked-out cart.
 * This is called after the payment gate approves and before PSP initiation.
 */
export async function createOrderFromCart(
  cartId: string,
  merchantId: string,
  agentSessionId?: string,
  agentCallbackUrl?: string,
  customerInfo?: { email?: string; name?: string; shippingAddress?: IROrder['shippingAddress'] },
): Promise<IROrder> {
  const order = await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUniqueOrThrow({
      where: { id: cartId, merchantId },
      include: { items: true },
    });

    if (cart.status !== 'ACTIVE') {
      throw new Error(`Cart ${cartId} is not active (status: ${cart.status}). Cannot create order.`);
    }

    const created = await tx.order.create({
      data: {
        merchantId,
        cartId,
        subtotal: cart.subtotal,
        taxAmount: cart.taxAmount,
        discountAmount: cart.discountAmount,
        total: cart.total,
        currency: cart.currency,
        agentSessionId: agentSessionId ?? null,
        agentCallbackUrl: agentCallbackUrl ?? null,
        customerEmail: customerInfo?.email ?? null,
        customerName: customerInfo?.name ?? null,
        shippingAddress: customerInfo?.shippingAddress
          ? (customerInfo.shippingAddress as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
      include: { cart: { include: { items: true } } },
    });

    // Mark the cart as checked out
    await tx.cart.update({
      where: { id: cartId },
      data: { status: 'CHECKED_OUT' },
    });

    return created;
  });

  const irOrder = toIROrder(order);
  await setCachedOrder(order.id, irOrder);
  return irOrder;
}

/**
 * Update order status — called by webhook handlers and reconciler.
 * Every status change also triggers cache invalidation.
 */
export async function updateOrderStatus(
  orderId: string,
  status: IROrder['status'],
  updates?: {
    fulfillmentStatus?: IROrder['fulfillmentStatus'];
    externalOrderId?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDelivery?: Date;
    internalNotes?: string;
  },
): Promise<IROrder> {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(updates?.fulfillmentStatus ? { fulfillmentStatus: updates.fulfillmentStatus } : {}),
      ...(updates?.externalOrderId !== undefined ? { externalOrderId: updates.externalOrderId } : {}),
      ...(updates?.trackingNumber !== undefined ? { trackingNumber: updates.trackingNumber } : {}),
      ...(updates?.trackingUrl !== undefined ? { trackingUrl: updates.trackingUrl } : {}),
      ...(updates?.estimatedDelivery !== undefined ? { estimatedDelivery: updates.estimatedDelivery } : {}),
      ...(updates?.internalNotes !== undefined ? { internalNotes: updates.internalNotes } : {}),
    },
    include: { cart: { include: { items: true } } },
  });

  const irOrder = toIROrder(order);
  await invalidateOrderCache(orderId);
  await setCachedOrder(orderId, irOrder);
  return irOrder;
}

/**
 * Get the full event log for an order (for agent status polling).
 */
export async function getOrderEventLog(orderId: string) {
  return prisma.transactionEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      eventType: true,
      actor: true,
      payload: true,
      correlationId: true,
      createdAt: true,
    },
  });
}
