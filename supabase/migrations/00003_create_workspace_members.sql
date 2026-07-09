CREATE TABLE workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'staff'
               CHECK (role IN ('owner','admin','staff','viewer')),
  invited_by   UUID REFERENCES auth.users(id),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (workspace_id, user_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS policies across all tables
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT workspace_id FROM public.workspace_members
  WHERE user_id = auth.uid() AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION get_user_role(ws_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.workspace_members
  WHERE user_id = auth.uid() AND workspace_id = ws_id AND deleted_at IS NULL;
$$;

-- Workspace policies
CREATE POLICY "Members can view their workspaces"
  ON workspaces FOR SELECT
  USING (id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Authenticated users can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and owners can update workspaces"
  ON workspaces FOR UPDATE
  USING (get_user_role(id) IN ('admin', 'owner'));

-- Workspace members policies
CREATE POLICY "Members can view members in their workspaces"
  ON workspace_members FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Admins and owners can add members"
  ON workspace_members FOR INSERT
  WITH CHECK (
    get_user_role(workspace_id) IN ('admin', 'owner')
    OR (
      -- Allow the workspace creator to add themselves as owner
      user_id = auth.uid()
      AND role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.deleted_at IS NULL
      )
    )
  );

CREATE POLICY "Admins and owners can update members"
  ON workspace_members FOR UPDATE
  USING (get_user_role(workspace_id) IN ('admin', 'owner'));

CREATE POLICY "Admins and owners can remove members"
  ON workspace_members FOR DELETE
  USING (get_user_role(workspace_id) IN ('admin', 'owner'));
