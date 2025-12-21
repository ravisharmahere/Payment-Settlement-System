import { Kafka, Producer } from 'kafkajs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { PaymentEvent } from './events';

dotenv.config();

let producer: Producer | null = null;

function getKafkaClient() {
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'payment-settlement-system',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });
}

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    const kafka = getKafkaClient();
    producer = kafka.producer();
    await producer.connect();
    logger.info('Kafka producer connected');
  }
  return producer;
}

export async function publishEvent(
  topic: string,
  event: PaymentEvent
): Promise<void> {
  const producerInstance = await getProducer();
  
  try {
    // Extract key based on event type
    let key = 'unknown';
    if ('paymentId' in event && event.paymentId) {
      key = event.paymentId.toString();
    } else if ('settlementId' in event && event.settlementId) {
      key = event.settlementId.toString();
    } else if ('refundId' in event && event.refundId) {
      key = event.refundId.toString();
    }
    
    await producerInstance.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(event),
        },
      ],
    });
    logger.debug(`Published event to ${topic}:`, event);
  } catch (error) {
    logger.error(`Failed to publish event to ${topic}:`, error);
    throw error;
  }
}

export async function closeProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('Kafka producer disconnected');
  }
}

