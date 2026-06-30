-- Phase 1 Security Migration
-- Adds: pin_hash + is_deleted to users, refresh_token_families, login_attempts, device_sessions

-- ─── Users: add pin_hash and is_deleted ──────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pin_hash" VARCHAR(100);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- ─── Refresh Token Families (family-based rotation + theft detection) ─────────
CREATE TABLE IF NOT EXISTS "refresh_token_families" (
  "id"         TEXT         NOT NULL,
  "familyId"   VARCHAR(50)  NOT NULL,
  "userId"     TEXT         NOT NULL,
  "tokenHash"  VARCHAR(64)  NOT NULL,
  "isUsed"     BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refresh_token_families_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_token_families_tokenHash_key"
  ON "refresh_token_families"("tokenHash");
CREATE INDEX IF NOT EXISTS "refresh_token_families_familyId_idx"
  ON "refresh_token_families"("familyId");
CREATE INDEX IF NOT EXISTS "refresh_token_families_userId_idx"
  ON "refresh_token_families"("userId");

ALTER TABLE "refresh_token_families"
  ADD CONSTRAINT "refresh_token_families_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Login Attempts (account lockout) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id"            TEXT         NOT NULL,
  "phone"         VARCHAR(15)  NOT NULL,
  "attemptCount"  INTEGER      NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil"   TIMESTAMP(3),
  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "login_attempts_phone_key"
  ON "login_attempts"("phone");

-- ─── Device Sessions (device fingerprinting) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "device_sessions" (
  "id"         TEXT         NOT NULL,
  "userId"     TEXT         NOT NULL,
  "deviceId"   VARCHAR(200) NOT NULL,
  "deviceName" VARCHAR(200),
  "ipAddress"  VARCHAR(45),
  "userAgent"  VARCHAR(500),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isTrusted"  BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_sessions_userId_deviceId_key"
  ON "device_sessions"("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "device_sessions_userId_idx"
  ON "device_sessions"("userId");

ALTER TABLE "device_sessions"
  ADD CONSTRAINT "device_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
