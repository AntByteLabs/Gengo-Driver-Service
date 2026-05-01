// Load env first — config.ts validates all required vars on import
import './config.js';
import { config } from './config.js';
import http from 'http';
import { createApp } from './server.js';
import { getPool, closePg } from './infrastructure/pg.js';
import { getRedis, closeRedis } from './infrastructure/redis.js';
import { getProducer, closeKafka } from './infrastructure/kafka.js';

async function bootstrap(): Promise<void> {
  // Warm up infrastructure connections
  await Promise.all([
    getPool().query('SELECT 1').then(() => console.log('[pg] connected')),
    getRedis().ping().then(() => console.log('[redis] ping ok')),
    getProducer(), // establishes Kafka producer connection
  ]);

  const app = createApp();
  const server = http.createServer(app);

  server.listen(config.PORT, () => {
    console.log(
      `[driver-svc] listening on port ${config.PORT} (${config.NODE_ENV})`,
    );
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[driver-svc] ${signal} received — shutting down gracefully`);
    server.close(async () => {
      await Promise.allSettled([closePg(), closeRedis(), closeKafka()]);
      console.log('[driver-svc] shutdown complete');
      process.exit(0);
    });

    // Force exit after 10s if connections are stuck
    setTimeout(() => {
      console.error('[driver-svc] forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[driver-svc] unhandledRejection', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[driver-svc] uncaughtException', err);
    process.exit(1);
  });
}

bootstrap().catch((err: unknown) => {
  console.error('[driver-svc] failed to start', err);
  process.exit(1);
});
