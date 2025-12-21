import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../../redis/client';
import { getPool } from '../../database/connection';
import mysql from 'mysql2/promise';
import { logger } from '../../utils/logger';

const IDEMPOTENCY_TTL_HOURS = parseInt(
  process.env.IDEMPOTENCY_TTL_HOURS || '24'
);

export interface IdempotencyRequest extends Request {
  idempotencyKey?: string;
  idempotencyResponse?: any;
}

export async function idempotencyMiddleware(
  req: IdempotencyRequest,
  res: Response,
  next: NextFunction
) {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'Idempotency-Key header is required',
    });
  }

  req.idempotencyKey = idempotencyKey;

  try {
    // Check Redis cache first
    const redis = getRedisClient();
    const cachedResponse = await redis.get(`idempotency:${idempotencyKey}`);

    if (cachedResponse) {
      logger.debug(`Idempotency key found in Redis: ${idempotencyKey}`);
      const response = JSON.parse(cachedResponse);
      req.idempotencyResponse = response;
      return res.status(200).json(response);
    }

    // Check MySQL
    const pool = getPool();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM idempotency_keys WHERE `key` = ? AND expires_at > NOW()',
      [idempotencyKey]
    );

    if (rows.length > 0) {
      logger.debug(`Idempotency key found in MySQL: ${idempotencyKey}`);
      const response = JSON.parse(rows[0].response);
      
      // Cache in Redis
      await redis.setex(
        `idempotency:${idempotencyKey}`,
        IDEMPOTENCY_TTL_HOURS * 3600,
        rows[0].response
      );

      req.idempotencyResponse = response;
      return res.status(200).json(response);
    }

    // Key not found, proceed with request
    next();
  } catch (error) {
    logger.error('Idempotency middleware error:', error);
    next(error);
  }
}

export async function storeIdempotencyResponse(
  idempotencyKey: string,
  paymentId: number,
  response: any
): Promise<void> {
  const pool = getPool();
  const redis = getRedisClient();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);

  const responseJson = JSON.stringify(response);

  // Store in MySQL
  await pool.execute(
    `INSERT INTO idempotency_keys (\`key\`, payment_id, response, expires_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       payment_id = VALUES(payment_id),
       response = VALUES(response),
       expires_at = VALUES(expires_at)`,
    [idempotencyKey, paymentId, responseJson, expiresAt]
  );

  // Store in Redis
  await redis.setex(
    `idempotency:${idempotencyKey}`,
    IDEMPOTENCY_TTL_HOURS * 3600,
    responseJson
  );

  logger.debug(`Stored idempotency response for key: ${idempotencyKey}`);
}

