-- Fulfilment Project — the Finance -> Operations handoff object.
--
-- Today, "fulfillment" means only fulfillment_items: one quantity tracker
-- per line item (or per package sub-item, since 00051), with no grouping
-- entity above it and nowhere to put a project name, a start/end date,
-- campaign notes, or a team assignment. This migration adds that parent
-- object, fully additive and not yet wired into anything — 00053 threads
-- auto-creation into the existing payment/sync/manual-track call sites and
-- backfills existing invoices; 00054 adds the dated posting-schedule
-- (deliverables) layer underneath it.
--
-- One project per invoice: Operations works one client/invoice at a time
-- (a Client -> Invoice picker, not a project list — see the UI), so a
-- project is looked up by invoice_id, never independently created or
-- browsed by id from a list. Quantity tracking on fulfillment_items is
-- completely unchanged by this migration; project_id is added to that
-- table in 00053, once this table exists to reference.

CREATE TABLE IF NOT EXISTS fulfillment_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  invoice_id   UUID NOT NULL REFERENCES invoices(id),
  client_id    UUID NOT NULL REFERENCES clients(id),
  -- Nullable: deliberately blank on auto-creation. Operations names the
  -- project once real work starts, which is often later than payment.
  name         TEXT,
  status       TEXT NOT NULL DEFAULT 'not_started'
               CHECK (status IN ('not_started', 'in_progress', 'completed', 'cancelled')),
  start_date   DATE,
  end_date     DATE,
  notes        TEXT,
  -- Single assignee, same pattern as leads.assigned_to/clients.assigned_to
  -- and the already-stubbed-but-unused fulfillment_items.assigned_to.
  assigned_to  UUID REFERENCES auth.users(id),
  -- NULL = system-created (auto handoff on first payment), matching the
  -- created_by convention already used on fulfillment_items.
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

-- One live project per invoice — also the ON CONFLICT target
-- get_or_create_fulfillment_project_for_invoice (00053) uses to stay
-- race-safe under concurrent callers (a payment and a lazy sync racing).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_projects_invoice
  ON fulfillment_projects(invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fulfillment_projects_workspace_status
  ON fulfillment_projects(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fulfillment_projects_client
  ON fulfillment_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_projects_assigned
  ON fulfillment_projects(assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE fulfillment_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view fulfillment projects" ON fulfillment_projects;
CREATE POLICY "Members can view fulfillment projects"
  ON fulfillment_projects FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create fulfillment projects" ON fulfillment_projects;
CREATE POLICY "Staff can create fulfillment projects"
  ON fulfillment_projects FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can update fulfillment projects" ON fulfillment_projects;
CREATE POLICY "Staff can update fulfillment projects"
  ON fulfillment_projects FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- ---------------------------------------------------------------------
-- get_fulfillment_project_by_invoice — the single read path the
-- single-workspace UI needs (Client -> Invoice picker resolves straight to
-- this). Returns no row if the invoice has no project yet (not eligible,
-- i.e. never reached partial/paid) rather than creating one as a side
-- effect of a read — creation only ever happens via
-- get_or_create_fulfillment_project_for_invoice (00053), called from
-- payment/sync/manual-track paths, never from this query function.
-- Deliverable rollup columns (deliverable_count, deliverable_posted_count,
-- next_deliverable_date) are added in 00054 via DROP + CREATE once that
-- table exists, same "signature changed -> drop+create" convention 00051
-- already used for get_fulfillment_items.
-- ---------------------------------------------------------------------
CREATE FUNCTION get_fulfillment_project_by_invoice(
  p_workspace_id UUID,
  p_invoice_id UUID
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  client_id UUID,
  client_name TEXT,
  name TEXT,
  status TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  assigned_to UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tracker_count BIGINT,
  tracker_completed_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view fulfillment projects';
  END IF;

  RETURN QUERY
  SELECT
    fp.id,
    fp.workspace_id,
    fp.invoice_id,
    i.invoice_number,
    fp.client_id,
    c.name,
    fp.name,
    fp.status,
    fp.start_date,
    fp.end_date,
    fp.notes,
    fp.assigned_to,
    fp.created_at,
    fp.updated_at,
    COUNT(fi.id) AS tracker_count,
    COUNT(fi.id) FILTER (WHERE fi.status = 'completed') AS tracker_completed_count
  FROM public.fulfillment_projects fp
  JOIN public.invoices i ON i.id = fp.invoice_id
  JOIN public.clients c ON c.id = fp.client_id
  -- Joined by invoice_id, not project_id: this function ships in 00052,
  -- before fulfillment_items.project_id exists (added in 00053). One
  -- project per invoice makes the two joins equivalent regardless.
  LEFT JOIN public.fulfillment_items fi ON fi.invoice_id = fp.invoice_id AND fi.deleted_at IS NULL
  WHERE fp.workspace_id = p_workspace_id
    AND fp.invoice_id = p_invoice_id
    AND fp.deleted_at IS NULL
  GROUP BY fp.id, i.invoice_number, c.name;
END;
$$;

-- ---------------------------------------------------------------------
-- update_fulfillment_project — full-form-submit convention (mirrors
-- update_client): every field passed every call, diffed against the old
-- row for the audit log.
-- ---------------------------------------------------------------------
CREATE FUNCTION update_fulfillment_project(
  p_project_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.fulfillment_projects%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this fulfillment project';
  END IF;

  SELECT * INTO v_old FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date cannot be before start date';
  END IF;

  IF v_old.name IS DISTINCT FROM NULLIF(p_name, '') THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', v_old.name, 'new', NULLIF(p_name, '')));
  END IF;
  IF v_old.start_date IS DISTINCT FROM p_start_date THEN
    v_changes := v_changes || jsonb_build_object('start_date', jsonb_build_object('old', v_old.start_date, 'new', p_start_date));
  END IF;
  IF v_old.end_date IS DISTINCT FROM p_end_date THEN
    v_changes := v_changes || jsonb_build_object('end_date', jsonb_build_object('old', v_old.end_date, 'new', p_end_date));
  END IF;
  IF v_old.notes IS DISTINCT FROM NULLIF(p_notes, '') THEN
    v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('old', v_old.notes, 'new', NULLIF(p_notes, '')));
  END IF;

  UPDATE public.fulfillment_projects
  SET
    name = NULLIF(p_name, ''),
    start_date = p_start_date,
    end_date = p_end_date,
    notes = NULLIF(p_notes, ''),
    updated_at = now()
  WHERE id = p_project_id;

  IF v_changes != '{}'::JSONB THEN
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'updated',
      'updated fulfillment project details', 'fulfillment_project', p_project_id
    );
    PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_project', p_project_id, v_changes);
  END IF;

  RETURN (SELECT to_jsonb(fp) FROM public.fulfillment_projects fp WHERE fp.id = p_project_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_fulfillment_project_status — lifecycle transitions:
--   not_started -> in_progress or cancelled
--   in_progress -> completed or cancelled
--   completed/cancelled -> in_progress ("Reopen", gated admin+ — same
--     asymmetric gate already used by update_fulfillment_status, since
--     undoing a terminal state is more consequential than ordinary
--     progress).
-- Deliberately does not cascade to child trackers/deliverables — matches
-- the existing non-cascade decision already documented on
-- delete_fulfillment_event.
-- ---------------------------------------------------------------------
CREATE FUNCTION update_fulfillment_project_status(
  p_project_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
  v_valid_next TEXT[];
BEGIN
  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  v_valid_next := CASE v_project.status
    WHEN 'not_started' THEN ARRAY['in_progress', 'cancelled']
    WHEN 'in_progress' THEN ARRAY['completed', 'cancelled']
    WHEN 'completed' THEN ARRAY['in_progress']
    WHEN 'cancelled' THEN ARRAY['in_progress']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Cannot transition fulfillment project from % to %', v_project.status, p_new_status;
  END IF;

  IF v_project.status IN ('completed', 'cancelled') THEN
    IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to reopen this fulfillment project';
    END IF;
  ELSE
    IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to change this fulfillment project''s status';
    END IF;
  END IF;

  UPDATE public.fulfillment_projects
  SET status = p_new_status, updated_at = now()
  WHERE id = p_project_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    'changed fulfillment project status to ' || p_new_status,
    'fulfillment_project', p_project_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_project', p_project_id,
    jsonb_build_object('status', jsonb_build_object('old', v_project.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(fp) FROM public.fulfillment_projects fp WHERE fp.id = p_project_id);
END;
$$;

-- ---------------------------------------------------------------------
-- assign_fulfillment_project — single assignee; p_assigned_to = NULL
-- unassigns. Validates the target is an active member of this workspace
-- (not just any auth.users row) so a project can never be assigned to
-- someone outside it.
-- ---------------------------------------------------------------------
CREATE FUNCTION assign_fulfillment_project(
  p_project_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_assigned_to UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to assign this fulfillment project';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = p_assigned_to AND wm.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee is not a member of this workspace';
  END IF;

  UPDATE public.fulfillment_projects
  SET assigned_to = p_assigned_to, updated_at = now()
  WHERE id = p_project_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user',
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned' ELSE 'assigned' END,
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned this fulfillment project' ELSE 'assigned this fulfillment project' END,
    'fulfillment_project', p_project_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_project', p_project_id,
    jsonb_build_object('assigned_to', jsonb_build_object('old', v_project.assigned_to, 'new', p_assigned_to))
  );

  RETURN (SELECT to_jsonb(fp) FROM public.fulfillment_projects fp WHERE fp.id = p_project_id);
END;
$$;
