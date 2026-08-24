import crypto from 'crypto';
import { prisma } from '../db/client.js';

const MANDATE_TTL_MS = 5 * 60 * 1000;

export function computeStateHash(
  cartId: string,
  items: Array<{ productId: string; variantId?: string | null; quantity: number; unitPrice: number }>,
  total: number,
  currency: string,
): string {
  const sortedItems = [...items]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map(i => `${i.productId}:${i.variantId ?? 'none'}:${i.quantity}:${i.unitPrice}`)
    .join('|');

  const input = `${cartId}|${sortedItems}|${total}|${currency}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function issueMandate(cartId: string, stateHash: string): Promise<string> {
  const mandate = await prisma.cartMandate.create({
    data: {
      cartId,
      stateHash,
      expiresAt: new Date(Date.now() + MANDATE_TTL_MS),
    },
  });
  return mandate.stateHash;
}

export async function validateAndConsumeMandate(
  cartId: string,
  stateHash: string,
): Promise<{ valid: boolean; reason?: string }> {
  const mandate = await prisma.cartMandate.findFirst({
    where: { cartId, stateHash, consumed: false },
    orderBy: { issuedAt: 'desc' },
  });

  if (!mandate) {
    return { valid: false, reason: 'No matching cart mandate found. Cart state may have changed.' };
  }

  if (mandate.expiresAt < new Date()) {
    return { valid: false, reason: 'Cart mandate expired. Please re-initiate checkout.' };
  }

  await prisma.cartMandate.update({
    where: { id: mandate.id },
    data: { consumed: true },
  });

  return { valid: true };
}

export async function recomputeAndValidateHash(
  cartId: string,
  expectedHash: string,
): Promise<{ valid: boolean; currentHash: string; reason?: string }> {
  const cart = await prisma.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: { items: true },
  });

  const currentHash = computeStateHash(
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

  if (currentHash !== expectedHash) {
    return {
      valid: false,
      currentHash,
      reason: 'Cart contents changed since checkout was initiated. Prices or items may have been updated.',
    };
  }

  return { valid: true, currentHash };
}
