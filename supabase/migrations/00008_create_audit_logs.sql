CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  actor_id    UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL CHECK (action IN ('create','update','delete','restore')),
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  changes     JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_workspace ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins and owners can view audit logs
CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (get_user_role(workspace_id) IN ('admin', 'owner'));

-- Insert via server actions only (staff+ can trigger actions that log)
CREATE POLICY "Staff can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );
