import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('7d'),

  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

  GATE_DEFAULT_PER_TRANSACTION_CAP_INR: z.coerce.number().default(10000),
  GATE_DEFAULT_PER_SESSION_CAP_INR: z.coerce.number().default(50000),
  GATE_DEFAULT_VELOCITY_TRANSACTIONS_PER_HOUR: z.coerce.number().default(10),

  SYNC_DEFAULT_POLL_INTERVAL_MINUTES: z.coerce.number().default(5),
  SYNC_STALE_AFTER_SECONDS: z.coerce.number().default(600),

  BULLMQ_SYNC_CONCURRENCY: z.coerce.number().default(5),
  BULLMQ_OUTBOX_CONCURRENCY: z.coerce.number().default(10),

  CACHE_PRODUCT_TTL_SECONDS: z.coerce.number().default(300),
  CACHE_INVENTORY_TTL_SECONDS: z.coerce.number().default(60),
  CACHE_CART_TTL_SECONDS: z.coerce.number().default(1800),
  CACHE_ORDER_TTL_SECONDS: z.coerce.number().default(120),

  WEBHOOK_SIGNING_SECRET: z.string().min(32),

  RECONCILER_POLL_INTERVAL_MS: z.coerce.number().default(90000),
  RECONCILER_THRESHOLD_SECONDS: z.coerce.number().default(120),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(' Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
