import dotenv from 'dotenv';
import { createServer } from './api/server';
import { logger } from './utils/logger';
import { startSettlementWorker } from './workers/settlement.worker';
import { startPayoutWorker } from './workers/payout.worker';
import { startRefundWorker } from './workers/refund.worker';

dotenv.config();

const PORT = process.env.PORT || 3000;
const WORKER_MODE = process.env.WORKER_MODE || 'all';

async function startWorkers() {
  if (WORKER_MODE === 'all' || WORKER_MODE === 'settlement') {
    startSettlementWorker().catch((error) => {
      logger.error('Settlement worker failed:', error);
    });
  }

  if (WORKER_MODE === 'all' || WORKER_MODE === 'payout') {
    startPayoutWorker().catch((error) => {
      logger.error('Payout worker failed:', error);
    });
  }

  if (WORKER_MODE === 'all' || WORKER_MODE === 'refund') {
    startRefundWorker().catch((error) => {
      logger.error('Refund worker failed:', error);
    });
  }
}

async function startServer() {
  const app = createServer();

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // Start workers if not in API-only mode
  if (WORKER_MODE !== 'api') {
    await startWorkers();
  }
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Server shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Server shutting down...');
  process.exit(0);
});

