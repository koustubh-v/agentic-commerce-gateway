import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Freshness utilities — TTL + stale-after flag
// ---------------------------------------------------------------------------

/**
 * Determine if a last-synced timestamp is considered stale
 * based on the configured SYNC_STALE_AFTER_SECONDS threshold.
 */
export function isStale(lastSyncedAt: Date | null | undefined): boolean {
  if (!lastSyncedAt) return true;
  const ageSeconds = (Date.now() - lastSyncedAt.getTime()) / 1000;
  return ageSeconds > env.SYNC_STALE_AFTER_SECONDS;
}

/**
 * Get data age in seconds from a last-synced timestamp.
 */
export function getDataAgeSeconds(lastSyncedAt: Date | null | undefined): number | undefined {
  if (!lastSyncedAt) return undefined;
  return Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000);
}

/**
 * Build a stale-reason message surfaced to agents when data is stale.
 */
export function buildStaleReason(lastSyncedAt: Date | null | undefined, staleAfterSeconds?: number): string {
  const threshold = staleAfterSeconds ?? env.SYNC_STALE_AFTER_SECONDS;
  if (!lastSyncedAt) return 'Product data has never been synced from merchant backend.';
  const ageSeconds = Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000);
  return `Product data is ${ageSeconds}s old (stale after ${threshold}s). Price and stock may have changed — verify at checkout.`;
}
