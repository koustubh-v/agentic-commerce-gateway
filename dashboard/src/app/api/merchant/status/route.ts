import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const merchantId = session.user.merchantId;

  // Check if they have a sync config
  const config = await prisma.merchantSyncConfig.findUnique({
    where: { merchantId }
  });

  if (!config?.productsEndpoint) {
    return NextResponse.json({ isConnected: false, productCount: 0 });
  }

  // Get current product count
  const productCount = await prisma.product.count({
    where: { merchantId }
  });

  return NextResponse.json({ 
    isConnected: true, 
    productCount 
  });
}
