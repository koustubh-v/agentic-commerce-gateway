import { prisma } from '../../src/db/client.js';
import { seedNormalMerchant } from '../fixtures/seed.js';
import { commerceCreateCart, commerceAddItem, commerceInitiateCheckout } from '../../src/commerce/actions.js';
import { CartStateError } from '../../src/commerce/errors.js';

describe('State Hash (TOCTOU Defense)', () => {
  let merchant: any, variant: any;

  beforeAll(async () => {
    const fixtures = await seedNormalMerchant();
    merchant = fixtures.merchant;
    variant = fixtures.variant;
  });

  afterAll(async () => {
    await prisma.cart.deleteMany({});
    await prisma.merchant.deleteMany({});
  });

  it('rejects checkout if price changed after cart was hashed', async () => {
    const cart = await commerceCreateCart(merchant.id, 'session_1');
    const snapshot = await commerceAddItem(cart.id, variant.productId, variant.id, 1);
    
    // Simulate malicious or delayed price shift on the merchant side
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { price: 999999 }, // Price increases dramatically
    });

    // Agent attempts checkout with the old, cheaper stateHash
    await expect(
      commerceInitiateCheckout(cart.id, snapshot.stateHash, 'idem-hash-1', 'session_1')
    ).rejects.toThrow(CartStateError);
  });
});
