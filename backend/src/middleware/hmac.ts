/**
 * HMAC-SHA256 request signing middleware.
 *
 * Protects critical state-changing endpoints against replay attacks and
 * request forgery. The mobile app computes and attaches:
 *
 *   X-Signature: HMAC-SHA256(JSON.stringify({...body, timestamp}), HMAC_SECRET)
 *   X-Timestamp:  Unix timestamp in seconds (must be within ±5 minutes of server time)
 *
 * Applied to: POST /payments/initiate, PUT /complaints/:id/status,
 *             POST /visitors (guard registration), PUT /visitors/:id/approve
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const MAX_SKEW_SECONDS = 5 * 60;  // 5-minute replay window

export function generateHmac(body: object, timestamp: number): string {
  const payload = JSON.stringify({ ...body, timestamp });
  return createHmac('sha256', env.security.hmacSecret).update(payload).digest('hex');
}

export function verifyHmac(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-signature'] as string | undefined;
  const timestampStr = req.headers['x-timestamp'] as string | undefined;

  if (!signature || !timestampStr) {
    return res.status(401).json({
      success: false,
      message: 'Missing HMAC signature headers (X-Signature, X-Timestamp)',
    });
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return res.status(401).json({ success: false, message: 'Invalid X-Timestamp header' });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > MAX_SKEW_SECONDS) {
    return res.status(401).json({
      success: false,
      message: 'Request timestamp expired. Check your device clock (must be within 5 minutes of server).',
    });
  }

  const expected = generateHmac(req.body ?? {}, timestamp);

  // Constant-time comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ success: false, message: 'Invalid request signature' });
    }
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid request signature' });
  }

  next();
}
