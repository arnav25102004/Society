/**
 * HMAC-SHA256 request signing middleware.
 *
 * Protects critical state-changing endpoints against replay attacks and
 * request forgery. A static secret can't live inside a mobile app bundle (it'd be
 * trivially extractable), so the mobile client first calls POST /auth/signing-key
 * (requireAuth) to get a short-lived, per-user key, then signs with that:
 *
 *   X-Signature: HMAC-SHA256(JSON.stringify({...body, timestamp}), <per-user key>)
 *   X-Timestamp:  Unix timestamp in seconds (must be within ±5 minutes of server time)
 *
 * Applied to: PUT /complaints/:id/status, PUT /visitors/:id/approve,
 *             POST /payments/bills/:id/mark-paid
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { hmacKeyService } from '../services/hmacKey.service';

const MAX_SKEW_SECONDS = 5 * 60;  // 5-minute replay window

export function generateHmac(body: object, timestamp: number, key: string): string {
  const payload = JSON.stringify({ ...body, timestamp });
  return createHmac('sha256', key).update(payload).digest('hex');
}

export async function verifyHmac(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-signature'] as string | undefined;
  const timestampStr = req.headers['x-timestamp'] as string | undefined;
  const authUser = (req as any).user;

  // Web dashboard bypass: the admin portal (apps/admin) never signs requests at all —
  // it authenticates via JWT + role only. Mobile clients (including committee members
  // using the mobile app) DO sign these routes — see apps/mobile/src/services/hmac.ts.
  // Scoping the bypass to "no signature headers present" (not just role) means a
  // committee/admin request from mobile still gets its signature verified for real,
  // instead of every privileged role silently skipping HMAC regardless of caller.
  const isTrustedRole = authUser && ['admin', 'committee', 'superadmin'].includes(authUser.role);
  if (isTrustedRole && !signature && !timestampStr) {
    return next();
  }

  if (!signature || !timestampStr) {
    return res.status(401).json({
      success: false,
      message: 'Missing HMAC signature headers (X-Signature, X-Timestamp)',
    });
  }

  if (!authUser?.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
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

  const signingKey = await hmacKeyService.get(authUser.userId);
  if (!signingKey) {
    return res.status(401).json({
      success: false,
      message: 'No active signing key. Call POST /auth/signing-key first.',
    });
  }

  const expected = generateHmac(req.body ?? {}, timestamp, signingKey);

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
