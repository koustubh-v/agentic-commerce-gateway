import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'child_process';
import { prisma } from '../src/db/client.js';
import { disconnectRedis } from '../src/cache/client.js';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;

export default async function globalSetup() {
  console.log('\\n[Setup] Starting Testcontainers (PostgreSQL + Redis)...');

  // Start containers in parallel
  [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const dbUri = pgContainer.getConnectionUri();
  const redisUri = redisContainer.getConnectionUrl();

  process.env.DATABASE_URL = dbUri;
  process.env.REDIS_URL = redisUri;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_xxxxx';
  process.env.RAZORPAY_KEY_SECRET = 'xxxxx';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_xxxxx';
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.HOST = '127.0.0.1';

  console.log('[Setup] Containers running. Applying Prisma migrations...');

  // Run Prisma migrations against the fresh test database
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: dbUri },
    stdio: 'inherit',
  });

  console.log('[Setup] Migrations complete.');

  // Store connection URLs for use in individual test files if needed
  (globalThis as any).__DATABASE_URL__ = dbUri;
  (globalThis as any).__REDIS_URL__ = redisUri;
}

export async function teardown() {
  await prisma.$disconnect();
  await disconnectRedis();
  
  if (pgContainer) {
    await pgContainer.stop();
  }
  if (redisContainer) {
    await redisContainer.stop();
  }
}
