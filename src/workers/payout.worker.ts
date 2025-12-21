import { startPayoutConsumer } from '../kafka/consumers/payout.consumer';
import { logger } from '../utils/logger';

export async function startPayoutWorker(): Promise<void> {
  try {
    logger.info('Starting payout worker...');
    await startPayoutConsumer();
  } catch (error) {
    logger.error('Failed to start payout worker:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Payout worker shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Payout worker shutting down...');
  process.exit(0);
});

