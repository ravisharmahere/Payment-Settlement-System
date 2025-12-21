import Redis from 'ioredis';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });
  }

  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}

export async function acquireLock(
  key: string,
  ttl: number = 30
): Promise<boolean> {
  const client = getRedisClient();
  const result = await client.set(key, '1', 'EX', ttl, 'NX');
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

