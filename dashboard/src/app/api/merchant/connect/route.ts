import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
      },
    });
  });

  return NextResponse.json({ success: true });
}
