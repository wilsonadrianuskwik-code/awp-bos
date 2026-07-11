-- profiles previously only allowed a user to SELECT their own row
-- (auth.uid() = id). But activity timelines and now getQuotation()'s
-- created_by/approved_by lookup need to display OTHER workspace members'
-- name/avatar for attribution ("John approved this quotation"). Without
-- this, those lookups silently return null for anyone but the row's own
-- user — not an error, just missing attribution for teammates' actions.
--
-- Additive: Postgres RLS OR's multiple permissive policies together, so
-- this only widens access beyond "view your own profile," never narrows it.
DROP POLICY IF EXISTS "Members can view teammate profiles in shared workspaces" ON profiles;
CREATE POLICY "Members can view teammate profiles in shared workspaces"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT user_id FROM workspace_members
      WHERE workspace_id IN (SELECT get_user_workspace_ids())
      AND deleted_at IS NULL
    )
  );
