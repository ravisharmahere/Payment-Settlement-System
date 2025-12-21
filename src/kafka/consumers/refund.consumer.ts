import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer, consumeMessages } from '../consumer';
import { RefundInitiatedEvent } from '../events';
import { logger } from '../../utils/logger';

export async function startRefundConsumer(): Promise<void> {
  const consumer = await createConsumer('refund-worker', ['refunds']);

  await consumeMessages(consumer, async (payload: EachMessagePayload) => {
    try {
      const message = JSON.parse(payload.message.value?.toString() || '{}');
      
      if (message.type === 'refunds.initiated') {
        const event = message as RefundInitiatedEvent;
        logger.info(`Refund ${event.refundId} processed for payment ${event.paymentId}`);
        // Refund processing is handled synchronously in the API,
        // but this consumer can be used for additional async processing if needed
      }
    } catch (error) {
      logger.error('Error processing refund event:', error);
      throw error;
    }
  });

  logger.info('Refund consumer started');
}

