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
  PORT: parseInt(process.env.PORT ?? '3002', 10),

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
    // RS256 keys — if not set in dev, jwt.service generates ephemeral keys at startup
    privateKeyB64: process.env.JWT_PRIVATE_KEY ?? '',
    publicKeyB64: process.env.JWT_PUBLIC_KEY ?? '',
    keyId: process.env.JWT_KEY_ID ?? 'v1',
  },

  security: {
    pinPepper: get('PIN_PEPPER', 'dev-pin-pepper-societyhub-local-only-32chars!!'),
    hmacSecret: get('HMAC_SECRET', 'dev-hmac-secret-societyhub-local-only-64chars-padding-here!!'),
    superAdminSecret: get('SUPER_ADMIN_SECRET', 'dev-super-admin-secret-societyhub-local-only-64chars!!'),
    aesEncryptionKey: get('AES_ENCRYPTION_KEY', 'HWZsZLh0XXZK4+Kck96jyUKX/mGLHlfCNd0GFdrGTF8='),
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
    // Google Play reviewer test account — logs in with a fixed OTP instead of a real
    // SMS, since reviewers can't receive texts. Scoped to exactly one phone number,
    // set as the "test credentials" in the Play Console submission. Unset either var
    // in production to disable entirely.
    reviewAccountPhone: process.env.REVIEW_ACCOUNT_PHONE ?? '',
    reviewAccountOtp: process.env.REVIEW_ACCOUNT_OTP ?? '',
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

  // AI provider. Auto-selects: groq if GROQ_API_KEY set, else gemini if GEMINI_API_KEY set,
  // else 'mock' (rule-based, no key needed). Override explicitly with AI_PROVIDER.
  // Groq is OpenAI-compatible (https://console.groq.com) — fast, cheap, open models.
  ai: {
    provider: (process.env.AI_PROVIDER ??
      (process.env.GROQ_API_KEY ? 'groq' : process.env.GEMINI_API_KEY ? 'gemini' : 'mock')) as
      'mock' | 'gemini' | 'openai' | 'groq',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',

    // Groq (OpenAI-compatible) config
    groqApiKey: process.env.GROQ_API_KEY ?? '',
    groqBaseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
    // Fast + cheap model with strict Structured Outputs (triage, draft).
    modelFast: process.env.AI_MODEL_FAST ?? 'openai/gpt-oss-20b',
    // Capable model with tool calling (chat, agent).
    modelSmart: process.env.AI_MODEL_SMART ?? 'llama-3.3-70b-versatile',
  },
} as const;
