/**
 * Resource-level RBAC (Role-Based Access Control).
 *
 * Checks whether a specific user can perform an action on a specific resource
 * within a society. Applied in the service layer (not just route middleware)
 * so permissions are enforced regardless of how a route is called.
 *
 * hasPermission(userId, resource, action, opts) → Promise<boolean>
 */

import { prisma } from '../config/db';

export type ResourceType = 'complaint' | 'bill' | 'visitor' | 'member' | 'announcement' | 'expense';
export type Action = 'read' | 'write' | 'delete' | 'approve';

interface PermissionOpts {
  /** Resource owner's user ID (for self-check) */
  ownerId?: string;
  /** Society this resource belongs to */
  societyId?: string;
  /** Flat number of the resource (for bill/visitor flat checks) */
  flatNumber?: string;
  /** Required member roles (default: all approved members can read) */
  requiredRoles?: string[];
}

/**
 * Central permission check. Returns true if the user can perform the action.
 *
 * Rules:
 *   - Residents (owner/tenant) can READ/WRITE their OWN resources only
 *   - Committee/admin can READ/WRITE/DELETE all resources in their society
 *   - Guards can only WRITE visitors for their society
 *   - Cross-society access is never allowed
 */
export async function hasPermission(
  userId: string,
  resource: ResourceType,
  action: Action,
  opts: PermissionOpts = {},
): Promise<boolean> {
  const { ownerId, societyId, flatNumber, requiredRoles } = opts;

  // Find the user's membership in the relevant society
  const membership = societyId
    ? await prisma.societyMember.findFirst({
        where: { userId, societyId, status: 'approved' },
      })
    : null;

  if (!membership && societyId) return false;  // not a member of this society

  const role = membership?.role ?? 'unknown';
  const isCommittee = ['committee', 'admin'].includes(role);
  const isOwner = userId === ownerId;
  const isSameFlat = flatNumber && membership?.flatNumber === flatNumber;

  // Check required roles override
  if (requiredRoles && requiredRoles.length > 0) {
    return requiredRoles.includes(role);
  }

  switch (resource) {
    case 'complaint':
      if (action === 'read')   return isCommittee || isOwner || !!isSameFlat;
      if (action === 'write')  return isCommittee || isOwner;
      if (action === 'delete') return isCommittee;
      if (action === 'approve') return isCommittee;
      break;

    case 'bill':
      if (action === 'read')  return isCommittee || !!isSameFlat;
      if (action === 'write') return isCommittee;  // only committee generates bills
      if (action === 'delete') return false;        // bills are never deleted
      break;

    case 'visitor':
      if (action === 'read')    return isCommittee || !!isSameFlat || role === 'guard';
      if (action === 'write')   return role === 'guard' || isCommittee;
      if (action === 'approve') return !!isSameFlat || isCommittee;  // resident of the flat
      break;

    case 'member':
      if (action === 'read')   return !!membership;        // any member can view member list
      if (action === 'write')  return isCommittee;
      if (action === 'approve') return isCommittee;
      if (action === 'delete') return isCommittee;
      break;

    case 'announcement':
      if (action === 'read')  return !!membership;
      if (action === 'write') return isCommittee;
      if (action === 'delete') return isCommittee;
      break;

    case 'expense':
      if (action === 'read')  return !!membership;  // all members can view for transparency
      if (action === 'write') return isCommittee;
      if (action === 'delete') return isCommittee;
      break;
  }

  return false;
}

/**
 * Express middleware factory: gates a route behind a resource-level check.
 * Resolves the resource context from req.params / req.query.
 */
export function requirePermission(resource: ResourceType, action: Action) {
  return async (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const authReq = req as import('../middleware/auth').AuthenticatedRequest;
    const userId = authReq.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const societyId = (req.query.societyId ?? req.body?.societyId) as string | undefined;
    const flatNumber = req.body?.flatNumber as string | undefined;

    const allowed = await hasPermission(userId, resource, action, { societyId, flatNumber });
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  };
}
