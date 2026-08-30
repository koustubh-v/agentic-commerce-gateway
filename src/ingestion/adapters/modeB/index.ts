

//   - Merchant installs the ACG SDK into their backend

export interface ModeBWebhookPayload {
  merchantId: string;
  entityType: 'products' | 'inventory' | 'order_update';
  data: unknown[];
  timestamp: string;
  signature: string; 
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
  
  _payload: ModeBWebhookPayload,
): Promise<ModeBIngestResult> {
  
  throw new Error('Mode B is not yet implemented. Use Mode A (config-mapping) for now.');
}
