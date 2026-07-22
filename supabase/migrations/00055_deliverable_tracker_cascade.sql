-- Fulfilment consolidation (Section 6-7 of the UNIFY plan): deliverables
-- become the single source of truth that package tracker progress derives
-- from. Marking a linked deliverable "posted" now auto-records exactly one
-- unit of delivery against its tracker (single action, no double-entry);
-- un-posting reverses that same event. Also adds the batched RPCs the new
-- List/Kanban bulk UI needs, an assignee RPC for deliverables (previously
-- only settable at creation time), and a set-based "generate from an
-- explicit list of dates" RPC backing the new Generate Schedule wizard
-- (which supersedes the old fixed-frequency bulk_generate_fulfillment_deliverables
-- as the only deliverable-generation entry point going forward).

-- ---------------------------------------------------------------------
-- Prerequisite fix: the idempotency unique index doesn't exclude
-- soft-deleted rows, so un-posting (soft-deleting the cascade event) then
-- re-posting the same deliverable would hit a duplicate-key error on the
-- second INSERT even though the original event is logically gone.
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS idx_fulfillment_events_idempotency;
CREATE UNIQUE INDEX idx_fulfillment_events_idempotency
  ON fulfillment_events(idempotency_key) WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- update_fulfillment_deliverable_status — same signature/state machine as
-- 00054, with the tracker cascade added around the existing status update.
-- Nested PERFORM calls share this function's own transaction: if
-- record_fulfillment_event raises (tracker already completed/cancelled),
-- the whole deliverable status change rolls back with it.
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

  -- Forward cascade: posting a linked deliverable records exactly one unit
  -- of delivery against its tracker. If the tracker can no longer accept
  -- events (already completed/cancelled), this raises and rolls back the
  -- entire status transition above.
  IF p_new_status = 'posted' AND v_deliverable.fulfillment_item_id IS NOT NULL THEN
    PERFORM public.record_fulfillment_event(
      v_deliverable.fulfillment_item_id, p_workspace_id, p_actor_id, 1, CURRENT_DATE,
      'Auto-recorded from deliverable "' || v_deliverable.title || '"',
      'deliverable:' || p_deliverable_id
    );
  END IF;

  -- Reverse cascade: un-posting (reopen back to scheduled) soft-deletes the
  -- auto-recorded event so a later re-post creates a fresh one rather than
  -- double-counting. Deliberately does NOT touch fulfillment_items.status —
  -- if posting this deliverable had pushed the tracker to 'completed',
  -- un-posting leaves it 'completed' until someone explicitly reopens the
  -- tracker itself (matches the "no auto-regression" discipline already
  -- used elsewhere in this module).
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
-- delete_fulfillment_deliverable — same as 00054, plus reversing the
-- cascade event if the deliverable being deleted was posted, so a deleted
-- deliverable doesn't leave a phantom delivery behind on its tracker.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_fulfillment_deliverable(
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

  IF v_deliverable.status = 'posted' THEN
    UPDATE public.fulfillment_events
    SET deleted_at = now()
    WHERE idempotency_key = 'deliverable:' || p_deliverable_id AND deleted_at IS NULL;
  END IF;

  UPDATE public.fulfillment_deliverables SET deleted_at = now(), updated_at = now() WHERE id = p_deliverable_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'fulfillment_deliverable', p_deliverable_id);

  RETURN jsonb_build_object('success', true, 'id', p_deliverable_id);
END;
$$;

-- ---------------------------------------------------------------------
-- assign_fulfillment_deliverable — mirrors assign_fulfillment_project's
-- shape. Deliverables previously had no post-creation way to change
-- assigned_to (only settable via create/bulk-generate).
-- ---------------------------------------------------------------------
CREATE FUNCTION assign_fulfillment_deliverable(
  p_deliverable_id UUID,
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
  v_deliverable public.fulfillment_deliverables%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to assign this deliverable';
  END IF;

  SELECT * INTO v_deliverable FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_deliverable.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = p_assigned_to AND wm.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee is not a member of this workspace';
  END IF;

  UPDATE public.fulfillment_deliverables
  SET assigned_to = p_assigned_to, updated_at = now()
  WHERE id = p_deliverable_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user',
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned' ELSE 'assigned' END,
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned deliverable "' || v_deliverable.title || '"'
         ELSE 'assigned deliverable "' || v_deliverable.title || '"' END,
    'fulfillment_deliverable', p_deliverable_id, 'fulfillment_project', v_deliverable.project_id
  );

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = p_deliverable_id);
END;
$$;

-- ---------------------------------------------------------------------
-- bulk_update_fulfillment_deliverable_status — batched status change for
-- the List view's multi-select toolbar (P7-13 discipline: one RPC call,
-- not an N-way client fan-out). Loops the same single-row transition logic
-- inline per id; all-or-nothing — one invalid transition raises and rolls
-- back the entire batch, matching this codebase's existing bulk-action
-- precedent (no partial-success bulk state).
-- ---------------------------------------------------------------------
CREATE FUNCTION bulk_update_fulfillment_deliverable_status(
  p_deliverable_ids UUID[],
  p_workspace_id UUID,
  p_actor_id UUID,
  p_new_status TEXT
)
RETURNS SETOF fulfillment_deliverables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_deliverable_ids IS NULL OR array_length(p_deliverable_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No deliverables selected';
  END IF;

  FOREACH v_id IN ARRAY p_deliverable_ids LOOP
    PERFORM public.update_fulfillment_deliverable_status(v_id, p_workspace_id, p_actor_id, p_new_status);
  END LOOP;

  RETURN QUERY
  SELECT * FROM public.fulfillment_deliverables WHERE id = ANY(p_deliverable_ids);
END;
$$;

-- ---------------------------------------------------------------------
-- bulk_reschedule_fulfillment_deliverables — "Quick Reschedule": moves every
-- selected deliverable to one target date. Same batching/atomicity
-- discipline as above.
-- ---------------------------------------------------------------------
CREATE FUNCTION bulk_reschedule_fulfillment_deliverables(
  p_deliverable_ids UUID[],
  p_workspace_id UUID,
  p_actor_id UUID,
  p_scheduled_date DATE
)
RETURNS SETOF fulfillment_deliverables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_deliverable_ids IS NULL OR array_length(p_deliverable_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No deliverables selected';
  END IF;

  FOREACH v_id IN ARRAY p_deliverable_ids LOOP
    PERFORM public.reschedule_fulfillment_deliverable(v_id, p_workspace_id, p_actor_id, p_scheduled_date);
  END LOOP;

  RETURN QUERY
  SELECT * FROM public.fulfillment_deliverables WHERE id = ANY(p_deliverable_ids);
END;
$$;

-- ---------------------------------------------------------------------
-- bulk_create_fulfillment_deliverables — backs the Generate Schedule
-- wizard: unlike bulk_generate_fulfillment_deliverables (fixed frequency +
-- count from a start date, which can't represent an edited preview or the
-- "Custom" method), this accepts an explicit, already-computed/edited list
-- of {title, scheduled_date, description, fulfillment_item_id, assigned_to}
-- and inserts them all in one set-based statement. Same per-item
-- tracker-ownership validation as create_fulfillment_deliverable; one
-- summarized activity log entry, not one per row.
-- ---------------------------------------------------------------------
CREATE FUNCTION bulk_create_fulfillment_deliverables(
  p_project_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_items JSONB
)
RETURNS SETOF fulfillment_deliverables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
  v_count INT;
  v_bad_item_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to generate deliverables';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'Items must be a JSON array';
  END IF;

  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 200 THEN
    RAISE EXCEPTION 'Count must be between 1 and 200';
  END IF;

  SELECT (item->>'fulfillment_item_id')::UUID INTO v_bad_item_id
  FROM jsonb_array_elements(p_items) AS item
  WHERE item->>'fulfillment_item_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.fulfillment_items fi
      WHERE fi.id = (item->>'fulfillment_item_id')::UUID
        AND fi.project_id = p_project_id AND fi.deleted_at IS NULL
    )
  LIMIT 1;

  IF v_bad_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'One or more linked trackers do not belong to this project';
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'generated ' || v_count || ' deliverable(s)',
    'fulfillment_project', p_project_id
  );

  RETURN QUERY
  INSERT INTO public.fulfillment_deliverables (
    workspace_id, project_id, fulfillment_item_id, title, description,
    scheduled_date, assigned_to, created_by
  )
  SELECT
    p_workspace_id, p_project_id,
    NULLIF(item->>'fulfillment_item_id', '')::UUID,
    item->>'title',
    NULLIF(item->>'description', ''),
    (item->>'scheduled_date')::DATE,
    NULLIF(item->>'assigned_to', '')::UUID,
    p_actor_id
  FROM jsonb_array_elements(p_items) AS item
  RETURNING *;
END;
$$;
