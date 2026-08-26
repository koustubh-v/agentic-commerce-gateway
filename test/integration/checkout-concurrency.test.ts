import { prisma } from '../../src/db/client.js';
import { seedTestMerchant } from '../fixtures/seed.js';
import { commerceCreateCart, commerceAddItem, commerceInitiateCheckout } from '../../src/commerce/actions.js';
import { InventoryLockError } from '../../src/commerce/errors.js';
import { disconnectRedis } from '../../src/cache/client.js';

describe('Checkout Concurrency (Last Unit Race)', () => {
  let merchant: any, variant: any;

  beforeAll(async () => {
    // Requires Testcontainers to be running
    const fixtures = await seedTestMerchant();
    merchant = fixtures.merchant;
    variant = fixtures.variant;
  });

  afterAll(async () => {
    await prisma.cart.deleteMany({});
    await prisma.merchant.deleteMany({});
  });

  it('only one of two concurrent checkouts succeeds on stock of 1', async () => {
    // 1. Agent A and Agent B both create a cart and add the same variant (stock: 1)
    const cartA = await commerceCreateCart(merchant.id, 'session_A');
    const cartB = await commerceCreateCart(merchant.id, 'session_B');

    const snapshotA = await commerceAddItem(cartA.id, variant.productId, variant.id, 1);
    const snapshotB = await commerceAddItem(cartB.id, variant.productId, variant.id, 1);

    // 2. Both attempt to initiate checkout at the exact same millisecond
    const promiseA = commerceInitiateCheckout(cartA.id, snapshotA.stateHash, 'idem-agentA', 'session_A');
    const promiseB = commerceInitiateCheckout(cartB.id, snapshotB.stateHash, 'idem-agentB', 'session_B');

    const results = await Promise.allSettled([promiseA, promiseB]);

    // 3. Exactly one should succeed, exactly one should fail with InventoryLockError
    const successes = results.filter((r) => r.status === 'fulfilled');
    const rejections = results.filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    const error = (rejections[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(InventoryLockError);
  });
});
