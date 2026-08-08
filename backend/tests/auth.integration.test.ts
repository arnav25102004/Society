import express from 'express';
import request from 'supertest';

const otpSend = jest.fn();
const otpVerify = jest.fn();

const loginAttemptFindUnique = jest.fn();
const loginAttemptUpsert = jest.fn();
const userFindUnique = jest.fn();
const userCreate = jest.fn();
const deviceSessionFindUnique = jest.fn();
const deviceSessionCreate = jest.fn();
const societyMemberFindMany = jest.fn();
const refreshTokenFamilyCreate = jest.fn();

jest.mock('../src/services/otp.service', () => ({
  otpService: {
    send: (...a: any[]) => otpSend(...a),
    verify: (...a: any[]) => otpVerify(...a),
  },
}));

jest.mock('../src/services/security-audit.service', () => ({
  SecurityAuditService: { log: jest.fn(), extractIp: jest.fn(() => '127.0.0.1') },
}));

jest.mock('../src/config/db', () => ({
  prisma: {
    loginAttempt: {
      findUnique: (...a: any[]) => loginAttemptFindUnique(...a),
      upsert: (...a: any[]) => loginAttemptUpsert(...a),
    },
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

import { authRouter } from '../src/routes/auth';
import { jwtService } from '../src/services/jwt.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

describe('auth router — OTP flow', () => {
  const app = buildApp();

  beforeEach(() => jest.resetAllMocks());

  it('POST /auth/send-otp returns the OTP service result', async () => {
    otpSend.mockResolvedValueOnce({ success: true, message: 'OTP sent successfully' });
    const res = await request(app).post('/auth/send-otp').send({ phone: '9999999999' });
    expect(res.status).toBe(200);
    expect(otpSend).toHaveBeenCalledWith('9999999999');
  });

  it('POST /auth/send-otp returns 429 when the OTP service reports rate limiting', async () => {
    otpSend.mockResolvedValueOnce({ success: false, message: 'Too many OTP requests. Try again in an hour.' });
    const res = await request(app).post('/auth/send-otp').send({ phone: '9999999999' });
    expect(res.status).toBe(429);
  });

  it('POST /auth/verify-otp rejects when the account is currently locked out', async () => {
    loginAttemptFindUnique.mockResolvedValueOnce({
      phone: '9999999999',
      attemptCount: 5,
      lastAttemptAt: new Date(),
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });
    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ phone: '9999999999', otp: '123456' });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/too many attempts/i);
    // Must short-circuit before ever checking the OTP itself
    expect(otpVerify).not.toHaveBeenCalled();
  });

  it('POST /auth/verify-otp records a failed attempt and returns a generic message on wrong OTP', async () => {
    loginAttemptFindUnique.mockResolvedValueOnce(null);
    otpVerify.mockResolvedValueOnce(false);
    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ phone: '9999999999', otp: '000001' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired OTP');
    expect(loginAttemptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ attemptCount: 1 }) })
    );
  });

  it('POST /auth/verify-otp locks the account on the 5th failure within the window', async () => {
    loginAttemptFindUnique.mockResolvedValueOnce({
      phone: '9999999999',
      attemptCount: 4,
      lastAttemptAt: new Date(), // within the 10-minute window
      lockedUntil: null,
    });
    otpVerify.mockResolvedValueOnce(false);
    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ phone: '9999999999', otp: '000001' });
    expect(res.status).toBe(401);
    expect(loginAttemptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          attemptCount: 5,
          lockedUntil: expect.any(Date),
        }),
      })
    );
  });

  it('POST /auth/verify-otp logs in an existing user and issues tokens on success', async () => {
    loginAttemptFindUnique.mockResolvedValueOnce(null);
    otpVerify.mockResolvedValueOnce(true);
    userFindUnique.mockResolvedValueOnce({ id: 'user-1', phone: 'encrypted', name: 'Test User', pinHash: null });
    societyMemberFindMany.mockResolvedValueOnce([]);
    refreshTokenFamilyCreate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ phone: '9999999999', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
    expect(res.body.isNewUser).toBe(false);
    // Lockout counter must reset on success
    expect(loginAttemptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { attemptCount: 0, lockedUntil: null } })
    );
  });

  it('POST /auth/verify-otp creates a new user on first-ever login', async () => {
    loginAttemptFindUnique.mockResolvedValueOnce(null);
    otpVerify.mockResolvedValueOnce(true);
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({ id: 'user-new', phone: 'encrypted', name: '', pinHash: null });
    societyMemberFindMany.mockResolvedValueOnce([]);
    refreshTokenFamilyCreate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ phone: '8888888888', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(userCreate).toHaveBeenCalled();
  });
});

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
