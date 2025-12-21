import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer, consumeMessages } from '../consumer';
import { SettlementTaskEvent } from '../events';
import { PayoutService } from '../../services/payout.service';
import { logger } from '../../utils/logger';

export async function startPayoutConsumer(): Promise<void> {
  const consumer = await createConsumer('payout-worker', ['settlement.tasks']);
  const payoutService = new PayoutService();

  await consumeMessages(consumer, async (payload: EachMessagePayload) => {
    try {
      const message = JSON.parse(payload.message.value?.toString() || '{}');
      
      if (message.type === 'settlement.tasks') {
        const event = message as SettlementTaskEvent;
        logger.info(`Processing payout for settlement ${event.settlementId}`);
        
        // Process each split
        for (const split of event.splits) {
          if (split.vendorId !== 'PLATFORM') {
            try {
              await payoutService.processPayout(
                event.settlementId,
                split.vendorId,
                split.amount
              );
            } catch (error) {
              logger.error(
                `Payout failed for vendor ${split.vendorId} in settlement ${event.settlementId}:`,
                error
              );
            }
          }
        }
        
        logger.info(`Payout processing completed for settlement ${event.settlementId}`);
      }
    } catch (error) {
      logger.error('Error processing payout:', error);
      throw error;
    }
  });

  logger.info('Payout consumer started');
}

