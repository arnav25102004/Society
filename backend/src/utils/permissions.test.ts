jest.mock('../config/db', () => ({
  prisma: {
    societyMember: { findFirst: jest.fn() },
  },
}));

import { prisma } from '../config/db';
import { hasPermission } from './permissions';

const findFirst = prisma.societyMember.findFirst as jest.Mock;

describe('hasPermission', () => {
  const societyId = 'soc-1';

  describe('bill', () => {
    it('lets committee read any bill in their society', async () => {
      findFirst.mockResolvedValueOnce({ role: 'committee', flatNumber: 'A-101' });
      const allowed = await hasPermission('user-1', 'bill', 'read', { societyId, flatNumber: 'B-202' });
      expect(allowed).toBe(true);
    });

    it('lets a resident read a bill for their own flat', async () => {
      findFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' });
      const allowed = await hasPermission('user-1', 'bill', 'read', { societyId, flatNumber: 'A-101' });
      expect(allowed).toBe(true);
    });

    it('blocks a resident from reading another flat’s bill', async () => {
      findFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' });
      const allowed = await hasPermission('user-1', 'bill', 'read', { societyId, flatNumber: 'B-202' });
      expect(allowed).toBe(false);
    });

    it('blocks residents from writing (generating) bills', async () => {
      findFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' });
      const allowed = await hasPermission('user-1', 'bill', 'write', { societyId });
      expect(allowed).toBe(false);
    });

    it('never allows deleting a bill, even for committee', async () => {
      findFirst.mockResolvedValueOnce({ role: 'committee', flatNumber: 'A-101' });
      const allowed = await hasPermission('user-1', 'bill', 'delete', { societyId });
      expect(allowed).toBe(false);
    });

    it('blocks a non-member entirely', async () => {
      findFirst.mockResolvedValueOnce(null);
      const allowed = await hasPermission('user-1', 'bill', 'read', { societyId, flatNumber: 'A-101' });
      expect(allowed).toBe(false);
    });
  });

  describe('visitor', () => {
    it('lets a guard write (register) visitors', async () => {
      findFirst.mockResolvedValueOnce({ role: 'guard', flatNumber: null });
      const allowed = await hasPermission('user-1', 'visitor', 'write', { societyId });
      expect(allowed).toBe(true);
    });

    it('blocks a resident from writing (registering) visitors', async () => {
      findFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' });
      const allowed = await hasPermission('user-1', 'visitor', 'write', { societyId });
      expect(allowed).toBe(false);
    });

    it('lets the resident of the flat approve their own visitor', async () => {
      findFirst.mockResolvedValueOnce({ role: 'owner', flatNumber: 'A-101' });
      const allowed = await hasPermission('user-1', 'visitor', 'approve', { societyId, flatNumber: 'A-101' });
      expect(allowed).toBe(true);
    });
  });

  describe('requiredRoles override', () => {
    it('short-circuits to a role allowlist regardless of resource/action', async () => {
      findFirst.mockResolvedValueOnce({ role: 'guard', flatNumber: null });
      const allowed = await hasPermission('user-1', 'complaint', 'delete', {
        societyId,
        requiredRoles: ['guard'],
      });
      expect(allowed).toBe(true);
    });
  });
});
