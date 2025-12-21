import mysql from 'mysql2/promise';
import { getPool, withTransaction } from '../database/connection';
import { Settlement, SettlementSplit } from '../models/settlement.model';
import { Vendor } from '../models/vendor.model';
import { LedgerService } from './ledger.service';
import { publishEvent } from '../kafka/producer';
import { logger } from '../utils/logger';

export interface SplitCalculation {
  vendorId: string;
  amount: number;
  percentage: number;
}

export class SettlementService {
  private ledgerService: LedgerService;

  constructor() {
    this.ledgerService = new LedgerService();
  }

  async processSettlement(paymentId: number): Promise<Settlement> {
    return withTransaction(async (connection) => {
      // Get payment with retry logic to handle race conditions
      let paymentRows: mysql.RowDataPacket[] = [];
      let retries = 0;
      const maxRetries = 5;
      
      while (retries < maxRetries) {
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM payments WHERE id = ?',
          [paymentId]
        );
        paymentRows = rows as mysql.RowDataPacket[];

        if (paymentRows.length > 0) {
          break;
        }
        
        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
        }
      }

      if (paymentRows.length === 0) {
        throw new Error(`Payment ${paymentId} not found after ${maxRetries} retries`);
      }

      const payment = paymentRows[0];
      if (payment.status !== 'CAPTURED') {
        throw new Error(`Payment ${paymentId} is not in CAPTURED status`);
      }

      // Get all vendors and their split percentages
      const [vendorRows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM vendors'
      );

      if (vendorRows.length === 0) {
        throw new Error('No vendors configured');
      }

      const vendors: Vendor[] = vendorRows.map((row) => ({
        id: row.id,
        name: row.name,
        splitPercentage: Number(row.split_percentage),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      // Calculate splits
      const splits = this.calculateSplits(
        Number(payment.amount),
        vendors,
        payment.vendor_id
      );

      // Create settlement
      const [settlementResult] = await connection.execute<mysql.ResultSetHeader>(
        `INSERT INTO settlements (payment_id, status, total_amount)
         VALUES (?, 'PENDING', ?)`,
        [paymentId, payment.amount]
      );

      const settlementId = settlementResult.insertId;

      // Create settlement splits (only for actual vendors, not PLATFORM)
      const vendorSplits = splits.filter((split) => split.vendorId !== 'PLATFORM');
      const splitInserts = vendorSplits.map((split) =>
        connection.execute(
          `INSERT INTO settlement_splits (settlement_id, vendor_id, amount, status)
           VALUES (?, ?, ?, 'PENDING')`,
          [settlementId, split.vendorId, split.amount]
        )
      );
      await Promise.all(splitInserts);

      // Create double-entry ledger entries
      await this.createLedgerEntries(settlementId, paymentId, splits, connection);

      // Get created settlement
      const [settlementRows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM settlements WHERE id = ?',
        [settlementId]
      );

      const settlement = this.mapRowToSettlement(settlementRows[0]);

      // Emit settlement task event
      await publishEvent('settlement.tasks', {
        type: 'settlement.tasks',
        settlementId: settlement.id,
        paymentId: paymentId,
        splits: splits.map((s) => ({ vendorId: s.vendorId, amount: s.amount })),
        timestamp: new Date().toISOString(),
      });

      logger.info(`Settlement ${settlementId} created for payment ${paymentId}`);
      return settlement;
    });
  }

  private calculateSplits(
    totalAmount: number,
    vendors: Vendor[],
    primaryVendorId: string
  ): SplitCalculation[] {
    // Find primary vendor
    const primaryVendor = vendors.find((v) => v.id === primaryVendorId);
    if (!primaryVendor) {
      throw new Error(`Primary vendor ${primaryVendorId} not found`);
    }

    // Calculate platform revenue (100% - vendor split)
    const platformRevenuePercentage = 100 - primaryVendor.splitPercentage;
    const platformRevenue = (totalAmount * platformRevenuePercentage) / 100;
    const vendorAmount = (totalAmount * primaryVendor.splitPercentage) / 100;

    return [
      {
        vendorId: 'PLATFORM',
        amount: platformRevenue,
        percentage: platformRevenuePercentage,
      },
      {
        vendorId: primaryVendorId,
        amount: vendorAmount,
        percentage: primaryVendor.splitPercentage,
      },
    ];
  }

  private async createLedgerEntries(
    settlementId: number,
    paymentId: number,
    splits: SplitCalculation[],
    connection: mysql.PoolConnection
  ): Promise<void> {
    const entries = [];

    // Calculate total amount
    const totalAmount = splits.reduce((sum, s) => sum + s.amount, 0);

    // Debit: Cash account (money received)
    entries.push({
      settlementId,
      paymentId,
      accountType: 'CASH' as const,
      debit: totalAmount,
      credit: 0,
      description: 'Payment received',
    });

    // Credit: Revenue account (platform revenue)
    const platformSplit = splits.find((s) => s.vendorId === 'PLATFORM');
    if (platformSplit) {
      entries.push({
        settlementId,
        paymentId,
        accountType: 'REVENUE' as const,
        debit: 0,
        credit: platformSplit.amount,
        description: 'Platform revenue',
      });
    }

    // Credit: Payable accounts (vendor payouts)
    for (const split of splits) {
      if (split.vendorId !== 'PLATFORM') {
        entries.push({
          settlementId,
          paymentId,
          accountType: 'PAYABLE' as const,
          vendorId: split.vendorId,
          debit: 0,
          credit: split.amount,
          description: `Payable to ${split.vendorId}`,
        });
      }
    }

    await this.ledgerService.createLedgerEntries(entries, connection);
  }

  async finalizeSettlement(
    settlementId: number,
    connection?: mysql.PoolConnection
  ): Promise<void> {
    if (connection) {
      await connection.execute(
        "UPDATE settlements SET status = 'SETTLED' WHERE id = ?",
        [settlementId]
      );
      await connection.execute(
        "UPDATE settlement_splits SET status = 'SETTLED' WHERE settlement_id = ?",
        [settlementId]
      );
    } else {
      const pool = getPool();
      await pool.execute(
        "UPDATE settlements SET status = 'SETTLED' WHERE id = ?",
        [settlementId]
      );
      await pool.execute(
        "UPDATE settlement_splits SET status = 'SETTLED' WHERE settlement_id = ?",
        [settlementId]
      );
    }

    logger.info(`Settlement ${settlementId} finalized`);
  }

  async getSettlementById(id: number): Promise<Settlement> {
    const pool = getPool();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM settlements WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      throw new Error(`Settlement ${id} not found`);
    }

    return this.mapRowToSettlement(rows[0]);
  }

  private mapRowToSettlement(row: mysql.RowDataPacket): Settlement {
    return {
      id: row.id,
      paymentId: row.payment_id,
      status: row.status,
      totalAmount: Number(row.total_amount),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

