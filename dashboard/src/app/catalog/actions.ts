'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Queue } from 'bullmq';

import IORedis from 'ioredis';
const redis = new (IORedis as any)(process.env.REDIS_URL || 'redis://localhost:6379');
const syncQueue = new Queue('acg:sync:products', { connection: redis });

export async function triggerSync(merchantId: string) {
  
  await syncQueue.add('sync', {
    merchantId,
    entityType: 'products',
    triggeredBy: 'manual'
  });

  revalidatePath('/catalog');
}
