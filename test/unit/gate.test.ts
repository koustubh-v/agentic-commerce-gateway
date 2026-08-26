import { runGate } from '../../src/payments/gate.js';
import { buildGateContext } from '../helpers/buildContext.js';

describe('runGate (Money-Action Gate)', () => {
  it('rejects when amount exceeds per-transaction cap', async () => {
    const ctx = buildGateContext({
      serverCartTotalPaise: 1500000,
      agentStatedTotalPaise: 1500000,
      policy: { perTxnCapPaise: 1000000, velocityCapPerHour: 5, skuAllowlistMode: 'all' },
    });
    const result = await runGate(ctx);
    expect(result.decision).toBe('REJECTED');
    expect(result.message).toMatch(/exceeds/i);
    expect(result.rule).toBe('PER_TXN_CAP');
  });

  it('rejects on amount drift between agent-stated and server-computed total', async () => {
    const ctx = buildGateContext({
      agentStatedTotalPaise: 50000,
      serverCartTotalPaise: 65000,
    });
    const result = await runGate(ctx);
    expect(result.decision).toBe('REJECTED');
    expect(result.rule).toBe('AMOUNT_DRIFT');
  });

  it('rejects when SKU is not agent-purchasable', async () => {
    const ctx = buildGateContext({
      items: [
        {
          productId: 'prod_1',
          variantId: 'var_1',
          quantity: 1,
          agentPurchasable: false, // The critical check
        },
      ],
    });
    const result = await runGate(ctx);
    expect(result.decision).toBe('REJECTED');
    expect(result.rule).toBe('SKU_ALLOWLIST');
  });

  it('approves when all checks pass and returns explainable reason string', async () => {
    const ctx = buildGateContext(); // Default valid context
    const result = await runGate(ctx);
    expect(result.decision).toBe('APPROVED');
    expect(result.message).toBeTruthy(); // Never empty
  });
});
