import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwt.service';

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    phone: string;
    societyId?: string;
    role?: string;
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const payload = jwtService.verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  (req as AuthenticatedRequest).user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user?.role || !roles.includes(authReq.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

// Requires a valid sensitive_action_token in the X-Action-Token header.
// Call POST /auth/pin/verify first to obtain one (valid 5 minutes).
export function requirePin(req: Request, res: Response, next: NextFunction) {
  const actionToken = req.headers['x-action-token'] as string | undefined;
  if (!actionToken) {
    return res.status(403).json({
      success: false,
      message: 'This action requires PIN verification. Call POST /auth/pin/verify first.',
    });
  }

  const payload = jwtService.verifySensitiveActionToken(actionToken);
  if (!payload) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired action token. Please verify your PIN again.',
    });
  }

  // Ensure the action token belongs to the same user making the request
  const authUser = (req as AuthenticatedRequest).user;
  if (authUser && payload.userId !== authUser.userId) {
    return res.status(403).json({ success: false, message: 'Action token user mismatch' });
  }

  next();
}
