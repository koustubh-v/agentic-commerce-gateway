import { prisma } from '../db/client.js';
import {
  getCachedProducts,
  setCachedProducts,
  getCachedProduct,
  setCachedProduct,
  invalidateProductCache,
} from '../cache/ir-cache.js';
import type {
  IRProduct,
  IRProductVariant,
  IRInventory,
  IRProductImage,
  ProductFilters,
  IRResponse,
  FreshnessMetadata,
} from '../types/ir.js';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    variants: { include: { inventory: true } };
  };
}>;

function toIRInventory(inv: NonNullable<ProductWithRelations['variants'][number]['inventory']>): IRInventory {
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

function toIRVariant(v: ProductWithRelations['variants'][number]): IRProductVariant {
  return {
    id: v.id,
    externalId: v.externalId,
    title: v.title,
    price: v.price ? Number(v.price) : undefined,
    compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : undefined,
    attributes: (v.attributes as Record<string, string>) ?? {},
    sku: v.sku ?? undefined,
    barcode: v.barcode ?? undefined,
    agentPurchasable: v.agentPurchasable,
    inventory: v.inventory ? toIRInventory(v.inventory) : undefined,
  };
}

function toIRProduct(p: ProductWithRelations): IRProduct {
  const images = Array.isArray(p.images) ? (p.images as unknown as IRProductImage[]) : [];
  return {
    id: p.id,
    merchantId: p.merchantId,
    externalId: p.externalId,
    externalUrl: p.externalUrl ?? undefined,
    title: p.title,
    description: p.description ?? undefined,
    category: p.category ?? undefined,
    tags: p.tags,
    brand: p.brand ?? undefined,
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : undefined,
    currency: p.currency,
    images,
    status: p.status as IRProduct['status'],
    availability: p.availability as IRProduct['availability'],
    agentPurchasable: p.agentPurchasable,
    variants: p.variants.map(toIRVariant),
    lastSyncedAt: p.lastSyncedAt?.toISOString(),
    isStale: p.isStale,
    staleReason: p.staleReason ?? undefined,
  };
}

function buildFreshness(products: IRProduct[]): FreshnessMetadata {
  const anyStale = products.some((p) => p.isStale);
  const oldest = products
    .filter((p) => p.lastSyncedAt)
    .sort((a, b) => (a.lastSyncedAt! < b.lastSyncedAt! ? -1 : 1))[0];

  const dataAgeSeconds = oldest?.lastSyncedAt
    ? Math.floor((Date.now() - new Date(oldest.lastSyncedAt).getTime()) / 1000)
    : undefined;

  return {
    lastSyncedAt: oldest?.lastSyncedAt,
    isStale: anyStale || (dataAgeSeconds !== undefined && dataAgeSeconds > env.SYNC_STALE_AFTER_SECONDS),
    staleReason: anyStale ? 'One or more products have stale data from the merchant backend.' : undefined,
    dataAgeSeconds,
  };
}

// ---------------------------------------------------------------------------
// IR Products Service
// ---------------------------------------------------------------------------

/**
 * List products for a merchant — read from Redis cache, fall back to Postgres.
 * Agents always call this, never query the merchant DB directly.
 */
export async function getProducts(
  merchantId: string,
  filters: ProductFilters = {},
): Promise<IRResponse<IRProduct[]>> {
  // Try cache first for non-filtered requests
  const isUnfiltered = !filters.category && !filters.availability && !filters.search && !filters.minPrice && !filters.maxPrice;
  if (isUnfiltered && !filters.agentPurchasable) {
    const cached = await getCachedProducts(merchantId);
    if (cached) {
      return { data: cached, freshness: buildFreshness(cached) };
    }
  }

  // Build Prisma where clause from filters
  const where: Prisma.ProductWhereInput = {
    merchantId,
    status: 'ACTIVE',
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.availability ? { availability: filters.availability } : {}),
    ...(filters.agentPurchasable !== undefined ? { agentPurchasable: filters.agentPurchasable } : {}),
    ...(filters.minPrice || filters.maxPrice
      ? {
          price: {
            ...(filters.minPrice ? { gte: filters.minPrice } : {}),
            ...(filters.maxPrice ? { lte: filters.maxPrice } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
    include: { variants: { include: { inventory: true } } },
    orderBy: { updatedAt: 'desc' },
    take: filters.limit ?? 50,
    skip: filters.offset ?? 0,
  });

  const irProducts = products.map(toIRProduct);

  // Cache unfiltered list only (filtered results are per-query)
  if (isUnfiltered) {
    await setCachedProducts(merchantId, irProducts);
  }

  return { data: irProducts, freshness: buildFreshness(irProducts) };
}

/**
 * Get a single product by internal ACG product ID.
 */
export async function getProduct(
  merchantId: string,
  productId: string,
): Promise<IRResponse<IRProduct> | null> {
  const cached = await getCachedProduct(merchantId, productId);
  if (cached) {
    return {
      data: cached,
      freshness: {
        lastSyncedAt: cached.lastSyncedAt,
        isStale: cached.isStale,
        staleReason: cached.staleReason,
        dataAgeSeconds: cached.lastSyncedAt
          ? Math.floor((Date.now() - new Date(cached.lastSyncedAt).getTime()) / 1000)
          : undefined,
      },
    };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, merchantId },
    include: { variants: { include: { inventory: true } } },
  });

  if (!product) return null;

  const irProduct = toIRProduct(product);
  await setCachedProduct(merchantId, productId, irProduct);

  return {
    data: irProduct,
    freshness: {
      lastSyncedAt: irProduct.lastSyncedAt,
      isStale: irProduct.isStale,
      staleReason: irProduct.staleReason,
    },
  };
}

/**
 * Upsert a product from sync (internal — called by ingestion adapters only).
 * Returns the IR product after writing to DB and invalidating cache.
 */
export async function upsertProductFromSync(
  merchantId: string,
  data: Omit<IRProduct, 'id' | 'variants' | 'isStale' | 'lastSyncedAt'> & {
    variants?: Array<Omit<IRProductVariant, 'id' | 'inventory'> & { stock?: number | undefined }> | undefined;
  },
): Promise<IRProduct> {
  const product = await prisma.$transaction(async (tx) => {
    const upserted = await tx.product.upsert({
      where: { merchantId_externalId: { merchantId, externalId: data.externalId } },
      create: {
        merchantId,
        externalId: data.externalId,
        externalUrl: data.externalUrl ?? null,
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,
        tags: data.tags,
        brand: data.brand ?? null,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        currency: data.currency,
        images: data.images as unknown as Prisma.InputJsonValue,
        status: data.status,
        availability: data.availability,
        agentPurchasable: data.agentPurchasable,
        isStale: false,
        lastSyncedAt: new Date(),
      },
      update: {
        externalUrl: data.externalUrl ?? null,
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,
        tags: data.tags,
        brand: data.brand ?? null,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        currency: data.currency,
        images: data.images as unknown as Prisma.InputJsonValue,
        status: data.status,
        availability: data.availability,
        agentPurchasable: data.agentPurchasable,
        isStale: false,
        staleReason: null,
        lastSyncedAt: new Date(),
      },
    });

    // Upsert variants + inventory
    if (data.variants) {
      for (const variant of data.variants) {
        const upsertedVariant = await tx.productVariant.upsert({
          where: { productId_externalId: { productId: upserted.id, externalId: variant.externalId } },
          create: {
            productId: upserted.id,
            externalId: variant.externalId,
            title: variant.title,
            price: variant.price ?? null,
            compareAtPrice: variant.compareAtPrice ?? null,
            attributes: variant.attributes as Prisma.InputJsonValue,
            sku: variant.sku ?? null,
            barcode: variant.barcode ?? null,
            agentPurchasable: variant.agentPurchasable,
          },
          update: {
            title: variant.title,
            price: variant.price ?? null,
            compareAtPrice: variant.compareAtPrice ?? null,
            attributes: variant.attributes as Prisma.InputJsonValue,
            sku: variant.sku ?? null,
            agentPurchasable: variant.agentPurchasable,
          },
        });

        if (variant.stock !== undefined) {
          await tx.inventory.upsert({
            where: { variantId: upsertedVariant.id },
            create: {
              variantId: upsertedVariant.id,
              stock: variant.stock,
              availability: variant.stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
              lastSyncedAt: new Date(),
            },
            update: {
              stock: variant.stock,
              availability: variant.stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
              lastSyncedAt: new Date(),
            },
          });
        }
      }
    }

    return tx.product.findUniqueOrThrow({
      where: { id: upserted.id },
      include: { variants: { include: { inventory: true } } },
    });
  });

  const irProduct = toIRProduct(product);
  await invalidateProductCache(merchantId);
  return irProduct;
}

/**
 * Mark all products for a merchant as stale (e.g., sync failed).
 */
export async function markProductsStale(merchantId: string, reason: string): Promise<void> {
  await prisma.product.updateMany({
    where: { merchantId },
    data: { isStale: true, staleReason: reason },
  });
  await invalidateProductCache(merchantId);
}
