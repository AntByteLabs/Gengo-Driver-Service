import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3004),

  // PostgreSQL
  PG_HOST: z.string().min(1),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_USER: z.string().min(1),
  PG_PASSWORD: z.string().min(1),
  PG_DATABASE: z.string().min(1),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_GEO_KEY: z.string().min(1).default('drivers:available:geo'),

  // Kafka
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().min(1).default('driver-svc'),
  KAFKA_TOPIC_TRIP_EVENTS: z.string().min(1).default('trip.events'),

  // Auth
  JWT_SECRET: z.string().min(16),

  // Admin
  ADMIN_API_KEY: z.string().min(16),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${formatted}`);
  }
  return result.data;
}

export const config = loadConfig();

export type Config = typeof config;
