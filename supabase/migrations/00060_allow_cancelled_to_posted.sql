-- Kanban feedback: a cancelled deliverable could only be reopened back to
-- "scheduled" — there was no way to mark it directly "posted" (e.g. the
-- post did actually go out after all, and cancelling it was a mistake).
-- Both reopen directions are admin-gated the same way today's
-- posted->scheduled reopen already is; the forward cascade in this same
-- function already fires for *any* transition landing on 'posted'
-- (it only checks `p_new_status = 'posted'`), so cancelled->posted gets the
-- tracker cascade for free, no separate change needed there.

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
  -- records exactly one unit of delivery against its tracker. If the
  -- tracker can no longer accept events (already completed/cancelled), this
  -- raises and rolls back the entire status transition above.
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
