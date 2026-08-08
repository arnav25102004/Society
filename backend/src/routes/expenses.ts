import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { imageUpload as upload } from '../middleware/upload';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { storageService } from '../services/storage.service';

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

const createCategorySchema = z.object({
  societyId: z.string().uuid(),
  name: z.string().min(2).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  budgetAmount: z.number().positive(),
});

const createExpenseSchema = z.object({
  societyId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().min(3).max(500),
  expenseMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

// ─── GET /expenses/categories — List categories ───────────────────────────────

expensesRouter.get('/categories', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const categories = await prisma.expenseCategory.findMany({
    where: { societyId },
    orderBy: { name: 'asc' },
  });

  res.json({ success: true, categories });
});

// ─── POST /expenses/categories — Create category (committee) ──────────────────

expensesRouter.post('/categories', validate(createCategorySchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyId, name, color, budgetAmount } = req.body as z.infer<typeof createCategorySchema>;

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const category = await prisma.expenseCategory.create({
    data: { societyId, name, color, budgetAmount },
  });

  res.status(201).json({ success: true, category });
});

// ─── GET /expenses/dashboard — Monthly expense breakdown ─────────────────────

expensesRouter.get('/dashboard', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');
  const month = String(req.query.month ?? new Date().toISOString().slice(0, 7));

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const [year, mon] = month.split('-').map(Number);
  const monthDate = new Date(year, mon - 1, 1);

  const [categories, expenses, collection] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { societyId } }),
    prisma.expense.findMany({
      where: { societyId, expenseMonth: monthDate },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.aggregate({
      where: { societyId, status: 'success', bill: { billMonth: monthDate } },
      _sum: { amount: true },
    }),
  ]);

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalBudget = categories.reduce((sum, c) => sum + Number(c.budgetAmount), 0);
  const totalCollected = Number(collection._sum.amount ?? 0);

  // Group expenses by category
  const breakdown = categories.map(cat => {
    const catExpenses = expenses.filter(e => e.categoryId === cat.id);
    const spent = catExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const percentage = totalExpenses > 0 ? Math.round((spent / totalExpenses) * 100) : 0;
    return {
      category: cat,
      spent,
      budget: Number(cat.budgetAmount),
      percentage,
      utilization: Number(cat.budgetAmount) > 0 ? Math.round((spent / Number(cat.budgetAmount)) * 100) : 0,
      expenses: catExpenses,
    };
  }).filter(b => b.spent > 0 || b.budget > 0);

  // Last 6 months trend
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, mon - 1 - i, 1);
    const monthExpenses = await prisma.expense.aggregate({
      where: { societyId, expenseMonth: d },
      _sum: { amount: true },
    });
    trend.push({
      month: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      amount: Number(monthExpenses._sum.amount ?? 0),
    });
  }

  res.json({
    success: true,
    summary: {
      month,
      totalExpenses,
      totalBudget,
      totalCollected,
      surplus: totalCollected - totalExpenses,
    },
    breakdown,
    trend,
  });
});

// ─── GET /expenses — List expenses ───────────────────────────────────────────

expensesRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');
  const month = req.query.month as string | undefined;

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  let monthDate: Date | undefined;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    monthDate = new Date(y, m - 1, 1);
  }

  const expenses = await prisma.expense.findMany({
    where: { societyId, ...(monthDate ? { expenseMonth: monthDate } : {}) },
    include: {
      category: { select: { name: true, color: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({ success: true, expenses });
});

// ─── POST /expenses — Add expense (committee) ─────────────────────────────────

expensesRouter.post(
  '/',
  upload.single('receipt'),
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const body = createExpenseSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, errors: body.error.errors });
    const { societyId, categoryId, amount, description, expenseMonth } = body.data;

    const member = await prisma.societyMember.findFirst({
      where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

    const category = await prisma.expenseCategory.findFirst({ where: { id: categoryId, societyId } });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    let receiptUrl: string | undefined;
    if (req.file) {
      receiptUrl = await storageService.save(req.file.originalname, req.file.buffer, req.file.mimetype);
    }

    const [year, mon] = expenseMonth.split('-').map(Number);
    const expense = await prisma.expense.create({
      data: {
        societyId,
        categoryId,
        amount,
        description,
        expenseMonth: new Date(year, mon - 1, 1),
        createdById: userId,
        receiptUrl,
      },
      include: { category: { select: { name: true, color: true } } },
    });

    res.status(201).json({ success: true, expense });
  }
);
