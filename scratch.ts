import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();
const API_BASE = 'http://127.0.0.1:3000/acp';

async function run() {
  const rawSecret = 'demo_secret_' + Date.now();
  const hash = await bcrypt.hash(rawSecret, 10);
  
  const client = await prisma.agentClient.create({
    data: {
      name: 'Test Client',
      clientId: 'agent_' + crypto.randomBytes(8).toString('hex'),
      clientSecretHash: hash,
      scopes: ['catalog:read', 'checkout:write']
    }
  });

  const authRes = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: client.clientId,
      client_secret: rawSecret
    })
  });
  
  const text = await authRes.text();
  console.log('STATUS:', authRes.status);
  console.log('RESPONSE:', text);
}

run().catch(console.error).finally(()=>prisma.$disconnect());
