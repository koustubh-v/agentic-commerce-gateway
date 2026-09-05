import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { exec } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const merchantId = session.user.merchantId;
  const body = await req.json();

  const { productsEndpoint, authType, authConfig, productsArrayPath, fieldMap, pollIntervalMs, currency } = body;

  if (!productsEndpoint) return NextResponse.json({ error: 'Products endpoint is required' }, { status: 400 });

  await prisma.$transaction(async (tx) => {

    await tx.merchantSyncConfig.upsert({
      where: { merchantId },
      create: {
        merchantId,
        productsEndpoint,
        authType: authType || 'none',
        productsArrayPath: productsArrayPath || '$',
        fieldMap: fieldMap || {},
        pollIntervalMs: pollIntervalMs || 300000,
      },
      update: {
        productsEndpoint,
        authType: authType || 'none',
        productsArrayPath: productsArrayPath || '$',
        fieldMap: fieldMap || {},
        pollIntervalMs: pollIntervalMs || 300000,
        circuitState: 'CLOSED',
        consecutiveFailures: 0,
      },
    });

    await tx.merchant.update({
      where: { id: merchantId },
      data: { 
        status: 'ACTIVE',
        currency: currency || 'INR',
        fulfillmentWebhookUrl: process.env.DEMO_MERCHANT_WEBHOOK_URL || 'http://localhost:8002/api/webhooks/acg',
        webhookSigningSecret: process.env.DEMO_MERCHANT_WEBHOOK_SECRET || 'local-demo-secret'
      }
    });
  });

  // Spawn ingestion process in the background
  const rootDir = path.join(process.cwd(), '..');
  exec('npm run demo:ingest', { 
    cwd: rootDir,
    env: { ...process.env, TARGET_MERCHANT_ID: merchantId }
  }, (err, stdout, stderr) => {
    if (err) console.error('[Auto-Ingest Error]', err);
    else console.log('[Auto-Ingest Started]', stdout);
  });

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const merchantId = session.user.merchantId;
  const config = await prisma.merchantSyncConfig.findUnique({
    where: { merchantId },
  });

  return NextResponse.json({
    productsEndpoint: config?.productsEndpoint || '',
    authType: config?.authType || 'none',
  });
}
