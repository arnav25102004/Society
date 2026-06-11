/**
 * Storage service — abstracts local disk vs S3 / Cloudflare R2.
 * Dev:  STORAGE_PROVIDER=local  → files saved to ./uploads/, served as static
 * Prod: STORAGE_PROVIDER=s3     → uploaded to R2/S3, returns public URL
 *
 * Cloudflare R2 env vars:
 *   S3_BUCKET, S3_REGION=auto
 *   S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
 *   S3_PUBLIC_URL=https://pub-<hash>.r2.dev   (or your custom domain)
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   (R2 API token pair)
 */
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

const LOCAL_DIR = path.resolve(env.storage.localUploadDir);

// Ensure local upload directory exists on startup
if (env.storage.provider === 'local' && !fs.existsSync(LOCAL_DIR)) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

// Lazy-initialised S3 client so we don't import AWS SDK in dev
let _s3Client: import('@aws-sdk/client-s3').S3Client | null = null;

async function getS3Client(): Promise<import('@aws-sdk/client-s3').S3Client> {
  if (_s3Client) return _s3Client;

  const { S3Client } = await import('@aws-sdk/client-s3');

  const cfg: ConstructorParameters<typeof S3Client>[0] = {
    region: env.storage.s3Region || 'auto',
    credentials: {
      accessKeyId: env.storage.awsAccessKeyId,
      secretAccessKey: env.storage.awsSecretAccessKey,
    },
  };

  // R2 requires a custom endpoint; AWS S3 does not
  if (env.storage.s3Endpoint) {
    cfg.endpoint = env.storage.s3Endpoint;
    // R2 needs path-style addressing
    cfg.forcePathStyle = false;
  }

  _s3Client = new S3Client(cfg);
  return _s3Client;
}

/** Sanitise a filename: strip path separators and keep only safe chars */
function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9-]/g, '_');
  return `${Date.now()}_${base}${ext}`;
}

export const storageService = {
  /**
   * Save a file buffer and return a public URL.
   *   local → /uploads/<filename>
   *   s3    → https://<s3PublicUrl>/<folder>/<filename>
   */
  async save(
    originalFilename: string,
    buffer: Buffer,
    mimeType: string,
    folder = 'uploads',
  ): Promise<string> {
    const filename = safeFilename(originalFilename);

    // ── Local ──────────────────────────────────────────────────────────────
    if (env.storage.provider === 'local') {
      const filepath = path.join(LOCAL_DIR, filename);
      fs.writeFileSync(filepath, buffer);
      return `/uploads/${filename}`;
    }

    // ── S3 / Cloudflare R2 ─────────────────────────────────────────────────
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3Client();

    const key = `${folder}/${filename}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: env.storage.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // Public-read so residents can view photos directly.
        // If using a private bucket, generate presigned URLs instead.
        ACL: 'public-read',
      }),
    );

    // Prefer explicit public URL (R2 public bucket domain / CloudFront)
    if (env.storage.s3PublicUrl) {
      return `${env.storage.s3PublicUrl.replace(/\/$/, '')}/${key}`;
    }

    // Fallback: standard AWS S3 path-style URL
    return `https://${env.storage.s3Bucket}.s3.${env.storage.s3Region}.amazonaws.com/${key}`;
  },

  /**
   * Delete a file by its public URL.
   * Silently ignores missing files (idempotent).
   */
  async delete(fileUrl: string): Promise<void> {
    if (!fileUrl) return;

    // ── Local ──────────────────────────────────────────────────────────────
    if (env.storage.provider === 'local') {
      const filename = path.basename(fileUrl);
      const filepath = path.join(LOCAL_DIR, filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      return;
    }

    // ── S3 / R2 ────────────────────────────────────────────────────────────
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3Client();

    // Extract the S3 key from the URL.
    // Works for both public URL (s3PublicUrl/key) and standard S3 URLs.
    let key: string;
    try {
      const url = new URL(fileUrl);
      // pathname is like /uploads/filename or /folder/filename
      key = url.pathname.replace(/^\//, '');
    } catch {
      // Not a URL — treat as a raw key
      key = fileUrl;
    }

    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.storage.s3Bucket,
        Key: key,
      }),
    );
  },
};
