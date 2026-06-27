import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { storageService } from '../services/storage.service';
import { notificationService } from '../services/notification.service';

export const visitorsRouter = Router();
visitorsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

    const guardMember = await prisma.societyMember.findFirst({
      where: { userId, societyId, role: { in: ['guard', 'committee', 'admin'] }, status: 'approved' },
    });
    if (!guardMember) return res.status(403).json({ success: false, message: 'Guard access required' });

    // Check pre-approval
    const now = new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = dayNames[now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const preApproval = await prisma.preApproval.findFirst({
      where: {
        societyId,
        flatNumber,
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
        flatNumber,
        visitorName,
        visitorPhone,
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
        where: { societyId, flatNumber, status: 'approved' },
        include: { user: { select: { expoPushToken: true, id: true } } },
      });
      const tokens = residentMembers.map(m => m.user.expoPushToken).filter((t): t is string => !!t);

      if (tokens.length) {
        notificationService.visitorArrival({
          residentTokens: tokens,
          visitorName,
          purpose,
          visitorId: visitor.id,
          flatNumber,
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

    res.status(201).json({ success: true, visitor, isPreApproved });
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

  res.json({ success: true, visitors });
});

// ─── PUT /visitors/:id/approve — Resident approves visitor ───────────────────

visitorsRouter.put('/:id/approve', async (req: Request, res: Response) => {
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

  res.json({ success: true, visitor: updated });
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

  res.json({ success: true, visitor: updated });
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

  res.json({ success: true, visitor: updated });
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
      flatNumber: member.flatNumber,
      visitorName,
      visitorPhone,
      schedule: schedule ?? Prisma.JsonNull,
      validFrom: new Date(validFrom),
      validUntil: validUntil ? new Date(validUntil) : null,
    },
  });

  res.status(201).json({ success: true, preApproval });
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

  res.json({ success: true, preApprovals });
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
