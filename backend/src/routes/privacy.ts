/**
 * DPDPA (Digital Personal Data Protection Act) privacy endpoints.
 *
 * POST /privacy/consent          — Record a new consent
 * DELETE /privacy/consent/:type  — Record revocation (row kept for legal audit trail)
 * GET  /privacy/my-data          — Data portability — all data about the requesting user
 * POST /privacy/delete-account   — Soft-delete / anonymise user account
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { decryptField } from '../utils/encryption';

export const privacyRouter = Router();
privacyRouter.use(requireAuth);

// ─── POST /privacy/consent ────────────────────────────────────────────────────

const consentSchema = z.object({
  consentType:   z.enum(['data_collection', 'push_notifications', 'photo_capture']),
  policyVersion: z.string().max(20).default('1.0'),
});

privacyRouter.post('/consent', validate(consentSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { consentType, policyVersion } = req.body as z.infer<typeof consentSchema>;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';

  await prisma.consentRecord.create({
    data: {
      id:            uuidv4(),
      userId,
      consentType:   consentType as any,
      ipAddress:     ip,
      policyVersion,
    },
  });

  res.json({ success: true, message: `Consent recorded for ${consentType}` });
});

// ─── DELETE /privacy/consent/:type — Revoke a consent ────────────────────────

privacyRouter.delete('/consent/:type', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const type = req.params.type;

  const validTypes = ['data_collection', 'push_notifications', 'photo_capture'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid consent type' });
  }

  // Find the latest active consent of this type
  const consent = await prisma.consentRecord.findFirst({
    where:   { userId, consentType: type as any, revokedAt: null },
    orderBy: { consentedAt: 'desc' },
  });

  if (!consent) {
    return res.status(404).json({ success: false, message: 'No active consent found for this type' });
  }

  // Mark as revoked (row is preserved for legal audit trail)
  await prisma.consentRecord.update({
    where: { id: consent.id },
    data:  { revokedAt: new Date() },
  });

  res.json({ success: true, message: `Consent for ${type} revoked` });
});

// ─── GET /privacy/my-data — Data portability ─────────────────────────────────

privacyRouter.get('/my-data', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;

  const [user, memberships, complaints, payments, consents, devices] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, phone: true, name: true, email: true, avatarUrl: true, createdAt: true },
    }),
    prisma.societyMember.findMany({
      where:   { userId },
      include: { society: { select: { name: true, city: true } } },
    }),
    prisma.complaint.findMany({
      where:  { raisedById: userId },
      select: { id: true, title: true, category: true, priority: true, status: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where:  { userId },
      select: { id: true, amount: true, status: true, paidAt: true, createdAt: true },
    }),
    prisma.consentRecord.findMany({
      where:   { userId },
      orderBy: { consentedAt: 'desc' },
    }),
    prisma.deviceSession.findMany({
      where:   { userId },
      select:  { deviceId: true, deviceName: true, lastSeenAt: true, createdAt: true },
    }),
  ]);

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  res.json({
    success: true,
    exportedAt: new Date().toISOString(),
    data: {
      profile: {
        id:        user.id,
        phone:     decryptField(user.phone),
        name:      user.name,
        email:     user.email ? decryptField(user.email) : null,
        avatarUrl: user.avatarUrl,
        memberSince: user.createdAt,
      },
      memberships: memberships.map(m => ({
        society:    m.society.name,
        city:       m.society.city,
        flatNumber: decryptField(m.flatNumber),
        role:       m.role,
        status:     m.status,
        joinedAt:   m.joinedAt,
      })),
      complaints: complaints.map(c => ({ id: c.id, title: c.title, category: c.category, status: c.status, createdAt: c.createdAt })),
      payments:   payments.map(p => ({ id: p.id, amount: p.amount, status: p.status, paidAt: p.paidAt })),
      consents,
      devices,
    },
  });
});

// ─── POST /privacy/delete-account — Soft-delete / anonymise ──────────────────

privacyRouter.post('/delete-account', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;

  await prisma.$transaction(async (tx) => {
    // Anonymise user: clear PII, mark deleted
    await tx.user.update({
      where: { id: userId },
      data: {
        name:          'Deleted User',
        phone:         `deleted_${userId}`,  // must remain unique — use userId as suffix
        email:         null,
        avatarUrl:     null,
        expoPushToken: null,
        pinHash:       null,
        isDeleted:     true,
      },
    });

    // Revoke all active consents
    await tx.consentRecord.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });

    // Invalidate all refresh token families
    await tx.refreshTokenFamily.deleteMany({ where: { userId } });
    await tx.refreshToken.deleteMany({ where: { userId } });

    // Remove device sessions
    await tx.deviceSession.deleteMany({ where: { userId } });

    // Deactivate society memberships (keeps for financial records)
    await tx.societyMember.updateMany({
      where: { userId },
      data:  { status: 'rejected' },  // effectively deactivated
    });
  });

  res.json({
    success: true,
    message: 'Account anonymised. Financial records are retained for legal compliance.',
  });
});
