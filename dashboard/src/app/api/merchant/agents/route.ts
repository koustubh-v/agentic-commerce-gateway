import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await req.json();

  const clientId = `acg_${crypto.randomBytes(10).toString('hex')}`;
  const rawSecret = crypto.randomBytes(32).toString('base64url');
  const clientSecretHash = await bcrypt.hash(rawSecret, 10);

  const client = await prisma.agentClient.create({
    data: {
      name: name || 'Agent Client',
      clientId,
      clientSecretHash,
      scopes: ['catalog:read', 'checkout:write', 'checkout:read'],
    },
  });

  return NextResponse.json({
    client,
    clientId,
    clientSecret: rawSecret,
    name: client.name,
  });
}
