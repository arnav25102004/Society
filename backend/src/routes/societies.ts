import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { customAlphabet } from 'nanoid';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';

export const societiesRouter = Router();
societiesRouter.use(requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSocietySchema = z.object({
  name: z.string().min(3).max(200),
  address: z.string().min(5),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  totalFlats: z.number().int().min(1).max(10000),
});

const joinSocietySchema = z.object({
  societyCode: z.string().length(8, 'Society code must be 8 characters').toUpperCase(),
  flatNumber: z.string().min(1).max(20),
  role: z.enum(['owner', 'tenant']),
  name: z.string().min(2).max(200),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  email: z.string().email().optional(),
});

// ─── GET /societies/search ────────────────────────────────────────────────────

societiesRouter.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  const city = String(req.query.city ?? '').trim();

  const societies = await prisma.society.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        city ? { city: { contains: city, mode: 'insensitive' } } : {},
      ],
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      totalFlats: true,
      logoUrl: true,
      societyCode: true,
      _count: { select: { members: { where: { status: 'approved' } } } },
    },
    take: 20,
    orderBy: { name: 'asc' },
  });

  res.json({ success: true, societies });
});

// ─── POST /societies — Create new society ─────────────────────────────────────

societiesRouter.post('/', validate(createSocietySchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const data = req.body as z.infer<typeof createSocietySchema>;

  // Generate unique 8-char society code
  const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);
  let societyCode: string;
  let exists = true;
  do {
    societyCode = nanoid();
    exists = !!(await prisma.society.findUnique({ where: { societyCode } }));
  } while (exists);

  const society = await prisma.$transaction(async (tx) => {
    const s = await tx.society.create({
      data: { ...data, societyCode },
    });
    // Creator becomes admin + first committee member
    await tx.societyMember.create({
      data: {
        userId,
        societyId: s.id,
        flatNumber: 'ADMIN',
        role: 'admin',
        status: 'approved',
      },
    });
    return s;
  });

  res.status(201).json({ success: true, society });
});

// ─── POST /societies/join — Join with society code ────────────────────────────

societiesRouter.post('/join', validate(joinSocietySchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyCode, flatNumber, role, name } = req.body as z.infer<typeof joinSocietySchema>;

  const society = await prisma.society.findUnique({ where: { societyCode } });
  if (!society) {
    return res.status(404).json({ success: false, message: 'Society not found. Check the code.' });
  }

  // If already a member, return the existing record so the app can route correctly
  const existing = await prisma.societyMember.findFirst({
    where: { userId, societyId: society.id },
  });
  if (existing) {
    return res.json({
      success: true,
      alreadyMember: true,
      member: {
        id: existing.id,
        societyId: society.id,
        societyName: society.name,
        flatNumber: existing.flatNumber,
        role: existing.role,
        status: existing.status,
      },
    });
  }

  // Update user name if not yet set
  await prisma.user.update({
    where: { id: userId },
    data: { name: name || undefined },
  });

  const member = await prisma.societyMember.create({
    data: {
      userId,
      societyId: society.id,
      flatNumber,
      role,
      status: 'pending', // Requires committee approval
    },
  });

  res.status(201).json({
    success: true,
    message: 'Request submitted. Awaiting committee approval.',
    member: {
      id: member.id,
      status: member.status,
      societyId: society.id,
      societyName: society.name,
      flatNumber: member.flatNumber,
      role: member.role,
    },
  });
});

// ─── GET /societies/:id — Get society details ─────────────────────────────────

societiesRouter.get('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { id } = req.params;

  const membership = await prisma.societyMember.findFirst({
    where: { userId, societyId: id },
  });
  if (!membership) {
    return res.status(403).json({ success: false, message: 'Not a member of this society' });
  }

  const society = await prisma.society.findUnique({ where: { id } });
  if (!society) return res.status(404).json({ success: false, message: 'Society not found' });

  res.json({ success: true, society, membership });
});

// ─── GET /societies/:id/members — List members (committee only) ───────────────

societiesRouter.get('/:id/members', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { id } = req.params;

  const myMembership = await prisma.societyMember.findFirst({
    where: { userId, societyId: id, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!myMembership) {
    return res.status(403).json({ success: false, message: 'Committee access required' });
  }

  const members = await prisma.societyMember.findMany({
    where: { societyId: id },
    include: { user: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'desc' },
  });

  res.json({ success: true, members });
});

// ─── PUT /societies/:id/members/:memberId/approve ─────────────────────────────

societiesRouter.put('/:id/members/:memberId/approve', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { id, memberId } = req.params;

  const myMembership = await prisma.societyMember.findFirst({
    where: { userId, societyId: id, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!myMembership) {
    return res.status(403).json({ success: false, message: 'Committee access required' });
  }

  const member = await prisma.societyMember.update({
    where: { id: memberId },
    data: { status: 'approved' },
  });

  res.json({ success: true, member });
});

// ─── PUT /societies/:id/members/:memberId/reject ──────────────────────────────

societiesRouter.put('/:id/members/:memberId/reject', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { id, memberId } = req.params;

  const myMembership = await prisma.societyMember.findFirst({
    where: { userId, societyId: id, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!myMembership) {
    return res.status(403).json({ success: false, message: 'Committee access required' });
  }

  const member = await prisma.societyMember.update({
    where: { id: memberId },
    data: { status: 'rejected' },
  });

  res.json({ success: true, member });
});

// ─── PATCH /societies/me/profile — Update own profile ────────────────────────

societiesRouter.patch('/me/profile', validate(updateProfileSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const data = req.body as z.infer<typeof updateProfileSchema>;
  const user = await prisma.user.update({ where: { id: userId }, data });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
});
