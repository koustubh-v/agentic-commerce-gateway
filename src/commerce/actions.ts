import { prisma } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';
import { runGate, type GateContext } from '../payments/gate.js';
import { appendTransactionEvent } from '../payments/event-log.js';
import { createRazorpayOrder } from '../payments/razorpay.js';
import { computeStateHash, issueMandate, validateAndConsumeMandate, recomputeAndValidateHash } from './state-hash.js';
import { acquireInventoryLock, releaseAllLocksForCheckout } from './inventory-lock.js';
import { GateRejectionError, CartStateError, InventoryLockError, mapRazorpayError } from './errors.js';
import { invalidateCartCache, setCachedCart, setCachedOrder } from '../cache/ir-cache.js';
import { reserveStock } from '../ir/inventory.js';
import type { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { writeOutboxEntry } from '../sync/outbox/writer.js';

export interface CartSnapshot {
  id: string;
  merchantId: string;
  status: string;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    productTitle: string;
    variantTitle: string | null;
  }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  version: number;
  stateHash: string;
}

export interface CheckoutResult {
  checkoutToken: string;
  razorpayOrderId: string | null;
  amount: number;
  currency: string;
  keyId: string;
  orderId: string;
  gateDecision: string;
  gateMessage: string;
}

export interface TransactionStatusResult {
  transactionId: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  gateDecision: string | null;
  gateMessage: string | null;
  auditTrail: Array<{
    eventType: string;
    actor: string;
    payload: unknown;
    createdAt: Date;
  }>;
}

export async function commerceCreateCart(
  merchantId: string,
  agentSessionId: string,
): Promise<CartSnapshot> {
  const cartId = uuidv4();

  const cart = await prisma.$transaction(async (tx) => {
    await tx.cart.create({
      data: {
        id: cartId,
        merchantId,
        agentSessionId,
        currency: 'INR',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return tx.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: { items: true },
    });
  });

  const stateHash = computeStateHash(cartId, [], Number(cart.total), cart.currency);
  await issueMandate(cartId, stateHash);

  return {
    id: cart.id,
    merchantId: cart.merchantId,
    status: cart.status,
    items: [],
    subtotal: Number(cart.subtotal),
    taxAmount: Number(cart.taxAmount),
    total: Number(cart.total),
    currency: cart.currency,
    version: cart.version,
    stateHash,
  };
}

export async function commerceAddItem(
  cartId: string,
  productId: string,
  variantId: string | undefined,
  quantity: number,
): Promise<CartSnapshot> {
  const cart = await prisma.$transaction(async (tx) => {
    const existing = await tx.cart.findUniqueOrThrow({
      where: { id: cartId },
    });

    if (existing.status !== 'ACTIVE') {
      throw new CartStateError(`Cart ${cartId} is ${existing.status}, cannot add items.`);
    }

    const product = await tx.product.findFirstOrThrow({
      where: { id: productId, merchantId: existing.merchantId, status: 'ACTIVE' },
      include: { variants: true },
    });

    const variant = variantId
      ? product.variants.find(v => v.id === variantId) ?? null
      : null;

    const unitPrice = variant?.price ? Number(variant.price) : Number(product.price);
    const lineTotal = unitPrice * quantity;

    const existingItem = await tx.cartItem.findFirst({
      where: { cartId, productId, variantId: variantId ?? null },
    });

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      await tx.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQty,
          lineTotal: unitPrice * newQty,
        },
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId,
          productId,
          variantId: variantId ?? null,
          quantity,
          unitPrice,
          lineTotal,
          productTitle: product.title,
          variantTitle: variant?.title ?? null,
        },
      });
    }

    if (variantId) {
      await reserveStock(variantId, quantity);
    }

    const items = await tx.cartItem.findMany({ where: { cartId } });
    const subtotal = items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
    const total = subtotal;

    await tx.cart.update({
      where: { id: cartId },
      data: { subtotal, total, version: { increment: 1 } },
    });

    return tx.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: { items: true },
    });
  });

  const stateHash = computeStateHash(
    cart.id,
    cart.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
    })),
    Number(cart.total),
    cart.currency,
  );
  await issueMandate(cart.id, stateHash);
  await invalidateCartCache(cartId);

  return {
    id: cart.id,
    merchantId: cart.merchantId,
    status: cart.status,
    items: cart.items.map(i => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      productTitle: i.productTitle,
      variantTitle: i.variantTitle,
    })),
    subtotal: Number(cart.subtotal),
    taxAmount: Number(cart.taxAmount),
    total: Number(cart.total),
    currency: cart.currency,
    version: cart.version,
    stateHash,
  };
}

export async function commerceInitiateCheckout(
  cartId: string,
  stateHash: string,
  idempotencyKey: string,
  agentSessionId: string,
): Promise<CheckoutResult> {
  const mandateResult = await validateAndConsumeMandate(cartId, stateHash);
  if (!mandateResult.valid) {
    throw new CartStateError(mandateResult.reason!);
  }

  const hashResult = await recomputeAndValidateHash(cartId, stateHash);
  if (!hashResult.valid) {
    throw new CartStateError(hashResult.reason!);
  }

  const cart = await prisma.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: { items: true },
  });

  if (cart.status !== 'ACTIVE') {
    throw new CartStateError(`Cart ${cartId} is ${cart.status}, cannot checkout.`);
  }

  const variantIds = cart.items
    .map(i => i.variantId)
    .filter((v): v is string => v !== null);

  for (const vid of variantIds) {
    const lock = await acquireInventoryLock(vid, cartId);
    if (!lock.acquired) {
      await releaseAllLocksForCheckout(variantIds, cartId);
      throw new InventoryLockError(vid, 'Item reserved by another checkout. Please try again shortly.');
    }
  }

  const gateCtx: GateContext = {
    merchantId: cart.merchantId,
    agentSessionId,
    amount: Number(cart.total),
    currency: cart.currency,
    cartTotal: Number(cart.total),
    productIds: cart.items.map(i => i.productId),
    correlationId: idempotencyKey,
  };

  const gateResult = await runGate(gateCtx);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        merchantId: cart.merchantId,
        cartId: cart.id,
        subtotal: cart.subtotal,
        taxAmount: cart.taxAmount,
        discountAmount: cart.discountAmount,
        total: cart.total,
        currency: cart.currency,
        agentSessionId,
      },
    });

    await tx.cart.update({
      where: { id: cartId },
      data: { status: 'CHECKED_OUT' },
    });

    return created;
  });

  const intent = await prisma.paymentIntent.create({
    data: {
      merchantId: cart.merchantId,
      orderId: order.id,
      idempotencyKey,
      amount: cart.total,
      currency: cart.currency,
      status: 'INTENT_CREATED',
      gateDecision: gateResult.decision as any,
      gateRule: gateResult.rule,
      gateMessage: gateResult.message,
    },
  });

  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: order.id,
    eventType: 'GATE_DECISION',
    actor: `agent:${agentSessionId}`,
    payload: {
      decision: gateResult.decision,
      rule: gateResult.rule,
      message: gateResult.message,
      amount: Number(cart.total),
      currency: cart.currency,
      cartStateHash: stateHash,
    },
    correlationId: idempotencyKey,
  });

  if (gateResult.decision !== 'APPROVED') {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'GATE_REJECTED' },
    });

    await releaseAllLocksForCheckout(variantIds, cartId);

    throw new GateRejectionError(gateResult.rule, gateResult.decision, gateResult.message);
  }

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'GATE_APPROVED' },
  });

  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: cart.merchantId },
    select: { razorpayKeyId: true, razorpayKeySecretEncrypted: true },
  });

  const checkoutToken = crypto.randomBytes(32).toString('hex');

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: 'OUTBOX_WRITTEN',
      checkoutToken,
      checkoutTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: order.id,
    eventType: 'OUTBOX_WRITTEN',
    actor: 'system:gateway',
    payload: {
      amount: Math.round(Number(cart.total) * 100),
      currency: cart.currency,
      cartStateHash: stateHash,
    },
    correlationId: idempotencyKey,
  });

  // Write intent to call Razorpay to outbox
  await writeOutboxEntry({
    paymentIntentId: intent.id,
    actionType: 'CREATE_RAZORPAY_ORDER',
    correlationId: idempotencyKey,
    payload: {
      amount: Math.round(Number(cart.total) * 100),
      currency: cart.currency,
      receipt: order.id,
      notes: {
        agent_justification: gateResult.message.substring(0, 256),
        agent_identity: agentSessionId,
        cart_state_hash: stateHash,
        idempotency_key: idempotencyKey,
        gateway_order_id: order.id,
      },
    },
  });

  return {
    checkoutToken,
    razorpayOrderId: null, // Will be populated by outbox worker
    amount: Math.round(Number(cart.total) * 100),
    currency: cart.currency,
    keyId: merchant.razorpayKeyId ?? '',
    orderId: order.id,
    gateDecision: gateResult.decision,
    gateMessage: gateResult.message,
  };
}

export async function commerceGetTransactionStatus(
  transactionId: string,
): Promise<TransactionStatusResult> {
  const intent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: transactionId },
    include: {
      transactionEvents: {
        orderBy: { createdAt: 'asc' },
        select: {
          eventType: true,
          actor: true,
          payload: true,
          createdAt: true,
        },
      },
    },
  });

  return {
    transactionId: intent.id,
    orderId: intent.orderId,
    status: intent.status,
    amount: Number(intent.amount),
    currency: intent.currency,
    gateDecision: intent.gateDecision,
    gateMessage: intent.gateMessage ?? null,
    auditTrail: intent.transactionEvents.map(e => ({
      eventType: e.eventType,
      actor: e.actor,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
  };
}

export async function commerceGetOrderByCheckoutToken(
  checkoutToken: string,
): Promise<{ orderId: string; paymentIntentId: string; status: string } | null> {
  const intent = await prisma.paymentIntent.findFirst({
    where: { checkoutToken },
  });

  if (!intent) return null;

  return {
    orderId: intent.orderId,
    paymentIntentId: intent.id,
    status: intent.status,
  };
}

export async function commerceCancelCheckout(orderId: string): Promise<void> {
  const intent = await prisma.paymentIntent.findFirst({
    where: { orderId },
    include: { order: true }
  });

  if (!intent) return;

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'CANCELLED' }
  });

  await appendTransactionEvent({
    paymentIntentId: intent.id,
    orderId: intent.orderId,
    eventType: 'CANCELLED',
    actor: 'agent',
    payload: { reason: 'Agent cancelled checkout session' },
    correlationId: `cancel-${Date.now()}`
  });

  const variantIds = await prisma.cartItem.findMany({
    where: { cartId: intent.order.cartId },
    select: { variantId: true }
  });

  await releaseAllLocksForCheckout(
    variantIds.map(v => v.variantId).filter((v): v is string => v !== null),
    intent.order.cartId
  );
}

export async function commerceUpdateCart(
  orderId: string,
  items: Array<{ productId: string; variantId?: string; quantity: number }>
): Promise<CartSnapshot> {
  // For the ACP patch route. Modifying a cart after intent creation invalidates the intent.
  // We cancel the old intent and create a new checkout session.
  await commerceCancelCheckout(orderId);
  
  const oldOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  
  // Clear old cart items and add new ones
  await prisma.cartItem.deleteMany({ where: { cartId: oldOrder.cartId } });
  
  for (const item of items) {
    await commerceAddItem(oldOrder.cartId, item.productId, item.variantId, item.quantity);
  }
  
  const cart = await prisma.cart.findUniqueOrThrow({
    where: { id: oldOrder.cartId },
    include: { items: true }
  });
  
  const stateHash = computeStateHash(
    cart.id,
    cart.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
    })),
    Number(cart.total),
    cart.currency,
  );
  
  return {
    id: cart.id,
    merchantId: cart.merchantId,
    status: cart.status,
    items: cart.items.map(i => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      productTitle: i.productTitle,
      variantTitle: i.variantTitle,
    })),
    subtotal: Number(cart.subtotal),
    taxAmount: Number(cart.taxAmount),
    total: Number(cart.total),
    currency: cart.currency,
    version: cart.version,
    stateHash,
  };
}
