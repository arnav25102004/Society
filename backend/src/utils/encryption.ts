/**
 * Field-level encryption utility — AES-256-GCM.
 *
 * Two modes:
 *   encryptField(text)          — random IV; use for non-searchable fields (email, visitor_phone)
 *   encryptSearchable(text)     — deterministic IV (HMAC-derived); use for lookup fields (phone)
 *   decryptField(ciphertext)    — works for both modes
 *
 * Stored format:  base64(iv):base64(authTag):base64(ciphertext)
 *
 * AES_ENCRYPTION_KEY env var must be a base64-encoded 32-byte key.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

function getKey(): Buffer {
  const raw = Buffer.from(env.security.aesEncryptionKey, 'base64');
  if (raw.length !== 32) {
    throw new Error(`AES_ENCRYPTION_KEY must be 32 bytes (got ${raw.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  return raw;
}

/**
 * Encrypt with a random IV — use for display-only fields that are never searched.
 * Different ciphertext on each call for the same plaintext (semantically secure).
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv  = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/**
 * Encrypt with a deterministic IV derived from the plaintext.
 * Same plaintext always produces the same ciphertext — preserves DB unique constraints
 * and allows encrypted-value lookups (e.g., WHERE phone = encryptSearchable(rawPhone)).
 * Slightly weaker than random IV but necessary for indexed/searchable fields.
 */
export function encryptSearchable(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  // Derive a 12-byte deterministic IV via HMAC-SHA256 truncated to IV_LENGTH
  const iv = createHmac('sha256', key).update(plaintext, 'utf8').digest().slice(0, IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/**
 * Decrypt a value encrypted by either encryptField or encryptSearchable.
 * Returns the original plaintext, or the input unchanged if it doesn't look encrypted.
 */
export function decryptField(ciphertext: string | null | undefined): string {
  if (!ciphertext) return ciphertext ?? '';
  const parts = ciphertext.split(':');
  // Not in our encrypted format — return as-is (handles legacy plaintext records)
  if (parts.length !== 3) return ciphertext;
  try {
    const key = getKey();
    const iv  = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const enc = Buffer.from(parts[2], 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  } catch {
    // Decryption failed (wrong key, corrupted data, or plaintext that looks like our format)
    return ciphertext;
  }
}

/** Convenience: returns true if a string looks like an encrypted value */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  try {
    Buffer.from(parts[0], 'base64');
    Buffer.from(parts[1], 'base64');
    Buffer.from(parts[2], 'base64');
    return parts[0].length > 0 && parts[1].length > 0 && parts[2].length > 0;
  } catch {
    return false;
  }
}
