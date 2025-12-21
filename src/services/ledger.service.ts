import mysql from 'mysql2/promise';
import { getPool } from '../database/connection';
import { LedgerEntry, CreateLedgerEntryInput, AccountType } from '../models/ledger.model';
import { logger } from '../utils/logger';

export class LedgerService {
  /**
   * Create ledger entries ensuring double-entry accounting (debits = credits)
   */
  async createLedgerEntries(
    entries: CreateLedgerEntryInput[],
    connection?: mysql.PoolConnection
  ): Promise<LedgerEntry[]> {
    // Validate double-entry: sum of debits must equal sum of credits
    const totalDebits = entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredits = entries.reduce((sum, e) => sum + Number(e.credit), 0);
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(
        `Double-entry validation failed: debits (${totalDebits}) must equal credits (${totalCredits})`
      );
    }

    const createdEntries: LedgerEntry[] = [];
    const pool = connection || getPool();
    
    for (const entry of entries) {
      const [result] = await pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO ledger_entries 
         (settlement_id, payment_id, account_type, vendor_id, debit, credit, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.settlementId || null,
          entry.paymentId || null,
          entry.accountType,
          entry.vendorId || null,
          entry.debit,
          entry.credit,
          entry.description || null,
        ]
      );

      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM ledger_entries WHERE id = ?',
        [result.insertId]
      );

      createdEntries.push(this.mapRowToLedgerEntry(rows[0]));
    }

    logger.info(`Created ${createdEntries.length} ledger entries`);
    return createdEntries;
  }

  /**
   * Get ledger entries for a settlement
   */
  async getLedgerEntriesBySettlement(
    settlementId: number
  ): Promise<LedgerEntry[]> {
    const pool = getPool();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM ledger_entries WHERE settlement_id = ? ORDER BY created_at',
      [settlementId]
    );
    return rows.map(this.mapRowToLedgerEntry);
  }

  /**
   * Verify double-entry balance for a settlement
   */
  async verifyDoubleEntry(settlementId: number): Promise<boolean> {
    const pool = getPool();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT SUM(debit) as total_debits, SUM(credit) as total_credits
       FROM ledger_entries WHERE settlement_id = ?`,
      [settlementId]
    );

    const totalDebits = Number(rows[0].total_debits || 0);
    const totalCredits = Number(rows[0].total_credits || 0);
    
    return Math.abs(totalDebits - totalCredits) < 0.01;
  }

  private mapRowToLedgerEntry(row: mysql.RowDataPacket): LedgerEntry {
    return {
      id: row.id,
      settlementId: row.settlement_id,
      paymentId: row.payment_id,
      accountType: row.account_type as AccountType,
      vendorId: row.vendor_id,
      debit: Number(row.debit),
      credit: Number(row.credit),
      description: row.description,
      createdAt: row.created_at,
    };
  }
}

