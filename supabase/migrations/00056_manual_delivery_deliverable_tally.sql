-- Reverse of migration 00055's cascade: posting a deliverable already
-- bumps its tracker's delivered count (deliverable -> tracker). But the
-- manual "Record Delivery" button — still the only path for trackers that
-- were never scheduled — had no awareness of fulfillment_deliverables at
-- all, so recording a delivery directly on a tracker left every linked
-- "Post #N" deliverable sitting in "scheduled" even though a unit was
-- just delivered against it.
--
-- The fix is symmetric: when record_fulfillment_event is called with NO
-- idempotency_key (a true manual call — the dialog never sends one), mark
-- the tracker's earliest still-scheduled linked deliverables as posted,
-- one per unit delivered. The forward cascade's calls are always keyed
-- ('deliverable:<id>'), so this branch never fires for those, which is
-- what prevents a deliverable-post from trying to post a second
-- deliverable.

-- ---------------------------------------------------------------------
-- mark_next_scheduled_deliverables_posted — pure deliverable-side
-- mutation (no event recording), so calling it from inside
-- record_fulfillment_event cannot recurse back into itself. Mirrors
-- update_fulfillment_deliverable_status's own status-change log shape
-- exactly, so each deliverable's own activity history reads the same
-- regardless of which path posted it.
-- ---------------------------------------------------------------------
CREATE FUNCTION mark_next_scheduled_deliverables_posted(
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
      AND status = 'scheduled'
      AND deleted_at IS NULL
    ORDER BY scheduled_date ASC
    LIMIT p_count
  LOOP
    UPDATE public.fulfillment_deliverables
    SET status = 'posted', posted_at = now(), updated_at = now()
    WHERE id = v_deliverable.id;

    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'changed deliverable "' || v_deliverable.title || '" status to posted',
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
-- record_fulfillment_event — same signature/body as 00051, with the
-- reverse-tally call added after the tracker's own status update.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_fulfillment_event(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_quantity_delivered NUMERIC,
  p_event_date DATE,
  p_notes TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.fulfillment_items%ROWTYPE;
  v_purchased NUMERIC;
  v_delivered NUMERIC;
  v_new_status TEXT;
  v_event_id UUID;
  v_existing_event public.fulfillment_events%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to record a fulfillment event';
  END IF;

  IF p_quantity_delivered <= 0 THEN
    RAISE EXCEPTION 'Quantity delivered must be greater than 0';
  END IF;

  IF p_quantity_delivered != TRUNC(p_quantity_delivered) THEN
    RAISE EXCEPTION 'Quantity delivered must be a whole number';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_event FROM public.fulfillment_events
    WHERE idempotency_key = p_idempotency_key AND deleted_at IS NULL;

    IF v_existing_event.id IS NOT NULL THEN
      RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = v_existing_event.fulfillment_item_id);
    END IF;
  END IF;

  SELECT * INTO v_item FROM public.fulfillment_items
  WHERE id = p_fulfillment_item_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment item not found';
  END IF;

  IF v_item.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Fulfillment item in status % cannot accept new events', v_item.status;
  END IF;

  INSERT INTO public.fulfillment_events (
    workspace_id, fulfillment_item_id, quantity_delivered, event_date, notes, idempotency_key, recorded_by
  )
  VALUES (
    p_workspace_id, p_fulfillment_item_id, p_quantity_delivered, COALESCE(p_event_date, CURRENT_DATE),
    NULLIF(p_notes, ''), p_idempotency_key, p_actor_id
  )
  RETURNING id INTO v_event_id;

  IF v_item.package_item_index >= 0 THEN
    v_purchased := v_item.package_item_quantity;
  ELSE
    SELECT li.quantity INTO v_purchased FROM public.line_items li WHERE li.id = v_item.line_item_id;
  END IF;

  SELECT COALESCE(SUM(quantity_delivered), 0) INTO v_delivered
  FROM public.fulfillment_events
  WHERE fulfillment_item_id = p_fulfillment_item_id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_delivered >= v_purchased THEN 'completed'
    WHEN v_delivered > 0 THEN 'in_progress'
    ELSE v_item.status
  END;

  UPDATE public.fulfillment_items
  SET status = v_new_status, updated_at = now()
  WHERE id = p_fulfillment_item_id;

  -- Reverse tally: a manual (unkeyed) delivery record consumes that many
  -- of the tracker's earliest still-scheduled deliverables. Keyed calls
  -- (the forward cascade in update_fulfillment_deliverable_status, always
  -- 'deliverable:<id>') skip this — a deliverable being posted must never
  -- turn around and post a second deliverable.
  IF p_idempotency_key IS NULL THEN
    PERFORM public.mark_next_scheduled_deliverables_posted(
      p_fulfillment_item_id, p_workspace_id, p_actor_id, p_quantity_delivered::int
    );
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'fulfillment_recorded',
    'recorded delivery of ' || p_quantity_delivered || ' unit(s)',
    'fulfillment_item', p_fulfillment_item_id, 'invoice', v_item.invoice_id,
    jsonb_build_object('event_id', v_event_id, 'quantity_delivered', p_quantity_delivered)
  );
  IF v_new_status IS DISTINCT FROM v_item.status THEN
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_item', p_fulfillment_item_id,
      jsonb_build_object('status', jsonb_build_object('old', v_item.status, 'new', v_new_status))
    );
  END IF;

  RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = p_fulfillment_item_id);
END;
$$;
