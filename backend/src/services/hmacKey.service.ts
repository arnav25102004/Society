import { randomBytes } from 'crypto';
import { redis } from '../config/redis';

const KEY_PREFIX = 'hmac_key:';
const KEY_TTL_SECONDS = 5 * 60; // matches the sensitive-action-token lifetime

// Per-user, short-lived HMAC signing keys — issued to an authenticated mobile client
// so it can sign a handful of state-changing requests without ever shipping a static
// secret inside the app bundle (which would be trivially extractable by anyone).
export const hmacKeyService = {
  async issue(userId: string): Promise<{ key: string; expiresInSeconds: number }> {
    const key = randomBytes(32).toString('hex');
    await redis.setex(`${KEY_PREFIX}${userId}`, KEY_TTL_SECONDS, key);
    return { key, expiresInSeconds: KEY_TTL_SECONDS };
  },

  async get(userId: string): Promise<string | null> {
    return redis.get(`${KEY_PREFIX}${userId}`);
  },
};
