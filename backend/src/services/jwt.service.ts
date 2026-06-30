import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';
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

// ─── RS256 key management ─────────────────────────────────────────────────────
// Production: read PEM keys from env (base64-encoded).
// Dev: generate an ephemeral RSA pair at startup (tokens invalidated on restart — fine for dev).

let rsaPrivateKey: string;
let rsaPublicKey: string;
const keyId = env.jwt.keyId;

if (env.jwt.privateKeyB64 && env.jwt.publicKeyB64) {
  rsaPrivateKey = Buffer.from(env.jwt.privateKeyB64, 'base64').toString('utf8');
  rsaPublicKey  = Buffer.from(env.jwt.publicKeyB64,  'base64').toString('utf8');
} else {
  if (!env.isDev) {
    throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production');
  }
  console.warn('[jwt] RS256 keys not set — generating ephemeral dev keys (tokens reset on restart)');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  rsaPrivateKey = privateKey as unknown as string;
  rsaPublicKey  = publicKey  as unknown as string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const jwtService = {
  signAccessToken(payload: AccessPayload): string {
    return jwt.sign(payload, rsaPrivateKey, {
      algorithm: 'RS256',
      expiresIn: '15m',
      keyid: keyId,
    } as jwt.SignOptions);
  },

  signRefreshToken(payload: RefreshPayload): string {
    return jwt.sign(payload, rsaPrivateKey, {
      algorithm: 'RS256',
      expiresIn: '7d',
      keyid: keyId,
    } as jwt.SignOptions);
  },

  verifyAccessToken(token: string): AccessPayload | null {
    try {
      return jwt.verify(token, rsaPublicKey, { algorithms: ['RS256'] }) as AccessPayload;
    } catch {
      return null;
    }
  },

  verifyRefreshToken(token: string): RefreshPayload | null {
    try {
      return jwt.verify(token, rsaPublicKey, { algorithms: ['RS256'] }) as RefreshPayload;
    } catch {
      return null;
    }
  },

  signSensitiveActionToken(userId: string): string {
    return jwt.sign({ userId, type: 'sensitive_action' }, rsaPrivateKey, {
      algorithm: 'RS256',
      expiresIn: '5m',
      keyid: keyId,
    } as jwt.SignOptions);
  },

  verifySensitiveActionToken(token: string): { userId: string; type: string } | null {
    try {
      const payload = jwt.verify(token, rsaPublicKey, { algorithms: ['RS256'] }) as { userId: string; type: string };
      if (payload.type !== 'sensitive_action') return null;
      return payload;
    } catch {
      return null;
    }
  },

  // Returns the public key in PEM format for /.well-known/jwks.json if ever needed
  getPublicKey(): string {
    return rsaPublicKey;
  },
};
