import { startSettlementConsumer } from '../kafka/consumers/settlement.consumer';
import { logger } from '../utils/logger';

export async function startSettlementWorker(): Promise<void> {
  try {
    logger.info('Starting settlement orchestrator worker...');
    await startSettlementConsumer();
  } catch (error) {
    logger.error('Failed to start settlement worker:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Settlement worker shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Settlement worker shutting down...');
  process.exit(0);
});

