import express from 'express';
import request from 'supertest';

// ─── Firebase Admin mock ──────────────────────────────────────────────────────
const mockVerifyIdToken = jest.fn();

jest.mock('../src/config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const userFindUnique = jest.fn();
const userCreate = jest.fn();
const deviceSessionFindUnique = jest.fn();
const deviceSessionCreate = jest.fn();
const societyMemberFindMany = jest.fn();
const refreshTokenFamilyCreate = jest.fn();

jest.mock('../src/config/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: any[]) => userFindUnique(...a),
      create: (...a: any[]) => userCreate(...a),
      findMany: jest.fn().mockResolvedValue([]),
    },
    deviceSession: {
      findUnique: (...a: any[]) => deviceSessionFindUnique(...a),
      create: (...a: any[]) => deviceSessionCreate(...a),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    societyMember: { findMany: (...a: any[]) => societyMemberFindMany(...a) },
    refreshTokenFamily: { create: (...a: any[]) => refreshTokenFamilyCreate(...a) },
  },
}));

jest.mock('../src/services/security-audit.service', () => ({
  SecurityAuditService: { log: jest.fn(), extractIp: jest.fn(() => '127.0.0.1') },
}));

// ─── otpService mock (still used by otp-action-token route) ──────────────────
const otpVerify = jest.fn();

jest.mock('../src/services/otp.service', () => ({
  otpService: {
    send: jest.fn(),
    verify: (...a: any[]) => otpVerify(...a),
  },
}));

import { authRouter } from '../src/routes/auth';
import { jwtService } from '../src/services/jwt.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

// ─── POST /auth/firebase-verify ───────────────────────────────────────────────

describe('auth router — Firebase phone auth flow', () => {
  const app = buildApp();

  beforeEach(() => jest.resetAllMocks());

  it('rejects a missing or empty idToken with 400', async () => {
    const res = await request(app).post('/auth/firebase-verify').send({});
    expect(res.status).toBe(400);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid Firebase token with 401', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('auth/id-token-expired'));
    const res = await request(app)
      .post('/auth/firebase-verify')
      .send({ idToken: 'bad-token' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  it('rejects a Firebase token with no phone_number claim with 400', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid-1', phone_number: undefined });
    const res = await request(app)
      .post('/auth/firebase-verify')
      .send({ idToken: 'valid-but-no-phone' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phone number/i);
  });

  it('logs in an existing user and issues tokens on a valid token', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'firebase-uid-1',
      phone_number: '+919999999999',
    });
    userFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      phone: 'encrypted',
      name: 'Test User',
      avatarUrl: null,
      pinHash: null,
    });
    societyMemberFindMany.mockResolvedValueOnce([]);
    refreshTokenFamilyCreate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/auth/firebase-verify')
      .send({ idToken: 'valid-firebase-token' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.phone).toBe('9999999999'); // +91 stripped
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('strips +91 prefix and stores a raw 10-digit phone number', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'firebase-uid-2',
      phone_number: '+918888888888',
    });
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({
      id: 'user-new',
      phone: 'encrypted',
      name: '',
      avatarUrl: null,
      pinHash: null,
    });
    societyMemberFindMany.mockResolvedValueOnce([]);
    refreshTokenFamilyCreate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/auth/firebase-verify')
      .send({ idToken: 'new-user-token' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user.phone).toBe('8888888888');
    // encryptSearchable is called with the stripped 10-digit number
    expect(userCreate).toHaveBeenCalled();
  });

  it('creates a new user when none exists (isNewUser = true)', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'firebase-uid-3',
      phone_number: '+917777777777',
    });
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({
      id: 'user-created',
      phone: 'enc',
      name: '',
      avatarUrl: null,
      pinHash: null,
    });
    societyMemberFindMany.mockResolvedValueOnce([]);
    refreshTokenFamilyCreate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/auth/firebase-verify')
      .send({ idToken: 'first-time-token' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(userCreate).toHaveBeenCalledTimes(1);
  });

  it('returns memberships when the user belongs to a society', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'firebase-uid-4',
      phone_number: '+916666666666',
    });
    userFindUnique.mockResolvedValueOnce({
      id: 'user-member',
      phone: 'enc',
      name: 'Member User',
      avatarUrl: null,
      pinHash: null,
    });
    societyMemberFindMany.mockResolvedValueOnce([
      {
        id: 'mem-1',
        societyId: 'soc-1',
        flatNumber: 'A-101',
        role: 'owner',
        status: 'approved',
        society: { id: 'soc-1', name: 'Green Park', city: 'Pune' },
      },
    ]);
    refreshTokenFamilyCreate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/auth/firebase-verify')
      .send({ idToken: 'member-token' });

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0]).toMatchObject({
      societyName: 'Green Park',
      flatNumber: 'A-101',
      role: 'owner',
      status: 'approved',
    });
  });
});

// ─── POST /auth/otp-action-token ─────────────────────────────────────────────
// This route still uses Redis-backed otpService (user is already authenticated,
// wants to elevate to sensitive-action token without a PIN).

describe('auth router — otp-action-token (PIN-less sensitive-action re-auth)', () => {
  const app = buildApp();
  beforeEach(() => jest.resetAllMocks());

  function tokenFor(phone = '9999999999', userId = 'user-1') {
    return jwtService.signAccessToken({ userId, phone });
  }

  it('issues a sensitive-action token when the OTP is correct', async () => {
    otpVerify.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/auth/otp-action-token')
      .set('Authorization', `Bearer ${tokenFor('9999999999')}`)
      .send({ otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.sensitiveActionToken).toEqual(expect.any(String));
    expect(otpVerify).toHaveBeenCalledWith('9999999999', '123456');
  });

  it('rejects an incorrect OTP', async () => {
    otpVerify.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/auth/otp-action-token')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ otp: '000000' });

    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/auth/otp-action-token').send({ otp: '123456' });
    expect(res.status).toBe(401);
    expect(otpVerify).not.toHaveBeenCalled();
  });
});
