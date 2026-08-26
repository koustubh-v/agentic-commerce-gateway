export function buildGateContext(overrides: any = {}) {
  return {
    cartId: overrides.cartId || 'cart_123',
    agentId: overrides.agentId || 'agent_abc',
    merchantId: overrides.merchantId || 'merchant_xyz',
    agentStatedTotalPaise: overrides.agentStatedTotalPaise || 50000,
    serverCartTotalPaise: overrides.serverCartTotalPaise || 50000,
    currency: 'INR',
    items: overrides.items || [
      {
        productId: 'prod_1',
        variantId: 'var_1',
        quantity: 1,
        agentPurchasable: true,
      },
    ],
    policy: overrides.policy || {
      perTxnCapPaise: 1000000,
      velocityCapPerHour: 5,
      skuAllowlistMode: 'all',
    },
    ...overrides,
  };
}
