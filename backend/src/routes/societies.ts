import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { customAlphabet } from 'nanoid';
import { parse as parseCsv } from 'csv-parse/sync';
import multer from 'multer';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { encryptSearchable, encryptField, decryptField } from '../utils/encryption';

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB is plenty for a few hundred rows
  fileFilter: (_req, file, cb) => {
    if (!/\.csv$/i.test(file.originalname)) {
      const err = new Error('Only .csv files are accepted') as Error & { status: number };
      err.status = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },
});

export const societiesRouter = Router();
societiesRouter.use(requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSocietySchema = z.object({
  name: z.string().min(3).max(200),
  address: z.string().min(5),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  totalFlats: z.coerce.number().int().min(1).max(10000),
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
        id:          existing.id,
        societyId:   society.id,
        societyName: society.name,
        flatNumber:  decryptField(existing.flatNumber),
        role:        existing.role,
        status:      existing.status,
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
      flatNumber: encryptSearchable(flatNumber),
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
      flatNumber,  // return raw to client
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

  const membersDecrypted = members.map(m => ({
    ...m,
    flatNumber: decryptField(m.flatNumber),
    user: { ...m.user, phone: decryptField(m.user.phone) },
  }));
  res.json({ success: true, members: membersDecrypted });
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

// ─── POST /societies/:id/members/bulk-import — CSV bulk member import ─────────
// Admin/committee uploads a CSV (columns: flatNumber, name, phone, role) to pre-register
// a whole society at once instead of every resident self-registering and waiting for
// individual approval. Each row creates (or reuses) a User keyed by phone, and a
// SocietyMember with status 'approved' directly — when that phone number later verifies
// OTP for the first time (existing /auth/verify-otp flow), it finds this same User row
// and the resident lands straight in the app, already approved.

const csvRowSchema = z.object({
  flatNumber: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Phone must be a 10-digit Indian mobile number'),
  role: z.enum(['owner', 'tenant']).default('owner'),
});

interface RowResult {
  row: number;
  flatNumber: string;
  phone: string;
  status: 'created' | 'already_member' | 'error';
  message?: string;
}

societiesRouter.post(
  '/:id/members/bulk-import',
  csvUpload.single('file'),
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const { id: societyId } = req.params;

    const myMembership = await prisma.societyMember.findFirst({
      where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
    });
    if (!myMembership) {
      return res.status(403).json({ success: false, message: 'Committee access required' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file required (field name: file)' });
    }

    let records: Record<string, string>[];
    try {
      records = parseCsv(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: `Could not parse CSV: ${err.message}` });
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'CSV has no data rows' });
    }
    if (records.length > 1000) {
      return res.status(400).json({ success: false, message: 'Max 1000 rows per import — split into multiple files' });
    }

    const results: RowResult[] = [];

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2; // +1 for 0-index, +1 for header row
      const parsed = csvRowSchema.safeParse(records[i]);
      if (!parsed.success) {
        results.push({
          row: rowNum,
          flatNumber: records[i].flatNumber ?? '',
          phone: records[i].phone ?? '',
          status: 'error',
          message: parsed.error.errors.map(e => e.message).join('; '),
        });
        continue;
      }

      const { flatNumber, name, phone, role } = parsed.data;

      try {
        const encryptedPhone = encryptSearchable(phone);

        let user = await prisma.user.findUnique({ where: { phone: encryptedPhone } });
        if (!user) {
          user = await prisma.user.create({ data: { phone: encryptedPhone, name } });
        }

        const existingMembership = await prisma.societyMember.findFirst({
          where: { userId: user.id, societyId },
        });
        if (existingMembership) {
          results.push({ row: rowNum, flatNumber, phone, status: 'already_member' });
          continue;
        }

        await prisma.societyMember.create({
          data: {
            userId: user.id,
            societyId,
            flatNumber: encryptSearchable(flatNumber),
            role,
            status: 'approved', // pre-approved by the committee via this import
          },
        });

        results.push({ row: rowNum, flatNumber, phone, status: 'created' });
      } catch (err: any) {
        results.push({ row: rowNum, flatNumber, phone, status: 'error', message: err.message });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter(r => r.status === 'created').length,
      alreadyMember: results.filter(r => r.status === 'already_member').length,
      failed: results.filter(r => r.status === 'error').length,
    };

    res.json({ success: true, summary, results });
  }
);

// ─── PATCH /societies/me/profile — Update own profile ────────────────────────

societiesRouter.patch('/me/profile', validate(updateProfileSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const data = req.body as z.infer<typeof updateProfileSchema>;
  const updateData: { name?: string; email?: string } = {};
  if (data.name)  updateData.name  = data.name;
  if (data.email) updateData.email = encryptField(data.email);  // email encrypted at rest
  const user = await prisma.user.update({ where: { id: userId }, data: updateData });
  res.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email ? decryptField(user.email) : null },
  });
});
