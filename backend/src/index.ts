import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
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
import { knowledgeRouter } from './routes/knowledge';
import { agreementsRouter } from './routes/agreements';
import { privacyRouter } from './routes/privacy';
import { securityAdminRouter } from './routes/security-admin';
import { errorHandler } from './middleware/errorHandler';
import { csrfTokenRoute } from './middleware/csrf';
import './workers/cleanup.worker';  // register cron jobs on startup

const app = express();
const httpServer = createServer(app);

// ─── Security headers (Helmet) ────────────────────────────────────────────────
app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
      styleSrc: ["'none'"],
      imgSrc: ["'none'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginResourcePolicy: false,  // allow images from R2/CDN to load in app
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: env.isDev ? '*' : env.CORS_ORIGIN,
  credentials: !env.isDev,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Device-ID',
    'X-Signature',
    'X-Timestamp',
    'X-Action-Token',
  ],
}));
app.use(compression());
app.use(cookieParser());
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
// CSRF token endpoint for web dashboard (Phase 4) — mobile clients don't need this
app.get('/api/v1/csrf-token', csrfTokenRoute);

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
app.use('/api/v1/knowledge', knowledgeRouter);
app.use('/api/v1/agreements', agreementsRouter);
app.use('/api/v1/privacy', privacyRouter);
app.use('/api/v1/security', securityAdminRouter);

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

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

export { app };
