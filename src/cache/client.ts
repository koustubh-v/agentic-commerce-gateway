import Redis from 'ioredis';
import { env } from '../config/env.js';

const redisOptions = {
  lazyConnect: true,
  retryStrategy: (times: number) => {
    if (times > 10) return null; // Stop retrying
    return Math.min(times * 100, 3000); // Exponential backoff
  },
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
};

// Primary client — for general use (reads/writes)
export const redis = new Redis(env.REDIS_URL, redisOptions);

// Subscriber client — BullMQ requires a separate client for subscriptions
export const redisSub = new Redis(env.REDIS_URL, redisOptions);

// Separate client for BullMQ worker (it needs its own connection)
export const redisBullMQ = new Redis(env.REDIS_URL, {
  ...redisOptions,
  maxRetriesPerRequest: null, // Required by BullMQ
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.info('[Redis] Connected');
});

export async function connectRedis(): Promise<void> {
  await redis.connect();
  await redisSub.connect();
  await redisBullMQ.connect();
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await redisSub.quit();
  await redisBullMQ.quit();
}
