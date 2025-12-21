import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer, consumeMessages } from '../consumer';
import { PaymentCapturedEvent } from '../events';
import { SettlementService } from '../../services/settlement.service';
import { logger } from '../../utils/logger';

export async function startSettlementConsumer(): Promise<void> {
  const consumer = await createConsumer('settlement-orchestrator', ['payments']);
  const settlementService = new SettlementService();

  await consumeMessages(consumer, async (payload: EachMessagePayload) => {
    try {
      const message = JSON.parse(payload.message.value?.toString() || '{}');
      
      if (message.type === 'payments.captured') {
        const event = message as PaymentCapturedEvent;
        logger.info(`Processing settlement for payment ${event.paymentId}`);
        
        await settlementService.processSettlement(event.paymentId);
        logger.info(`Settlement processed for payment ${event.paymentId}`);
      }
    } catch (error) {
      logger.error('Error processing settlement:', error);
      throw error;
    }
  });

  logger.info('Settlement consumer started');
}

