import { prisma } from '../../src/db/client.js';

export async function seedTestMerchant() {
  const merchant = await prisma.merchant.create({
    data: {
      name: 'Test Merchant',
      slug: 'test-merchant',
      email: 'test@example.com',
      apiKeyHash: 'hash1',
      apiKeyPrefix: 'ak_test_1',
      razorpayKeyId: 'rzp_test_xxxxx',
      razorpayKeySecretEncrypted: 'xxxxx',
      fulfillmentWebhookUrl: 'http://localhost:3000/webhook-test',
      webhookSigningSecret: 'whsec_test_xxxxx',
      agentPolicy: {
        perTxnCapPaise: 1000000,
        velocityCapPerHour: 5,
        skuAllowlistMode: 'all',
      },
    },
  });

  const product = await prisma.product.create({
    data: {
      merchantId: merchant.id,
      externalId: 'ext_prod_1',
      title: 'Test Widget',
      description: 'A widget for testing',
      price: 50000,
      agentPurchasable: true,
    },
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      externalId: 'ext_var_1',
      title: 'Default Variant',
      price: 50000,
    },
  });

  // Deliberately stock = 1 for concurrency tests
  await prisma.inventory.create({
    data: {
      variantId: variant.id,
      stock: 1,
    },
  });

  return { merchant, product, variant };
}

export async function seedNormalMerchant() {
  const merchant = await prisma.merchant.create({
    data: {
      name: 'Normal Merchant',
      slug: 'normal-merchant',
      email: 'normal@example.com',
      apiKeyHash: 'hash2',
      apiKeyPrefix: 'ak_test_2',
      razorpayKeyId: 'rzp_test_yyyyy',
      razorpayKeySecretEncrypted: 'yyyyy',
      webhookSigningSecret: 'whsec_test_yyyyy',
      agentPolicy: {
        perTxnCapPaise: 2000000,
        velocityCapPerHour: 10,
        skuAllowlistMode: 'all',
      },
    },
  });

  const product = await prisma.product.create({
    data: {
      merchantId: merchant.id,
      externalId: 'ext_prod_2',
      title: 'Normal Widget',
      description: 'A widget for normal tests',
      price: 30000,
      agentPurchasable: true,
    },
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      externalId: 'ext_var_2',
      title: 'Default Variant',
      price: 30000,
    },
  });

  // stock = 100 for normal flow tests
  await prisma.inventory.create({
    data: {
      variantId: variant.id,
      stock: 100,
    },
  });

  return { merchant, product, variant };
}
