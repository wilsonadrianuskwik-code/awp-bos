-- Posting Schedule: the dated deliverable layer Operations manages under a
-- Fulfilment Project, separate from (and additive to) the existing
-- quantity trackers (fulfillment_items). A deliverable is a single dated
-- unit of work (e.g. "Feed post — buka puasa bersama", Jul 12) that can
-- optionally reference a specific tracker so it counts toward that
-- tracker's purchased/delivered math, but the link is optional — a
-- deliverable can exist purely as a posting-schedule entry with no
-- quantity linkage, per the explicit "avoid over-engineering, projects
-- often start later than payment" steer.
--
-- "Overdue"/"due soon" is computed at read time (scheduled_date in the
-- past AND status = 'scheduled'), never stored — same never-cache-progress
-- discipline as purchased/delivered/remaining on fulfillment_items.

CREATE TABLE IF NOT EXISTS fulfillment_deliverables (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),
  -- ON DELETE RESTRICT: a project with a posting schedule must never be
  -- deletable out from under it (projects are soft-deleted anyway, so this
  -- only guards against a hard delete no code path performs).
  project_id          UUID NOT NULL REFERENCES fulfillment_projects(id) ON DELETE RESTRICT,
  -- Optional link to a specific quantity tracker. ON DELETE SET NULL: a
  -- deliverable outlives the tracker it was linked to rather than being
  -- destroyed by it (trackers are soft-deleted in practice, but this is
  -- the correct guard regardless).
  fulfillment_item_id UUID REFERENCES fulfillment_items(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  scheduled_date      DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled', 'posted', 'cancelled')),
  posted_at           TIMESTAMPTZ,
  -- Optional per-deliverable override of the project's own assignee.
  assigned_to         UUID REFERENCES auth.users(id),
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_deliverables_project
  ON fulfillment_deliverables(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fulfillment_deliverables_workspace_date
  ON fulfillment_deliverables(workspace_id, scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fulfillment_deliverables_item
  ON fulfillment_deliverables(fulfillment_item_id) WHERE fulfillment_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fulfillment_deliverables_assigned
  ON fulfillment_deliverables(assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE fulfillment_deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view fulfillment deliverables" ON fulfillment_deliverables;
CREATE POLICY "Members can view fulfillment deliverables"
  ON fulfillment_deliverables FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create fulfillment deliverables" ON fulfillment_deliverables;
CREATE POLICY "Staff can create fulfillment deliverables"
  ON fulfillment_deliverables FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can update fulfillment deliverables" ON fulfillment_deliverables;
CREATE POLICY "Staff can update fulfillment deliverables"
  ON fulfillment_deliverables FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- ---------------------------------------------------------------------
-- create_fulfillment_deliverable — validates the project exists/matches
-- workspace, and (if a tracker link is given) that the tracker actually
-- belongs to this project, rejecting a cross-project link.
-- ---------------------------------------------------------------------
CREATE FUNCTION create_fulfillment_deliverable(
  p_project_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_title TEXT,
  p_scheduled_date DATE,
  p_description TEXT DEFAULT NULL,
  p_fulfillment_item_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
  v_new_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to add a deliverable';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF p_scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Scheduled date is required';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_fulfillment_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fulfillment_items fi
    WHERE fi.id = p_fulfillment_item_id AND fi.project_id = p_project_id AND fi.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'That tracker does not belong to this project';
  END IF;

  INSERT INTO public.fulfillment_deliverables (
    workspace_id, project_id, fulfillment_item_id, title, description,
    scheduled_date, assigned_to, notes, created_by
  )
  VALUES (
    p_workspace_id, p_project_id, p_fulfillment_item_id, p_title, NULLIF(p_description, ''),
    p_scheduled_date, p_assigned_to, NULLIF(p_notes, ''), p_actor_id
  )
  RETURNING id INTO v_new_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'added deliverable "' || p_title || '"', 'fulfillment_deliverable', v_new_id,
    'fulfillment_project', p_project_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'fulfillment_deliverable', v_new_id);

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = v_new_id);
END;
$$;

-- ---------------------------------------------------------------------
-- bulk_generate_fulfillment_deliverables — a single set-based insert,
-- numeric guards matching the 00047 discipline (bounds enforced here so
-- every caller, present and future, is protected, not just today's form).
-- One summarized activity log entry, not one per row, to avoid flooding
-- the activity feed.
-- ---------------------------------------------------------------------
CREATE FUNCTION bulk_generate_fulfillment_deliverables(
  p_project_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_start_date DATE,
  p_frequency_days INTEGER,
  p_count INTEGER,
  p_title_template TEXT DEFAULT NULL,
  p_fulfillment_item_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL
)
RETURNS SETOF fulfillment_deliverables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to generate deliverables';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Start date is required';
  END IF;

  IF p_count IS NULL OR p_count < 1 OR p_count > 200 THEN
    RAISE EXCEPTION 'Count must be between 1 and 200';
  END IF;

  IF p_frequency_days IS NULL OR p_frequency_days < 1 THEN
    RAISE EXCEPTION 'Frequency must be at least 1 day';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_fulfillment_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fulfillment_items fi
    WHERE fi.id = p_fulfillment_item_id AND fi.project_id = p_project_id AND fi.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'That tracker does not belong to this project';
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'generated ' || p_count || ' deliverable(s) starting ' || p_start_date,
    'fulfillment_project', p_project_id
  );

  RETURN QUERY
  INSERT INTO public.fulfillment_deliverables (
    workspace_id, project_id, fulfillment_item_id, title, scheduled_date, assigned_to, created_by
  )
  SELECT
    p_workspace_id, p_project_id, p_fulfillment_item_id,
    COALESCE(NULLIF(p_title_template, ''), 'Post') || ' #' || (n + 1),
    p_start_date + (n * p_frequency_days),
    p_assigned_to, p_actor_id
  FROM generate_series(0, p_count - 1) AS n
  RETURNING *;
END;
$$;

-- ---------------------------------------------------------------------
-- reschedule_fulfillment_deliverable
-- ---------------------------------------------------------------------
CREATE FUNCTION reschedule_fulfillment_deliverable(
  p_deliverable_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_scheduled_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.fulfillment_deliverables%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to reschedule this deliverable';
  END IF;

  IF p_scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Scheduled date is required';
  END IF;

  SELECT * INTO v_old FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  UPDATE public.fulfillment_deliverables
  SET scheduled_date = p_scheduled_date, updated_at = now()
  WHERE id = p_deliverable_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'rescheduled deliverable "' || v_old.title || '"', 'fulfillment_deliverable', p_deliverable_id,
    'fulfillment_project', v_old.project_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', p_deliverable_id,
    jsonb_build_object('scheduled_date', jsonb_build_object('old', v_old.scheduled_date, 'new', p_scheduled_date))
  );

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = p_deliverable_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_fulfillment_deliverable_status — transitions:
--   scheduled -> posted or cancelled
--   posted/cancelled -> scheduled ("Reopen", gated admin+, same asymmetric
--     gate as every other terminal-state reopen in this codebase).
-- Sets/clears posted_at on entering/leaving 'posted'.
-- ---------------------------------------------------------------------
CREATE FUNCTION update_fulfillment_deliverable_status(
  p_deliverable_id UUID,
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
  v_deliverable public.fulfillment_deliverables%ROWTYPE;
  v_valid_next TEXT[];
BEGIN
  SELECT * INTO v_deliverable FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_deliverable.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  v_valid_next := CASE v_deliverable.status
    WHEN 'scheduled' THEN ARRAY['posted', 'cancelled']
    WHEN 'posted' THEN ARRAY['scheduled']
    WHEN 'cancelled' THEN ARRAY['scheduled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Cannot transition deliverable from % to %', v_deliverable.status, p_new_status;
  END IF;

  IF v_deliverable.status IN ('posted', 'cancelled') THEN
    IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to reopen this deliverable';
    END IF;
  ELSE
    IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to change this deliverable''s status';
    END IF;
  END IF;

  UPDATE public.fulfillment_deliverables
  SET
    status = p_new_status,
    posted_at = CASE WHEN p_new_status = 'posted' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_deliverable_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    'changed deliverable "' || v_deliverable.title || '" status to ' || p_new_status,
    'fulfillment_deliverable', p_deliverable_id, 'fulfillment_project', v_deliverable.project_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', p_deliverable_id,
    jsonb_build_object('status', jsonb_build_object('old', v_deliverable.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = p_deliverable_id);
END;
$$;

-- ---------------------------------------------------------------------
-- delete_fulfillment_deliverable — soft delete.
-- ---------------------------------------------------------------------
CREATE FUNCTION delete_fulfillment_deliverable(
  p_deliverable_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deliverable public.fulfillment_deliverables%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this deliverable';
  END IF;

  SELECT * INTO v_deliverable FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_deliverable.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  UPDATE public.fulfillment_deliverables SET deleted_at = now(), updated_at = now() WHERE id = p_deliverable_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'fulfillment_deliverable', p_deliverable_id);

  RETURN jsonb_build_object('success', true, 'id', p_deliverable_id);
END;
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_deliverables — paginated read with computed is_overdue
-- and tracker_description (resolved via the same package-aware logic
-- get_fulfillment_items already uses, when linked to a tracker).
-- ---------------------------------------------------------------------
CREATE FUNCTION get_fulfillment_deliverables(
  p_workspace_id UUID,
  p_project_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  fulfillment_item_id UUID,
  tracker_description TEXT,
  title TEXT,
  description TEXT,
  scheduled_date DATE,
  status TEXT,
  is_overdue BOOLEAN,
  posted_at TIMESTAMPTZ,
  assigned_to UUID,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view deliverables';
  END IF;

  RETURN QUERY
  SELECT
    fd.id,
    fd.project_id,
    fd.fulfillment_item_id,
    CASE WHEN fd.fulfillment_item_id IS NOT NULL
      THEN (CASE WHEN fi.package_item_index >= 0 THEN li.description || ' — ' || fi.package_item_name ELSE li.description END)
      ELSE NULL
    END AS tracker_description,
    fd.title,
    fd.description,
    fd.scheduled_date,
    fd.status,
    (fd.scheduled_date < CURRENT_DATE AND fd.status = 'scheduled') AS is_overdue,
    fd.posted_at,
    fd.assigned_to,
    fd.notes,
    fd.created_at,
    fd.updated_at,
    COUNT(*) OVER() AS total_count
  FROM public.fulfillment_deliverables fd
  LEFT JOIN public.fulfillment_items fi ON fi.id = fd.fulfillment_item_id
  LEFT JOIN public.line_items li ON li.id = fi.line_item_id
  WHERE fd.workspace_id = p_workspace_id
    AND fd.deleted_at IS NULL
    AND (p_project_id IS NULL OR fd.project_id = p_project_id)
    AND (p_status IS NULL OR fd.status = p_status)
    AND (p_from_date IS NULL OR fd.scheduled_date >= p_from_date)
    AND (p_to_date IS NULL OR fd.scheduled_date <= p_to_date)
  ORDER BY fd.scheduled_date ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_project_by_invoice — replaced (return shape changes) to
-- add deliverable rollup columns now that fulfillment_deliverables exists.
-- Every existing column/expression from 00052 carried forward unchanged.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_fulfillment_project_by_invoice(uuid, uuid);
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
  tracker_completed_count BIGINT,
  deliverable_count BIGINT,
  deliverable_posted_count BIGINT,
  next_deliverable_date DATE
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
    COUNT(DISTINCT fi.id) AS tracker_count,
    COUNT(DISTINCT fi.id) FILTER (WHERE fi.status = 'completed') AS tracker_completed_count,
    COUNT(DISTINCT fd.id) AS deliverable_count,
    COUNT(DISTINCT fd.id) FILTER (WHERE fd.status = 'posted') AS deliverable_posted_count,
    MIN(fd.scheduled_date) FILTER (WHERE fd.status = 'scheduled' AND fd.scheduled_date >= CURRENT_DATE) AS next_deliverable_date
  FROM public.fulfillment_projects fp
  JOIN public.invoices i ON i.id = fp.invoice_id
  JOIN public.clients c ON c.id = fp.client_id
  LEFT JOIN public.fulfillment_items fi ON fi.project_id = fp.id AND fi.deleted_at IS NULL
  LEFT JOIN public.fulfillment_deliverables fd ON fd.project_id = fp.id AND fd.deleted_at IS NULL
  WHERE fp.workspace_id = p_workspace_id
    AND fp.invoice_id = p_invoice_id
    AND fp.deleted_at IS NULL
  GROUP BY fp.id, i.invoice_number, c.name;
END;
$$;
