import { prisma } from '../db/client.js';
import type { IRInventory } from '../types/ir.js';

// ---------------------------------------------------------------------------
// IR Inventory Service
// Inventory is always read live from Postgres (TTL is short; Redis cache is
// managed at the product level). Writes are atomic SQL to prevent race conditions.
// ---------------------------------------------------------------------------

/**
 * Get live inventory for a variant.
 */
export async function getInventory(variantId: string): Promise<IRInventory | null> {
  const inv = await prisma.inventory.findUnique({ where: { variantId } });
  if (!inv) return null;

  return {
    variantId: inv.variantId,
    stock: inv.stock,
    reservedStock: inv.reservedStock,
    availability: inv.availability as IRInventory['availability'],
    trackQuantity: inv.trackQuantity,
    lowStockThreshold: inv.lowStockThreshold ?? undefined,
    lastSyncedAt: inv.lastSyncedAt?.toISOString(),
  };
}

/**
 * Atomically decrement stock for a variant.
 * Uses a single SQL UPDATE WHERE stock > 0 — no read-then-write race condition.
 * Returns the new stock count, or null if out of stock.
 */
export async function decrementStock(variantId: string, quantity: number = 1): Promise<number | null> {
  const result = await prisma.$queryRaw<Array<{ stock: number }>>`
    UPDATE inventory
    SET stock = stock - ${quantity},
        availability = CASE WHEN stock - ${quantity} <= 0 THEN 'OUT_OF_STOCK'::"AvailabilityStatus" ELSE availability END,
        "updatedAt" = NOW()
    WHERE "variantId" = ${variantId}
      AND stock >= ${quantity}
    RETURNING stock
  `;

  if (result.length === 0) return null; // Out of stock or not found
  return result[0]?.stock ?? null;
}

/**
 * Reserve stock (increment reservedStock) without decrementing actual stock.
 * Used when a cart item is added — stock is decremented at checkout confirmation.
 */
export async function reserveStock(variantId: string, quantity: number): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE inventory
    SET "reservedStock" = "reservedStock" + ${quantity},
        "updatedAt" = NOW()
    WHERE "variantId" = ${variantId}
      AND (stock - "reservedStock") >= ${quantity}
    RETURNING "variantId" as id
  `;

  return result.length > 0;
}

/**
 * Release reserved stock (e.g., cart abandoned or order cancelled).
 */
export async function releaseReservedStock(variantId: string, quantity: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE inventory
    SET "reservedStock" = GREATEST(0, "reservedStock" - ${quantity}),
        "updatedAt" = NOW()
    WHERE "variantId" = ${variantId}
  `;
}

/**
 * Increment stock (e.g., order refunded/cancelled, stock returned).
 */
export async function incrementStock(variantId: string, quantity: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE inventory
    SET stock = stock + ${quantity},
        availability = CASE WHEN stock + ${quantity} > 0 THEN 'IN_STOCK'::"AvailabilityStatus" ELSE availability END,
        "updatedAt" = NOW()
    WHERE "variantId" = ${variantId}
  `;
}
