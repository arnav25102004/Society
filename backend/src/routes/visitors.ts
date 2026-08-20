import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { imageUpload as upload } from '../middleware/upload';
import { Prisma } from '@prisma/client';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { verifyHmac } from '../middleware/hmac';
import { prisma } from '../config/db';
import { storageService } from '../services/storage.service';
import { notificationService } from '../services/notification.service';
import { encryptField, encryptSearchable, decryptField } from '../utils/encryption';
import { hasPermission } from '../utils/permissions';

export const visitorsRouter = Router();
visitorsRouter.use(requireAuth);

const registerVisitorSchema = z.object({
  societyId: z.string().uuid(),
  flatNumber: z.string().min(1).max(20),
  visitorName: z.string().min(2).max(200),
  visitorPhone: z.string().max(15).optional(),
  purpose: z.enum(['delivery', 'guest', 'cab', 'service', 'other']),
  companyName: z.string().max(100).optional(),
});

const preApprovalSchema = z.object({
  societyId: z.string().uuid(),
  visitorName: z.string().min(2).max(200),
  visitorPhone: z.string().max(15).optional(),
  schedule: z.object({
    days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
  validFrom: z.string(),
  validUntil: z.string().optional(),
});

// ─── POST /visitors — Guard registers visitor ─────────────────────────────────
// Not HMAC-signed: this is a multipart/form-data upload, and HMAC-over-JSON-body
// doesn't apply cleanly to file uploads. Protected instead by requireAuth (real JWT)
// plus the guard/committee/admin role check below — the same protection level most
// other mutating routes in this app rely on.

visitorsRouter.post(
  '/',
  upload.single('photo'),
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const body = registerVisitorSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, errors: body.error.errors });
    }
    const { societyId, flatNumber, visitorName, visitorPhone, purpose, companyName } = body.data;
    // SocietyMember.flatNumber and PreApproval.flatNumber are both encrypted (deterministic,
    // so they're still usable in WHERE clauses) — Visitor.flatNumber must match that same
    // scheme, or every downstream comparison (pre-approval matching, resident notification
    // lookup, the resident's own visitor list, approve/reject) silently fails to find a match.
    const encryptedFlatNumber = encryptSearchable(flatNumber);

    const canWrite = await hasPermission(userId, 'visitor', 'write', { societyId });
    if (!canWrite) return res.status(403).json({ success: false, message: 'Guard access required' });

    const guardMember = await prisma.societyMember.findFirst({
      where: { userId, societyId, role: { in: ['guard', 'committee', 'admin'] }, status: 'approved' },
    });

    // Check pre-approval
    const now = new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = dayNames[now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const preApproval = await prisma.preApproval.findFirst({
      where: {
        societyId,
        flatNumber: encryptedFlatNumber,
        visitorName: { contains: visitorName, mode: 'insensitive' },
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
    });

    let isPreApproved = false;
    if (preApproval) {
      const schedule = preApproval.schedule as any;
      if (!schedule || (schedule.days?.includes(currentDay) && currentTime >= schedule.start_time && currentTime <= schedule.end_time)) {
        isPreApproved = true;
      }
    }

    let photoUrl: string | undefined;
    if (req.file) {
      photoUrl = await storageService.save(req.file.originalname, req.file.buffer, req.file.mimetype);
    }

    const visitor = await prisma.visitor.create({
      data: {
        societyId,
        flatNumber: encryptedFlatNumber,
        visitorName,
        visitorPhone: visitorPhone ? encryptField(visitorPhone) : undefined,
        visitorPhoto: photoUrl,
        purpose: purpose as any,
        companyName,
        status: isPreApproved ? 'pre_approved' : 'pending',
        guardId: userId,
        ...(isPreApproved ? { approvedById: preApproval!.userId, entryTime: new Date() } : {}),
      },
    });

    if (!isPreApproved) {
      // Notify resident of the flat
      const residentMembers = await prisma.societyMember.findMany({
        where: { societyId, flatNumber: encryptedFlatNumber, status: 'approved' },
        include: { user: { select: { expoPushToken: true, id: true } } },
      });
      const tokens = residentMembers.map(m => m.user.expoPushToken).filter((t): t is string => !!t);

      if (tokens.length) {
        notificationService.visitorArrival({
          residentTokens: tokens,
          visitorName,
          purpose,
          visitorId: visitor.id,
          flatNumber, // plaintext for the push notification body text
          companyName,
        });
      }

      // Auto-expire after 5 minutes
      setTimeout(async () => {
        const current = await prisma.visitor.findUnique({ where: { id: visitor.id }, select: { status: true } });
        if (current?.status === 'pending') {
          await prisma.visitor.update({ where: { id: visitor.id }, data: { status: 'expired' } });
        }
      }, 5 * 60 * 1000);
    }

    // Return the plaintext flat number to the client — the guard app needs to display it,
    // not the ciphertext that just got stored.
    res.status(201).json({ success: true, visitor: { ...visitor, flatNumber }, isPreApproved });
  }
);

// ─── GET /visitors — List visitors ───────────────────────────────────────────

visitorsRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const isCommittee = ['committee', 'admin', 'guard'].includes(member.role);

  const visitors = await prisma.visitor.findMany({
    where: {
      societyId,
      ...(!isCommittee ? { flatNumber: member.flatNumber } : {}),
      ...(req.query.status ? { status: req.query.status as any } : {}),
    },
    include: {
      approvedBy: { select: { name: true } },
      guard: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const visitorsDecrypted = await Promise.all(visitors.map(async v => ({
    ...v,
    flatNumber: decryptField(v.flatNumber),
    visitorPhone: v.visitorPhone ? decryptField(v.visitorPhone) : null,
    visitorPhoto: v.visitorPhoto ? await storageService.getSignedUrl(v.visitorPhoto) : null,
  })));
  res.json({ success: true, visitors: visitorsDecrypted });
});

// ─── PUT /visitors/:id/approve — Resident approves visitor ───────────────────
// HMAC-signed: mobile must include X-Signature + X-Timestamp headers

visitorsRouter.put('/:id/approve', verifyHmac, async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const visitor = await prisma.visitor.findUnique({ where: { id: req.params.id } });
  if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
  if (visitor.status !== 'pending') return res.status(400).json({ success: false, message: 'Visitor already processed' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: visitor.societyId, flatNumber: visitor.flatNumber, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not your flat' });

  const updated = await prisma.visitor.update({
    where: { id: visitor.id },
    data: { status: 'approved', approvedById: userId, entryTime: new Date() },
  });

  res.json({ success: true, visitor: { ...updated, flatNumber: decryptField(updated.flatNumber) } });
});

// ─── PUT /visitors/:id/reject — Resident rejects visitor ─────────────────────

visitorsRouter.put('/:id/reject', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const visitor = await prisma.visitor.findUnique({ where: { id: req.params.id } });
  if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
  if (visitor.status !== 'pending') return res.status(400).json({ success: false, message: 'Visitor already processed' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: visitor.societyId, flatNumber: visitor.flatNumber, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not your flat' });

  const updated = await prisma.visitor.update({
    where: { id: visitor.id },
    data: { status: 'rejected', approvedById: userId },
  });

  res.json({ success: true, visitor: { ...updated, flatNumber: decryptField(updated.flatNumber) } });
});

// ─── PUT /visitors/:id/exit — Guard marks exit ───────────────────────────────

visitorsRouter.put('/:id/exit', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const visitor = await prisma.visitor.findUnique({ where: { id: req.params.id } });
  if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: visitor.societyId, role: { in: ['guard', 'committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Guard access required' });

  const updated = await prisma.visitor.update({
    where: { id: visitor.id },
    data: { exitTime: new Date() },
  });

  res.json({ success: true, visitor: { ...updated, flatNumber: decryptField(updated.flatNumber) } });
});

// ─── POST /visitors/pre-approve — Add pre-approval rule ──────────────────────

visitorsRouter.post('/pre-approve', validate(preApprovalSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyId, visitorName, visitorPhone, schedule, validFrom, validUntil } = req.body as z.infer<typeof preApprovalSchema>;

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const preApproval = await prisma.preApproval.create({
    data: {
      societyId,
      userId,
      flatNumber: member.flatNumber,  // already encrypted from join
      visitorName,
      visitorPhone: visitorPhone ? encryptField(visitorPhone) : undefined,
      schedule: schedule ?? Prisma.JsonNull,
      validFrom: new Date(validFrom),
      validUntil: validUntil ? new Date(validUntil) : null,
    },
  });

  res.status(201).json({
    success: true,
    preApproval: { ...preApproval, visitorPhone: visitorPhone ?? null },
  });
});

// ─── GET /visitors/pre-approvals — List my pre-approvals ─────────────────────

visitorsRouter.get('/pre-approvals', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const preApprovals = await prisma.preApproval.findMany({
    where: { userId, societyId },
    orderBy: { createdAt: 'desc' },
  });

  const decrypted = preApprovals.map(p => ({
    ...p,
    visitorPhone: p.visitorPhone ? decryptField(p.visitorPhone) : null,
  }));
  res.json({ success: true, preApprovals: decrypted });
});

// ─── DELETE /visitors/pre-approvals/:id — Remove pre-approval ────────────────

visitorsRouter.delete('/pre-approvals/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const preApproval = await prisma.preApproval.findUnique({ where: { id: req.params.id } });
  if (!preApproval || preApproval.userId !== userId) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  await prisma.preApproval.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
});
