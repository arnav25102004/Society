import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { storageService } from '../services/storage.service';
import { notificationService } from '../services/notification.service';

export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const createSchema = z.object({
  societyId: z.string().uuid(),
  title: z.string().min(3).max(300),
  body: z.string().min(5),
  category: z.enum(['general', 'maintenance', 'event', 'emergency', 'rule']).default('general'),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  isPinned: z.boolean().optional().default(false),
});

// ─── GET /announcements — List announcements ──────────────────────────────────

announcementsRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const announcements = await prisma.announcement.findMany({
    where: {
      societyId,
      ...(req.query.category ? { category: req.query.category as any } : {}),
    },
    include: {
      postedBy: { select: { name: true, avatarUrl: true } },
      reads: { where: { userId }, select: { readAt: true } },
      _count: { select: { reads: true } },
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });

  const result = announcements.map(a => ({
    ...a,
    isRead: a.reads.length > 0,
    readCount: a._count.reads,
    reads: undefined,
    _count: undefined,
  }));

  res.json({ success: true, announcements: result });
});

// ─── POST /announcements — Create announcement (committee) ────────────────────

announcementsRouter.post(
  '/',
  upload.array('attachments', 3),
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const body = createSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, errors: body.error.errors });
    }
    const { societyId, title, body: announcementBody, category, priority, isPinned } = body.data;

    const member = await prisma.societyMember.findFirst({
      where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

    const files = req.files as Express.Multer.File[] | undefined;
    const attachmentUrls: string[] = [];
    if (files?.length) {
      for (const file of files) {
        const url = await storageService.save(file.originalname, file.buffer, file.mimetype);
        attachmentUrls.push(url);
      }
    }

    const announcement = await prisma.announcement.create({
      data: {
        societyId,
        postedById: userId,
        title,
        body: announcementBody,
        category: category as any,
        priority: priority as any,
        isPinned: isPinned ?? false,
        attachments: attachmentUrls,
      },
      include: { postedBy: { select: { name: true } } },
    });

    // Push notification to all residents
    const allMembers = await prisma.societyMember.findMany({
      where: { societyId, status: 'approved' },
      include: { user: { select: { expoPushToken: true } } },
    });
    const tokens = allMembers.map(m => m.user.expoPushToken).filter((t): t is string => !!t);

    notificationService.newAnnouncement({
      tokens,
      title,
      body: announcementBody.slice(0, 100),
      announcementId: announcement.id,
      priority,
    });

    res.status(201).json({ success: true, announcement });
  }
);

// ─── GET /announcements/:id — Announcement detail + mark read ─────────────────

announcementsRouter.get('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const announcement = await prisma.announcement.findUnique({
    where: { id: req.params.id },
    include: {
      postedBy: { select: { name: true, avatarUrl: true } },
      _count: { select: { reads: true } },
    },
  });
  if (!announcement) return res.status(404).json({ success: false, message: 'Not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: announcement.societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Access denied' });

  // Mark as read
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: announcement.id, userId } },
    create: { announcementId: announcement.id, userId },
    update: {},
  });

  res.json({ success: true, announcement: { ...announcement, readCount: announcement._count.reads } });
});

// ─── PATCH /announcements/:id/pin — Pin/unpin ─────────────────────────────────

announcementsRouter.patch('/:id/pin', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!announcement) return res.status(404).json({ success: false, message: 'Not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: announcement.societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const updated = await prisma.announcement.update({
    where: { id: announcement.id },
    data: { isPinned: !announcement.isPinned },
  });

  res.json({ success: true, announcement: updated });
});

// ─── DELETE /announcements/:id — Delete announcement ─────────────────────────

announcementsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!announcement) return res.status(404).json({ success: false, message: 'Not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: announcement.societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  await prisma.announcement.delete({ where: { id: announcement.id } });
  res.json({ success: true });
});

// ─── GET /announcements/unread-count ─────────────────────────────────────────

announcementsRouter.get('/meta/unread-count', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const total = await prisma.announcement.count({ where: { societyId } });
  const read = await prisma.announcementRead.count({
    where: { userId, announcement: { societyId } },
  });

  res.json({ success: true, unread: total - read, total });
});
