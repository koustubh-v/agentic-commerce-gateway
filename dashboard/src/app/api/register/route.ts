import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, websiteUrl } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const rawApiKey = `ak_live_${crypto.randomBytes(16).toString('hex')}`;
    const apiKeyHash = await bcrypt.hash(rawApiKey, 10);
    const apiKeyPrefix = rawApiKey.slice(0, 10);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + crypto.randomBytes(3).toString('hex');

    const result = await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          name,
          slug,
          email,
          websiteUrl: websiteUrl || null,
          status: 'ONBOARDING',
          apiKeyHash,
          apiKeyPrefix,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'merchant',
          merchantId: merchant.id,
        },
      });

      return { merchant, user };
    });

    return NextResponse.json({
      success: true,
      merchantId: result.merchant.id,
      apiKey: rawApiKey, 
    });
  } catch (err: any) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
