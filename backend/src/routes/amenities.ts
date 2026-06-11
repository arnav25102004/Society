import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { validate } from '../middleware/validate';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/db';

export const amenitiesRouter = Router();
amenitiesRouter.use(requireAuth);

const createAmenitySchema = z.object({
  societyId: z.string().uuid(),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  maxCapacity: z.number().int().positive().default(1),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMins: z.number().int().positive().default(60),
  bookingAdvanceDays: z.number().int().positive().default(7),
  depositAmount: z.number().nonnegative().optional(),
});

const bookSchema = z.object({
  bookDate: z.string(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  guests: z.number().int().positive().default(1),
  notes: z.string().max(300).optional(),
});

// ─── GET /amenities — List amenities ─────────────────────────────────────────

amenitiesRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const amenities = await prisma.amenity.findMany({
    where: { societyId, isActive: true },
    orderBy: { name: 'asc' },
  });

  res.json({ success: true, amenities });
});

// ─── POST /amenities — Create amenity (committee) ────────────────────────────

amenitiesRouter.post('/', validate(createAmenitySchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { societyId, name, description, maxCapacity, openTime, closeTime, slotDurationMins, bookingAdvanceDays, depositAmount } =
    req.body as z.infer<typeof createAmenitySchema>;

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Committee access required' });

  const amenity = await prisma.amenity.create({
    data: { societyId, name, description, maxCapacity, openTime, closeTime, slotDurationMins, bookingAdvanceDays, depositAmount },
  });

  res.status(201).json({ success: true, amenity });
});

// ─── GET /amenities/:id/availability — Check slots for a date ────────────────

amenitiesRouter.get('/:id/availability', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const date = String(req.query.date ?? '');
  if (!date) return res.status(400).json({ success: false, message: 'date required (YYYY-MM-DD)' });

  const amenity = await prisma.amenity.findUnique({ where: { id: req.params.id } });
  if (!amenity || !amenity.isActive) return res.status(404).json({ success: false, message: 'Amenity not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: amenity.societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const bookDate = new Date(date);
  const bookings = await prisma.amenityBooking.findMany({
    where: { amenityId: amenity.id, bookDate, status: { in: ['confirmed', 'pending'] } },
    select: { startTime: true, endTime: true, guests: true },
  });

  // Generate slots
  const slots = generateSlots(amenity.openTime, amenity.closeTime, amenity.slotDurationMins, bookings, amenity.maxCapacity);

  res.json({ success: true, amenity, date, slots });
});

// ─── POST /amenities/:id/book — Book a slot ──────────────────────────────────

amenitiesRouter.post('/:id/book', validate(bookSchema), async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { bookDate, startTime, endTime, guests, notes } = req.body as z.infer<typeof bookSchema>;

  const amenity = await prisma.amenity.findUnique({ where: { id: req.params.id } });
  if (!amenity || !amenity.isActive) return res.status(404).json({ success: false, message: 'Amenity not found' });

  const member = await prisma.societyMember.findFirst({
    where: { userId, societyId: amenity.societyId, status: 'approved' },
  });
  if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

  const bookDateParsed = new Date(bookDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + amenity.bookingAdvanceDays);

  if (bookDateParsed < today) return res.status(400).json({ success: false, message: 'Cannot book past dates' });
  if (bookDateParsed > maxDate) return res.status(400).json({ success: false, message: `Can only book up to ${amenity.bookingAdvanceDays} days in advance` });

  // Check conflict
  const conflict = await prisma.amenityBooking.findFirst({
    where: {
      amenityId: amenity.id,
      bookDate: bookDateParsed,
      status: { in: ['confirmed', 'pending'] },
      OR: [
        { startTime: { gte: startTime, lt: endTime } },
        { endTime: { gt: startTime, lte: endTime } },
        { startTime: { lte: startTime }, endTime: { gte: endTime } },
      ],
    },
  });

  if (conflict && amenity.maxCapacity === 1) {
    return res.status(409).json({ success: false, message: 'Slot already booked' });
  }

  const booking = await prisma.amenityBooking.create({
    data: {
      amenityId: amenity.id,
      userId,
      societyId: amenity.societyId,
      bookDate: bookDateParsed,
      startTime,
      endTime,
      guests: guests ?? 1,
      notes,
      status: 'confirmed',
    },
    include: { amenity: { select: { name: true } } },
  });

  res.status(201).json({ success: true, booking });
});

// ─── GET /amenities/bookings/mine — My bookings ───────────────────────────────

amenitiesRouter.get('/bookings/mine', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const societyId = String(req.query.societyId ?? '');

  if (!societyId) return res.status(400).json({ success: false, message: 'societyId required' });

  const bookings = await prisma.amenityBooking.findMany({
    where: { userId, societyId },
    include: { amenity: { select: { name: true, photoUrl: true } } },
    orderBy: [{ bookDate: 'desc' }, { startTime: 'asc' }],
    take: 20,
  });

  res.json({ success: true, bookings });
});

// ─── DELETE /amenities/bookings/:id — Cancel booking ─────────────────────────

amenitiesRouter.delete('/bookings/:id', async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const booking = await prisma.amenityBooking.findUnique({ where: { id: req.params.id } });
  if (!booking || booking.userId !== userId) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }
  if (booking.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Already cancelled' });
  }

  await prisma.amenityBooking.update({
    where: { id: req.params.id },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });

  res.json({ success: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlots(
  openTime: string,
  closeTime: string,
  durationMins: number,
  bookings: { startTime: string; endTime: string; guests: number }[],
  maxCapacity: number
) {
  const slots = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (current + durationMins <= end) {
    const startH = Math.floor(current / 60);
    const startM = current % 60;
    const endM = current + durationMins;
    const endH = Math.floor(endM / 60);
    const endMin = endM % 60;

    const start = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const finish = `${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

    const overlapping = bookings.filter(b => !(b.endTime <= start || b.startTime >= finish));
    const bookedCount = overlapping.length;

    slots.push({
      startTime: start,
      endTime: finish,
      available: bookedCount < maxCapacity,
      bookedCount,
    });

    current += durationMins;
  }

  return slots;
}
