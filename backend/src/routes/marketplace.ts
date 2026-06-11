import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';
import { storageService } from '../services/storage.service';

export const marketplaceRouter = Router();
marketplaceRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const createListingSchema = z.object({
  societyId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  price: z.number().positive().optional(),
  isGiveaway: z.boolean().optional().default(false),
  category: z.enum(['electronics', 'furniture', 'appliances', 'clothing', 'books', 'vehicles', 'sports', 'kids', 'other']).default('other'),
});

const interestSchema = z.object({
  message: z.string().max(300).optional(),
});

// ─── GET /marketplace — List listings ────────────────────────────────────────

marketplaceRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const listings = await prisma.marketplaceListing.findMany({
    where: {
      societyId,
      status: (req.query.status as any) ?? 'available',
      ...(req.query.category ? { category: req.query.category as any } : {}),
      ...(req.query.myOnly === 'true' ? { userId } : {}),
    },
    include: {
      seller: { select: { name: true, avatarUrl: true } },
      _count: { select: { interests: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  res.json({ success: true, listings });
});

// ─── POST /marketplace — Create listing ──────────────────────────────────────

marketplaceRouter.post(
  '/',
  upload.array('photos', 5),
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const body = createListingSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, errors: body.error.errors });
    }
    const { societyId, title, description, price, isGiveaway, category } = body.data;

    const member = await prisma.societyMember.findFirst({
      where: { userId, societyId, status: 'approved' },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

    const files = req.files as Express.Multer.File[] | undefined;
    const photoUrls: string[] = [];
    if (files?.length) {
      for (const file of files) {
        const url = await storageService.save(file.originalname, file.buffer, file.mimetype);
        photoUrls.push(url);
      }
    }

    const listing = await prisma.marketplaceListing.create({
      data: {
        societyId,
        userId,
        title,
        description,
        price: isGiveaway ? null : price,
        isGiveaway: isGiveaway ?? false,
        category: category as any,
        photos: photoUrls,
        status: 'available',
      },
      include: { seller: { select: { name: true } } },
    });

    res.status(201).json({ success: true, listing });
  }
);

// ─── GET /marketplace/:id — Listing detail ───────────────────────────────────

marketplaceRouter.get('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: req.params.id },
    include: {
      seller: { select: { name: true, avatarUrl: true } },
      interests: {
        include: { user: { select: { name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { interests: true } },
    },
  });
  if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: listing.societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Access denied' });

  const userInterest = listing.interests.find(i => i.userId === userId);
  const interests = listing.userId === userId ? listing.interests : [];

  res.json({
    success: true,
    listing: { ...listing, interests: undefined, _count: undefined },
    interestCount: listing._count.interests,
    hasExpressedInterest: !!userInterest,
    interests: listing.userId === userId ? interests : undefined,
  });
});

// ─── PATCH /marketplace/:id — Update listing ─────────────────────────────────

marketplaceRouter.patch('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: req.params.id } });
  if (!listing || listing.userId !== userId) {
    return res.status(404).json({ success: false, message: 'Listing not found' });
  }

  const { status, price, description } = req.body;
  const updated = await prisma.marketplaceListing.update({
    where: { id: req.params.id },
    data: {
      ...(status ? { status } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(description ? { description } : {}),
    },
  });

  res.json({ success: true, listing: updated });
});

// ─── DELETE /marketplace/:id — Delete listing ────────────────────────────────

marketplaceRouter.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: req.params.id } });
  if (!listing || listing.userId !== userId) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  await prisma.marketplaceListing.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ─── POST /marketplace/:id/interest — Express interest ───────────────────────

marketplaceRouter.post('/:id/interest', validate(interestSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { message } = req.body as z.infer<typeof interestSchema>;

  const listing = await prisma.marketplaceListing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ success: false, message: 'Not found' });
  if (listing.userId === userId) return res.status(400).json({ success: false, message: 'Cannot express interest in your own listing' });
  if (listing.status !== 'available') return res.status(400).json({ success: false, message: 'Listing is no longer available' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: listing.societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const interest = await prisma.listingInterest.upsert({
    where: { listingId_userId: { listingId: listing.id, userId } },
    create: { listingId: listing.id, userId, message },
    update: { message },
  });

  res.json({ success: true, interest });
});
