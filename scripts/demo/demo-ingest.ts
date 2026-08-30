import { PrismaClient } from '@prisma/client';
import { normalizeProducts } from '../../src/ingestion/normalizer.js';
import type { RawProduct } from '../../src/ingestion/adapters/modeA/config-schema.js';

const prisma = new PrismaClient();

async function run() {
  console.log('\n [ACG DEMO] Starting High-Volume Catalog Ingestion...\n');

  let merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    console.error(' No merchant found in the database. Please create a merchant first.');
    process.exit(1);
  }

  console.log(` Bound to Merchant: ${merchant.name} (${merchant.id})`);
  console.log(`\n Simulating fetch of 9,000+ products from Legacy Merchant API...`);

  await new Promise(r => setTimeout(r, 1500));

  const rawProducts: RawProduct[] = [];
  const TOTAL_PRODUCTS = 9250;
  
  for (let i = 0; i < TOTAL_PRODUCTS; i++) {
    rawProducts.push({
      __acg_id: `prod_${i}`,
      __acg_title: `Demo Product ${i}`,
      __acg_price: (Math.random() * 10000 + 100).toFixed(2),
      __acg_stock: Math.floor(Math.random() * 500),
      __acg_category: i % 3 === 0 ? 'Electronics' : i % 3 === 1 ? 'Apparel' : 'Home',
      __acg_brand: 'Buildathon Demo'
    });
  }

  console.log(` Fetched ${TOTAL_PRODUCTS} items from legacy API.`);
  console.log(`\n Passing raw payload through ACG Normalizer & Translation Layer...`);
  
  const startTime = Date.now();

  const normalized = normalizeProducts(rawProducts, merchant.id);
  
  const normalizationTime = Date.now() - startTime;
  console.log(` Translated ${normalized.length} items to canonical ACG IR in ${normalizationTime}ms.`);

  console.log(`\n Batch inserting into PostgreSQL via Prisma...`);

  const insertStart = Date.now();

  await prisma.product.deleteMany({
    where: { externalId: { startsWith: 'prod_' }, merchantId: merchant.id }
  });

  const productsToInsert = normalized.map(p => ({
    merchantId: p.merchantId,
    externalId: p.externalId,
    title: p.title,
    description: p.description ?? '',
    category: p.category ?? 'Uncategorized',
    price: p.price,
    currency: p.currency,
    status: p.status,
    availability: p.availability,
    agentPurchasable: p.agentPurchasable
  }));

  const CHUNK_SIZE = 1000;
  for (let i = 0; i < productsToInsert.length; i += CHUNK_SIZE) {
    const chunk = productsToInsert.slice(i, i + CHUNK_SIZE);
    await prisma.product.createMany({
      data: chunk,
      skipDuplicates: true
    });
    process.stdout.write(`  ...inserted chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(productsToInsert.length / CHUNK_SIZE)}\r`);
  }

  const insertTime = Date.now() - insertStart;
  console.log(`\n\n Successfully persisted ${productsToInsert.length} products to database in ${insertTime}ms.`);
  console.log('\n Demo Ingestion Complete! Catalog is now Agent-Ready.\n');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
