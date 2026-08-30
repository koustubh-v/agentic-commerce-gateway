

export const QUEUES = {
  SYNC_PRODUCTS: 'sync-products',
  SYNC_INVENTORY: 'sync-inventory',
  OUTBOX: 'outbox-processor',
  RECONCILER: 'reconciler',
  WEBHOOK_NOTIFY: 'webhook-notify',
} as const;

export const CACHE_KEYS = {
  products: (merchantId: string) => `ir:products:${merchantId}`,
  product: (merchantId: string, productId: string) => `ir:product:${merchantId}:${productId}`,
  inventory: (variantId: string) => `ir:inventory:${variantId}`,
  cart: (cartId: string) => `ir:cart:${cartId}`,
  order: (orderId: string) => `ir:order:${orderId}`,
  merchantSyncStatus: (merchantId: string) => `sync:status:${merchantId}`,
} as const;

export const API_PREFIX = '/api/v1';

export const STALE_FLAG = 'UNCONFIRMED_DATA' as const;

export const IDEMPOTENCY_WINDOW_SECONDS = 86400; 
