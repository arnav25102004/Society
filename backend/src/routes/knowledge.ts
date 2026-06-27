/**
 * Society Knowledge Base — committee-filled FAQ that powers the chatbot's
 * `search_knowledge` tool (Phase 2). Committees add policy entries (pet rules,
 * parking, amenity timings…); residents query them through SocietyBot.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';

export const knowledgeRouter = Router();
knowledgeRouter.use(requireAuth);

const createSchema = z.object({
  societyId: z.string().uuid(),
  topic: z.string().min(2).max(200),
  question: z.string().min(5).max(500),
  answer: z.string().min(2),
  keywords: z.array(z.string()).optional(),
});

// GET /knowledge?societyId= — list entries (any approved member)
knowledgeRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');
  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({ where: { userId, societyId, status: 'approved' } });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const entries = await prisma.knowledgeEntry.findMany({
    where: { societyId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ success: true, entries });
});

// POST /knowledge — add an entry (committee/admin only)
knowledgeRouter.post('/', validate(createSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyId, topic, question, answer, keywords } = req.body as z.infer<typeof createSchema>;

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const entry = await prisma.knowledgeEntry.create({
    data: { societyId, topic, question, answer, keywords: keywords ?? [], createdById: userId },
  });
  res.status(201).json({ success: true, entry });
});

// DELETE /knowledge/:id — remove an entry (committee/admin only)
knowledgeRouter.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const entry = await prisma.knowledgeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ success: false, message: 'Not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: entry.societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  await prisma.knowledgeEntry.delete({ where: { id: entry.id } });
  res.json({ success: true });
});
