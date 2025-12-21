import mysql from 'mysql2/promise';
import { getPool, withTransaction } from '../database/connection';
import { PaymentService } from './payment.service';
import { LedgerService } from './ledger.service';
import { publishEvent } from '../kafka/producer';
import { logger } from '../utils/logger';

export interface CreateRefundInput {
  paymentId: number;
  amount: number;
  reason?: string;
}

export class RefundService {
  private paymentService: PaymentService;
  private ledgerService: LedgerService;

  constructor() {
    this.paymentService = new PaymentService();
    this.ledgerService = new LedgerService();
  }

  async processRefund(input: CreateRefundInput): Promise<void> {
    return withTransaction(async (connection) => {
      // Get payment
      const payment = await this.paymentService.getPaymentById(
        input.paymentId,
        connection
      );

      if (payment.status !== 'CAPTURED') {
        throw new Error(`Payment ${input.paymentId} cannot be refunded`);
      }

      if (input.amount > payment.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
      }

      // Get settlement for this payment
      const [settlementRows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM settlements WHERE payment_id = ?',
        [input.paymentId]
      );

      if (settlementRows.length === 0) {
        throw new Error(`No settlement found for payment ${input.paymentId}`);
      }

      const settlementId = settlementRows[0].id;

      // Get original ledger entries
      const originalEntries = await this.ledgerService.getLedgerEntriesBySettlement(
        settlementId
      );

      // Create reversing ledger entries (swap debit/credit)
      const reversingEntries = originalEntries.map((entry) => ({
        settlementId,
        paymentId: input.paymentId,
        accountType: entry.accountType,
        vendorId: entry.vendorId,
        debit: entry.credit, // Swap
        credit: entry.debit, // Swap
        description: `Refund: ${entry.description || 'Reversal'}`,
      }));

      // Scale down to refund amount if partial refund
      const refundRatio = input.amount / payment.amount;
      if (refundRatio < 1) {
        for (const entry of reversingEntries) {
          entry.debit = Number((entry.debit * refundRatio).toFixed(2));
          entry.credit = Number((entry.credit * refundRatio).toFixed(2));
        }
      }

      await this.ledgerService.createLedgerEntries(
        reversingEntries,
        connection
      );

      // Update payment status
      await this.paymentService.updatePaymentStatus(
        input.paymentId,
        'REFUNDED',
        connection
      );

      // Emit refund event
      await publishEvent('refunds', {
        type: 'refunds.initiated',
        refundId: Date.now(), // In production, this would be a proper refund ID
        paymentId: input.paymentId,
        amount: input.amount,
        currency: payment.currency,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Refund processed for payment ${input.paymentId}`);
    });
  }
}

