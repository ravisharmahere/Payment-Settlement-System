import mysql from 'mysql2/promise';
import { getPool, withTransaction } from '../database/connection';
import { SettlementService } from './settlement.service';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../utils/logger';

export class PayoutService {
  private settlementService: SettlementService;

  constructor() {
    this.settlementService = new SettlementService();
  }

  /**
   * Simulate vendor payout
   * In production, this would call an external payment gateway
   */
  async simulatePayout(vendorId: string, amount: number): Promise<boolean> {
    // Simulate random success/failure (80% success rate for demo)
    const success = Math.random() > 0.2;
    
    if (success) {
      logger.info(`Payout to ${vendorId} for ${amount} succeeded`);
      return true;
    } else {
      logger.warn(`Payout to ${vendorId} for ${amount} failed (simulated)`);
      throw new Error(`Payout to ${vendorId} failed`);
    }
  }

  /**
   * Process payout with retry logic
   */
  async processPayout(
    settlementId: number,
    vendorId: string,
    amount: number
  ): Promise<void> {
    try {
      await retryWithBackoff(
        async () => {
          return await this.simulatePayout(vendorId, amount);
        },
        {
          maxRetries: 5,
          initialDelay: 1000,
          maxDelay: 16000,
          backoffMultiplier: 2,
        }
      );

      // On success, finalize settlement
      await withTransaction(async (connection) => {
        await this.settlementService.finalizeSettlement(
          settlementId,
          connection
        );
      });

      logger.info(`Payout processed successfully for settlement ${settlementId}`);
    } catch (error) {
      logger.error(
        `Payout failed after retries for settlement ${settlementId}:`,
        error
      );
      
      // Mark settlement as failed
      const pool = getPool();
      await pool.execute(
        "UPDATE settlements SET status = 'FAILED' WHERE id = ?",
        [settlementId]
      );
      
      throw error;
    }
  }
}

