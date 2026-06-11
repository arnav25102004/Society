import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { otpService } from '../services/otp.service';
import { jwtService } from '../services/jwt.service';
import { prisma } from '../config/db';

export const authRouter = Router();

// Rate limiter specifically for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

authRouter.use(authLimiter);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const sendOtpSchema = z.object({
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  deviceId: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────

authRouter.post('/send-otp', validate(sendOtpSchema), async (req: Request, res: Response) => {
  const { phone } = req.body as z.infer<typeof sendOtpSchema>;
  const result = await otpService.send(phone);
  if (!result.success) {
    return res.status(429).json({ success: false, message: result.message });
  }
  res.json({ success: true, message: result.message });
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
// Returns JWT pair + user profile + membership status

authRouter.post('/verify-otp', validate(verifyOtpSchema), async (req: Request, res: Response) => {
  const { phone, otp, deviceId } = req.body as z.infer<typeof verifyOtpSchema>;

  const valid = await otpService.verify(phone, otp);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
  }

  // Upsert user — create on first login
  let user = await prisma.user.findUnique({ where: { phone } });
  const isNewUser = !user;

  if (!user) {
    user = await prisma.user.create({
      data: { phone, name: '' }, // name filled in ProfileSetup
    });
  }

  // Check if user is already in any approved society
  const memberships = await prisma.societyMember.findMany({
    where: { userId: user.id, status: 'approved' },
    include: { society: { select: { id: true, name: true, city: true } } },
  });

  // Issue tokens
  const tokenId = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const refreshToken = jwtService.signRefreshToken({ userId: user.id, tokenId });
  await prisma.refreshToken.create({
    data: { userId: user.id, token: refreshToken, deviceId, expiresAt },
  });

  const accessToken = jwtService.signAccessToken({ userId: user.id, phone: user.phone });

  res.json({
    success: true,
    isNewUser,
    tokens: { accessToken, refreshToken },
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    memberships: memberships.map((m) => ({
      id: m.id,
      societyId: m.societyId,
      societyName: m.society.name,
      societyCity: m.society.city,
      flatNumber: m.flatNumber,
      role: m.role,
      status: m.status,
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

  // Check token exists in DB (allows server-side revocation)
  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    return res.status(401).json({ success: false, message: 'Refresh token expired or revoked' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return res.status(401).json({ success: false, message: 'User not found' });

  const accessToken = jwtService.signAccessToken({ userId: user.id, phone: user.phone });
  res.json({ success: true, accessToken });
});

// ─── DELETE /auth/logout ──────────────────────────────────────────────────────

authRouter.delete('/logout', requireAuth, validate(refreshSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  res.json({ success: true, message: 'Logged out' });
});

// ─── PUT /auth/push-token — Register Expo push token ─────────────────────────

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
    where: { id: userId },
    select: { id: true, phone: true, name: true, email: true, avatarUrl: true },
  });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});
