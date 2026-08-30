import { JSONPath } from 'jsonpath-plus';
import type { MerchantSyncConfigInput, RawProduct } from './config-schema.js';

type FieldMap = MerchantSyncConfigInput['fieldMap'];

/**
 * Extract a value from an object using a JSONPath expression.
 * Returns undefined if the path doesn't match.
 */
function extractPath(obj: unknown, path: string): unknown {
  try {
    const results = JSONPath({ path, json: obj as object, wrap: false });
    return results ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract all items from an array using a JSONPath expression.
 */
function extractArray(obj: unknown, path: string): unknown[] {
  try {
    const results = JSONPath({ path, json: obj as object, wrap: true });
    if (Array.isArray(results)) return results;
    return [];
  } catch {
    return [];
  }
}

/**
 * Map a single raw merchant product object to ACG intermediate format.
 * All keys are prefixed with __acg_ to avoid collision with merchant field names.
 */
function mapSingleProduct(rawProduct: Record<string, unknown>, fieldMap: FieldMap): RawProduct {
  const extract = (path: string) => extractPath(rawProduct, path);

  return {
    __acg_id: String(extract(fieldMap.id) ?? ''),
    __acg_title: String(extract(fieldMap.title) ?? ''),
    __acg_price: extract(fieldMap.price) as string | number,
    __acg_description: fieldMap.description ? String(extract(fieldMap.description) ?? '') || undefined : undefined,
    __acg_category: fieldMap.category ? String(extract(fieldMap.category) ?? '') || undefined : undefined,
    __acg_currency: fieldMap.currency ? String(extract(fieldMap.currency) ?? '') || undefined : undefined,
    __acg_stock: fieldMap.stock !== undefined ? (extract(fieldMap.stock) as string | number) : undefined,
    __acg_images: fieldMap.images ? (extract(fieldMap.images) as string | unknown[] | undefined) : undefined,
    __acg_compareAtPrice: fieldMap.compareAtPrice !== undefined
      ? (extract(fieldMap.compareAtPrice) as string | number | undefined)
      : undefined,
    __acg_brand: fieldMap.brand ? String(extract(fieldMap.brand) ?? '') || undefined : undefined,
    __acg_sku: fieldMap.sku ? String(extract(fieldMap.sku) ?? '') || undefined : undefined,
    __acg_tags: fieldMap.tags ? (extract(fieldMap.tags) as string | string[] | undefined) : undefined,
    __acg_availability: fieldMap.availability
      ? String(extract(fieldMap.availability) ?? '') || undefined
      : undefined,
    __acg_variants: mapVariants(rawProduct, fieldMap),
    __acg_raw: rawProduct,
  };
}

function mapVariants(
  rawProduct: Record<string, unknown>,
  fieldMap: FieldMap,
): Array<Record<string, unknown>> | undefined {
  if (!fieldMap['variants.id']) return undefined;

  const variantIds = extractArray(rawProduct, fieldMap['variants.id']);
  if (variantIds.length === 0) return undefined;

  const variantsPath = fieldMap['variants.id'].split('[')[0] ?? '$.variants'; 
  const rawVariants = extractArray(rawProduct, variantsPath) as Array<Record<string, unknown>>;

  return rawVariants.map((rv) => ({
    id: fieldMap['variants.id'] ? extractPath(rv, fieldMap['variants.id']!.replace(/.*\[/, '$.')) : undefined,
    title: fieldMap['variants.title'] ? extractPath(rv, fieldMap['variants.title']!) : undefined,
    price: fieldMap['variants.price'] ? extractPath(rv, fieldMap['variants.price']!) : undefined,
    stock: fieldMap['variants.stock'] ? extractPath(rv, fieldMap['variants.stock']!) : undefined,
    sku: fieldMap['variants.sku'] ? extractPath(rv, fieldMap['variants.sku']!) : undefined,
    attributes: fieldMap['variants.attributes']
      ? extractPath(rv, fieldMap['variants.attributes']!)
      : {},
  }));
}

/**
 * Map an entire merchant API response (may be array or object with nested array)
 * to a list of ACG intermediate raw products.
 *
 * @param responseData - The raw JSON response from the merchant's products endpoint
 * @param fieldMap - The merchant's configured field mapping
 * @param productsArrayPath - JSONPath to the products array within the response
 */
export function mapMerchantResponse(
  responseData: unknown,
  fieldMap: FieldMap,
  productsArrayPath: string = '$',
): RawProduct[] {
  let products: unknown[];

  if (productsArrayPath === '$') {
    
    products = Array.isArray(responseData) ? responseData : [responseData];
  } else {
    products = extractArray(responseData, productsArrayPath);
  }

  const mapped: RawProduct[] = [];
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue;

    const rawObj = raw as Record<string, unknown>;
    const product = mapSingleProduct(rawObj, fieldMap);

    if (!product.__acg_id || !product.__acg_title) continue;

    mapped.push(product);
  }

  return mapped;
}
