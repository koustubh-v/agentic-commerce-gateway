import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();
const API_BASE = 'http://127.0.0.1:3000/acp';

async function run() {
  const prompt = process.argv.slice(2).join(' ') || 'earphones';
  console.log(`\n [AI AGENT] Waking up with task: "Buy ${prompt}"`);

  const targetMerchantId = process.env.TARGET_MERCHANT_ID;
  let merchant;
  if (targetMerchantId) {
    merchant = await prisma.merchant.findUnique({ where: { id: targetMerchantId } });
  } else {
    merchant = await prisma.merchant.findFirst();
  }

  if (!merchant) {
    console.error(' No merchant found. Run demo-ingest.ts first.');
    process.exit(1);
  }

  const rawSecret = 'demo_secret_' + Date.now();
  const hash = await bcrypt.hash(rawSecret, 10);
  
  const client = await prisma.agentClient.create({
    data: {
      name: 'Demo Shopping Agent',
      clientId: 'agent_' + crypto.randomBytes(8).toString('hex'),
      clientSecretHash: hash,
      scopes: ['catalog:read', 'checkout:write']
    }
  });

  console.log(`\n Authenticating with ACG as "${client.name}"...`);
  const authRes = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: client.clientId,
      client_secret: rawSecret
    })
  });
  
  if (!authRes.ok) throw new Error('Authentication failed');
  const { access_token } = await authRes.json();
  console.log(' Access token acquired.');

  // Dynamically extract keywords from the prompt to search the catalog
  const ignoreWords = ['buy', 'some', 'a', 'an', 'the', 'for', 'me', 'cheap', 'expensive'];
  const keywords = prompt.split(' ').filter(w => !ignoreWords.includes(w.toLowerCase()) && w.length > 2);
  
  console.log(` [AI AGENT] Analyzing catalog for keywords: [${keywords.join(', ')}]...`);

  let product = null;
  for (const kw of keywords) {
    product = await prisma.product.findFirst({
      where: { 
        merchantId: merchant.id, 
        status: 'ACTIVE',
        title: { contains: kw, mode: 'insensitive' }
      }
    });
    if (product) break;
  }
  
  if (!product) {
    console.error(`\n Error: The AI could not find any products matching "${prompt}" in your store.`);
    console.error(' Try running with a different product name that exists in your synced catalog.');
    process.exit(1);
  }

  console.log(`\n Found product: ${product.title} - ₹${product.price}`);
  console.log(' Attempting to purchase via Agent Commerce Gateway...');

  const checkoutRes = await fetch(`${API_BASE}/checkout_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`
    },
    body: JSON.stringify({
      merchantId: merchant.id,
      items: [{ productId: product.id, quantity: 1 }]
    })
  });

  const responseData = await checkoutRes.json();

  if (!checkoutRes.ok) {
    if (checkoutRes.status === 403) {
      console.log('\n======================================================');
      console.log(' GATEWAY BLOCKED TRANSACTION');
      console.log('======================================================');
      console.log(`Reason: ${responseData.error}`);
      console.log(`Rule Enforced: ${responseData.rule}`);
      console.log('======================================================\n');
      console.log(' Demo tip: Check your Merchant Dashboard Audit logs. The block was recorded instantly.');
    } else {
      console.error(' Error:', responseData);
    }
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log(' GATEWAY APPROVED');
  console.log('======================================================');
  console.log('Razorpay provisioning successful.');
  console.log(`Gateway Order ID: ${responseData.checkoutSessionId}`);

  const checkoutUrl = `http://localhost:3001/checkout/${responseData.checkoutToken}`;
  console.log(`\n Human-in-the-loop Checkout Link:\n${checkoutUrl}`);
  console.log('======================================================\n');
  
  console.log(' Demo tip: Open the link above to complete the Razorpay payment, then check your Merchant Dashboard!');

  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
