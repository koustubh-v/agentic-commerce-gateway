// =============================================================================
// Canonical Intermediate Representation (IR) — TypeScript types
// These mirror the Prisma models but are the agent-facing view.
// Every IR type is serializable (no Prisma Decimal — converted to number).
// =============================================================================

export type Currency = string; // ISO 4217: "INR", "USD", etc.

export type AvailabilityStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' | 'DISCONTINUED';
export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
export type CartStatus = 'ACTIVE' | 'CHECKED_OUT' | 'ABANDONED' | 'EXPIRED';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'FAILED';
export type FulfillmentStatus =
  | 'UNFULFILLED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'RETURNED';
export type TransactionStatus =
  | 'INTENT_CREATED'
  | 'BOUNDS_CHECKED'
  | 'GATE_APPROVED'
  | 'GATE_REJECTED'
  | 'OUTBOX_WRITTEN'
  | 'PSP_INITIATED'
  | 'PSP_PENDING'
  | 'PSP_SUCCEEDED'
  | 'PSP_FAILED'
  | 'UNCERTAIN'
  | 'FULFILLMENT_TRIGGERED'
  | 'SETTLED'
  | 'REFUNDED'
  | 'FAILED';

export interface IRMerchant {
  id: string;
  name: string;
  slug: string;
  currency: Currency;
  taxMode: string;
  fulfillmentRegions: string[];
  websiteUrl?: string;
}

export interface IRProductImage {
  url: string;
  alt?: string;
  position: number;
}

export interface IRInventory {
  variantId: string;
  stock: number;
  reservedStock: number;
  availability: AvailabilityStatus;
  trackQuantity: boolean;
  lowStockThreshold?: number | undefined;
  lastSyncedAt?: string | undefined; // ISO 8601
}

export interface IRProductVariant {
  id: string;
  externalId: string;
  title: string;
  price?: number | undefined; // null = inherit from parent
  compareAtPrice?: number | undefined;
  attributes: Record<string, string>;
  sku?: string | undefined;
  barcode?: string | undefined;
  agentPurchasable: boolean;
  inventory?: IRInventory | undefined;
}

export interface IRProduct {
  id: string;
  merchantId: string;
  externalId: string;
  externalUrl?: string | undefined;
  title: string;
  description?: string | undefined;
  category?: string | undefined;
  tags: string[];
  brand?: string | undefined;
  price: number;
  compareAtPrice?: number | undefined;
  currency: Currency;
  images: IRProductImage[];
  status: ProductStatus;
  availability: AvailabilityStatus;
  agentPurchasable: boolean;
  variants: IRProductVariant[];
  // Freshness metadata — agents should surface this to users when stale
  lastSyncedAt?: string | undefined;
  isStale: boolean;
  staleReason?: string | undefined;
}

export interface IRCartItem {
  id: string;
  productId: string;
  variantId?: string | undefined;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productTitle: string;
  variantTitle?: string | undefined;
}

export interface IRCart {
  id: string;
  merchantId: string;
  agentSessionId?: string | undefined;
  status: CartStatus;
  items: IRCartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: Currency;
  coupons: unknown[];
  version: number; // optimistic concurrency version
  expiresAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface IRAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface IROrder {
  id: string;
  merchantId: string;
  cartId: string;
  externalOrderId?: string | undefined;
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: Currency;
  customerEmail?: string | undefined;
  customerName?: string | undefined;
  shippingAddress?: IRAddress | undefined;
  trackingNumber?: string | undefined;
  trackingUrl?: string | undefined;
  estimatedDelivery?: string | undefined;
  agentSessionId?: string | undefined;
  notes?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface IRPaymentIntent {
  id: string;
  merchantId: string;
  orderId: string;
  idempotencyKey: string;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  pspProvider: string;
  pspOrderId?: string;
  checkoutToken?: string;
  checkoutTokenExpiresAt?: string;
  gateDecision?: 'APPROVED' | 'REJECTED' | 'REQUIRES_STEP_UP';
  gateMessage?: string;
}

// ---------------------------------------------------------------------------
// Filter / query types (used by IR service layer)
// ---------------------------------------------------------------------------

export interface ProductFilters {
  category?: string;
  availability?: AvailabilityStatus;
  minPrice?: number;
  maxPrice?: number;
  agentPurchasable?: boolean;
  search?: string; // simple text match on title/description
  limit?: number;
  offset?: number;
}

export interface CartMutationPayload {
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>;
  agentSessionId?: string;
  couponCode?: string;
}

export interface CartUpdatePayload {
  version: number; // Must match current version — optimistic concurrency
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>;
}

// ---------------------------------------------------------------------------
// Freshness wrapper — every agent-facing response includes this
// ---------------------------------------------------------------------------

export interface FreshnessMetadata {
  lastSyncedAt?: string | undefined;
  isStale: boolean;
  staleReason?: string | undefined;
  dataAgeSeconds?: number | undefined;
}

export interface IRResponse<T> {
  data: T;
  freshness: FreshnessMetadata;
}
