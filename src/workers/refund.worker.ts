import { startRefundConsumer } from '../kafka/consumers/refund.consumer';
import { logger } from '../utils/logger';

export async function startRefundWorker(): Promise<void> {
  try {
    logger.info('Starting refund worker...');
    await startRefundConsumer();
  } catch (error) {
    logger.error('Failed to start refund worker:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Refund worker shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Refund worker shutting down...');
  process.exit(0);
});

