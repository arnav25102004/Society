import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { verifyHmac } from '../middleware/hmac';
import { prisma } from '../config/db';
import { notificationService } from '../services/notification.service';
import { hasPermission } from '../utils/permissions';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const generateBillsSchema = z.object({
  societyId: z.string().uuid(),
  billMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
  amount: z.number().positive(),
  dueDate: z.string(),
  notes: z.string().optional(),
});

const payBillSchema = z.object({
  paymentMethod: z.enum(['upi', 'card', 'netbanking', 'cash']),
  transactionId: z.string().optional(),
});

// ─── GET /payments/bills — My unpaid bills ────────────────────────────────────

paymentsRouter.get('/bills', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const isCommittee = ['committee', 'admin'].includes(member.role);

  const bills = await prisma.maintenanceBill.findMany({
    where: {
      societyId,
      ...(!isCommittee ? { flatNumber: member.flatNumber } : {}),
      ...(req.query.status ? { status: req.query.status as any } : {}),
    },
    orderBy: { billMonth: 'desc' },
    take: 24,
    include: {
      payments: {
        where: { status: 'success' },
        select: { amount: true, paidAt: true, paymentMethod: true, transactionId: true },
      },
    },
  });

  res.json({ success: true, bills });
});

// ─── GET /payments/bills/:id — Bill detail ────────────────────────────────────

paymentsRouter.get('/bills/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const bill = await prisma.maintenanceBill.findUnique({
    where: { id: req.params.id },
    include: { payments: { where: { status: 'success' } } },
  });
  if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });

  // RBAC: residents can only read bills for their own flat; committee can read all
  const canRead = await hasPermission(userId, 'bill', 'read', {
    societyId: bill.societyId,
    flatNumber: bill.flatNumber,
  });
  if (!canRead) return res.status(403).json({ success: false, message: 'Access denied' });

  res.json({ success: true, bill });
});

// ─── POST /payments/bills/:id/pay — Pay a bill ───────────────────────────────
// HMAC-signed: mobile must include X-Signature + X-Timestamp headers

paymentsRouter.post('/bills/:id/pay', verifyHmac, validate(payBillSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { paymentMethod, transactionId } = req.body as z.infer<typeof payBillSchema>;

  const bill = await prisma.maintenanceBill.findUnique({ where: { id: req.params.id } });
  if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
  if (bill.status === 'paid') return res.status(400).json({ success: false, message: 'Already paid' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: bill.societyId, status: 'approved' },
  });
  if (!member || member.flatNumber !== bill.flatNumber) {
    return res.status(403).json({ success: false, message: 'This bill is not for your flat' });
  }

  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        billId: bill.id,
        userId,
        societyId: bill.societyId,
        amount: bill.totalAmount,
        paymentMethod,
        transactionId: transactionId ?? `TXN-${Date.now()}`,
        status: 'success',
        paidAt: new Date(),
      },
    }),
    prisma.maintenanceBill.update({
      where: { id: bill.id },
      data: { status: 'paid' },
    }),
  ]);

  // Notify committee
  const committeeMembers = await prisma.societyMember.findMany({
    where: { societyId: bill.societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
    include: { user: { select: { expoPushToken: true } } },
  });
  const tokens = committeeMembers.map(m => m.user.expoPushToken).filter((t): t is string => !!t);
  if (tokens.length) {
    notificationService.paymentReceived({
      committeeTokens: tokens,
      residentToken: undefined,
      flatNumber: bill.flatNumber,
      amount: Number(bill.totalAmount),
      societyId: bill.societyId,
    });
  }

  res.json({ success: true, payment });
});

// ─── POST /payments/bills/generate — Committee generates bills ────────────────

paymentsRouter.post('/bills/generate', validate(generateBillsSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyId, billMonth, amount, dueDate, notes } = req.body as z.infer<typeof generateBillsSchema>;

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const [year, month] = billMonth.split('-').map(Number);
  const billMonthDate = new Date(year, month - 1, 1);
  const dueDateParsed = new Date(dueDate);

  const approvedMembers = await prisma.societyMember.findMany({
    where: { societyId, status: 'approved', role: { in: ['owner', 'tenant'] } },
    select: { flatNumber: true },
  });

  const uniqueFlats = [...new Set(approvedMembers.map(m => m.flatNumber))];

  const bills = await prisma.$transaction(
    uniqueFlats.map(flatNumber =>
      prisma.maintenanceBill.upsert({
        where: { societyId_flatNumber_billMonth: { societyId, flatNumber, billMonth: billMonthDate } },
        create: {
          societyId,
          flatNumber,
          billMonth: billMonthDate,
          amount,
          totalAmount: amount,
          dueDate: dueDateParsed,
          status: 'unpaid',
          notes,
        },
        update: {},
      })
    )
  );

  res.json({ success: true, generated: bills.length });
});

// ─── GET /payments/history — Payment history ─────────────────────────────────

paymentsRouter.get('/history', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const payments = await prisma.payment.findMany({
    where: { userId, societyId, status: 'success' },
    include: { bill: { select: { billMonth: true, flatNumber: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({ success: true, payments });
});

// ─── GET /payments/collection — Committee collection summary ──────────────────

paymentsRouter.get('/collection', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');
  const month = req.query.month as string | undefined;

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  let monthDate: Date | undefined;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    monthDate = new Date(y, m - 1, 1);
  }

  const [paid, unpaid, overdue, total] = await Promise.all([
    prisma.maintenanceBill.count({ where: { societyId, status: 'paid', ...(monthDate ? { billMonth: monthDate } : {}) } }),
    prisma.maintenanceBill.count({ where: { societyId, status: 'unpaid', ...(monthDate ? { billMonth: monthDate } : {}) } }),
    prisma.maintenanceBill.count({ where: { societyId, status: 'overdue', ...(monthDate ? { billMonth: monthDate } : {}) } }),
    prisma.maintenanceBill.aggregate({
      where: { societyId, status: 'paid', ...(monthDate ? { billMonth: monthDate } : {}) },
      _sum: { totalAmount: true },
    }),
  ]);

  const recentPayments = await prisma.payment.findMany({
    where: { societyId, status: 'success' },
    include: { user: { select: { name: true } }, bill: { select: { flatNumber: true, billMonth: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  res.json({
    success: true,
    summary: { paid, unpaid, overdue, totalCollected: Number(total._sum.totalAmount ?? 0) },
    recentPayments,
  });
});
