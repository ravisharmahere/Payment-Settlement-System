import { Router, Request, Response } from 'express';
import { PaymentService } from '../../services/payment.service';
import { RefundService } from '../../services/refund.service';
import {
  idempotencyMiddleware,
  storeIdempotencyResponse,
  IdempotencyRequest,
} from '../middleware/idempotency';
import { logger } from '../../utils/logger';

const router = Router();
const paymentService = new PaymentService();
const refundService = new RefundService();

router.post(
  '/payments',
  idempotencyMiddleware,
  async (req: IdempotencyRequest, res: Response) => {
    try {
      // If idempotency response exists, return it
      if (req.idempotencyResponse) {
        return res.status(200).json(req.idempotencyResponse);
      }

      const { customerId, vendorId, amount, currency, description } = req.body;

      // Validation
      if (!customerId || !vendorId || !amount) {
        return res.status(400).json({
          error: 'Missing required fields: customerId, vendorId, amount',
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          error: 'Amount must be greater than 0',
        });
      }

      const payment = await paymentService.createPayment({
        customerId,
        vendorId,
        amount: parseFloat(amount),
        currency,
        description,
      });

      const response = {
        id: payment.id,
        customerId: payment.customerId,
        vendorId: payment.vendorId,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        status: payment.status,
        createdAt: payment.createdAt,
      };

      // Store idempotency response
      if (req.idempotencyKey) {
        await storeIdempotencyResponse(
          req.idempotencyKey,
          payment.id,
          response
        );
      }

      res.status(201).json(response);
    } catch (error: any) {
      logger.error('Error creating payment:', error);
      res.status(500).json({
        error: 'Failed to create payment',
        message: error.message,
      });
    }
  }
);

router.get('/payments/:id', async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id);
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    const payment = await paymentService.getPaymentById(paymentId);
    res.json({
      id: payment.id,
      customerId: payment.customerId,
      vendorId: payment.vendorId,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error getting payment:', error);
    res.status(500).json({
      error: 'Failed to get payment',
      message: error.message,
    });
  }
});

router.post('/refunds', async (req: Request, res: Response) => {
  try {
    const { paymentId, amount, reason } = req.body;

    if (!paymentId || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: paymentId, amount',
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be greater than 0',
      });
    }

    await refundService.processRefund({
      paymentId: parseInt(paymentId),
      amount: parseFloat(amount),
      reason,
    });

    res.status(200).json({
      message: 'Refund processed successfully',
      paymentId: parseInt(paymentId),
      amount: parseFloat(amount),
    });
  } catch (error: any) {
    logger.error('Error processing refund:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      message: error.message,
    });
  }
});

export default router;

