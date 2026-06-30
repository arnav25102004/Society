/**
 * CSRF protection for the web dashboard (Phase 4).
 *
 * Uses the Double-Submit Cookie pattern:
 *   1. Server sets __csrf cookie (HttpOnly=false so JS can read it) on first request
 *   2. Client reads cookie and sends the value as X-CSRF-Token header
 *   3. Server compares the two — CSRF attacks cannot read cookies cross-origin, so the
 *      header value only the real JS can provide.
 *
 * This middleware is NOT applied to the mobile API routes (which use JWT + HMAC).
 * Apply it only to web dashboard routes in Phase 4.
 *
 * Usage:
 *   import { csrfMiddleware, csrfTokenRoute } from '../middleware/csrf';
 *   app.get('/api/v1/csrf-token', csrfTokenRoute);
 *   app.use('/api/v1/web', csrfMiddleware, webDashboardRouter);
 */

import { createHmac, randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const COOKIE_NAME = '__csrf';
const HEADER_NAME = 'x-csrf-token';
const CSRF_TTL_MS = 4 * 60 * 60 * 1000;  // 4 hours

function signToken(raw: string): string {
  const sig = createHmac('sha256', env.security.hmacSecret).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

function verifyToken(signed: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot === -1) return null;
  const raw = signed.slice(0, dot);
  const expected = signToken(raw);
  if (expected !== signed) return null;
  const [, tsStr] = raw.split('_');
  if (!tsStr || Date.now() - parseInt(tsStr, 10) > CSRF_TTL_MS) return null;
  return raw;
}

/** GET /api/v1/csrf-token — returns a fresh CSRF token and sets the cookie */
export function csrfTokenRoute(req: Request, res: Response) {
  const raw = `${randomBytes(16).toString('hex')}_${Date.now()}`;
  const signed = signToken(raw);

  res.cookie(COOKIE_NAME, signed, {
    httpOnly: false,   // JS must be able to read this
    secure: !env.isDev,
    sameSite: 'strict',
    maxAge: CSRF_TTL_MS,
  });

  res.json({ success: true, csrfToken: signed });
}

/** Middleware: enforces CSRF on state-changing web dashboard requests */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  // Safe methods and OPTIONS preflight are exempt
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;
  const headerToken = req.headers[HEADER_NAME] as string | undefined;

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ success: false, message: 'CSRF token missing' });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({ success: false, message: 'CSRF token mismatch' });
  }

  if (!verifyToken(cookieToken)) {
    return res.status(403).json({ success: false, message: 'CSRF token invalid or expired' });
  }

  next();
}
