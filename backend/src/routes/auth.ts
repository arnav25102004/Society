import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { otpService } from '../services/otp.service';
import { jwtService } from '../services/jwt.service';
import { hmacKeyService } from '../services/hmacKey.service';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { encryptSearchable, encryptField, decryptField } from '../utils/encryption';
import { SecurityAuditService } from '../services/security-audit.service';

export const authRouter = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_OTP_FAILURES   = 5;
const FAILURE_WINDOW_MS  = 10 * 60 * 1000;  // 10 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;  // 15 minutes
const REFRESH_EXPIRY_MS  = 7 * 24 * 60 * 60 * 1000;

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isDev ? 1000 : 20,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
authRouter.use(authLimiter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function sendNewDeviceAlert(tokens: string[], deviceName: string): Promise<void> {
  const validTokens = tokens.filter(t => t?.startsWith('ExponentPushToken['));
  if (validTokens.length === 0) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTokens.map(to => ({
        to,
        title: 'New device login',
        body: `Your account was accessed from ${deviceName}. If this wasn't you, tap to review active sessions.`,
        data: { type: 'security_alert', action: 'new_device' },
        priority: 'high',
      }))),
    });
  } catch {
    // Non-critical — don't block the login
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const sendOtpSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
});

const verifyOtpSchema = z.object({
  phone:      z.string().regex(/^[6-9]\d{9}$/),
  otp:        z.string().length(6, 'OTP must be 6 digits'),
  deviceId:   z.string().max(200).optional(),
  deviceName: z.string().max(200).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const setPinSchema = z.object({
  pin: z.string().length(6, 'PIN must be exactly 6 digits').regex(/^\d{6}$/, 'PIN must be numeric'),
});

const verifyPinSchema = z.object({
  pin: z.string().length(6).regex(/^\d{6}$/),
});

const otpActionTokenSchema = z.object({
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

const adminLoginSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/),
  pin:   z.string().length(6).regex(/^\d{6}$/),
});

const superAdminLoginSchema = z.object({
  superAdminSecret: z.string().min(1),
});

// ─── POST /auth/admin/login — Society Admin PIN-based login ───────────────────

authRouter.post('/admin/login', validate(adminLoginSchema), async (req: Request, res: Response) => {
  const { phone, pin } = req.body as z.infer<typeof adminLoginSchema>;
  const encryptedPhone = encryptSearchable(phone);

  // Find user
  const user = await prisma.user.findUnique({ where: { phone: encryptedPhone } });
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  // Verify PIN
  if (!user.pinHash) {
    return res.status(400).json({ success: false, message: 'No security PIN set. Please configure a PIN in the mobile app first.' });
  }

  const pepperedPin = pin + env.security.pinPepper;
  const matches = await bcrypt.compare(pepperedPin, user.pinHash);
  if (!matches) {
    return res.status(401).json({ success: false, message: 'Incorrect security PIN' });
  }

  // Get memberships
  const memberships = await prisma.societyMember.findMany({
    where:   { userId: user.id },
    include: { society: { select: { id: true, name: true, city: true } } },
  });

  // Issue tokens
  const familyId = uuidv4();
  const tokenId  = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);
  
  const accessToken = jwtService.signAccessToken({ userId: user.id, phone });
  const refreshToken = jwtService.signRefreshToken({ userId: user.id, tokenId });
  const tokenHash    = hashToken(refreshToken);

  await prisma.refreshTokenFamily.create({
    data: { familyId, userId: user.id, tokenHash, expiresAt },
  });

  res.json({
    success: true,
    tokens: { accessToken, refreshToken },
    user: {
      id:        user.id,
      phone,
      name:      user.name,
      avatarUrl: user.avatarUrl,
      hasPinSet: true,
    },
    memberships: memberships.map(m => ({
      id:          m.id,
      societyId:   m.societyId,
      societyName: m.society.name,
      societyCity: m.society.city,
      flatNumber:  m.flatNumber,
      role:        m.role,
      status:      m.status,
    })),
  });
});

// ─── POST /auth/super-admin/login — Super admin login (Secret-key based) ─────────

authRouter.post('/super-admin/login', validate(superAdminLoginSchema), async (req: Request, res: Response) => {
  const { superAdminSecret } = req.body as z.infer<typeof superAdminLoginSchema>;

  // Validate the super admin secret
  if (superAdminSecret !== env.security.superAdminSecret) {
    return res.status(403).json({ success: false, message: 'Invalid super admin secret password' });
  }

  // Find or create the super admin user
  const systemAdminPhone = '0000000000';
  const encryptedPhone = encryptSearchable(systemAdminPhone);
  let user = await prisma.user.findUnique({ where: { phone: encryptedPhone } });
  if (!user) {
    user = await prisma.user.create({
      data: { phone: encryptedPhone, name: 'Super Admin HQ', updatedAt: new Date() },
    });
  }

  // Issue a long-lived access token with superadmin role (8h for dashboard sessions)
  const accessToken = jwtService.signAccessToken({ userId: user.id, phone: `+91${systemAdminPhone}`, role: 'superadmin' });

  res.json({
    success: true,
    accessToken,
    user: { id: user.id, name: user.name, role: 'superadmin' },
  });
});


// ─── POST /auth/send-otp ──────────────────────────────────────────────────────

authRouter.post('/send-otp', validate(sendOtpSchema), async (req: Request, res: Response) => {
  const { phone } = req.body as z.infer<typeof sendOtpSchema>;
  console.log(`[Auth] Received OTP request for: ${phone}`);
  const result = await otpService.send(phone);
  if (!result.success) {
    return res.status(429).json({ success: false, message: result.message });
  }
  res.json({ success: true, message: result.message });
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────

authRouter.post('/verify-otp', validate(verifyOtpSchema), async (req: Request, res: Response) => {
  const { phone, otp, deviceId, deviceName } = req.body as z.infer<typeof verifyOtpSchema>;
  const ip        = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';
  const userAgent = req.headers['user-agent'] ?? '';
  const headerDeviceId = req.headers['x-device-id'] as string | undefined;
  const effectiveDeviceId = deviceId ?? headerDeviceId;

  // ── Account lockout check ─────────────────────────────────────────────────
  const attempt = await prisma.loginAttempt.findUnique({ where: { phone } });
  if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
    const waitMinutes = Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(429).json({
      success: false,
      message: `Too many attempts. Try again in ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`,
    });
  }

  // ── OTP verification ──────────────────────────────────────────────────────
  const valid = await otpService.verify(phone, otp);
  if (!valid) {
    // Record failed attempt
    const now = new Date();
    const recentWindow = new Date(Date.now() - FAILURE_WINDOW_MS);
    const isWithinWindow = attempt?.lastAttemptAt && attempt.lastAttemptAt > recentWindow;
    const newCount = isWithinWindow ? (attempt?.attemptCount ?? 0) + 1 : 1;
    const lockUntil = newCount >= MAX_OTP_FAILURES
      ? new Date(Date.now() + LOCKOUT_DURATION_MS)
      : null;

    await prisma.loginAttempt.upsert({
      where:  { phone },
      update: { attemptCount: newCount, lastAttemptAt: now, lockedUntil: lockUntil },
      create: { phone, attemptCount: newCount, lastAttemptAt: now, lockedUntil: lockUntil },
    });

    SecurityAuditService.log({
      action: 'auth.otp_failed',
      ipAddress: SecurityAuditService.extractIp(req),
      userAgent: req.headers['user-agent'],
      success: false,
      metadata: { phone: `****${phone.slice(-4)}`, attemptCount: newCount },
    });
    // Always return the same generic message to avoid timing/oracle attacks
    return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
  }

  // ── Success — reset lockout ───────────────────────────────────────────────
  await prisma.loginAttempt.upsert({
    where:  { phone },
    update: { attemptCount: 0, lockedUntil: null },
    create: { phone, attemptCount: 0 },
  });

  // ── Upsert user (phone encrypted at rest) ────────────────────────────────
  const encryptedPhone = encryptSearchable(phone);
  let user = await prisma.user.findUnique({ where: { phone: encryptedPhone } });
  const isNewUser = !user;
  if (!user) {
    user = await prisma.user.create({ data: { phone: encryptedPhone, name: '' } });
  }

  // ── Device fingerprinting ─────────────────────────────────────────────────
  if (effectiveDeviceId) {
    const existing = await prisma.deviceSession.findUnique({
      where: { userId_deviceId: { userId: user.id, deviceId: effectiveDeviceId } },
    });

    if (!existing) {
      // New device — create record and alert other devices
      await prisma.deviceSession.create({
        data: {
          userId:     user.id,
          deviceId:   effectiveDeviceId,
          deviceName: deviceName ?? userAgent.slice(0, 200),
          ipAddress:  ip,
          userAgent:  userAgent.slice(0, 500),
        },
      });

      // Notify all other trusted device push tokens
      const otherDevices = await prisma.deviceSession.findMany({
        where: { userId: user.id, deviceId: { not: effectiveDeviceId } },
      });
      if (otherDevices.length > 0) {
        const otherUsers = await prisma.user.findMany({
          where: { id: user.id },
          select: { expoPushToken: true },
        });
        const tokens = otherUsers.flatMap(u => u.expoPushToken ? [u.expoPushToken] : []);
        const name = deviceName ?? 'a new device';
        sendNewDeviceAlert(tokens, name); // fire-and-forget
      }
    } else {
      // Update last seen
      await prisma.deviceSession.update({
        where: { userId_deviceId: { userId: user.id, deviceId: effectiveDeviceId } },
        data:  { lastSeenAt: new Date(), ipAddress: ip, userAgent: userAgent.slice(0, 500) },
      });
    }
  }

  // ── Return memberships ────────────────────────────────────────────────────
  const memberships = await prisma.societyMember.findMany({
    where:   { userId: user.id },
    include: { society: { select: { id: true, name: true, city: true } } },
  });

  // ── Issue tokens (family-tracked) ─────────────────────────────────────────
  const familyId = uuidv4();
  const tokenId  = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

  const refreshToken = jwtService.signRefreshToken({ userId: user.id, tokenId });
  const tokenHash    = hashToken(refreshToken);

  await prisma.refreshTokenFamily.create({
    data: { familyId, userId: user.id, tokenHash, expiresAt },
  });

  const accessToken = jwtService.signAccessToken({ userId: user.id, phone });  // raw phone in JWT

  SecurityAuditService.log({
    userId: user.id,
    action: isNewUser ? 'auth.register' : 'auth.login',
    ipAddress: SecurityAuditService.extractIp(req),
    userAgent: req.headers['user-agent'],
    success: true,
    metadata: { deviceId: effectiveDeviceId, phone: `****${phone.slice(-4)}` },
  });

  res.json({
    success: true,
    isNewUser,
    tokens: { accessToken, refreshToken },
    user: {
      id:        user.id,
      phone,                // return raw phone to client
      name:      user.name,
      avatarUrl: user.avatarUrl,
      hasPinSet: !!user.pinHash,
    },
    memberships: memberships.map(m => ({
      id:          m.id,
      societyId:   m.societyId,
      societyName: m.society.name,
      societyCity: m.society.city,
      flatNumber:  m.flatNumber,
      role:        m.role,
      status:      m.status,
    })),
  });
});

// ─── POST /auth/refresh-token ─────────────────────────────────────────────────

authRouter.post('/refresh-token', validate(refreshSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;

  const payload = jwtService.verifyRefreshToken(refreshToken);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }

  const tokenHash = hashToken(refreshToken);
  const stored    = await prisma.refreshTokenFamily.findUnique({ where: { tokenHash } });

  if (!stored) {
    // Could be old-format token (pre-upgrade) — fall back to legacy table
    const legacy = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!legacy || legacy.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Refresh token expired or revoked' });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    const accessToken = jwtService.signAccessToken({ userId: user.id, phone: user.phone });
    return res.json({ success: true, accessToken });
  }

  if (stored.expiresAt < new Date()) {
    return res.status(401).json({ success: false, message: 'Refresh token expired' });
  }

  // ── Token reuse detection — possible theft ─────────────────────────────────
  if (stored.isUsed) {
    // Invalidate ALL tokens in this family immediately
    await prisma.refreshTokenFamily.deleteMany({ where: { familyId: stored.familyId } });
    console.warn(`[security] Refresh token reuse detected for user ${stored.userId} — family ${stored.familyId} invalidated`);
    SecurityAuditService.log({
      userId: stored.userId,
      action: 'auth.token_reuse_detected',
      ipAddress: SecurityAuditService.extractIp(req),
      userAgent: req.headers['user-agent'],
      success: false,
      metadata: { familyId: stored.familyId },
    });
    return res.status(401).json({ success: false, message: 'Refresh token already used. All sessions invalidated for security.' });
  }

  // ── Mark current token as used ────────────────────────────────────────────
  await prisma.refreshTokenFamily.update({
    where: { tokenHash },
    data:  { isUsed: true },
  });

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return res.status(401).json({ success: false, message: 'User not found' });

  // ── Issue new token in same family ────────────────────────────────────────
  const newTokenId    = uuidv4();
  const newExpiresAt  = new Date(Date.now() + REFRESH_EXPIRY_MS);
  const newRefresh    = jwtService.signRefreshToken({ userId: user.id, tokenId: newTokenId });
  const newHash       = hashToken(newRefresh);

  await prisma.refreshTokenFamily.create({
    data: {
      familyId:  stored.familyId,
      userId:    user.id,
      tokenHash: newHash,
      expiresAt: newExpiresAt,
    },
  });

  const accessToken = jwtService.signAccessToken({ userId: user.id, phone: user.phone });

  res.json({ success: true, accessToken, refreshToken: newRefresh });
});

// ─── DELETE /auth/logout ──────────────────────────────────────────────────────

authRouter.delete('/logout', requireAuth, validate(refreshSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokenHash = hashToken(refreshToken);

  // Try new family table first
  const stored = await prisma.refreshTokenFamily.findUnique({ where: { tokenHash } });
  if (stored) {
    await prisma.refreshTokenFamily.deleteMany({ where: { familyId: stored.familyId } });
  } else {
    // Legacy table
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }
  const { userId } = (req as AuthenticatedRequest).user;
  SecurityAuditService.log({
    userId,
    action: 'auth.logout',
    ipAddress: SecurityAuditService.extractIp(req),
    userAgent: req.headers['user-agent'],
    success: true,
  });
  res.json({ success: true, message: 'Logged out' });
});

// ─── PUT /auth/push-token ─────────────────────────────────────────────────────

const pushTokenSchema = z.object({
  expoPushToken: z.string().startsWith('ExponentPushToken[').endsWith(']'),
});

authRouter.put('/push-token', requireAuth, validate(pushTokenSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { expoPushToken } = req.body as z.infer<typeof pushTokenSchema>;
  await prisma.user.update({ where: { id: userId }, data: { expoPushToken } });
  res.json({ success: true });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, phone: true, name: true, email: true, avatarUrl: true, pinHash: true },
  });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({
    success: true,
    user: {
      id:        user.id,
      phone:     decryptField(user.phone),
      name:      user.name,
      email:     user.email ? decryptField(user.email) : null,
      avatarUrl: user.avatarUrl,
      hasPinSet: !!user.pinHash,
    },
  });
});

// ─── GET /auth/devices ────────────────────────────────────────────────────────

authRouter.get('/devices', requireAuth, async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const devices = await prisma.deviceSession.findMany({
    where:   { userId },
    orderBy: { lastSeenAt: 'desc' },
    select:  { id: true, deviceId: true, deviceName: true, ipAddress: true, lastSeenAt: true, isTrusted: true, createdAt: true },
  });
  res.json({ success: true, devices });
});

// ─── DELETE /auth/devices/:id ─────────────────────────────────────────────────

authRouter.delete('/devices/:id', requireAuth, async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const device = await prisma.deviceSession.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  await prisma.deviceSession.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Device revoked' });
});

// ─── POST /auth/pin/set ───────────────────────────────────────────────────────

authRouter.post('/pin/set', requireAuth, validate(setPinSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { pin } = req.body as z.infer<typeof setPinSchema>;

  const pepperedPin = pin + env.security.pinPepper;
  const pinHash = await bcrypt.hash(pepperedPin, 12);

  await prisma.user.update({ where: { id: userId }, data: { pinHash } });
  res.json({ success: true, message: 'PIN set successfully' });
});

// ─── POST /auth/pin/verify ────────────────────────────────────────────────────

authRouter.post('/pin/verify', requireAuth, validate(verifyPinSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { pin } = req.body as z.infer<typeof verifyPinSchema>;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true } });
  if (!user?.pinHash) {
    return res.status(400).json({ success: false, message: 'No PIN set. Please set a PIN first.' });
  }

  const pepperedPin = pin + env.security.pinPepper;
  const matches = await bcrypt.compare(pepperedPin, user.pinHash);
  if (!matches) {
    return res.status(401).json({ success: false, message: 'Incorrect PIN' });
  }

  const sensitiveActionToken = jwtService.signSensitiveActionToken(userId);
  res.json({ success: true, sensitiveActionToken });
});

// ─── POST /auth/otp-action-token ───────────────────────────────────────────────
// Same purpose as /auth/pin/verify (issues a 5-min sensitive-action token) for users
// who have never set a PIN — call POST /auth/send-otp first, then this with the code.
// Verifies against the *authenticated* user's own phone, not an arbitrary one.

authRouter.post('/otp-action-token', requireAuth, validate(otpActionTokenSchema), async (req: Request, res: Response) => {
  const { userId, phone } = (req as AuthenticatedRequest).user;
  const { otp } = req.body as z.infer<typeof otpActionTokenSchema>;

  const valid = await otpService.verify(phone, otp);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
  }

  const sensitiveActionToken = jwtService.signSensitiveActionToken(userId);
  res.json({ success: true, sensitiveActionToken });
});

// ─── POST /auth/signing-key ────────────────────────────────────────────────────
// Issues a short-lived per-user HMAC signing key so the mobile client can sign
// state-changing requests (visitor approve/reject, complaint status) without a
// static secret ever being shipped inside the app bundle. Fetch this right before
// the signed call — it expires in 5 minutes, same lifetime as the PIN action token.

authRouter.post('/signing-key', requireAuth, async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { key, expiresInSeconds } = await hmacKeyService.issue(userId);
  res.json({ success: true, key, expiresInSeconds });
});
