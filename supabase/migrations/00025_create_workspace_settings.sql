-- Phase 7: Workspace Settings & Team Management.
--
-- workspace_invites closes the one real gap in the existing membership
-- model: workspace_members.invited_by already exists, but its RLS INSERT
-- policy requires a real auth.users row — there was never a way to
-- invite someone by email who hasn't signed up yet. Invites are
-- capability links (a unique token), the same pattern already proven for
-- quotations.share_token/invoices.share_token — not an email-sending
-- feature (Phase 4 explicitly deferred that infrastructure).

CREATE TABLE IF NOT EXISTS workspace_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  email        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'viewer')),
  token        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  invited_by   UUID NOT NULL REFERENCES auth.users(id),
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one live (pending) invite per email per workspace — re-inviting
-- revokes the old row first (see create_workspace_invite) rather than
-- colliding with this index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invites_pending_email
  ON workspace_invites(workspace_id, email) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);

ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

-- RLS is defense-in-depth here, same as every other table — the RPCs
-- below are SECURITY DEFINER and do the actual enforcement. The accept
-- flow reads a specific invite by token via the admin client instead
-- (mirrors getQuotationByShareToken/getInvoiceByShareToken), since the
-- invitee isn't a workspace member yet and has no row-level access.
DROP POLICY IF EXISTS "Admins and owners can view invites" ON workspace_invites;
CREATE POLICY "Admins and owners can view invites"
  ON workspace_invites FOR SELECT
  USING (get_user_role(workspace_id) IN ('admin', 'owner'));

DROP POLICY IF EXISTS "Admins and owners can create invites" ON workspace_invites;
CREATE POLICY "Admins and owners can create invites"
  ON workspace_invites FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('admin', 'owner'));

DROP POLICY IF EXISTS "Admins and owners can update invites" ON workspace_invites;
CREATE POLICY "Admins and owners can update invites"
  ON workspace_invites FOR UPDATE
  USING (get_user_role(workspace_id) IN ('admin', 'owner'));

-- ---------------------------------------------------------------------
-- create_workspace_invite
-- Rejects an email that already belongs to a current member outright
-- (never creates or replaces an invite in that case). Otherwise, any
-- existing pending invite for the same (workspace, email) is revoked
-- before the new one is inserted, so re-inviting always yields a fresh
-- working link instead of erroring on the partial unique index above.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_workspace_invite(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_existing_user_id UUID;
  v_invite_id UUID;
  v_replaced_count INTEGER;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to invite members';
  END IF;

  IF p_role NOT IN ('admin', 'staff', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT id INTO v_existing_user_id FROM auth.users WHERE lower(email) = v_email;

  IF v_existing_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = v_existing_user_id
  ) THEN
    RAISE EXCEPTION 'This person is already a member of this workspace';
  END IF;

  UPDATE public.workspace_invites
  SET status = 'revoked'
  WHERE workspace_id = p_workspace_id AND email = v_email AND status = 'pending';
  GET DIAGNOSTICS v_replaced_count = ROW_COUNT;

  INSERT INTO public.workspace_invites (workspace_id, email, role, invited_by)
  VALUES (p_workspace_id, v_email, p_role, p_actor_id)
  RETURNING id INTO v_invite_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'invited',
    'invited ' || v_email || ' as ' || p_role ||
      CASE WHEN v_replaced_count > 0 THEN ' (replacing a previous pending invite)' ELSE '' END,
    'workspace_invite', v_invite_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'workspace_invite', v_invite_id);

  RETURN (SELECT to_jsonb(wi) FROM public.workspace_invites wi WHERE wi.id = v_invite_id);
END;
$$;

-- ---------------------------------------------------------------------
-- revoke_workspace_invite
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION revoke_workspace_invite(
  p_invite_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.workspace_invites%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to revoke invites';
  END IF;

  SELECT * INTO v_invite FROM public.workspace_invites
  WHERE id = p_invite_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status != 'pending' THEN
    RAISE EXCEPTION 'Only pending invites can be revoked';
  END IF;

  UPDATE public.workspace_invites SET status = 'revoked' WHERE id = p_invite_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'revoked',
    'revoked the invite for ' || v_invite.email, 'workspace_invite', p_invite_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace_invite', p_invite_id,
    jsonb_build_object('status', jsonb_build_object('old', 'pending', 'new', 'revoked'))
  );

  RETURN jsonb_build_object('success', true, 'id', p_invite_id);
END;
$$;

-- ---------------------------------------------------------------------
-- accept_workspace_invite — called by an authenticated user who is not
-- yet a workspace member. Validates status/expiry, and that the invite's
-- email matches the caller's own auth.users.email (looked up server-side,
-- never trusted from the caller), before creating the membership.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_workspace_invite(
  p_token UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.workspace_invites%ROWTYPE;
  v_user_email TEXT;
  v_workspace public.workspaces%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM public.workspace_invites
  WHERE token = p_token
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status != 'pending' THEN
    RAISE EXCEPTION 'This invite is no longer available';
  END IF;

  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'This invite has expired';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  IF v_user_email IS NULL OR lower(v_user_email) != v_invite.email THEN
    RAISE EXCEPTION 'This invite was sent to a different email address';
  END IF;

  -- Defensive: the caller could already be a member if added another way
  -- between invite creation and acceptance.
  IF EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_invite.workspace_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this workspace';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_invite.workspace_id, p_user_id, v_invite.role, v_invite.invited_by);

  UPDATE public.workspace_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = p_user_id
  WHERE id = v_invite.id;

  SELECT * INTO v_workspace FROM public.workspaces WHERE id = v_invite.workspace_id;

  PERFORM public.log_activity(
    v_invite.workspace_id, p_user_id, 'user', 'joined',
    'joined the workspace as ' || v_invite.role, 'workspace_member', p_user_id
  );
  PERFORM public.log_audit_entry(v_invite.workspace_id, p_user_id, 'user', 'create', 'workspace_member', p_user_id);

  RETURN jsonb_build_object('workspace_id', v_workspace.id, 'workspace_slug', v_workspace.slug);
END;
$$;

-- ---------------------------------------------------------------------
-- update_workspace_member_role
-- Only an owner may change another owner's role or grant ownership.
-- Last-owner guard is a POST-mutation check: it counts owners excluding
-- the target member's own row, so it asks "would at least one owner
-- remain after this change" rather than "are there currently 2+ owners".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_workspace_member_role(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_member_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT;
  v_target public.workspace_members%ROWTYPE;
  v_remaining_owners INTEGER;
BEGIN
  v_actor_role := public.get_user_role(p_workspace_id);
  IF v_actor_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to change member roles';
  END IF;

  IF p_new_role NOT IN ('owner', 'admin', 'staff', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  IF p_new_role = 'owner' AND v_actor_role != 'owner' THEN
    RAISE EXCEPTION 'Only an owner can grant ownership';
  END IF;

  SELECT * INTO v_target FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_member_user_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_target.role = 'owner' AND v_actor_role != 'owner' THEN
    RAISE EXCEPTION 'Only an owner can change another owner''s role';
  END IF;

  IF v_target.role = 'owner' AND p_new_role != 'owner' THEN
    SELECT COUNT(*) INTO v_remaining_owners FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND role = 'owner' AND user_id != p_member_user_id;

    IF v_remaining_owners = 0 THEN
      RAISE EXCEPTION 'A workspace must have at least one owner';
    END IF;
  END IF;

  UPDATE public.workspace_members SET role = p_new_role WHERE id = v_target.id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'changed a member''s role from ' || v_target.role || ' to ' || p_new_role,
    'workspace_member', p_member_user_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace_member', p_member_user_id,
    jsonb_build_object('role', jsonb_build_object('old', v_target.role, 'new', p_new_role))
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_member_user_id, 'role', p_new_role);
END;
$$;

-- ---------------------------------------------------------------------
-- remove_workspace_member — hard DELETE. Membership is current
-- relationship state, not a business record to preserve; who was
-- removed, by whom, and when is captured by activities/audit_logs in the
-- same transaction instead. Same owner-only-touches-owner and
-- post-mutation last-owner guard as update_workspace_member_role.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_workspace_member(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_member_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT;
  v_target public.workspace_members%ROWTYPE;
  v_remaining_owners INTEGER;
BEGIN
  v_actor_role := public.get_user_role(p_workspace_id);
  IF v_actor_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to remove members';
  END IF;

  SELECT * INTO v_target FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_member_user_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_target.role = 'owner' THEN
    IF v_actor_role != 'owner' THEN
      RAISE EXCEPTION 'Only an owner can remove another owner';
    END IF;

    SELECT COUNT(*) INTO v_remaining_owners FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND role = 'owner' AND user_id != p_member_user_id;

    IF v_remaining_owners = 0 THEN
      RAISE EXCEPTION 'A workspace must have at least one owner';
    END IF;
  END IF;

  DELETE FROM public.workspace_members WHERE id = v_target.id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'removed',
    'removed a member from the workspace', 'workspace_member', p_member_user_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'workspace_member', p_member_user_id);

  RETURN jsonb_build_object('success', true, 'user_id', p_member_user_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_workspace — name/default_currency only; logo upload is
-- deferred to a later phase. The plain RLS UPDATE policy on `workspaces`
-- already permits this for admin/owner; this RPC wraps it purely for
-- consistent activity/audit logging with every other mutation.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_workspace(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_default_currency TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.workspaces%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update workspace settings';
  END IF;

  SELECT * INTO v_old FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  IF v_old.name IS DISTINCT FROM p_name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', v_old.name, 'new', p_name));
  END IF;
  IF v_old.default_currency IS DISTINCT FROM p_default_currency THEN
    v_changes := v_changes || jsonb_build_object('default_currency', jsonb_build_object('old', v_old.default_currency, 'new', p_default_currency));
  END IF;

  UPDATE public.workspaces
  SET name = p_name, default_currency = p_default_currency, updated_at = now()
  WHERE id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated workspace settings', 'workspace', p_workspace_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace', p_workspace_id, NULLIF(v_changes, '{}'::JSONB)
  );

  RETURN (SELECT to_jsonb(w) FROM public.workspaces w WHERE w.id = p_workspace_id);
END;
$$;
