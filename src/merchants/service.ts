import { prisma } from '../db/client.js';
import { MerchantSyncConfigSchema } from '../ingestion/adapters/modeA/config-schema.js';
import { registerMerchantSyncJob } from '../ingestion/adapters/modeA/poller.js';
import { triggerManualSync, getMerchantSyncStatus } from '../sync/merchant-sync.js';
import { z } from 'zod';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const CreateMerchantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  email: z.string().email(),
  websiteUrl: z.string().url().optional(),
  currency: z.string().length(3).default('INR'),
  taxMode: z.enum(['inclusive', 'exclusive']).default('inclusive'),
  fulfillmentRegions: z.array(z.string()).default([]),
  razorpayKeyId: z.string().optional(),
  fulfillmentWebhookUrl: z.string().url().optional(),
  cancellationWebhookUrl: z.string().url().optional(),
});

const UpdateMerchantPolicySchema = z.object({
  perTransactionCapINR: z.number().positive().optional(),
  perSessionCapINR: z.number().positive().optional(),
  velocityTxPerHour: z.number().int().positive().optional(),
  allowedSkuCategories: z.array(z.string()).optional(),
});

export type CreateMerchantInput = z.infer<typeof CreateMerchantSchema>;

/**
 * Onboard a new merchant — generates API key, stores config, registers sync job.
 */
export async function createMerchant(input: CreateMerchantInput): Promise<{
  merchant: Record<string, unknown>;
  apiKey: string; 
}> {
  const parsed = CreateMerchantSchema.parse(input);

  const existing = await prisma.merchant.findUnique({ where: { slug: parsed.slug } });
  if (existing) throw new Error(`Merchant with slug "${parsed.slug}" already exists.`);

  const rawKey = `ak_live_${uuidv4().replace(/-/g, '')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 16);

  const webhookSigningSecret = crypto.randomBytes(32).toString('hex');

  const merchant = await prisma.merchant.create({
    data: {
      name: parsed.name,
      slug: parsed.slug,
      email: parsed.email,
      websiteUrl: parsed.websiteUrl ?? null,
      currency: parsed.currency,
      taxMode: parsed.taxMode,
      fulfillmentRegions: parsed.fulfillmentRegions,
      apiKeyHash: keyHash,
      apiKeyPrefix: keyPrefix,
      razorpayKeyId: parsed.razorpayKeyId ?? null,
      fulfillmentWebhookUrl: parsed.fulfillmentWebhookUrl ?? null,
      cancellationWebhookUrl: parsed.cancellationWebhookUrl ?? null,
      webhookSigningSecret,
      status: 'ONBOARDING',
    },
  });

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      status: merchant.status,
      email: merchant.email,
      currency: merchant.currency,
      apiKeyPrefix: merchant.apiKeyPrefix,
      createdAt: merchant.createdAt,
    },
    apiKey: rawKey, 
  };
}

/**
 * Get merchant details (safe — no secrets).
 */
export async function getMerchant(merchantId: string) {
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      email: true,
      websiteUrl: true,
      currency: true,
      taxMode: true,
      fulfillmentRegions: true,
      integrationMode: true,
      razorpayKeyId: true,
      fulfillmentWebhookUrl: true,
      cancellationWebhookUrl: true,
      agentPolicy: true,
      apiKeyPrefix: true,
      createdAt: true,
      updatedAt: true,
      syncConfig: {
        select: {
          productsEndpoint: true,
          productsArrayPath: true,
          pollIntervalMinutes: true,
          isPollingEnabled: true,
          staleAfterSeconds: true,
          authType: true,
        },
      },
    },
  });

  return merchant;
}

/**
 * Update Mode A sync config for a merchant.
 * Re-registers the BullMQ polling job with new interval.
 */
export async function updateSyncConfig(
  merchantId: string,
  configInput: unknown,
): Promise<void> {
  const config = MerchantSyncConfigSchema.parse(configInput);

  await prisma.merchantSyncConfig.upsert({
    where: { merchantId },
    create: {
      merchantId,
      productsEndpoint: config.productsEndpoint,
      inventoryEndpoint: config.inventoryEndpoint ?? null,
      ordersEndpoint: config.ordersEndpoint ?? null,
      checkoutWebhookUrl: config.checkoutWebhookUrl ?? null,
      fieldMap: config.fieldMap,
      productsArrayPath: config.productsArrayPath,
      authType: config.authType,
      authHeaderName: config.authHeaderName ?? null,
      authValueEncrypted: config.authValue ?? null,
      pollIntervalMinutes: config.pollIntervalMinutes,
      isPollingEnabled: config.isPollingEnabled,
      staleAfterSeconds: config.staleAfterSeconds,
    },
    update: {
      productsEndpoint: config.productsEndpoint,
      inventoryEndpoint: config.inventoryEndpoint ?? null,
      ordersEndpoint: config.ordersEndpoint ?? null,
      checkoutWebhookUrl: config.checkoutWebhookUrl ?? null,
      fieldMap: config.fieldMap,
      productsArrayPath: config.productsArrayPath,
      authType: config.authType,
      authHeaderName: config.authHeaderName ?? null,
      authValueEncrypted: config.authValue ?? null,
      pollIntervalMinutes: config.pollIntervalMinutes,
      isPollingEnabled: config.isPollingEnabled,
      staleAfterSeconds: config.staleAfterSeconds,
    },
  });

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { status: 'ACTIVE', integrationMode: 'MODE_A' },
  });

  await registerMerchantSyncJob(merchantId);
}

/**
 * Update merchant agent policy (caps, velocity, allowlist).
 */
export async function updateMerchantPolicy(
  merchantId: string,
  policyInput: unknown,
): Promise<void> {
  const policy = UpdateMerchantPolicySchema.parse(policyInput);

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { agentPolicy: policy },
  });
}

/**
 * Validate an API key and return the merchant if valid.
 * Uses the prefix for O(1) lookup, then compares hashes.
 */
export async function validateApiKey(rawKey: string): Promise<string | null> {
  const prefix = rawKey.substring(0, 16);
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const merchant = await prisma.merchant.findFirst({
    where: { apiKeyPrefix: prefix, status: 'ACTIVE' },
    select: { id: true, apiKeyHash: true },
  });

  if (!merchant) return null;

  const hashBuf = Buffer.from(hash);
  const storedBuf = Buffer.from(merchant.apiKeyHash);

  if (hashBuf.length !== storedBuf.length) return null;
  if (!crypto.timingSafeEqual(hashBuf, storedBuf)) return null;

  return merchant.id;
}

export { triggerManualSync, getMerchantSyncStatus };
