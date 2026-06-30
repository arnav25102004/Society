-- Phase 2 DPDPA Consent Module

DO $$ BEGIN
  CREATE TYPE "ConsentType" AS ENUM ('data_collection', 'push_notifications', 'photo_capture');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "consent_records" (
  "id"            TEXT          NOT NULL,
  "userId"        TEXT          NOT NULL,
  "consentType"   "ConsentType" NOT NULL,
  "consentedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress"     VARCHAR(45),
  "policyVersion" VARCHAR(20)   NOT NULL DEFAULT '1.0',
  "revokedAt"     TIMESTAMP(3),
  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "consent_records_userId_consentType_idx"
  ON "consent_records"("userId", "consentType");

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
