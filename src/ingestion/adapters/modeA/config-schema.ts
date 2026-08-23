import { z } from 'zod';

// ---------------------------------------------------------------------------
// Mode A — Merchant sync config manifest schema
// This is what a merchant submits to configure config-mapping integration.
// ---------------------------------------------------------------------------

const AuthTypeSchema = z.enum(['bearer', 'api_key_header', 'basic', 'none']).default('none');

export const MerchantSyncConfigSchema = z.object({
  /** The merchant's existing REST endpoint that returns a product list */
  productsEndpoint: z.string().url('Must be a valid URL'),

  /** Optional: separate endpoint returning inventory/stock levels */
  inventoryEndpoint: z.string().url().optional(),

  /** Optional: endpoint to read order status from merchant system */
  ordersEndpoint: z.string().url().optional(),

  /**
   * POST target on merchant's system when ACG creates/updates an order.
   * ACG will send a signed webhook to this URL when payment settles.
   */
  checkoutWebhookUrl: z.string().url().optional(),

  /**
   * JSONPath field mapping — maps canonical IR field names → JSONPath expressions
   * pointing into the merchant's raw product object.
   *
   * Required fields: id, title, price
   * Optional: description, category, stock, images, variants, sku, currency
   *
   * Example:
   *   { "id": "$.sku", "title": "$.name", "price": "$.price_inr", "stock": "$.qty" }
   *
   * Array paths (for product lists): if the root response is a list, use "$[*]"
   * Nested: "$.variants[*].id", "$.images[0].src"
   */
  fieldMap: z.object({
    id: z.string(),                          // required: unique product identifier
    title: z.string(),                       // required: product title/name
    price: z.string(),                       // required: base price
    description: z.string().optional(),
    category: z.string().optional(),
    currency: z.string().optional(),
    stock: z.string().optional(),
    images: z.string().optional(),           // JSONPath to image array or single URL
    compareAtPrice: z.string().optional(),
    brand: z.string().optional(),
    sku: z.string().optional(),
    tags: z.string().optional(),
    availability: z.string().optional(),     // JSONPath → merchant's availability field
    // Variant mapping — if merchant has a variants array
    'variants.id': z.string().optional(),
    'variants.title': z.string().optional(),
    'variants.price': z.string().optional(),
    'variants.stock': z.string().optional(),
    'variants.sku': z.string().optional(),
    'variants.attributes': z.string().optional(),
  }),

  /**
   * JSONPath to the products array in the response.
   * e.g. "$.products" if response is { "products": [...] }
   * e.g. "$" if response is directly an array
   */
  productsArrayPath: z.string().default('$'),

  /** Auth for the merchant's API */
  authType: AuthTypeSchema,
  authHeaderName: z.string().optional(),    // e.g. "Authorization", "X-API-Key"
  authValue: z.string().optional(),         // Raw value (will be encrypted at storage)

  /** Polling config */
  pollIntervalMinutes: z.number().int().min(1).max(1440).default(5),
  isPollingEnabled: z.boolean().default(true),

  /** Data older than this is flagged as stale in agent responses */
  staleAfterSeconds: z.number().int().min(60).default(600),
});

export type MerchantSyncConfigInput = z.infer<typeof MerchantSyncConfigSchema>;

// ---------------------------------------------------------------------------
// Raw product data schema — what we accept from merchant APIs (very lenient)
// The normalizer is responsible for coercing this into canonical IR.
// ---------------------------------------------------------------------------

export const RawProductSchema = z.object({
  __acg_id: z.string(),            // mapped from fieldMap.id
  __acg_title: z.string(),         // mapped from fieldMap.title
  __acg_price: z.union([z.string(), z.number()]),
  __acg_description: z.string().optional(),
  __acg_category: z.string().optional(),
  __acg_currency: z.string().optional(),
  __acg_stock: z.union([z.string(), z.number()]).optional(),
  __acg_images: z.union([z.string(), z.array(z.unknown())]).optional(),
  __acg_compareAtPrice: z.union([z.string(), z.number()]).optional(),
  __acg_brand: z.string().optional(),
  __acg_sku: z.string().optional(),
  __acg_tags: z.union([z.string(), z.array(z.string())]).optional(),
  __acg_availability: z.string().optional(),
  __acg_variants: z.array(z.record(z.unknown())).optional(),
  __acg_raw: z.record(z.unknown()).optional(), // original raw object for debugging
});

export type RawProduct = z.infer<typeof RawProductSchema>;
