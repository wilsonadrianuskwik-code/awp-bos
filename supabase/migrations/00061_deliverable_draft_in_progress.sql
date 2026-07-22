-- Kanban redesign: match the reference mockup's 5-column model (Draft,
-- Scheduled, In Progress, Posted, Cancelled) instead of today's 3
-- (Scheduled, Posted, Cancelled). Draft is a deliverable with no date yet —
-- an idea/placeholder captured before it's actually scheduled — so
-- scheduled_date becomes nullable. In Progress sits between Scheduled and
-- Posted for active work that hasn't gone out yet.
--
-- is_overdue only makes sense for a dated item still pending completion,
-- so it now also covers 'in_progress' (previously 'scheduled' only) and is
-- unconditionally false when scheduled_date is NULL (draft, or a
-- cancelled item that was cancelled straight out of Draft).

ALTER TABLE fulfillment_deliverables ALTER COLUMN scheduled_date DROP NOT NULL;

ALTER TABLE fulfillment_deliverables DROP CONSTRAINT fulfillment_deliverables_status_check;
ALTER TABLE fulfillment_deliverables ADD CONSTRAINT fulfillment_deliverables_status_check
  CHECK (status IN ('draft', 'scheduled', 'in_progress', 'posted', 'cancelled'));

-- ---------------------------------------------------------------------
-- create_fulfillment_deliverable — scheduled_date is now optional; a
-- deliverable created with no date starts life as 'draft', one created
-- with a date starts 'scheduled' (unchanged from before).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fulfillment_deliverable(
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
  v_status TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to add a deliverable';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  v_status := CASE WHEN p_scheduled_date IS NULL THEN 'draft' ELSE 'scheduled' END;

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
    scheduled_date, status, assigned_to, notes, created_by
  )
  VALUES (
    p_workspace_id, p_project_id, p_fulfillment_item_id, p_title, NULLIF(p_description, ''),
    p_scheduled_date, v_status, p_assigned_to, NULLIF(p_notes, ''), p_actor_id
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
-- update_fulfillment_deliverable_status — 5-state machine. Reopen
-- (posted/cancelled -> anything) stays admin/owner-gated exactly as
-- before; draft/scheduled/in_progress moves stay staff+.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_fulfillment_deliverable_status(
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
    WHEN 'draft' THEN ARRAY['scheduled', 'in_progress', 'cancelled']
    WHEN 'scheduled' THEN ARRAY['in_progress', 'posted', 'cancelled']
    WHEN 'in_progress' THEN ARRAY['scheduled', 'posted', 'cancelled']
    WHEN 'posted' THEN ARRAY['scheduled']
    WHEN 'cancelled' THEN ARRAY['scheduled', 'posted']
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

  -- Forward cascade: posting a linked deliverable (from any prior status)
  -- records exactly one unit of delivery against its tracker.
  IF p_new_status = 'posted' AND v_deliverable.fulfillment_item_id IS NOT NULL THEN
    PERFORM public.record_fulfillment_event(
      v_deliverable.fulfillment_item_id, p_workspace_id, p_actor_id, 1, CURRENT_DATE,
      'Auto-recorded from deliverable "' || v_deliverable.title || '"',
      'deliverable:' || p_deliverable_id
    );
  END IF;

  -- Reverse cascade: un-posting (reopen back to scheduled) soft-deletes the
  -- auto-recorded event so a later re-post creates a fresh one rather than
  -- double-counting. Deliberately does NOT touch fulfillment_items.status.
  IF v_deliverable.status = 'posted' AND p_new_status = 'scheduled' THEN
    UPDATE public.fulfillment_events
    SET deleted_at = now()
    WHERE idempotency_key = 'deliverable:' || p_deliverable_id AND deleted_at IS NULL;
  END IF;

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
-- get_fulfillment_deliverables — is_overdue now also covers 'in_progress'
-- and is unconditionally false when scheduled_date is NULL (a Draft item
-- is never overdue).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_fulfillment_deliverables(
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
    (fd.scheduled_date IS NOT NULL AND fd.scheduled_date < CURRENT_DATE AND fd.status IN ('scheduled', 'in_progress')) AS is_overdue,
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
  ORDER BY fd.scheduled_date ASC NULLS LAST, fd.created_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_deliverables_by_client — "Outstanding" now also
-- surfaces 'in_progress' work, not just 'scheduled'; same is_overdue fix.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_fulfillment_deliverables_by_client(
  p_workspace_id UUID,
  p_client_id UUID
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  scheduled_date DATE,
  status TEXT,
  is_overdue BOOLEAN,
  project_id UUID,
  project_name TEXT,
  fulfillment_item_id UUID,
  tracker_description TEXT
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
    fd.title,
    fd.scheduled_date,
    fd.status,
    (fd.scheduled_date IS NOT NULL AND fd.scheduled_date < CURRENT_DATE AND fd.status IN ('scheduled', 'in_progress')) AS is_overdue,
    fd.project_id,
    COALESCE(fp.name, 'Untitled Project') AS project_name,
    fd.fulfillment_item_id,
    CASE WHEN fd.fulfillment_item_id IS NOT NULL
      THEN (CASE WHEN fi.package_item_index >= 0 THEN li.description || ' — ' || fi.package_item_name ELSE li.description END)
      ELSE NULL
    END AS tracker_description
  FROM public.fulfillment_deliverables fd
  JOIN public.fulfillment_projects fp ON fp.id = fd.project_id AND fp.deleted_at IS NULL
  LEFT JOIN public.fulfillment_items fi ON fi.id = fd.fulfillment_item_id
  LEFT JOIN public.line_items li ON li.id = fi.line_item_id
  WHERE fd.workspace_id = p_workspace_id
    AND fp.client_id = p_client_id
    AND fd.deleted_at IS NULL
    AND fd.status IN ('scheduled', 'in_progress')
  ORDER BY fd.scheduled_date ASC NULLS LAST;
END;
$$;

-- ---------------------------------------------------------------------
-- mark_next_scheduled_deliverables_posted — a manual delivery record can
-- now also tally against 'in_progress' deliverables, not just 'scheduled'
-- ones (both represent not-yet-posted scheduled work).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_next_scheduled_deliverables_posted(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_count INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deliverable RECORD;
  v_marked INTEGER := 0;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN 0;
  END IF;

  FOR v_deliverable IN
    SELECT id, title, project_id
    FROM public.fulfillment_deliverables
    WHERE fulfillment_item_id = p_fulfillment_item_id
      AND status IN ('scheduled', 'in_progress')
      AND deleted_at IS NULL
    ORDER BY scheduled_date ASC NULLS LAST
    LIMIT p_count
  LOOP
    UPDATE public.fulfillment_deliverables
    SET status = 'posted', posted_at = now(), updated_at = now()
    WHERE id = v_deliverable.id;

    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'changed deliverable "' || v_deliverable.title || '" status to posted (from a manual delivery record)',
      'fulfillment_deliverable', v_deliverable.id, 'fulfillment_project', v_deliverable.project_id
    );
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', v_deliverable.id,
      jsonb_build_object('status', jsonb_build_object('old', 'scheduled', 'new', 'posted'))
    );

    v_marked := v_marked + 1;
  END LOOP;

  RETURN v_marked;
END;
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_project_by_invoice — next_deliverable_date now also
-- looks at 'in_progress' items, not just 'scheduled' ones. Every other
-- column/expression carried forward unchanged from 00054.
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
    MIN(fd.scheduled_date) FILTER (WHERE fd.status IN ('scheduled', 'in_progress') AND fd.scheduled_date >= CURRENT_DATE) AS next_deliverable_date
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
