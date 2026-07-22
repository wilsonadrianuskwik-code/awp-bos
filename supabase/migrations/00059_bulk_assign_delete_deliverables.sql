-- Bulk operations polish pass: the List/Kanban multi-select toolbars need
-- five actions (Mark Posted, Change Status, Assign, Reschedule, Delete).
-- Reschedule/status-change already have batched RPCs (migration 00055).
-- This adds the two missing ones — bulk assign and bulk delete — following
-- the exact same shape: loop the existing single-row function (which
-- already re-checks role and writes its own activity/audit log per row) via
-- PERFORM/UPDATE inside one plpgsql function over unnest(...), all-or-
-- nothing (one invalid id fails the whole batch, matching the existing
-- bulk-action precedent — no partial-success bulk state).

-- ---------------------------------------------------------------------
-- bulk_assign_fulfillment_deliverables — loops assign_fulfillment_deliverable
-- (00055) per id, so role checks, membership validation, and the per-row
-- activity log all stay exactly as they are for a single assign; only the
-- fan-out is batched into one RPC call (P7-13 convention).
-- ---------------------------------------------------------------------
CREATE FUNCTION bulk_assign_fulfillment_deliverables(
  p_deliverable_ids UUID[],
  p_workspace_id UUID,
  p_actor_id UUID,
  p_assigned_to UUID
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
    PERFORM public.assign_fulfillment_deliverable(v_id, p_workspace_id, p_actor_id, p_assigned_to);
  END LOOP;

  RETURN QUERY
  SELECT * FROM public.fulfillment_deliverables WHERE id = ANY(p_deliverable_ids);
END;
$$;

-- ---------------------------------------------------------------------
-- bulk_delete_fulfillment_deliverables — loops delete_fulfillment_deliverable
-- (00055) per id, which already handles the posted-deliverable cascade
-- event soft-delete and its own audit log entry. Returns the (now
-- soft-deleted) rows so the client can confirm exactly which ids were
-- removed, same as the other bulk RPCs' return shape.
-- ---------------------------------------------------------------------
CREATE FUNCTION bulk_delete_fulfillment_deliverables(
  p_deliverable_ids UUID[],
  p_workspace_id UUID,
  p_actor_id UUID
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
    PERFORM public.delete_fulfillment_deliverable(v_id, p_workspace_id, p_actor_id);
  END LOOP;

  RETURN QUERY
  SELECT * FROM public.fulfillment_deliverables WHERE id = ANY(p_deliverable_ids);
END;
$$;
