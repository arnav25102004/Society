import 'dotenv/config';

const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

// In dev mode: fall back to safe hardcoded defaults so you can just `npm run dev`
// without touching any env file. In production: all secrets must be set explicitly.
function get(key: string, devDefault: string): string {
  const value = process.env[key];
  if (!value) {
    if (isDev) {
      console.warn(`[env] ${key} not set — using dev default (safe for local only)`);
      return devDefault;
    }
    throw new Error(`Missing required env var in production: ${key}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  isDev,
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  // In dev: works out of box with docker-compose defaults
  DATABASE_URL: get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/societyhub'),
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',

  jwt: {
    // Dev defaults are safe because they are only used locally.
    // Never use these strings in production — set real secrets via env.
    accessSecret: get('JWT_ACCESS_SECRET', 'dev-access-secret-societyhub-local-only'),
    refreshSecret: get('JWT_REFRESH_SECRET', 'dev-refresh-secret-societyhub-local-only'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '7d',   // longer in dev for convenience
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  otp: {
    // 'console'   = OTP printed to terminal (dev only, never in production)
    // 'fast2sms'  = free Indian SMS — signup at fast2sms.com, no DLT needed
    // 'msg91'     = paid Indian SMS (₹0.28/SMS), needs DLT template ID
    provider: (process.env.OTP_PROVIDER ?? 'console') as 'console' | 'fast2sms' | 'msg91',
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS ?? '600', 10),
    fast2smsApiKey: process.env.FAST2SMS_API_KEY ?? '',
    msg91AuthKey: process.env.MSG91_AUTH_KEY ?? '',
    msg91TemplateId: process.env.MSG91_TEMPLATE_ID ?? '',
  },

  // File uploads: 'local' saves to ./uploads/ folder, no AWS needed in dev
  storage: {
    provider: (process.env.STORAGE_PROVIDER ?? 'local') as 'local' | 's3',
    localUploadDir: process.env.LOCAL_UPLOAD_DIR ?? './uploads',
    s3Bucket: process.env.S3_BUCKET ?? '',
    s3Region: process.env.S3_REGION ?? 'auto',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    // For Cloudflare R2: set S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
    // For standard AWS S3: leave empty
    s3Endpoint: process.env.S3_ENDPOINT ?? '',
    // Public base URL for serving files (R2 public bucket URL or CloudFront)
    s3PublicUrl: process.env.S3_PUBLIC_URL ?? '',
  },

  // AI: uses Google Gemini (has free tier). Falls back to 'mock' in dev if no key set.
  ai: {
    provider: (process.env.AI_PROVIDER ?? (process.env.GEMINI_API_KEY ? 'gemini' : 'mock')) as 'mock' | 'gemini' | 'openai',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  },
} as const;
