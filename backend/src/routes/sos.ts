import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { notificationService } from '../services/notification.service';

export const sosRouter = Router();
sosRouter.use(requireAuth);

const triggerSosSchema = z.object({
  societyId: z.string().uuid(),
  message: z.string().max(500).optional(),
});

const resolveSchema = z.object({
  resolution: z.string().max(500).optional(),
});

// ─── POST /sos — Trigger SOS ──────────────────────────────────────────────────

sosRouter.post('/', validate(triggerSosSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const { societyId, message } = req.body as z.infer<typeof triggerSosSchema>;

    const member = await prisma.societyMember.findFirst({
      where: { userId, societyId, status: 'approved' },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

    const alert = await prisma.sosAlert.create({
      data: {
        societyId,
        userId,
        flatNumber: member.flatNumber,
        message,
        status: 'active',
      },
      include: { raisedBy: { select: { name: true, phone: true } } },
    });

    // Notify guards and committee — fire-and-forget so notification failure never blocks SOS
    prisma.societyMember.findMany({
      where: { societyId, role: { in: ['guard', 'committee', 'admin'] }, status: 'approved' },
      include: { user: { select: { expoPushToken: true } } },
    }).then((urgentMembers) => {
      const tokens = urgentMembers.map(m => m.user.expoPushToken).filter((t): t is string => !!t);
      notificationService.sosAlert({
        tokens,
        flatNumber: member.flatNumber,
        residentName: alert.raisedBy.name,
        message: message ?? 'Emergency! Immediate assistance required.',
        alertId: alert.id,
      });
    }).catch((err) => console.error('[sos] Notification failed:', err));

    return res.status(201).json({ success: true, alert, message: 'Help is on the way.' });
  } catch (err) {
    console.error('[sos] POST failed:', err);
    return res.status(500).json({ success: false, message: 'Could not send SOS. Please call emergency services: Police 100, Ambulance 108.' });
  }
});

// ─── GET /sos — Active SOS alerts ────────────────────────────────────────────

sosRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const societyId = String(req.query.societyId ?? '');

    if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

    const member = await prisma.societyMember.findFirst({
      where: { userId, societyId, status: 'approved' },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

    const isStaff = ['guard', 'committee', 'admin'].includes(member.role);

    const alerts = await prisma.sosAlert.findMany({
      where: {
        societyId,
        ...(req.query.status ? { status: req.query.status as any } : { status: 'active' }),
        ...(!isStaff ? { userId } : {}),
      },
      include: {
        raisedBy: { select: { name: true, phone: true } },
        respondedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return res.json({ success: true, alerts });
  } catch (err) {
    console.error('[sos] GET failed:', err);
    return res.json({ success: true, alerts: [] });
  }
});

// ─── PUT /sos/:id/resolve — Mark alert as resolved ───────────────────────────

sosRouter.put('/:id/resolve', validate(resolveSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const alert = await prisma.sosAlert.findUnique({ where: { id: req.params.id } });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    const member = await prisma.societyMember.findFirst({
      where: { userId, societyId: alert.societyId, role: { in: ['guard', 'committee', 'admin'] }, status: 'approved' },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Staff access required' });

    const updated = await prisma.sosAlert.update({
      where: { id: alert.id },
      data: { status: 'resolved', respondedById: userId, resolvedAt: new Date() },
    });

    prisma.user.findUnique({ where: { id: alert.userId }, select: { expoPushToken: true } })
      .then((raiser) => {
        if (raiser?.expoPushToken) notificationService.sosResolved({ token: raiser.expoPushToken, alertId: alert.id });
      }).catch(() => {});

    return res.json({ success: true, alert: updated });
  } catch (err) {
    console.error('[sos] PUT resolve failed:', err);
    return res.status(500).json({ success: false, message: 'Failed to resolve alert.' });
  }
});
