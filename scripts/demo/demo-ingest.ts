import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('\n [ACG DEMO] Starting High-Volume Catalog Ingestion...\n');

  const targetMerchantId = process.env.TARGET_MERCHANT_ID;
  let merchant;
  if (targetMerchantId) {
    merchant = await prisma.merchant.findUnique({ where: { id: targetMerchantId } });
  } else {
    merchant = await prisma.merchant.findFirst();
  }

  if (!merchant) {
    console.error(' No merchant found in the database. Please create a merchant first.');
    process.exit(1);
  }

  const syncConfig = await prisma.merchantSyncConfig.findUnique({
    where: { merchantId: merchant.id }
  });

  if (!syncConfig || !syncConfig.productsEndpoint) {
    console.error(' Merchant has not configured a Products Endpoint yet! Please connect your store in the dashboard.');
    process.exit(1);
  }

  console.log(` Bound to Merchant: ${merchant.name} (${merchant.id})`);
  console.log(` Target Endpoint: ${syncConfig.productsEndpoint}`);
  console.log(`\n Fetching real products from Merchant API...`);

  let page = 1;
  const limit = 100;
  let hasMore = true;
  let allProducts: any[] = [];
  
  const startTime = Date.now();

  try {
    while (hasMore) {
      const url = `${syncConfig.productsEndpoint}?page=${page}&limit=${limit}`;
      process.stdout.write(`  ...fetching page ${page}\r`);
      const res = await fetch(url);
      
      if (!res.ok) {
        throw new Error(`API responded with status: ${res.status}`);
      }

      const payload = await res.json();
      const data = payload.data || [];
      allProducts = allProducts.concat(data);
      
      hasMore = payload.has_more === true;
      page++;
    }
  } catch (err: any) {
    console.error(`\n Error fetching products: ${err.message}`);
    process.exit(1);
  }

  const fetchTime = Date.now() - startTime;
  console.log(`\n Fetched ${allProducts.length} items from real merchant API in ${fetchTime}ms.`);

  console.log(`\n Passing raw payload through ACG Normalizer & Translation Layer...`);
  
  const normStartTime = Date.now();
  
  // Normalizing the merchant's specific format to ACG Canonical IR
  const normalized = allProducts.map((p) => ({
    merchantId: merchant.id,
    externalId: String(p.external_id),
    title: String(p.name).trim(),
    description: p.description ? String(p.description).trim() : '',
    category: p.categories && p.categories.length > 0 ? String(p.categories[0]) : 'Uncategorized',
    price: typeof p.price_in_cents === 'number' ? p.price_in_cents / 100 : 0,
    currency: p.currency || 'USD',
    status: 'ACTIVE',
    availability: p.in_stock ? 'IN_STOCK' : 'OUT_OF_STOCK',
    agentPurchasable: true
  }));
  
  const normalizationTime = Date.now() - normStartTime;
  console.log(` Translated ${normalized.length} items to canonical ACG IR in ${normalizationTime}ms.`);

  console.log(`\n Batch inserting into PostgreSQL via Prisma...`);

  const insertStart = Date.now();

  // Clear existing products for this merchant to simulate fresh sync
  await prisma.product.deleteMany({
    where: { merchantId: merchant.id }
  });

  const CHUNK_SIZE = 1000;
  for (let i = 0; i < normalized.length; i += CHUNK_SIZE) {
    const chunk = normalized.slice(i, i + CHUNK_SIZE);
    await prisma.product.createMany({
      data: chunk as any,
      skipDuplicates: true
    });
    process.stdout.write(`  ...inserted chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(normalized.length / CHUNK_SIZE)}\r`);
  }

  const insertTime = Date.now() - insertStart;
  console.log(`\n\n Successfully persisted ${normalized.length} products to database in ${insertTime}ms.`);
  console.log('\n Demo Ingestion Complete! Catalog is now Agent-Ready.\n');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
