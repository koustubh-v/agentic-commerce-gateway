'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export async function createAgentClient() {
  const clientId = `acg_test_${crypto.randomBytes(8).toString('hex')}`;
  const rawSecret = crypto.randomBytes(32).toString('base64');
  
  const clientSecretHash = await bcrypt.hash(rawSecret, 10);

  await prisma.agentClient.create({
    data: {
      name: 'Agent ' + clientId.substring(9, 13),
      clientId,
      clientSecretHash,
      scopes: ['catalog:read', 'checkout:write', 'checkout:read'],
    }
  });

  // In a real app we'd display the raw secret ONCE to the user.
  // For this demo, we'll just revalidate the list.
  
  revalidatePath('/agents');
}
