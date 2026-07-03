-- Widen all columns that store AES-256-GCM encrypted values.
-- Encrypted format: base64(iv):base64(authTag):base64(ciphertext) ~ 80-100 chars for short plaintext.
-- Users
ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(500);
-- Society members
ALTER TABLE society_members ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
-- Complaints
ALTER TABLE complaints ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
-- Maintenance bills
ALTER TABLE maintenance_bills ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
-- Payments
ALTER TABLE payments ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
-- Visitors
ALTER TABLE visitors ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
ALTER TABLE visitors ALTER COLUMN "visitorPhone" TYPE VARCHAR(500);
-- Pre-approvals
ALTER TABLE pre_approvals ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
ALTER TABLE pre_approvals ALTER COLUMN "visitorPhone" TYPE VARCHAR(500);
-- SOS alerts
ALTER TABLE sos_alerts ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
-- Knowledge entries
ALTER TABLE knowledge_entries ALTER COLUMN "flatNumber" TYPE VARCHAR(500);
