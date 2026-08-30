import Redis from 'ioredis';
import { env } from '../config/env.js';

const redisOptions = {
  lazyConnect: true,
  retryStrategy: (times: number) => {
    if (times > 10) return null; 
    return Math.min(times * 100, 3000); 
  },
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
};

export const redis = new Redis(env.REDIS_URL, redisOptions);

export const redisSub = new Redis(env.REDIS_URL, redisOptions);

export const redisBullMQ = new Redis(env.REDIS_URL, {
  ...redisOptions,
  maxRetriesPerRequest: null, 
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.info('[Redis] Connected');
});

export async function connectRedis(): Promise<void> {
  try { if (redis.status !== 'ready' && redis.status !== 'connecting') await redis.connect(); } catch (e) {}
  try { if (redisSub.status !== 'ready' && redisSub.status !== 'connecting') await redisSub.connect(); } catch (e) {}
  try { if (redisBullMQ.status !== 'ready' && redisBullMQ.status !== 'connecting') await redisBullMQ.connect(); } catch (e) {}
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await redisSub.quit();
  await redisBullMQ.quit();
}
