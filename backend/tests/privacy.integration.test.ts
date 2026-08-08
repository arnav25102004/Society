import express from 'express';
import request from 'supertest';

const userUpdate = jest.fn();
const consentRecordUpdateMany = jest.fn();
const refreshTokenFamilyDeleteMany = jest.fn();
const refreshTokenDeleteMany = jest.fn();
const deviceSessionDeleteMany = jest.fn();
const societyMemberUpdateMany = jest.fn();
const transaction = jest.fn();

jest.mock('../src/config/db', () => ({
  prisma: {
    user: { update: (...a: any[]) => userUpdate(...a) },
    consentRecord: { updateMany: (...a: any[]) => consentRecordUpdateMany(...a) },
    refreshTokenFamily: { deleteMany: (...a: any[]) => refreshTokenFamilyDeleteMany(...a) },
    refreshToken: { deleteMany: (...a: any[]) => refreshTokenDeleteMany(...a) },
    deviceSession: { deleteMany: (...a: any[]) => deviceSessionDeleteMany(...a) },
    societyMember: { updateMany: (...a: any[]) => societyMemberUpdateMany(...a) },
    $transaction: (...a: any[]) => transaction(...a),
  },
}));

import { privacyRouter } from '../src/routes/privacy';
import { jwtService } from '../src/services/jwt.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/privacy', privacyRouter);
  return app;
}

function tokenFor(userId = 'user-1') {
  return jwtService.signAccessToken({ userId, phone: '+919999999999' });
}

describe('privacy router — delete-account requires a fresh action token', () => {
  const app = buildApp();
  beforeEach(() => jest.resetAllMocks());

  it('rejects delete-account without an X-Action-Token', async () => {
    const res = await request(app)
      .post('/privacy/delete-account')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/pin verification/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects delete-account with an action token belonging to a different user', async () => {
    const otherUsersToken = jwtService.signSensitiveActionToken('someone-else');

    const res = await request(app)
      .post('/privacy/delete-account')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .set('X-Action-Token', otherUsersToken);

    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('proceeds with account deletion given a valid same-user action token', async () => {
    transaction.mockImplementationOnce(async (fn: any) => fn({
      user: { update: userUpdate },
      consentRecord: { updateMany: consentRecordUpdateMany },
      refreshTokenFamily: { deleteMany: refreshTokenFamilyDeleteMany },
      refreshToken: { deleteMany: refreshTokenDeleteMany },
      deviceSession: { deleteMany: deviceSessionDeleteMany },
      societyMember: { updateMany: societyMemberUpdateMany },
    }));

    const actionToken = jwtService.signSensitiveActionToken('user-1');

    const res = await request(app)
      .post('/privacy/delete-account')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .set('X-Action-Token', actionToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: expect.objectContaining({ isDeleted: true }) })
    );
  });
});
