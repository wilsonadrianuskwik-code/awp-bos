CREATE TABLE activities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID NOT NULL REFERENCES workspaces(id),
  actor_id               UUID NOT NULL REFERENCES auth.users(id),
  action                 TEXT NOT NULL,
  description            TEXT NOT NULL,
  entity_type            TEXT NOT NULL,
  entity_id              UUID NOT NULL,
  secondary_entity_type  TEXT,
  secondary_entity_id    UUID,
  metadata               JSONB DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_workspace ON activities(workspace_id, created_at DESC);
CREATE INDEX idx_activities_entity ON activities(entity_type, entity_id, created_at DESC);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view activities"
  ON activities FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Staff can create activities"
  ON activities FOR INSERT
  WITH CHECK (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );
