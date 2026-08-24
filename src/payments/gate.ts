import { prisma } from '../db/client.js';
import { env } from '../config/env.js';

export type GateOutcome = 'APPROVED' | 'REJECTED' | 'REQUIRES_STEP_UP';

export interface GateDecision {
  decision: GateOutcome;
  rule: string;
  limit?: number;
  requested?: number;
  currency?: string;
  message: string;
}

export interface GateContext {
  merchantId: string;
  agentSessionId: string;
  amount: number;
  currency: string;
  cartTotal: number;
  productIds: string[];
  correlationId: string;
  stateHash?: string;
}

interface MerchantPolicy {
  perTransactionCapINR: number;
  perSessionCapINR: number;
  velocityTxPerHour: number;
  allowedSkuCategories?: string[];
}

async function loadPolicy(merchantId: string): Promise<MerchantPolicy> {
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    select: { agentPolicy: true },
  });

  const overrides = merchant.agentPolicy as Partial<MerchantPolicy> | null;

  return {
    perTransactionCapINR: overrides?.perTransactionCapINR ?? env.GATE_DEFAULT_PER_TRANSACTION_CAP_INR,
    perSessionCapINR: overrides?.perSessionCapINR ?? env.GATE_DEFAULT_PER_SESSION_CAP_INR,
    velocityTxPerHour: overrides?.velocityTxPerHour ?? env.GATE_DEFAULT_VELOCITY_TRANSACTIONS_PER_HOUR,
    ...(overrides?.allowedSkuCategories ? { allowedSkuCategories: overrides.allowedSkuCategories } : {}),
  };
}

async function getVelocityCount(agentSessionId: string, merchantId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.paymentIntent.count({
    where: {
      merchantId,
      order: { agentSessionId },
      status: { notIn: ['GATE_REJECTED', 'FAILED', 'PSP_FAILED'] },
      createdAt: { gte: oneHourAgo },
    },
  });
}

async function getSessionSpend(agentSessionId: string, merchantId: string): Promise<number> {
  const result = await prisma.paymentIntent.aggregate({
    where: {
      merchantId,
      order: { agentSessionId },
      status: { in: ['PSP_SUCCEEDED', 'SETTLED', 'FULFILLMENT_TRIGGERED'] },
    },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

export async function runGate(ctx: GateContext): Promise<GateDecision> {
  const policy = await loadPolicy(ctx.merchantId);

  if (Math.abs(ctx.amount - ctx.cartTotal) > 0.01) {
    return {
      decision: 'REJECTED',
      rule: 'amount_drift',
      limit: ctx.cartTotal,
      requested: ctx.amount,
      currency: ctx.currency,
      message: `Amount mismatch: requested ₹${ctx.amount}, server total is ₹${ctx.cartTotal}.`,
    };
  }

  if (ctx.amount > policy.perTransactionCapINR) {
    return {
      decision: 'REJECTED',
      rule: 'per_transaction_cap',
      limit: policy.perTransactionCapINR,
      requested: ctx.amount,
      currency: ctx.currency,
      message: `₹${ctx.amount} exceeds ₹${policy.perTransactionCapINR} per-transaction limit.`,
    };
  }

  const sessionSpend = await getSessionSpend(ctx.agentSessionId, ctx.merchantId);
  const projectedSpend = sessionSpend + ctx.amount;

  if (projectedSpend > policy.perSessionCapINR) {
    return {
      decision: 'REJECTED',
      rule: 'per_session_cap',
      limit: policy.perSessionCapINR,
      requested: projectedSpend,
      currency: ctx.currency,
      message: `Session spend would reach ₹${projectedSpend}, exceeding ₹${policy.perSessionCapINR} limit.`,
    };
  }

  const velocityCount = await getVelocityCount(ctx.agentSessionId, ctx.merchantId);
  if (velocityCount >= policy.velocityTxPerHour) {
    return {
      decision: 'REQUIRES_STEP_UP',
      rule: 'velocity_cap',
      limit: policy.velocityTxPerHour,
      requested: velocityCount + 1,
      message: `${velocityCount} transactions in the last hour (limit: ${policy.velocityTxPerHour}). Human confirmation required.`,
    };
  }

  const nonPurchasable = await prisma.product.findMany({
    where: { id: { in: ctx.productIds }, agentPurchasable: false },
    select: { id: true, title: true },
  });

  if (nonPurchasable.length > 0) {
    const titles = nonPurchasable.map(p => p.title).join(', ');
    return {
      decision: 'REJECTED',
      rule: 'agent_purchasable',
      message: `Products not available for agent purchase: ${titles}.`,
    };
  }

  return {
    decision: 'APPROVED',
    rule: 'all_checks_passed',
    message: `All checks passed. ₹${ctx.amount} approved.`,
  };
}

export async function runPreCaptureGate(
  merchantId: string,
  agentSessionId: string,
  amount: number,
  currency: string,
  productIds: string[],
  correlationId: string,
): Promise<GateDecision> {
  const inventoryChecks = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: { include: { inventory: true } } },
  });

  for (const product of inventoryChecks) {
    for (const variant of product.variants) {
      if (variant.inventory && variant.inventory.stock <= 0) {
        return {
          decision: 'REJECTED',
          rule: 'inventory_depleted_pre_capture',
          message: `${product.title} (${variant.title}) is out of stock. Capture skipped, funds will auto-release.`,
        };
      }
    }
  }

  const policy = await loadPolicy(merchantId);
  const velocityCount = await getVelocityCount(agentSessionId, merchantId);

  if (velocityCount > policy.velocityTxPerHour) {
    return {
      decision: 'REJECTED',
      rule: 'velocity_cap_pre_capture',
      message: `Velocity limit breached by concurrent request. Capture skipped.`,
    };
  }

  return {
    decision: 'APPROVED',
    rule: 'pre_capture_all_passed',
    message: `Pre-capture checks passed. ₹${amount} ready for capture.`,
  };
}
