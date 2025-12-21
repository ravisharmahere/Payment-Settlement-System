import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

function getKafkaClient() {
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'payment-settlement-system',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });
}

export async function createConsumer(
  groupId: string,
  topics: string[]
): Promise<Consumer> {
  const kafka = getKafkaClient();
  const consumer = kafka.consumer({ groupId });
  
  await consumer.connect();
  logger.info(`Kafka consumer connected (groupId: ${groupId})`);

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
    logger.info(`Subscribed to topic: ${topic}`);
  }

  return consumer;
}

export async function consumeMessages(
  consumer: Consumer,
  handler: (payload: EachMessagePayload) => Promise<void>
): Promise<void> {
  await consumer.run({
    eachMessage: async (payload) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error('Error processing message:', error);
        // In production, you might want to send to a dead letter queue
      }
    },
  });
}

