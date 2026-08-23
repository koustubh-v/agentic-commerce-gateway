import { prisma } from '../db/client.js';
import { getCachedCart, setCachedCart, invalidateCartCache } from '../cache/ir-cache.js';
import { reserveStock, releaseReservedStock } from './inventory.js';
import type { IRCart, IRCartItem, CartMutationPayload, CartUpdatePayload } from '../types/ir.js';
import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type CartWithRelations = Prisma.CartGetPayload<{
  include: {
    items: {
      include: { product: true; variant: true };
    };
  };
}>;

function toIRCartItem(item: CartWithRelations['items'][number]): IRCartItem {
  return {
    id: item.id,
    productId: item.productId,
    variantId: item.variantId ?? undefined,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal),
    productTitle: item.productTitle,
    variantTitle: item.variantTitle ?? undefined,
  };
}

function toIRCart(cart: CartWithRelations): IRCart {
  return {
    id: cart.id,
    merchantId: cart.merchantId,
    agentSessionId: cart.agentSessionId ?? undefined,
    status: cart.status as IRCart['status'],
    items: cart.items.map(toIRCartItem),
    subtotal: Number(cart.subtotal),
    taxAmount: Number(cart.taxAmount),
    discountAmount: Number(cart.discountAmount),
    total: Number(cart.total),
    currency: cart.currency,
    coupons: Array.isArray(cart.coupons) ? (cart.coupons as unknown[]) : [],
    version: cart.version,
    expiresAt: cart.expiresAt?.toISOString(),
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Totals computation — always server-side, never trust client numbers
// ---------------------------------------------------------------------------

async function recomputeTotals(
  cartId: string,
  tx: Prisma.TransactionClient,
): Promise<{ subtotal: number; tax: number; total: number }> {
  const items = await tx.cartItem.findMany({ where: { cartId } });
  const subtotal = items.reduce((sum, i) => sum + Number(i.lineTotal), 0);

  // Tax placeholder — merchant tax mode will be applied in a follow-on phase
  const tax = 0;
  const total = subtotal + tax;

  await tx.cart.update({
    where: { id: cartId },
    data: { subtotal, taxAmount: tax, total, version: { increment: 1 } },
  });

  return { subtotal, tax, total };
}

// ---------------------------------------------------------------------------
// IR Cart Service
// ---------------------------------------------------------------------------

/**
 * Get a cart by ID — Redis first, Postgres fallback.
 */
export async function getCart(cartId: string): Promise<IRCart | null> {
  const cached = await getCachedCart(cartId);
  if (cached) return cached;

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: { items: { include: { product: true, variant: true } } },
  });

  if (!cart) return null;

  const irCart = toIRCart(cart);
  await setCachedCart(cartId, irCart);
  return irCart;
}

/**
 * Create a new cart for a merchant/agent session.
 */
export async function createCart(
  merchantId: string,
  payload: CartMutationPayload,
): Promise<IRCart> {
  const cartId = uuidv4();

  const cart = await prisma.$transaction(async (tx) => {
    // Create the cart
    await tx.cart.create({
      data: {
        id: cartId,
        merchantId,
        agentSessionId: payload.agentSessionId ?? null,
        currency: 'INR', // Will be set from merchant config
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min TTL
      },
    });

    // Add items
    for (const item of payload.items) {
      const product = await tx.product.findFirstOrThrow({
        where: { id: item.productId, merchantId, status: 'ACTIVE' },
        include: { variants: true },
      });

      const variant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId) ?? null
        : null;

      const unitPrice = variant?.price ? Number(variant.price) : Number(product.price);
      const lineTotal = unitPrice * item.quantity;

      await tx.cartItem.create({
        data: {
          cartId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
          unitPrice,
          lineTotal,
          productTitle: product.title,
          variantTitle: variant?.title ?? null,
        },
      });

      // Reserve stock if variant has inventory
      if (item.variantId) {
        await reserveStock(item.variantId, item.quantity);
      }
    }

    await recomputeTotals(cartId, tx);

    return tx.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: { items: { include: { product: true, variant: true } } },
    });
  });

  const irCart = toIRCart(cart);
  await setCachedCart(cartId, irCart);
  return irCart;
}

/**
 * Update a cart — optimistic concurrency via version check.
 * If the version doesn't match, throws a ConflictError.
 * The caller must reload the cart and re-apply their changes.
 */
export async function updateCart(
  cartId: string,
  merchantId: string,
  payload: CartUpdatePayload,
): Promise<IRCart> {
  const cart = await prisma.$transaction(async (tx) => {
    // Optimistic concurrency check
    const existing = await tx.cart.findUniqueOrThrow({ where: { id: cartId } });

    if (existing.version !== payload.version) {
      throw new CartConflictError(
        `Cart was modified by another request. Expected version ${payload.version}, got ${existing.version}. Please reload and retry.`,
        existing.version,
      );
    }

    if (existing.merchantId !== merchantId) {
      throw new Error('Cart does not belong to this merchant.');
    }

    // Release all existing stock reservations
    const existingItems = await tx.cartItem.findMany({ where: { cartId } });
    for (const item of existingItems) {
      if (item.variantId) {
        await releaseReservedStock(item.variantId, item.quantity);
      }
    }

    // Remove old items
    await tx.cartItem.deleteMany({ where: { cartId } });

    // Add new items
    for (const item of payload.items) {
      const product = await tx.product.findFirstOrThrow({
        where: { id: item.productId, merchantId, status: 'ACTIVE' },
        include: { variants: true },
      });

      const variant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId) ?? null
        : null;

      const unitPrice = variant?.price ? Number(variant.price) : Number(product.price);
      const lineTotal = unitPrice * item.quantity;

      await tx.cartItem.create({
        data: {
          cartId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
          unitPrice,
          lineTotal,
          productTitle: product.title,
          variantTitle: variant?.title ?? null,
        },
      });

      if (item.variantId) {
        await reserveStock(item.variantId, item.quantity);
      }
    }

    await recomputeTotals(cartId, tx);

    return tx.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: { items: { include: { product: true, variant: true } } },
    });
  });

  const irCart = toIRCart(cart);
  await setCachedCart(cartId, irCart);
  return irCart;
}

/**
 * Expire / abandon a cart and release all stock holds.
 */
export async function expireCart(cartId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const items = await tx.cartItem.findMany({ where: { cartId } });
    for (const item of items) {
      if (item.variantId) {
        await releaseReservedStock(item.variantId, item.quantity);
      }
    }

    await tx.cart.update({
      where: { id: cartId },
      data: { status: 'ABANDONED' },
    });
  });

  await invalidateCartCache(cartId);
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class CartConflictError extends Error {
  constructor(message: string, public readonly currentVersion: number) {
    super(message);
    this.name = 'CartConflictError';
  }
}
