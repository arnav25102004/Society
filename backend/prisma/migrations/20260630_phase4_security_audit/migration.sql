-- Phase 4: Security Audit Log
-- Append-only table with a DB trigger that blocks UPDATE and DELETE.

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     UUID,
  "societyId"  UUID,
  action       VARCHAR(100) NOT NULL,
  resource     VARCHAR(100),
  "resourceId" VARCHAR(100),
  "ipAddress"  VARCHAR(45),
  "userAgent"  VARCHAR(500),
  country      VARCHAR(50),
  success      BOOLEAN NOT NULL DEFAULT TRUE,
  metadata     JSONB,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_audit_logs_userid_createdat ON security_audit_logs ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS security_audit_logs_societyid_createdat ON security_audit_logs ("societyId", "createdAt");
CREATE INDEX IF NOT EXISTS security_audit_logs_action_createdat ON security_audit_logs (action, "createdAt");

-- Trigger function: block all mutations (only INSERT is allowed)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_logs is append-only — UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_log ON security_audit_logs;
CREATE TRIGGER trg_immutable_audit_log
  BEFORE UPDATE OR DELETE ON security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
