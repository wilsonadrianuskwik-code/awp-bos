-- Follow-up correction: 'draft' is removed (every deliverable is dated
-- again, scheduled_date back to NOT NULL) and the Kanban's transition
-- matrix is replaced by unrestricted movement — any status can move to any
-- other status by dragging. Only two invariants remain, both existing
-- business rules, not new ones: (1) posted still cascades one delivery
-- unit onto its linked tracker (or reverses it, leaving 'posted'), and
-- (2) leaving a terminal state (posted or cancelled) for anything else is
-- still gated to admin/owner — the same "undo a terminal state needs
-- elevated permission" rule this module has used since 00055.

-- Backfill: any existing 'draft' rows become 'scheduled', and any row
-- with no date (draft or otherwise) gets today's date so the column can
-- go back to NOT NULL cleanly.
UPDATE fulfillment_deliverables
SET scheduled_date = COALESCE(scheduled_date, CURRENT_DATE),
    status = CASE WHEN status = 'draft' THEN 'scheduled' ELSE status END
WHERE status = 'draft' OR scheduled_date IS NULL;

ALTER TABLE fulfillment_deliverables ALTER COLUMN scheduled_date SET NOT NULL;

ALTER TABLE fulfillment_deliverables DROP CONSTRAINT fulfillment_deliverables_status_check;
ALTER TABLE fulfillment_deliverables ADD CONSTRAINT fulfillment_deliverables_status_check
  CHECK (status IN ('scheduled', 'in_progress', 'posted', 'cancelled'));

-- ---------------------------------------------------------------------
-- create_fulfillment_deliverable — scheduled_date required again (no
-- more 'draft' fallback).
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
-- update_fulfillment_deliverable_status — unrestricted transitions
-- between the 4 remaining statuses. The only remaining gate: leaving
-- 'posted' or 'cancelled' (undoing a terminal state) requires admin/owner,
-- same as every prior migration in this series.
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
BEGIN
  SELECT * INTO v_deliverable FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_deliverable.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  IF p_new_status NOT IN ('scheduled', 'in_progress', 'posted', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status %', p_new_status;
  END IF;

  IF p_new_status = v_deliverable.status THEN
    RAISE EXCEPTION 'Deliverable is already %', p_new_status;
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

  -- Reverse cascade: leaving 'posted' for anything else soft-deletes the
  -- auto-recorded event so a later re-post creates a fresh one rather than
  -- double-counting. Deliberately does NOT touch fulfillment_items.status.
  IF v_deliverable.status = 'posted' AND p_new_status != 'posted' THEN
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
