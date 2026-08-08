import express from 'express';
import request from 'supertest';

// nanoid (used elsewhere in societies.ts for society codes, not by this endpoint)
// ships ESM-only and isn't transformed by ts-jest's default config — stub it out
// rather than teach the whole test suite to transform node_modules for one package.
jest.mock('nanoid', () => ({ customAlphabet: () => () => 'MOCKCODE' }));

const societyMemberFindFirst = jest.fn();
const societyMemberCreate = jest.fn();
const userFindUnique = jest.fn();
const userCreate = jest.fn();

jest.mock('../src/config/db', () => ({
  prisma: {
    societyMember: {
      findFirst: (...a: any[]) => societyMemberFindFirst(...a),
      create: (...a: any[]) => societyMemberCreate(...a),
    },
    user: {
      findUnique: (...a: any[]) => userFindUnique(...a),
      create: (...a: any[]) => userCreate(...a),
    },
  },
}));

import { societiesRouter } from '../src/routes/societies';
import { jwtService } from '../src/services/jwt.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/societies', societiesRouter);
  return app;
}

const SOCIETY_ID = '33333333-3333-3333-3333-333333333333';

function tokenFor(role: string, userId = 'admin-1') {
  return jwtService.signAccessToken({ userId, phone: '+919999999999', societyId: SOCIETY_ID, role });
}

function csv(rows: string) {
  return Buffer.from(`flatNumber,name,phone,role\n${rows}`);
}

describe('POST /societies/:id/members/bulk-import', () => {
  const app = buildApp();
  beforeEach(() => jest.resetAllMocks());

  it('rejects a resident (committee-only action)', async () => {
    societyMemberFindFirst.mockResolvedValueOnce(null); // committee/admin membership check fails
    const res = await request(app)
      .post(`/societies/${SOCIETY_ID}/members/bulk-import`)
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .attach('file', csv('A-101,Ramesh Kumar,9876543210,owner'), 'members.csv');

    expect(res.status).toBe(403);
  });

  it('rejects a non-.csv file', async () => {
    societyMemberFindFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post(`/societies/${SOCIETY_ID}/members/bulk-import`)
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .attach('file', Buffer.from('not a csv'), 'members.txt');

    expect(res.status).toBe(400);
  });

  it('creates new users+members for valid rows, skips rows already in the society, reports invalid rows', async () => {
    societyMemberFindFirst
      .mockResolvedValueOnce({ role: 'admin' }) // committee check
      .mockResolvedValueOnce(null) // row 1: not yet a member -> created
      .mockResolvedValueOnce({ id: 'existing-membership' }); // row 2: already a member

    userFindUnique
      .mockResolvedValueOnce(null) // row 1: new user
      .mockResolvedValueOnce({ id: 'user-existing' }); // row 2: user already exists

    userCreate.mockResolvedValueOnce({ id: 'user-new' });
    societyMemberCreate.mockResolvedValueOnce({ id: 'member-new' });

    const rows = [
      'A-101,Ramesh Kumar,9876543210,owner',
      'A-102,Priya Singh,9876543211,tenant',
      'BAD,,notaphone,owner', // invalid: missing name, bad phone
    ].join('\n');

    const res = await request(app)
      .post(`/societies/${SOCIETY_ID}/members/bulk-import`)
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .attach('file', csv(rows), 'members.csv');

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 3, created: 1, alreadyMember: 1, failed: 1 });
    expect(res.body.results[0]).toMatchObject({ status: 'created', flatNumber: 'A-101' });
    expect(res.body.results[1]).toMatchObject({ status: 'already_member', flatNumber: 'A-102' });
    expect(res.body.results[2]).toMatchObject({ status: 'error' });

    expect(societyMemberCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved', role: 'owner' }) })
    );
  });

  it('rejects a CSV with no data rows', async () => {
    societyMemberFindFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post(`/societies/${SOCIETY_ID}/members/bulk-import`)
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .attach('file', Buffer.from('flatNumber,name,phone,role\n'), 'members.csv');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no data rows/i);
  });
});
