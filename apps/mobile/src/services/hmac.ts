import * as Crypto from 'expo-crypto';
import { api } from './api';

// HMAC-SHA256 built from expo-crypto's raw-byte SHA-256 digest (RFC 2104), since React
// Native has no built-in `crypto.createHmac`. Signing keys are short-lived and per-user —
// see POST /auth/signing-key on the backend for why a static secret can't ship here.

const BLOCK_SIZE = 64; // SHA-256 block size in bytes

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as BufferSource);
  return new Uint8Array(buf);
}

async function hmacSha256Hex(keyHex: string, message: string): Promise<string> {
  let keyBytes = hexToBytes(keyHex);
  if (keyBytes.length > BLOCK_SIZE) {
    keyBytes = await sha256(keyBytes);
  }
  const padded = new Uint8Array(BLOCK_SIZE);
  padded.set(keyBytes);

  const oKeyPad = padded.map(b => b ^ 0x5c);
  const iKeyPad = padded.map(b => b ^ 0x36);
  const messageBytes = new TextEncoder().encode(message);

  const inner = await sha256(concat(iKeyPad, messageBytes));
  const outer = await sha256(concat(oKeyPad, inner));
  return bytesToHex(outer);
}

let cachedKey: { key: string; expiresAt: number } | null = null;

async function getSigningKey(): Promise<string> {
  if (cachedKey && cachedKey.expiresAt > Date.now() + 5000) {
    return cachedKey.key;
  }
  const res = await api.post('/auth/signing-key');
  const { key, expiresInSeconds } = res.data as { key: string; expiresInSeconds: number };
  cachedKey = { key, expiresAt: Date.now() + expiresInSeconds * 1000 };
  return key;
}

// Signs a request body the same way the backend's verifyHmac middleware expects:
// HMAC-SHA256(JSON.stringify({...body, timestamp}), <per-user signing key>).
// Returns headers to spread onto the request — fetches a fresh signing key first if
// the cached one is missing or about to expire.
export async function signRequest(body: object = {}): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await getSigningKey();
  const payload = JSON.stringify({ ...body, timestamp });
  const signature = await hmacSha256Hex(key, payload);
  return {
    'X-Signature': signature,
    'X-Timestamp': String(timestamp),
  };
}
