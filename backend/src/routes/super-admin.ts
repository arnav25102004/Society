/**
 * Super Admin routes — platform-wide access requiring SUPER_ADMIN_SECRET.
 * These routes are NOT society-scoped; they have visibility across all societies/users.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { decryptField } from '../utils/encryption';

export const superAdminRouter = Router();

/** Middleware: require role === 'superadmin' in the JWT payload */
function requireSuperAdmin(req: Request, res: Response, next: Function) {
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
  next();
}

superAdminRouter.use(requireAuth, requireSuperAdmin);

// ─── GET /super-admin/stats — Platform overview stats ─────────────────────────

superAdminRouter.get('/stats', async (_req: Request, res: Response) => {
  const [totalSocieties, totalUsers, totalMembers, pendingMembers, totalComplaints, activeAlerts] = await Promise.all([
    prisma.society.count(),
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.societyMember.count({ where: { status: 'approved' } }),
    prisma.societyMember.count({ where: { status: 'pending' } }),
    prisma.complaint.count(),
    prisma.sosAlert.count({ where: { status: 'active' } }),
  ]);

  res.json({
    success: true,
    stats: { totalSocieties, totalUsers, totalMembers, pendingMembers, totalComplaints, activeAlerts },
  });
});

// ─── GET /super-admin/societies — All societies with counts ───────────────────

superAdminRouter.get('/societies', async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
  const limit = Math.min(100, parseInt(String(req.query.limit ?? '20'), 10));
  const search = String(req.query.search ?? '');

  const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

  const [societies, total] = await Promise.all([
    prisma.society.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            members: { where: { status: 'approved' } },
          },
        },
      },
    }),
    prisma.society.count({ where }),
  ]);

  res.json({ success: true, societies, total, page, pages: Math.ceil(total / limit) });
});

// ─── GET /super-admin/societies/:id/members — Members of any society ──────────

superAdminRouter.get('/societies/:id/members', async (req: Request, res: Response) => {
  const { id } = req.params;
  const members = await prisma.societyMember.findMany({
    where: { societyId: id },
    include: { user: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'desc' },
  });

  const decrypted = members.map(m => ({
    ...m,
    flatNumber: decryptField(m.flatNumber),
    user: { ...m.user, phone: decryptField(m.user.phone) },
  }));

  res.json({ success: true, members: decrypted });
});

// ─── PUT /super-admin/societies/:id/members/:memberId/approve ─────────────────

superAdminRouter.put('/societies/:id/members/:memberId/approve', async (req: Request, res: Response) => {
  const { memberId } = req.params;
  const member = await prisma.societyMember.update({
    where: { id: memberId },
    data: { status: 'approved' },
  });
  res.json({ success: true, member });
});

// ─── PUT /super-admin/societies/:id/members/:memberId/reject ──────────────────

superAdminRouter.put('/societies/:id/members/:memberId/reject', async (req: Request, res: Response) => {
  const { memberId } = req.params;
  const member = await prisma.societyMember.update({
    where: { id: memberId },
    data: { status: 'rejected' },
  });
  res.json({ success: true, member });
});

// ─── GET /super-admin/users — All users ───────────────────────────────────────

superAdminRouter.get('/users', async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
  const limit = Math.min(100, parseInt(String(req.query.limit ?? '20'), 10));
  const search = String(req.query.search ?? '');

  const where = search
    ? { isDeleted: false, name: { contains: search, mode: 'insensitive' as const } }
    : { isDeleted: false };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, phone: true, email: true, avatarUrl: true, createdAt: true, isDeleted: true,
        _count: { select: { memberships: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  const decrypted = users.map(u => ({ ...u, phone: decryptField(u.phone) }));
  res.json({ success: true, users: decrypted, total, page, pages: Math.ceil(total / limit) });
});

// ─── DELETE /super-admin/users/:id — Soft-delete a user ──────────────────────

superAdminRouter.delete('/users/:id', async (req: Request, res: Response) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { isDeleted: true } });
  res.json({ success: true, message: 'User soft-deleted' });
});
