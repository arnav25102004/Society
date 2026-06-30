/**
 * Admin security dashboard endpoints (Phase 4).
 * Requires committee/admin role within a society.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/db';

export const securityAdminRouter = Router();
securityAdminRouter.use(requireAuth);

const querySchema = z.object({
  societyId: z.string().uuid(),
  days:      z.coerce.number().int().min(1).max(90).default(7),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(50),
});

// ─── GET /security/audit-log — Paginated audit log for a society ──────────────

securityAdminRouter.get('/audit-log', validate(querySchema, 'query'), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyId, days, page, limit } = req.query as unknown as z.infer<typeof querySchema>;

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const skip  = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.securityAuditLog.findMany({
      where: {
        societyId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.securityAuditLog.count({
      where: { societyId, createdAt: { gte: since } },
    }),
  ]);

  res.json({ success: true, logs, total, page, pages: Math.ceil(total / limit) });
});

// ─── GET /security/summary — Security health summary ─────────────────────────

securityAdminRouter.get('/summary', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId  = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalLast24h,
    failuresLast24h,
    tokenReuseEvents,
    topActions,
  ] = await Promise.all([
    prisma.securityAuditLog.count({ where: { societyId, createdAt: { gte: since24h } } }),
    prisma.securityAuditLog.count({ where: { societyId, createdAt: { gte: since24h }, success: false } }),
    prisma.securityAuditLog.count({ where: { societyId, action: 'auth.token_reuse_detected', createdAt: { gte: since7d } } }),
    prisma.securityAuditLog.groupBy({
      by: ['action'],
      where: { societyId, createdAt: { gte: since7d } },
      _count: true,
      orderBy: { _count: { action: 'desc' } },
      take: 10,
    }),
  ]);

  res.json({
    success: true,
    summary: {
      totalEventsLast24h: totalLast24h,
      failedEventsLast24h: failuresLast24h,
      tokenReuseEventsLast7d: tokenReuseEvents,
      topActionsByFrequency: topActions.map(a => ({ action: a.action, count: a._count })),
    },
  });
});

// ─── GET /security/user-activity/:userId — Activity for a specific user ───────

securityAdminRouter.get('/user-activity/:targetUserId', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId  = String(req.query.societyId ?? '');
  const days       = Math.min(parseInt(String(req.query.days ?? '7'), 10) || 7, 30);

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs = await prisma.securityAuditLog.findMany({
    where: {
      userId:    req.params.targetUserId,
      societyId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, logs });
});
