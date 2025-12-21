import mysql from 'mysql2/promise';
import { getPool, withTransaction } from '../database/connection';
import { Payment, CreatePaymentInput } from '../models/payment.model';
import { publishEvent } from '../kafka/producer';
import { logger } from '../utils/logger';

export class PaymentService {
  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    return withTransaction(async (connection) => {
      const [result] = await connection.execute<mysql.ResultSetHeader>(
        `INSERT INTO payments (customer_id, vendor_id, amount, currency, description, status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [
          input.customerId,
          input.vendorId,
          input.amount,
          input.currency || 'USD',
          input.description || null,
        ]
      );

      const payment = await this.getPaymentById(result.insertId, connection);
      
      // Auto-capture for demo (in production, this would be a separate step)
      await this.capturePayment(payment.id, connection);

      return payment;
    });
  }

  async capturePayment(
    paymentId: number,
    connection?: mysql.PoolConnection
  ): Promise<Payment> {
    let payment: Payment;
    
    if (connection) {
      await connection.execute(
        "UPDATE payments SET status = 'CAPTURED' WHERE id = ?",
        [paymentId]
      );
      payment = await this.getPaymentById(paymentId, connection);
    } else {
      const pool = getPool();
      await pool.execute(
        "UPDATE payments SET status = 'CAPTURED' WHERE id = ?",
        [paymentId]
      );
      payment = await this.getPaymentById(paymentId);
    }

    // Emit payment captured event AFTER transaction commits
    // Use setImmediate to ensure transaction has committed
    setImmediate(async () => {
      try {
        await publishEvent('payments', {
          type: 'payments.captured',
          paymentId: payment.id,
          customerId: payment.customerId,
          vendorId: payment.vendorId,
          amount: payment.amount,
          currency: payment.currency,
          timestamp: new Date().toISOString(),
        });
        logger.info(`Payment ${paymentId} captured`);
      } catch (error) {
        logger.error(`Failed to publish payment captured event for ${paymentId}:`, error);
      }
    });

    logger.info(`Payment ${paymentId} captured`);
    return payment;
  }

  async getPaymentById(
    id: number,
    connection?: mysql.PoolConnection
  ): Promise<Payment> {
    let rows: mysql.RowDataPacket[];
    
    if (connection) {
      [rows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM payments WHERE id = ?',
        [id]
      );
    } else {
      const pool = getPool();
      [rows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM payments WHERE id = ?',
        [id]
      );
    }

    if (rows.length === 0) {
      throw new Error(`Payment with id ${id} not found`);
    }

    return this.mapRowToPayment(rows[0]);
  }

  async updatePaymentStatus(
    paymentId: number,
    status: Payment['status'],
    connection?: mysql.PoolConnection
  ): Promise<void> {
    if (connection) {
      await connection.execute('UPDATE payments SET status = ? WHERE id = ?', [
        status,
        paymentId,
      ]);
    } else {
      const pool = getPool();
      await pool.execute('UPDATE payments SET status = ? WHERE id = ?', [
        status,
        paymentId,
      ]);
    }
  }

  private mapRowToPayment(row: mysql.RowDataPacket): Payment {
    return {
      id: row.id,
      customerId: row.customer_id,
      vendorId: row.vendor_id,
      amount: Number(row.amount),
      currency: row.currency,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

