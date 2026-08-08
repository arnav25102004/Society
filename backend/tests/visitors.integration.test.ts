import express from 'express';
import request from 'supertest';

const societyMemberFindFirst = jest.fn();
const societyMemberFindMany = jest.fn();
const visitorFindUnique = jest.fn();
const visitorCreate = jest.fn();
const visitorUpdate = jest.fn();
const preApprovalFindFirst = jest.fn();
const storageSave = jest.fn();

jest.mock('../src/config/db', () => ({
  prisma: {
    societyMember: {
      findFirst: (...a: any[]) => societyMemberFindFirst(...a),
      findMany: (...a: any[]) => societyMemberFindMany(...a),
    },
    visitor: {
      findUnique: (...a: any[]) => visitorFindUnique(...a),
      create: (...a: any[]) => visitorCreate(...a),
      update: (...a: any[]) => visitorUpdate(...a),
    },
    preApproval: { findFirst: (...a: any[]) => preApprovalFindFirst(...a) },
  },
}));

jest.mock('../src/services/storage.service', () => ({
  storageService: { save: (...a: any[]) => storageSave(...a), getSignedUrl: jest.fn() },
}));

jest.mock('../src/services/notification.service', () => ({
  notificationService: { visitorArrival: jest.fn() },
}));

import { visitorsRouter } from '../src/routes/visitors';
import { authRouter } from '../src/routes/auth';
import { jwtService } from '../src/services/jwt.service';
import { hmacKeyService } from '../src/services/hmacKey.service';
import { generateHmac } from '../src/middleware/hmac';

jest.mock('../src/services/hmacKey.service', () => ({
  hmacKeyService: { issue: jest.fn(), get: jest.fn() },
}));

// auth.ts pulls in otp.service.ts, which opens a real ioredis client (lazyConnect
// keeps it from connecting immediately, but its internal timers still keep the
// Jest process alive past the test run) — mock it out at the source.
jest.mock('../src/config/redis', () => ({ redis: { incr: jest.fn(), expire: jest.fn(), setex: jest.fn(), get: jest.fn(), del: jest.fn() } }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/visitors', visitorsRouter);
  return app;
}

const SOCIETY_ID = '22222222-2222-2222-2222-222222222222';

function tokenFor(role: string, userId = 'user-1') {
  return jwtService.signAccessToken({ userId, phone: '+919999999999', societyId: SOCIETY_ID, role });
}

describe('visitors router — guard registration (no HMAC required)', () => {
  const app = buildApp();
  beforeEach(() => {
    jest.resetAllMocks();
    societyMemberFindMany.mockResolvedValue([]);
    storageSave.mockResolvedValue('photo-url');
  });

  it('lets a guard register a visitor with just a valid JWT (multipart route, no HMAC)', async () => {
    societyMemberFindFirst
      .mockResolvedValueOnce({ role: 'guard', flatNumber: null }) // hasPermission lookup
      .mockResolvedValueOnce({ role: 'guard' }); // guardMember lookup
    preApprovalFindFirst.mockResolvedValueOnce(null);
    visitorCreate.mockResolvedValueOnce({ id: 'visitor-1', status: 'pending' });

    const res = await request(app)
      .post('/visitors')
      .set('Authorization', `Bearer ${tokenFor('guard')}`)
      .field('societyId', SOCIETY_ID)
      .field('flatNumber', 'A-101')
      .field('visitorName', 'Ramesh Kumar')
      .field('purpose', 'delivery');

    expect(res.status).toBe(201);
    expect(res.body.visitor).toMatchObject({ id: 'visitor-1' });
  });

  it('blocks a resident from registering a visitor (guard-only action)', async () => {
    societyMemberFindFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' }); // hasPermission lookup
    const res = await request(app)
      .post('/visitors')
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .field('societyId', SOCIETY_ID)
      .field('flatNumber', 'A-101')
      .field('visitorName', 'Ramesh Kumar')
      .field('purpose', 'delivery');

    expect(res.status).toBe(403);
  });
});

describe('visitors router — resident approve (per-user HMAC required)', () => {
  const app = buildApp();
  beforeEach(() => jest.resetAllMocks());

  it('rejects approve without a signing key on file', async () => {
    (hmacKeyService.get as jest.Mock).mockResolvedValueOnce(null);
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await request(app)
      .put('/visitors/visitor-1/approve')
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .set('X-Signature', 'deadbeef')
      .set('X-Timestamp', String(timestamp));

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/signing key/i);
  });

  it('rejects approve when the signature does not match the issued per-user key', async () => {
    (hmacKeyService.get as jest.Mock).mockResolvedValueOnce('the-real-key');
    const timestamp = Math.floor(Date.now() / 1000);
    const wrongSignature = generateHmac({}, timestamp, 'wrong-key');

    const res = await request(app)
      .put('/visitors/visitor-1/approve')
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .set('X-Signature', wrongSignature)
      .set('X-Timestamp', String(timestamp));

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid request signature/i);
  });

  it('approves the visitor when signed with the correct per-user key', async () => {
    (hmacKeyService.get as jest.Mock).mockResolvedValueOnce('the-real-key');
    visitorFindUnique.mockResolvedValueOnce({
      id: 'visitor-1', status: 'pending', societyId: SOCIETY_ID, flatNumber: 'A-101',
    });
    societyMemberFindFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' });
    visitorUpdate.mockResolvedValueOnce({ id: 'visitor-1', status: 'approved' });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateHmac({}, timestamp, 'the-real-key');

    const res = await request(app)
      .put('/visitors/visitor-1/approve')
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .set('X-Signature', signature)
      .set('X-Timestamp', String(timestamp));

    expect(res.status).toBe(200);
    expect(res.body.visitor).toMatchObject({ status: 'approved' });
  });

  it('lets committee bypass HMAC entirely when no signature headers are sent (web admin path)', async () => {
    visitorFindUnique.mockResolvedValueOnce({
      id: 'visitor-1', status: 'pending', societyId: SOCIETY_ID, flatNumber: 'A-101',
    });
    societyMemberFindFirst.mockResolvedValueOnce({ role: 'committee', flatNumber: 'A-101' });
    visitorUpdate.mockResolvedValueOnce({ id: 'visitor-1', status: 'approved' });

    const res = await request(app)
      .put('/visitors/visitor-1/approve')
      .set('Authorization', `Bearer ${tokenFor('committee')}`);

    expect(res.status).toBe(200);
    expect(hmacKeyService.get).not.toHaveBeenCalled();
  });

  it('does NOT bypass HMAC for committee when signature headers ARE present but wrong (mobile path)', async () => {
    // A committee member using the mobile app signs requests (see hmac.ts service on the
    // client) — if their signature is bad, the role-based bypass must not silently let it
    // through just because the caller happens to be committee/admin.
    (hmacKeyService.get as jest.Mock).mockResolvedValueOnce('the-real-key');

    const res = await request(app)
      .put('/visitors/visitor-1/approve')
      .set('Authorization', `Bearer ${tokenFor('committee')}`)
      .set('X-Signature', 'deadbeef00deadbeef00deadbeef00deadbeef00deadbeef00deadbeef00de')
      .set('X-Timestamp', String(Math.floor(Date.now() / 1000)));

    expect(res.status).toBe(401);
    expect(hmacKeyService.get).toHaveBeenCalled();
  });
});

describe('auth router — signing-key issuance', () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);

  beforeEach(() => jest.resetAllMocks());

  it('issues a per-user signing key for an authenticated request', async () => {
    (hmacKeyService.issue as jest.Mock).mockResolvedValueOnce({ key: 'issued-key', expiresInSeconds: 300 });

    const res = await request(app)
      .post('/auth/signing-key')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: 'issued-key', expiresInSeconds: 300 });
    expect(hmacKeyService.issue).toHaveBeenCalledWith('user-1');
  });

  it('rejects an unauthenticated signing-key request', async () => {
    const res = await request(app).post('/auth/signing-key');
    expect(res.status).toBe(401);
  });
});
