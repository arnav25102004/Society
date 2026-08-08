import express from 'express';
import request from 'supertest';

const societyMemberFindFirst = jest.fn();
const maintenanceBillFindUnique = jest.fn();
const maintenanceBillFindMany = jest.fn();
const maintenanceBillUpdate = jest.fn();
const paymentCreate = jest.fn();
const userFindUnique = jest.fn();
const transaction = jest.fn();

jest.mock('../src/config/db', () => ({
  prisma: {
    societyMember: { findFirst: (...a: any[]) => societyMemberFindFirst(...a) },
    maintenanceBill: {
      findUnique: (...a: any[]) => maintenanceBillFindUnique(...a),
      findMany: (...a: any[]) => maintenanceBillFindMany(...a),
      update: (...a: any[]) => maintenanceBillUpdate(...a),
    },
    payment: { create: (...a: any[]) => paymentCreate(...a) },
    user: { findUnique: (...a: any[]) => userFindUnique(...a) },
    $transaction: (...a: any[]) => transaction(...a),
  },
}));

jest.mock('../src/services/notification.service', () => ({
  notificationService: { paymentReceived: jest.fn() },
}));

import { paymentsRouter } from '../src/routes/payments';
import { jwtService } from '../src/services/jwt.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/payments', paymentsRouter);
  return app;
}

const SOCIETY_ID = '11111111-1111-1111-1111-111111111111';

function tokenFor(role: string, userId = 'user-1') {
  return jwtService.signAccessToken({ userId, phone: '+919999999999', societyId: SOCIETY_ID, role });
}

describe('payments router — access control', () => {
  const app = buildApp();

  beforeEach(() => jest.resetAllMocks());

  it('GET /payments/bills 403s a non-member', async () => {
    societyMemberFindFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/payments/bills?societyId=soc-1')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(403);
  });

  it('GET /payments/bills scopes residents to their own flat', async () => {
    societyMemberFindFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' });
    maintenanceBillFindMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/payments/bills?societyId=soc-1')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
    expect(maintenanceBillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ flatNumber: 'A-101' }),
      })
    );
  });

  it('POST /payments/bills/generate rejects a resident (committee-only)', async () => {
    societyMemberFindFirst.mockResolvedValueOnce(null); // not found with committee/admin role filter
    const res = await request(app)
      .post('/payments/bills/generate')
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .send({ societyId: SOCIETY_ID, billMonth: '2026-08', amount: 5000, dueDate: '2026-08-10' });
    expect(res.status).toBe(403);
  });

  it('POST /payments/bills/:id/mark-paid rejects an unauthenticated request', async () => {
    const res = await request(app).post('/payments/bills/bill-1/mark-paid').send({ paymentMethod: 'cash' });
    expect(res.status).toBe(401);
  });

  it('POST /payments/bills/:id/mark-paid rejects a resident without HMAC signature (no bypass for residents)', async () => {
    const res = await request(app)
      .post('/payments/bills/bill-1/mark-paid')
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .send({ paymentMethod: 'cash' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/hmac/i);
  });

  it('POST /payments/bills/:id/mark-paid rejects committee without a PIN action token', async () => {
    const res = await request(app)
      .post('/payments/bills/bill-1/mark-paid')
      .set('Authorization', `Bearer ${tokenFor('committee')}`)
      .send({ paymentMethod: 'cash' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/pin/i);
  });

  it('POST /payments/bills/:id/mark-paid succeeds for committee with a valid PIN action token', async () => {
    maintenanceBillFindUnique.mockResolvedValueOnce({
      id: 'bill-1', societyId: 'soc-1', flatNumber: 'A-101', status: 'unpaid', totalAmount: 5000,
    });
    societyMemberFindFirst
      .mockResolvedValueOnce({ role: 'committee' }) // committee membership check
      .mockResolvedValueOnce({ userId: 'resident-1' }); // flat's resident lookup
    transaction.mockResolvedValueOnce([{ id: 'payment-1', amount: 5000 }]);
    userFindUnique.mockResolvedValueOnce({ expoPushToken: null });

    const actionToken = jwtService.signSensitiveActionToken('user-1');

    const res = await request(app)
      .post('/payments/bills/bill-1/mark-paid')
      .set('Authorization', `Bearer ${tokenFor('committee')}`)
      .set('X-Action-Token', actionToken)
      .send({ paymentMethod: 'cash', notes: 'Handed to treasurer' });

    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({ id: 'payment-1' });
  });

  it('POST /payments/bills/:id/mark-paid rejects a PIN action token belonging to a different user', async () => {
    maintenanceBillFindUnique.mockResolvedValueOnce({
      id: 'bill-1', societyId: 'soc-1', flatNumber: 'A-101', status: 'unpaid', totalAmount: 5000,
    });
    const otherUsersToken = jwtService.signSensitiveActionToken('someone-else');

    const res = await request(app)
      .post('/payments/bills/bill-1/mark-paid')
      .set('Authorization', `Bearer ${tokenFor('committee')}`)
      .set('X-Action-Token', otherUsersToken)
      .send({ paymentMethod: 'cash' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/mismatch/i);
  });

  it('POST /payments/bills/:id/mark-paid refuses to double-pay an already-paid bill', async () => {
    maintenanceBillFindUnique.mockResolvedValueOnce({
      id: 'bill-1', societyId: 'soc-1', flatNumber: 'A-101', status: 'paid', totalAmount: 5000,
    });
    const actionToken = jwtService.signSensitiveActionToken('user-1');

    const res = await request(app)
      .post('/payments/bills/bill-1/mark-paid')
      .set('Authorization', `Bearer ${tokenFor('committee')}`)
      .set('X-Action-Token', actionToken)
      .send({ paymentMethod: 'cash' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already paid/i);
  });
});
