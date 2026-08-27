'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Queue } from 'bullmq';

// Configure a temporary BullMQ connection to push the sync job
import IORedis from 'ioredis';
const redis = new (IORedis as any)(process.env.REDIS_URL || 'redis://localhost:6379');
const syncQueue = new Queue('acg:sync:products', { connection: redis });

export async function triggerSync(merchantId: string) {
  // Push a job to BullMQ
  await syncQueue.add('sync', {
    merchantId,
    entityType: 'products',
    triggeredBy: 'manual'
  });

  // Revalidate to show updated runs or status eventually
  revalidatePath('/catalog');
}
