import { prisma } from '../db/client.js';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Money-Action Gate
//
// Every payment action passes through this gate BEFORE any PSP call is made.
// The gate is a separate module — independently auditable.
// Produces one of three outcomes: APPROVED | REJECTED | REQUIRES_STEP_UP
// Every decision has a structured reason written to the audit trail.
// ---------------------------------------------------------------------------

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
  amount: number;           // Server-side recomputed total (never trust client)
  currency: string;
  cartTotal: number;        // Cart total as stored in DB
  productIds: string[];
  correlationId: string;
}

interface MerchantPolicy {
  perTransactionCapINR: number;
  perSessionCapINR: number;
  velocityTxPerHour: number;
  allowedSkuCategories?: string[];
}

/**
 * Load policy for a merchant.
 * Falls back to platform-level defaults if merchant has no override.
 */
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

/**
 * Count how many transactions this agent has successfully initiated in the last hour.
 */
async function getVelocityCount(agentSessionId: string, merchantId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  return prisma.paymentIntent.count({
    where: {
      merchantId,
      order: { agentSessionId },
      status: {
        notIn: ['GATE_REJECTED', 'FAILED', 'PSP_FAILED'],
      },
      createdAt: { gte: oneHourAgo },
    },
  });
}

/**
 * Get cumulative spend for an agent session.
 */
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

// ---------------------------------------------------------------------------
// The Gate — single entry point
// ---------------------------------------------------------------------------

/**
 * Run all gate checks for a checkout request.
 * Returns the first failing check, or APPROVED if all pass.
 *
 * Rules evaluated in order:
 * 1. Amount drift check (server-side total ≠ client stated amount)
 * 2. Per-transaction cap
 * 3. Per-session cumulative spend cap
 * 4. Velocity cap (N transactions per hour)
 * 5. SKU allowlist (if configured)
 * 6. Agent-purchasable flag on all products
 */
export async function runGate(ctx: GateContext): Promise<GateDecision> {
  const policy = await loadPolicy(ctx.merchantId);

  // ---------------------------------------------------------------------------
  // Rule 1: Amount drift — server-recomputed total must match cart total in DB
  // Never trust agent-stated amounts.
  // ---------------------------------------------------------------------------
  if (Math.abs(ctx.amount - ctx.cartTotal) > 0.01) {
    return {
      decision: 'REJECTED',
      rule: 'amount_drift',
      limit: ctx.cartTotal,
      requested: ctx.amount,
      currency: ctx.currency,
      message: `Amount mismatch: agent requested ₹${ctx.amount}, but server-computed cart total is ₹${ctx.cartTotal}. Please re-fetch the cart and retry with the correct amount.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Rule 2: Per-transaction cap
  // ---------------------------------------------------------------------------
  if (ctx.amount > policy.perTransactionCapINR) {
    return {
      decision: 'REJECTED',
      rule: 'per_transaction_cap',
      limit: policy.perTransactionCapINR,
      requested: ctx.amount,
      currency: ctx.currency,
      message: `Cart total ₹${ctx.amount} exceeds the ₹${policy.perTransactionCapINR} per-transaction limit set by merchant policy for agent-initiated purchases.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Rule 3: Per-session cumulative spend cap
  // ---------------------------------------------------------------------------
  const sessionSpend = await getSessionSpend(ctx.agentSessionId, ctx.merchantId);
  const projectedSpend = sessionSpend + ctx.amount;

  if (projectedSpend > policy.perSessionCapINR) {
    return {
      decision: 'REJECTED',
      rule: 'per_session_cap',
      limit: policy.perSessionCapINR,
      requested: projectedSpend,
      currency: ctx.currency,
      message: `This purchase would bring session spend to ₹${projectedSpend}, exceeding the ₹${policy.perSessionCapINR} per-session limit. Requires explicit human confirmation to proceed.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Rule 4: Velocity cap
  // ---------------------------------------------------------------------------
  const velocityCount = await getVelocityCount(ctx.agentSessionId, ctx.merchantId);

  if (velocityCount >= policy.velocityTxPerHour) {
    return {
      decision: 'REQUIRES_STEP_UP',
      rule: 'velocity_cap',
      limit: policy.velocityTxPerHour,
      requested: velocityCount + 1,
      message: `This agent session has initiated ${velocityCount} transactions in the last hour (limit: ${policy.velocityTxPerHour}). Explicit human confirmation required before continuing.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Rule 5: Agent-purchasable flag
  // ---------------------------------------------------------------------------
  const nonPurchasable = await prisma.product.findMany({
    where: {
      id: { in: ctx.productIds },
      agentPurchasable: false,
    },
    select: { id: true, title: true },
  });

  if (nonPurchasable.length > 0) {
    const titles = nonPurchasable.map((p) => p.title).join(', ');
    return {
      decision: 'REJECTED',
      rule: 'agent_purchasable',
      message: `The following products are not available for agent-initiated purchases: ${titles}. The merchant has restricted these to human checkout only.`,
    };
  }

  // ---------------------------------------------------------------------------
  // All rules passed
  // ---------------------------------------------------------------------------
  return {
    decision: 'APPROVED',
    rule: 'all_checks_passed',
    message: `All gate checks passed. Transaction approved for ₹${ctx.amount}.`,
  };
}
