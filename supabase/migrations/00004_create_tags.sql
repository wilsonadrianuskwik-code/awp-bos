CREATE TABLE tags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  color        TEXT DEFAULT '#6B7280',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tags"
  ON tags FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Admins can manage tags"
  ON tags FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('admin', 'owner'));

CREATE POLICY "Admins can update tags"
  ON tags FOR UPDATE
  USING (get_user_role(workspace_id) IN ('admin', 'owner'));

CREATE POLICY "Admins can delete tags"
  ON tags FOR DELETE
  USING (get_user_role(workspace_id) IN ('admin', 'owner'));
