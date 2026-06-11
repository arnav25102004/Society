import Redis from 'ioredis';
import { env } from './env';

// Upstash Redis uses rediss:// (TLS). ioredis handles this automatically
// when the URL starts with rediss://, but needs tls option enabled.
const isTLS = env.REDIS_URL.startsWith('rediss://');

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  // Required for Upstash (TLS) and other hosted Redis providers
  tls: isTLS ? { rejectUnauthorized: false } : undefined,
  // Upstash free tier disconnects idle connections — auto-reconnect
  enableOfflineQueue: false,
  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  },
});

redis.on('error', (err) => {
  // Don't crash on connection errors — just log them
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

redis.on('reconnecting', () => {
  console.log('[Redis] Reconnecting...');
});
