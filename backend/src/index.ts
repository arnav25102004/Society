import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import path from 'path';

import { env } from './config/env';
import { redis } from './config/redis';
import { prisma } from './config/db';
import { authRouter } from './routes/auth';
import { societiesRouter } from './routes/societies';
import { complaintsRouter } from './routes/complaints';
import { paymentsRouter } from './routes/payments';
import { visitorsRouter } from './routes/visitors';
import { announcementsRouter } from './routes/announcements';
import { marketplaceRouter } from './routes/marketplace';
import { amenitiesRouter } from './routes/amenities';
import { sosRouter } from './routes/sos';
import { expensesRouter } from './routes/expenses';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const httpServer = createServer(app);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// ─── Serve local uploads (dev only) ──────────────────────────────────────────
if (env.storage.provider === 'local') {
  app.use('/uploads', express.static(path.resolve(env.storage.localUploadDir)));
}

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/societies', societiesRouter);
app.use('/api/v1/complaints', complaintsRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/visitors', visitorsRouter);
app.use('/api/v1/announcements', announcementsRouter);
app.use('/api/v1/marketplace', marketplaceRouter);
app.use('/api/v1/amenities', amenitiesRouter);
app.use('/api/v1/sos', sosRouter);
app.use('/api/v1/expenses', expensesRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
async function start() {
  await redis.connect();
  await prisma.$connect();

  httpServer.listen(env.PORT, () => {
    console.log(`[Server] Running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

export { app };
