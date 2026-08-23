import { redis } from './client.js';
import { CACHE_KEYS } from '../config/constants.js';
import { env } from '../config/env.js';
import type { IRProduct, IRCart, IROrder } from '../types/ir.js';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setJSON<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

async function deleteKey(key: string): Promise<void> {
  await redis.del(key);
}

async function deletePrefixed(prefix: string): Promise<void> {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// ---------------------------------------------------------------------------
// Product cache
// ---------------------------------------------------------------------------

export async function getCachedProducts(merchantId: string): Promise<IRProduct[] | null> {
  return getJSON<IRProduct[]>(CACHE_KEYS.products(merchantId));
}

export async function setCachedProducts(merchantId: string, products: IRProduct[]): Promise<void> {
  await setJSON(CACHE_KEYS.products(merchantId), products, env.CACHE_PRODUCT_TTL_SECONDS);
}

export async function getCachedProduct(merchantId: string, productId: string): Promise<IRProduct | null> {
  return getJSON<IRProduct>(CACHE_KEYS.product(merchantId, productId));
}

export async function setCachedProduct(merchantId: string, productId: string, product: IRProduct): Promise<void> {
  await setJSON(CACHE_KEYS.product(merchantId, productId), product, env.CACHE_PRODUCT_TTL_SECONDS);
}

export async function invalidateProductCache(merchantId: string): Promise<void> {
  // Invalidate both the list and all individual product entries for this merchant
  await deletePrefixed(`ir:product:${merchantId}:`);
  await deleteKey(CACHE_KEYS.products(merchantId));
}

// ---------------------------------------------------------------------------
// Cart cache
// ---------------------------------------------------------------------------

export async function getCachedCart(cartId: string): Promise<IRCart | null> {
  return getJSON<IRCart>(CACHE_KEYS.cart(cartId));
}

export async function setCachedCart(cartId: string, cart: IRCart): Promise<void> {
  await setJSON(CACHE_KEYS.cart(cartId), cart, env.CACHE_CART_TTL_SECONDS);
}

export async function invalidateCartCache(cartId: string): Promise<void> {
  await deleteKey(CACHE_KEYS.cart(cartId));
}

// ---------------------------------------------------------------------------
// Order cache
// ---------------------------------------------------------------------------

export async function getCachedOrder(orderId: string): Promise<IROrder | null> {
  return getJSON<IROrder>(CACHE_KEYS.order(orderId));
}

export async function setCachedOrder(orderId: string, order: IROrder): Promise<void> {
  await setJSON(CACHE_KEYS.order(orderId), order, env.CACHE_ORDER_TTL_SECONDS);
}

export async function invalidateOrderCache(orderId: string): Promise<void> {
  await deleteKey(CACHE_KEYS.order(orderId));
}
