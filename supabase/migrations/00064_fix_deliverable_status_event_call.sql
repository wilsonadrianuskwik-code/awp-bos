-- Root cause of "function public.record_fulfillment_event(uuid, uuid, uuid,
-- integer, date, text, text) does not exist" on posting a deliverable from
-- the Kanban board (drag to Posted, or the bulk "Mark Posted" action,
-- which both go through update_fulfillment_deliverable_status):
--
-- Migration 00058 changed record_fulfillment_event's trailing parameter
-- from `p_idempotency_key TEXT` to `p_source_deliverable_id UUID`, and
-- correctly dropped the old TEXT-parameter overload
-- (record_fulfillment_event(uuid, uuid, uuid, numeric, date, text, text)).
-- But 00062 (written after 00058, to remove the 'draft' status and make
-- transitions unrestricted) restated update_fulfillment_deliverable_status
-- by copying its body forward from BEFORE 00058's signature change,
-- so its forward-cascade call still passed the old convention:
--
--   PERFORM public.record_fulfillment_event(
--     v_deliverable.fulfillment_item_id, p_workspace_id, p_actor_id, 1, CURRENT_DATE,
--     'Auto-recorded from deliverable "' || v_deliverable.title || '"',
--     'deliverable:' || p_deliverable_id          -- TEXT, last param
--   );
--
-- Since no overload accepts a TEXT 7th argument anymore, every attempt to
-- post a linked deliverable raised exactly the reported "does not exist"
-- error — 100% reproducible, not data-dependent, which is why it surfaced
-- immediately on Kanban.
--
-- Fix: pass p_deliverable_id directly as the UUID p_source_deliverable_id
-- argument (record_fulfillment_event derives the same 'deliverable:<id>'
-- idempotency key internally, per 00058) instead of building that string
-- here. The reverse-cascade block below it already targets
-- fulfillment_events.idempotency_key (a stored TEXT column, unrelated to
-- the function signature) and needs no change.

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
  -- records exactly one unit of delivery against its tracker. Passes the
  -- deliverable's own id as p_source_deliverable_id (UUID) — matching
  -- 00058's signature — instead of a hand-built 'deliverable:<id>' string.
  IF p_new_status = 'posted' AND v_deliverable.fulfillment_item_id IS NOT NULL THEN
    PERFORM public.record_fulfillment_event(
      v_deliverable.fulfillment_item_id, p_workspace_id, p_actor_id, 1, CURRENT_DATE,
      'Auto-recorded from deliverable "' || v_deliverable.title || '"',
      p_deliverable_id
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
