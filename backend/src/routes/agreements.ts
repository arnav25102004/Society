/**
 * Smart Agreements (Phase 3) — LLM-generated rental / lease / leave-license
 * documents with auto-inserted society clauses. Generation only (no RAG);
 * a single agreement fits in the model context.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { aiService, AgreementType } from '../services/ai.service';

export const agreementsRouter = Router();
agreementsRouter.use(requireAuth);

const generateSchema = z.object({
  societyId: z.string().uuid(),
  type: z.enum(['rent', 'lease', 'leave_license']),
  flatNumber: z.string().min(1).max(20),
  details: z.record(z.any()), // landlordName, tenantName, monthlyRent, deposit, durationMonths, startDate, …
});

// POST /agreements/generate — generate + store a draft (owner/committee/admin)
agreementsRouter.post('/generate', validate(generateSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyId, type, flatNumber, details } = req.body as z.infer<typeof generateSchema>;

  const [member, society] = await Promise.all([
    prisma.societyMember.findFirst({
      where: { userId, societyId, role: { in: ['owner', 'committee', 'admin'] }, status: 'approved' },
    }),
    prisma.society.findUnique({ where: { id: societyId }, select: { name: true } }),
  ]);
  if (!member) return res.status(403).json({ success: false, message: 'Owner or committee access required' });

  const content = await aiService.generateAgreement({
    type: type as AgreementType,
    societyName: society?.name ?? 'Society',
    flatNumber,
    details,
  });

  const agreement = await prisma.agreement.create({
    data: { societyId, createdById: userId, type, flatNumber, inputs: details, content, status: 'draft' },
  });

  res.status(201).json({ success: true, agreement });
});

// GET /agreements?societyId= — list (approved member)
agreementsRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');
  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({ where: { userId, societyId, status: 'approved' } });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const agreements = await prisma.agreement.findMany({
    where: { societyId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, status: true, flatNumber: true, createdAt: true },
  });
  res.json({ success: true, agreements });
});

// GET /agreements/:id — fetch one (scoped to caller's society membership)
agreementsRouter.get('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const agreement = await prisma.agreement.findUnique({ where: { id: req.params.id } });
  if (!agreement) return res.status(404).json({ success: false, message: 'Not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: agreement.societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  res.json({ success: true, agreement });
});
