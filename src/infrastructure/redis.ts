import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    client.on('error', (err) => {
      logger.error({ err }, 'redis client error');
    });

    client.on('connect', () => {
      logger.info('redis connected');
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
