'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getMerchantPolicy() {
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) return null;

  const policy = merchant.agentPolicy as Record<string, any> || {};

  return {
    perTransactionCapINR: policy.perTransactionCapINR ?? 10000,
    perSessionCapINR: policy.perSessionCapINR ?? 50000,
    velocityTxPerHour: policy.velocityTxPerHour ?? 10,
  };
}

export async function updateMerchantPolicy(policyUpdate: any) {
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) throw new Error('No merchant found');

  const currentPolicy = (merchant.agentPolicy as Record<string, any>) || {};
  const newPolicy = { ...currentPolicy, ...policyUpdate };

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { agentPolicy: newPolicy }
  });

  revalidatePath('/demo');
  return true;
}
