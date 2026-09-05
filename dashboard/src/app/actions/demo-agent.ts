'use server';

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const API_BASE = 'http://127.0.0.1:3000/acp';

export async function runAgentDemo(prompt: string) {
  try {
    const merchant = await prisma.merchant.findFirst();
    if (!merchant) {
      return { success: false, reason: 'No merchant found. Please connect your store first.', rule: 'system' };
    }

    const rawSecret = 'demo_secret_' + Date.now();
    const hash = await bcrypt.hash(rawSecret, 10);
    
    const client = await prisma.agentClient.create({
      data: {
        name: 'Demo Web Agent',
        clientId: 'agent_web_' + crypto.randomBytes(4).toString('hex'),
        clientSecretHash: hash,
        scopes: ['catalog:read', 'checkout:write']
      }
    });

    // Authenticate
    const authRes = await fetch(`${API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: rawSecret
      }),
      cache: 'no-store'
    });
    
    if (!authRes.ok) return { success: false, reason: 'Authentication failed with ACP.', rule: 'system' };
    const { access_token } = await authRes.json();

    // Extract keywords and search
    const ignoreWords = ['buy', 'some', 'a', 'an', 'the', 'for', 'me', 'cheap', 'expensive'];
    const keywords = prompt.split(' ').filter(w => !ignoreWords.includes(w.toLowerCase()) && w.length > 2);
    
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
      return { success: false, reason: `The AI could not find any products matching "${prompt}" in your store.`, rule: 'catalog_search' };
    }

    // Checkout
    const checkoutRes = await fetch(`${API_BASE}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      },
      body: JSON.stringify({
        merchantId: merchant.id,
        items: [{ productId: product.id, quantity: 1 }]
      }),
      cache: 'no-store'
    });

    const responseData = await checkoutRes.json();

    if (!checkoutRes.ok) {
      if (checkoutRes.status === 403) {
        return { 
          success: false, 
          reason: responseData.error || 'Blocked by Gate Guardian', 
          rule: responseData.rule || 'unknown_rule',
          productTitle: product.title,
          productPrice: product.price
        };
      }
      return { success: false, reason: 'Checkout API failed', rule: 'system' };
    }

    return { 
      success: true, 
      checkoutUrl: `/checkout/${responseData.checkoutToken}`,
      productTitle: product.title,
      productPrice: product.price
    };

  } catch (err: any) {
    return { success: false, reason: err.message || 'Internal error', rule: 'system' };
  }
}
