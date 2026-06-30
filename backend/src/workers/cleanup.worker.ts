/**
 * Background cleanup worker.
 * Runs cron jobs that don't belong in the request/response cycle.
 *
 * Jobs:
 *   - Visitor photo auto-delete: daily at 2:00 AM, removes photos older than 30 days.
 *   - Expired refresh token family cleanup: daily at 3:00 AM.
 */

import cron from 'node-cron';
import { prisma } from '../config/db';
import { storageService } from '../services/storage.service';

// ─── Visitor photo auto-delete (DPDPA / data retention) ──────────────────────
// Runs at 2:00 AM daily. Finds visitors created > 30 days ago, deletes their
// photos from R2/S3, and sets visitorPhoto = null in the DB.

cron.schedule('0 2 * * *', async () => {
  console.log('[cleanup] Starting visitor photo auto-delete job');
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const stale = await prisma.visitor.findMany({
    where: {
      createdAt:    { lt: cutoff },
      visitorPhoto: { not: null },
    },
    select: { id: true, visitorPhoto: true },
  });

  let deleted = 0;
  for (const visitor of stale) {
    try {
      if (visitor.visitorPhoto) {
        await storageService.delete(visitor.visitorPhoto);
        await prisma.visitor.update({
          where: { id: visitor.id },
          data:  { visitorPhoto: null },
        });
        deleted++;
      }
    } catch (err) {
      console.error(`[cleanup] Failed to delete photo for visitor ${visitor.id}:`, err);
    }
  }
  console.log(`[cleanup] Visitor photo auto-delete: deleted ${deleted}/${stale.length} photos`);
}, { timezone: 'Asia/Kolkata' });

// ─── Expired refresh token family cleanup ─────────────────────────────────────
// Runs at 3:00 AM daily. Removes fully-used or expired token family entries.

cron.schedule('0 3 * * *', async () => {
  const now = new Date();
  const { count } = await prisma.refreshTokenFamily.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { isUsed: true }] },
  });
  if (count > 0) {
    console.log(`[cleanup] Removed ${count} expired/used refresh token family entries`);
  }
}, { timezone: 'Asia/Kolkata' });

console.log('[cleanup] Cron jobs scheduled (visitor photo delete @2AM, token cleanup @3AM IST)');
