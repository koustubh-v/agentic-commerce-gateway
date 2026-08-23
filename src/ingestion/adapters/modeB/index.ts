// ---------------------------------------------------------------------------
// Mode B Adapter — stub for Phase 2
//
// Mode B is the SDK push-based integration:
//   - Merchant installs the ACG SDK into their backend
//   - SDK exposes decorator-based hooks (@az.products, @az.checkout)
//   - On each request, the SDK calls ACG's ingest endpoint directly (push vs poll)
//
// This file is a stub with the interface defined so Phase 2 can implement
// without changing any consumers.
// ---------------------------------------------------------------------------

export interface ModeBWebhookPayload {
  merchantId: string;
  entityType: 'products' | 'inventory' | 'order_update';
  data: unknown[];
  timestamp: string;
  signature: string; // HMAC-SHA256 of payload body signed with merchant's webhook secret
}

export interface ModeBIngestResult {
  accepted: number;
  rejected: number;
  errors: Array<{ index: number; reason: string }>;
}

/**
 * Handle a Mode B push payload from a merchant's SDK.
 * TODO: Implement in Phase 2.
 */
export async function handleModeBPush(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _payload: ModeBWebhookPayload,
): Promise<ModeBIngestResult> {
  // Phase 2: Verify HMAC, normalise payload, write to IR, invalidate cache
  throw new Error('Mode B is not yet implemented. Use Mode A (config-mapping) for now.');
}
