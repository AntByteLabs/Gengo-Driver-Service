// Load env first — config.ts validates all required vars on import
import './config.js';
import { config } from './config.js';
import http from 'http';
import { createApp } from './server.js';
import { getPool, closePg } from './infrastructure/pg.js';
import { getRedis, closeRedis } from './infrastructure/redis.js';
import { getProducer, closeKafka } from './infrastructure/kafka.js';
import { logger } from './infrastructure/logger.js';

async function bootstrap(): Promise<void> {
  // Warm up infrastructure connections
  await Promise.all([
    getPool().query('SELECT 1').then(() => logger.info('pg connected')),
    getRedis().ping().then(() => logger.info('redis ping ok')),
    getProducer(), // establishes Kafka producer connection
  ]);

  const app = createApp();
  const server = http.createServer(app);

  server.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      'driver-svc listening',
    );
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutdown signal received');
    server.close(async () => {
      await Promise.allSettled([closePg(), closeRedis(), closeKafka()]);
      logger.info('shutdown complete');
      process.exit(0);
    });

    // Force exit after 10s if connections are stuck
    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    process.exit(1);
  });
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
