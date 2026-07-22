-- Consolidates the deliverable<->tracker progress cascade into ONE pipeline
-- instead of two mechanisms glued together by sniffing whether a string key
-- was passed. Before this migration: 00055 added a "forward cascade" (post a
-- deliverable -> record_fulfillment_event with p_idempotency_key =
-- 'deliverable:<id>'), and 00056 added a "reverse tally" bolted onto the
-- SAME function, keyed off `p_idempotency_key IS NULL` to distinguish a
-- manual call from a cascade-originated one. That works, but reads as two
-- systems stitched together by a magic string convention, not one pipeline.
--
-- This migration makes it explicit: record_fulfillment_event takes a typed
-- p_source_deliverable_id UUID instead of a raw p_idempotency_key TEXT. The
-- idempotency key is derived internally from it. The deliverable-schedule
-- reconciliation (marking scheduled deliverables as posted) now runs
-- UNCONDITIONALLY on every call — manual or deliverable-triggered — simply
-- excluding p_source_deliverable_id from its own candidate set when one is
-- given (that deliverable's status is already being set by its own caller).
-- One parameter replaces one implicit string convention; the behavior is
-- identical, but there is exactly one entry point and one exclusion rule,
-- not two branches distinguished by "was a key passed at all."

-- ---------------------------------------------------------------------
-- mark_next_scheduled_deliverables_posted — same as 00056, plus an
-- exclusion parameter so the caller that already knows which deliverable
-- triggered this call (the forward cascade) can keep that one out of the
-- reconciliation pass, rather than the reconciliation being skipped
-- entirely for that path.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_next_scheduled_deliverables_posted(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_count INTEGER,
  p_exclude_deliverable_id UUID DEFAULT NULL
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
      AND (p_exclude_deliverable_id IS NULL OR id != p_exclude_deliverable_id)
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
-- record_fulfillment_event — the one progress-writing entry point for the
-- whole module. Changing the trailing parameter's type (TEXT -> UUID)
-- requires dropping the old overload first; CREATE OR REPLACE cannot
-- change an existing parameter's type.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS record_fulfillment_event(uuid, uuid, uuid, numeric, date, text, text);

CREATE FUNCTION record_fulfillment_event(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_quantity_delivered NUMERIC,
  p_event_date DATE,
  p_notes TEXT,
  p_source_deliverable_id UUID DEFAULT NULL
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
  v_idempotency_key TEXT;
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

  v_idempotency_key := CASE
    WHEN p_source_deliverable_id IS NOT NULL THEN 'deliverable:' || p_source_deliverable_id
    ELSE NULL
  END;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_event FROM public.fulfillment_events
    WHERE idempotency_key = v_idempotency_key AND deleted_at IS NULL;

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
    NULLIF(p_notes, ''), v_idempotency_key, p_actor_id
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

  -- Reconciliation: runs on every call, not just unkeyed ones. When this
  -- call is itself triggered by one specific deliverable being posted, that
  -- deliverable's own status was already flipped by its caller BEFORE this
  -- function ran — meaning it's no longer in the 'scheduled' candidate set
  -- and reconciliation would otherwise spill the same unit onto the NEXT
  -- scheduled deliverable instead of recognizing it's already accounted
  -- for. Subtracting 1 for a deliverable-triggered call (always quantity 1
  -- at today's only call site) makes the reconciliation quantity net to
  -- zero for that path — one pipeline, one quantity adjustment, not a
  -- separate on/off branch.
  PERFORM public.mark_next_scheduled_deliverables_posted(
    p_fulfillment_item_id, p_workspace_id, p_actor_id,
    p_quantity_delivered::int - (CASE WHEN p_source_deliverable_id IS NOT NULL THEN 1 ELSE 0 END),
    p_source_deliverable_id
  );

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

-- ---------------------------------------------------------------------
-- update_fulfillment_deliverable_status — same signature/body as 00055,
-- with its cascade call updated to pass the typed p_source_deliverable_id
-- instead of building the 'deliverable:<id>' string itself. The direct
-- fulfillment_events soft-delete on reopen (below) still matches by the
-- same string value internally, so that branch is unchanged.
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

  IF p_new_status = 'posted' AND v_deliverable.fulfillment_item_id IS NOT NULL THEN
    PERFORM public.record_fulfillment_event(
      v_deliverable.fulfillment_item_id, p_workspace_id, p_actor_id, 1, CURRENT_DATE,
      'Auto-recorded from deliverable "' || v_deliverable.title || '"',
      p_deliverable_id
    );
  END IF;

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
