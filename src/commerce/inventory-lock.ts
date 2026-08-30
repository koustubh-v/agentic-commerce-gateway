import { redis } from '../cache/client.js';

const LOCK_TTL_SECONDS = 1800; 
const LOCK_PREFIX = 'lock:sku:';

export async function acquireInventoryLock(
  variantId: string,
  checkoutId: string,
): Promise<{ acquired: boolean; heldBy?: string }> {
  const key = `${LOCK_PREFIX}${variantId}`;
  const result = await redis.set(key, checkoutId, 'EX', LOCK_TTL_SECONDS, 'NX');

  if (result === 'OK') {
    return { acquired: true };
  }

  const holder = await redis.get(key);
  if (holder) {
    return { acquired: false, heldBy: holder };
  }
  return { acquired: false };
}

export async function releaseInventoryLock(variantId: string, checkoutId: string): Promise<void> {
  const key = `${LOCK_PREFIX}${variantId}`;
  const holder = await redis.get(key);

  if (holder === checkoutId) {
    await redis.del(key);
  }
}

export async function releaseAllLocksForCheckout(
  variantIds: string[],
  checkoutId: string,
): Promise<void> {
  await Promise.all(variantIds.map(vid => releaseInventoryLock(vid, checkoutId)));
}
