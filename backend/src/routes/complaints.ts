import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { aiService, Priority } from '../services/ai.service';
import { storageService } from '../services/storage.service';
import { notificationService } from '../services/notification.service';

export const complaintsRouter = Router();
complaintsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  societyId: z.string().uuid(),
  title: z.string().min(5).max(300),
  description: z.string().max(2000).optional(),
  category: z.string().optional(), // AI will auto-assign, but resident can hint
});

const updateStatusSchema = z.object({
  status: z.enum(['assigned', 'in_progress', 'resolved', 'closed']),
  assignedToId: z.string().uuid().optional(),
  resolutionNote: z.string().optional(),
});

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(500).optional(),
});

const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
  societyId: z.string().uuid(),
});

// ─── POST /complaints — File a complaint ──────────────────────────────────────

complaintsRouter.post(
  '/',
  upload.array('photos', 5),
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const body = createSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: body.error.errors });
    }
    const { societyId, title, description } = body.data;

    // Verify membership
    const member = await prisma.societyMember.findFirst({
      where: { userId, societyId, status: 'approved' },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Not an approved member' });

    // Upload photos to local storage (or S3 in prod)
    const files = req.files as Express.Multer.File[] | undefined;
    const photoUrls: string[] = [];
    if (files?.length) {
      for (const file of files) {
        const url = await storageService.save(file.originalname, file.buffer, file.mimetype);
        photoUrls.push(url);
      }
    }

    // 🤖 AI Triage — runs in parallel with DB write for speed
    const [triage, user, society] = await Promise.all([
      aiService.triageComplaint(title, description ?? ''),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.society.findUnique({ where: { id: societyId }, select: { name: true } }),
    ]);

    // Create complaint with AI-assigned priority and category
    const complaint = await prisma.complaint.create({
      data: {
        societyId,
        raisedById: userId,
        flatNumber: member.flatNumber,
        title,
        description,
        photos: photoUrls,
        category: triage.category,
        priority: triage.priority as any,
        status: 'open',
        // Store AI reasoning in resolution note temporarily (until committee assigns)
        resolutionNote: undefined,
      },
      include: {
        raisedBy: { select: { name: true, phone: true } },
      },
    });

    // 🤖 AI drafts committee response immediately
    const draftResponse = await aiService.draftCommitteeResponse(
      user?.name ?? 'Resident',
      member.flatNumber,
      society?.name ?? 'Society',
      triage,
      title
    );

    // Push notification to all committee/admin members
    const committeeMembers = await prisma.societyMember.findMany({
      where: { societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
      include: { user: { select: { expoPushToken: true } } },
    });
    const committeeTokens = committeeMembers
      .map((m) => m.user.expoPushToken)
      .filter((t): t is string => !!t);

    notificationService.newComplaint({
      committeeTokens,
      flatNumber: member.flatNumber,
      societyName: society?.name ?? 'Society',
      complaintTitle: title,
      complaintId: complaint.id,
      priority: triage.priority,
    });

    res.status(201).json({
      success: true,
      complaint: {
        id: complaint.id,
        title: complaint.title,
        status: complaint.status,
        priority: complaint.priority,
        category: complaint.category,
        photos: complaint.photos,
        createdAt: complaint.createdAt,
      },
      ai: {
        triage: {
          priority: triage.priority,
          category: triage.category,
          reasoning: triage.reasoning,
          estimatedResolutionHours: triage.estimatedResolutionHours,
          isEmergency: triage.isEmergency,
        },
        // Draft response shown to resident as an "immediate acknowledgement"
        acknowledgement: draftResponse.body,
      },
    });
  }
);

// ─── GET /complaints — List complaints ────────────────────────────────────────

complaintsRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const myOnly = req.query.myOnly === 'true';

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const isCommittee = ['committee', 'admin'].includes(member.role);

  const complaints = await prisma.complaint.findMany({
    where: {
      societyId,
      ...(myOnly || !isCommittee ? { raisedById: userId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(priority ? { priority: priority as any } : {}),
    },
    include: {
      raisedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: [
      // Critical first, then by date
      { priority: 'asc' },
      { createdAt: 'desc' },
    ],
    take: 50,
  });

  res.json({ success: true, complaints });
});

// ─── GET /complaints/:id — Get complaint detail with tracker ──────────────────

complaintsRouter.get('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { id } = req.params;

  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: {
      raisedBy: { select: { name: true, phone: true } },
      assignedTo: { select: { name: true, phone: true } },
    },
  });
  if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });

  // Check membership
  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: complaint.societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Access denied' });

  // Build Swiggy-style tracker steps
  const tracker = buildTracker(complaint);

  res.json({ success: true, complaint, tracker });
});

// ─── PUT /complaints/:id/status — Committee updates status ────────────────────

complaintsRouter.put('/:id/status', validate(updateStatusSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { id } = req.params;
  const { status, assignedToId, resolutionNote } = req.body as z.infer<typeof updateStatusSchema>;

  const complaint = await prisma.complaint.findUnique({ where: { id } });
  if (!complaint) return res.status(404).json({ success: false, message: 'Not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: complaint.societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const updated = await prisma.complaint.update({
    where: { id },
    data: {
      status: status as any,
      ...(assignedToId ? { assignedToId } : {}),
      ...(resolutionNote ? { resolutionNote } : {}),
      ...(status === 'resolved' ? { resolvedAt: new Date() } : {}),
    },
  });

  // Notify resident of status change
  const residentUser = await prisma.user.findUnique({
    where: { id: complaint.raisedById },
    select: { expoPushToken: true },
  });
  if (residentUser?.expoPushToken) {
    notificationService.complaintStatusUpdate({
      residentToken: residentUser.expoPushToken,
      complaintTitle: complaint.title,
      complaintId: complaint.id,
      newStatus: status,
      resolutionNote,
    });
  }

  res.json({ success: true, complaint: updated });
});

// ─── POST /complaints/:id/rate — Resident rates resolution ───────────────────

complaintsRouter.post('/:id/rate', validate(rateSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { id } = req.params;
  const { rating } = req.body as z.infer<typeof rateSchema>;

  const complaint = await prisma.complaint.findUnique({ where: { id } });
  if (!complaint) return res.status(404).json({ success: false, message: 'Not found' });
  if (complaint.raisedById !== userId) return res.status(403).json({ success: false, message: 'Only the reporter can rate' });
  if (complaint.status !== 'resolved') return res.status(400).json({ success: false, message: 'Complaint must be resolved first' });

  await prisma.complaint.update({ where: { id }, data: { rating, status: 'closed' } });
  res.json({ success: true });
});

// ─── POST /ai/chat — Resident AI chatbot ─────────────────────────────────────

complaintsRouter.post('/ai/chat', validate(chatSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { messages, societyId } = req.body as z.infer<typeof chatSchema>;

  const [user, member, society, openComplaints, latestBill, recentAnnouncements] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.societyMember.findFirst({ where: { userId, societyId, status: 'approved' } }),
    prisma.society.findUnique({ where: { id: societyId }, select: { name: true } }),
    prisma.complaint.findMany({
      where: { societyId, raisedById: userId, status: { notIn: ['closed'] } },
      select: { title: true, status: true, priority: true },
      take: 5,
    }),
    prisma.maintenanceBill.findFirst({
      where: { societyId, flatNumber: (await prisma.societyMember.findFirst({ where: { userId, societyId } }))?.flatNumber ?? '', status: { in: ['unpaid', 'overdue'] } },
      orderBy: { billMonth: 'desc' },
    }),
    prisma.announcement.findMany({
      where: { societyId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { title: true, createdAt: true },
    }),
  ]);

  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const reply = await aiService.chat(messages, {
    residentName: user?.name ?? 'Resident',
    flatNumber: member.flatNumber,
    societyName: society?.name ?? 'Your Society',
    pendingDues: latestBill ? Number(latestBill.totalAmount) : 0,
    openComplaints: openComplaints.map(c => ({
      title: c.title,
      status: c.status,
      priority: c.priority as Priority,
    })),
    recentAnnouncements: recentAnnouncements.map(a => ({
      title: a.title,
      date: a.createdAt.toLocaleDateString('en-IN'),
    })),
  });

  res.json({ success: true, reply });
});

// ─── GET /complaints/stats — Analytics (committee) ───────────────────────────

complaintsRouter.get('/stats/summary', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const [byStatus, byPriority, avgResolutionTime] = await Promise.all([
    prisma.complaint.groupBy({ by: ['status'], where: { societyId }, _count: true }),
    prisma.complaint.groupBy({ by: ['priority'], where: { societyId }, _count: true }),
    prisma.complaint.aggregate({
      where: { societyId, status: 'closed', resolvedAt: { not: null } },
      _avg: { rating: true },
    }),
  ]);

  res.json({ success: true, stats: { byStatus, byPriority, avgRating: avgResolutionTime._avg.rating } });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTracker(complaint: any) {
  const steps = [
    {
      id: 'received',
      label: 'Received',
      description: 'Your complaint has been received and logged.',
      completed: true,
      timestamp: complaint.createdAt,
    },
    {
      id: 'triaged',
      label: 'AI Triaged',
      description: `Classified as ${complaint.priority.toUpperCase()} priority in ${complaint.category}.`,
      completed: true,
      timestamp: complaint.createdAt,
    },
    {
      id: 'assigned',
      label: 'Assigned',
      description: complaint.assignedTo
        ? `Assigned to ${complaint.assignedTo.name}`
        : 'Waiting for committee to assign a technician.',
      completed: ['assigned', 'in_progress', 'resolved', 'closed'].includes(complaint.status),
      timestamp: null,
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      description: 'Technician is working on your complaint.',
      completed: ['in_progress', 'resolved', 'closed'].includes(complaint.status),
      timestamp: null,
    },
    {
      id: 'resolved',
      label: 'Resolved',
      description: complaint.resolutionNote ?? 'Issue has been fixed.',
      completed: ['resolved', 'closed'].includes(complaint.status),
      timestamp: complaint.resolvedAt,
    },
  ];

  const currentStep = [...steps].reverse().find(s => s.completed);
  return { steps, currentStep: currentStep?.id ?? 'received' };
}
