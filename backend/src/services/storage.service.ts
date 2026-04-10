/**
 * Storage service — abstracts local disk vs S3.
 * Dev: files saved to ./uploads/ and served as static files.
 * Production: swap STORAGE_PROVIDER=s3 and fill S3 credentials.
 */
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

const LOCAL_DIR = path.resolve(env.storage.localUploadDir);

// Ensure local upload directory exists
if (env.storage.provider === 'local' && !fs.existsSync(LOCAL_DIR)) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

export const storageService = {
  /**
   * Save a file buffer and return a public URL.
   * In dev: saves to ./uploads/<filename>, served at /uploads/<filename>
   * In prod: uploads to S3 and returns a signed or public URL
   */
  async save(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
    if (env.storage.provider === 'local') {
      const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filepath = path.join(LOCAL_DIR, safeFilename);
      fs.writeFileSync(filepath, buffer);
      return `/uploads/${safeFilename}`;
    }

    // S3 upload (plug in when ready for production)
    throw new Error('S3 storage not configured yet. Set STORAGE_PROVIDER=local for dev.');
  },

  /**
   * Delete a file by its URL.
   */
  async delete(fileUrl: string): Promise<void> {
    if (env.storage.provider === 'local') {
      const filename = path.basename(fileUrl);
      const filepath = path.join(LOCAL_DIR, filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
  },
};
