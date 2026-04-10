import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface AccessPayload {
  userId: string;
  phone: string;
  societyId?: string;
  role?: string;
}

interface RefreshPayload {
  userId: string;
  tokenId: string;
}

export const jwtService = {
  signAccessToken(payload: AccessPayload): string {
    return jwt.sign(payload, env.jwt.accessSecret, {
      expiresIn: env.jwt.accessExpiresIn,
    } as jwt.SignOptions);
  },

  signRefreshToken(payload: RefreshPayload): string {
    return jwt.sign(payload, env.jwt.refreshSecret, {
      expiresIn: env.jwt.refreshExpiresIn,
    } as jwt.SignOptions);
  },

  verifyAccessToken(token: string): AccessPayload | null {
    try {
      return jwt.verify(token, env.jwt.accessSecret) as AccessPayload;
    } catch {
      return null;
    }
  },

  verifyRefreshToken(token: string): RefreshPayload | null {
    try {
      return jwt.verify(token, env.jwt.refreshSecret) as RefreshPayload;
    } catch {
      return null;
    }
  },
};
