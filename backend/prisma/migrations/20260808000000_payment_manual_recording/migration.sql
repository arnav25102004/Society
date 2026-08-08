-- Payment v1: no external gateway yet. Committee/admin manually records payments,
-- so we track who recorded it and let them attach a note (e.g. "cash handed to treasurer").
ALTER TABLE "payments" ADD COLUMN "recordedByUserId" TEXT;
ALTER TABLE "payments" ADD COLUMN "notes" TEXT;

ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedByUserId_fkey"
  FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
