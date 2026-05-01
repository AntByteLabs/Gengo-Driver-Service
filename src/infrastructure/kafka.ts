import { Kafka, Producer, logLevel } from 'kafkajs';
import { config } from '../config.js';

let producer: Producer | null = null;
let kafka: Kafka | null = null;

function getKafka(): Kafka {
  if (!kafka) {
    kafka = new Kafka({
      clientId: config.KAFKA_CLIENT_ID,
      brokers: config.KAFKA_BROKERS.split(',').map((b) => b.trim()),
      logLevel: logLevel.WARN,
    });
  }
  return kafka;
}

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = getKafka().producer({
      allowAutoTopicCreation: false,
      idempotent: true,
    });
    await producer.connect();
    console.log('[kafka] producer connected');
  }
  return producer;
}

export async function publishEvent(
  topic: string,
  key: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify({ ...payload, publishedAt: Date.now() }),
      },
    ],
  });
}

export async function closeKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
