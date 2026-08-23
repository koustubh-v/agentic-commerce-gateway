import type { IRProduct, IRProductImage, IRProductVariant, AvailabilityStatus } from '../types/ir.js';
import type { RawProduct } from './adapters/modeA/config-schema.js';

// ---------------------------------------------------------------------------
// Normalizer — converts ACG-prefixed intermediates to canonical IR
// This is the type-coercion and sanitization boundary.
// Stateless: (rawProducts, merchantId, currency) → IRProduct[]
// ---------------------------------------------------------------------------

/**
 * Parse a price value — accepts string or number, returns a clean float.
 * Strips currency symbols and commas.
 */
function parsePrice(raw: string | number | undefined): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number') return isNaN(raw) ? undefined : raw;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse a stock quantity — accepts string or number.
 */
function parseStock(raw: string | number | undefined): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return isNaN(n) ? undefined : Math.max(0, n);
}

/**
 * Normalise tags — accepts CSV string or string array.
 */
function parseTags(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * Normalise images — accepts a single URL string or array of objects/strings.
 */
function parseImages(raw: string | unknown[] | undefined): IRProductImage[] {
  if (!raw) return [];

  if (typeof raw === 'string') {
    return raw ? [{ url: raw, position: 0 }] : [];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item, idx) => {
        if (typeof item === 'string') return { url: item, position: idx };
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          const url = String(obj['url'] ?? obj['src'] ?? obj['image'] ?? '');
          const alt = obj['alt'] ? String(obj['alt']) : undefined;
          return url ? { url, alt, position: idx } : null;
        }
        return null;
      })
      .filter((img): img is IRProductImage => img !== null);
  }

  return [];
}

/**
 * Normalise availability status from arbitrary merchant strings.
 */
function parseAvailability(
  raw: string | undefined,
  stock?: number,
): AvailabilityStatus {
  if (!raw && stock !== undefined) {
    return stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
  }

  if (!raw) return 'IN_STOCK';

  const lower = raw.toLowerCase().replace(/[-_ ]/g, '');
  if (['instock', 'available', 'yes', '1', 'true', 'active'].includes(lower)) return 'IN_STOCK';
  if (['outofstock', 'unavailable', 'no', '0', 'false', 'soldout'].includes(lower)) return 'OUT_OF_STOCK';
  if (['preorder', 'pre-order', 'preorderable', 'comingsoon'].includes(lower)) return 'PREORDER';
  if (['discontinued', 'archived', 'inactive'].includes(lower)) return 'DISCONTINUED';

  return 'IN_STOCK'; // Safe default
}

/**
 * Normalise a single raw variant.
 */
function normalizeVariant(
  raw: Record<string, unknown>,
  index: number,
): Omit<IRProductVariant, 'id' | 'inventory'> & { stock?: number | undefined } {
  const stock = parseStock(raw['stock'] as string | number | undefined);
  const result: Omit<IRProductVariant, 'id' | 'inventory'> & { stock?: number | undefined } = {
    externalId: String(raw['id'] ?? raw['variant_id'] ?? `variant_${index}`),
    title: String(raw['title'] ?? raw['name'] ?? `Variant ${index + 1}`),
    price: parsePrice(raw['price'] as string | number | undefined),
    compareAtPrice: parsePrice(raw['compare_at_price'] as string | number | undefined),
    attributes: typeof raw['attributes'] === 'object' && raw['attributes'] !== null
      ? (raw['attributes'] as Record<string, string>)
      : {},
    sku: raw['sku'] ? String(raw['sku']) : undefined,
    agentPurchasable: true,
  };
  if (stock !== undefined) result.stock = stock;
  return result;
}

export type NormalizedVariant = Omit<IRProductVariant, 'id' | 'inventory'> & {
  stock?: number | undefined;
};

export type NormalizedProduct = Omit<IRProduct, 'id' | 'isStale' | 'lastSyncedAt' | 'variants'> & {
  variants?: NormalizedVariant[] | undefined;
};

/**
 * Normalise a list of ACG-mapped raw products into canonical IR products.
 *
 * @param rawProducts - ACG-prefixed intermediates from the mapper
 * @param merchantId - Target merchant
 * @param defaultCurrency - Merchant's default currency (used when not present in product)
 */
export function normalizeProducts(
  rawProducts: RawProduct[],
  merchantId: string,
  defaultCurrency: string = 'INR',
): NormalizedProduct[] {
  const normalized: NormalizedProduct[] = [];

  for (const raw of rawProducts) {
    const price = parsePrice(raw.__acg_price);
    if (price === undefined) {
      // Cannot normalise a product with no price — skip with a warning
      console.warn(`[Normalizer] Skipping product ${raw.__acg_id}: cannot parse price "${raw.__acg_price}"`);
      continue;
    }

    const stock = parseStock(raw.__acg_stock);

    const variants = raw.__acg_variants?.map((v, i) =>
      normalizeVariant(v as Record<string, unknown>, i),
    );

    const productData: NormalizedProduct = {
      merchantId,
      externalId: raw.__acg_id,
      title: raw.__acg_title.trim(),
      description: raw.__acg_description?.trim() || undefined,
      category: raw.__acg_category?.trim() || undefined,
      tags: parseTags(raw.__acg_tags),
      brand: raw.__acg_brand?.trim() || undefined,
      price,
      compareAtPrice: parsePrice(raw.__acg_compareAtPrice),
      currency: raw.__acg_currency?.trim() || defaultCurrency,
      images: parseImages(raw.__acg_images),
      status: 'ACTIVE' as const,
      availability: parseAvailability(raw.__acg_availability, stock),
      agentPurchasable: true,
      staleReason: undefined,
    };
    if (variants) productData.variants = variants;
    normalized.push(productData);
  }

  return normalized;
}
