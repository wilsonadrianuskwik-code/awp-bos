-- Phase 12 workflow refinements, post-review:
--
-- 1. Fulfillment quantities are whole numbers only. The column stays
--    NUMERIC(10,3) (unchanged, so a future intentional decimal-quantity
--    feature is a one-line constraint removal, not a column-type
--    migration) but a CHECK now rejects any fractional value at the DB
--    layer, and record_fulfillment_event raises a friendly error before
--    ever reaching that constraint — the same "TS validates, RPC
--    re-validates as defense in depth" pattern already used everywhere
--    else in this codebase.
--
-- 2. Fulfillment should only begin once an invoice has actually started
--    being paid, not merely once it's been sent/viewed. Narrows the
--    eligible-invoice-status set from the original "actually billed" set
--    (sent/viewed/partial/paid/overdue) down to partial/paid only, in both
--    sync_fulfillment_items (automatic) and create_fulfillment_item
--    (manual "Track Fulfillment"). This is a business-rule change, not an
--    architectural one — sync_fulfillment_items was never called from any
--    invoice-creation/status-transition code (confirmed: zero touch to
--    src/features/invoices/actions.ts or any invoice RPC), so narrowing
--    the eligible-status set is the correct and sufficient fix. In
--    practice this also ties activation tightly to the payment moment:
--    the invoice detail page already calls sync_fulfillment_items on every
--    load, and record-payment-dialog.tsx already calls router.refresh()
--    immediately after a payment is recorded — so a tracker now appears
--    the moment a payment lands, without any new call site inside the
--    Invoice feature.

ALTER TABLE fulfillment_events DROP CONSTRAINT IF EXISTS fulfillment_events_quantity_delivered_check;
ALTER TABLE fulfillment_events ADD CONSTRAINT fulfillment_events_quantity_delivered_check
  CHECK (quantity_delivered > 0 AND quantity_delivered = TRUNC(quantity_delivered));

CREATE OR REPLACE FUNCTION sync_fulfillment_items(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to sync fulfillment items';
  END IF;

  FOR v_row IN
    SELECT li.id AS line_item_id, i.id AS invoice_id, i.invoice_number, i.client_id
    FROM public.line_items li
    JOIN public.invoices i ON i.id = li.entity_id AND li.entity_type = 'invoice'
    WHERE li.workspace_id = p_workspace_id
      AND i.deleted_at IS NULL
      AND i.status IN ('partial', 'paid')
      AND li.quantity > 1
      AND NOT EXISTS (
        SELECT 1 FROM public.fulfillment_items fi
        WHERE fi.line_item_id = li.id AND fi.deleted_at IS NULL
      )
  LOOP
    INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id)
    VALUES (p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id)
    ON CONFLICT (line_item_id) WHERE deleted_at IS NULL DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NOT NULL THEN
      PERFORM public.log_activity(
        p_workspace_id, NULL, 'system', 'created',
        'started tracking fulfillment for invoice ' || v_row.invoice_number,
        'fulfillment_item', v_new_id, 'invoice', v_row.invoice_id
      );
      PERFORM public.log_audit_entry(p_workspace_id, NULL, 'system', 'create', 'fulfillment_item', v_new_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION create_fulfillment_item(
  p_line_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line_item public.line_items%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_new_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to track fulfillment';
  END IF;

  SELECT * INTO v_line_item FROM public.line_items
  WHERE id = p_line_item_id AND workspace_id = p_workspace_id AND entity_type = 'invoice';

  IF v_line_item.id IS NULL THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = v_line_item.entity_id AND deleted_at IS NULL;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status NOT IN ('partial', 'paid') THEN
    RAISE EXCEPTION 'Invoice in status % is not eligible for fulfillment tracking', v_invoice.status;
  END IF;

  INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id, created_by)
  VALUES (p_workspace_id, v_invoice.id, v_invoice.client_id, p_line_item_id, p_actor_id)
  ON CONFLICT (line_item_id) WHERE deleted_at IS NULL DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'This line item is already being tracked';
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'started tracking fulfillment for invoice ' || v_invoice.invoice_number,
    'fulfillment_item', v_new_id, 'invoice', v_invoice.id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'fulfillment_item', v_new_id);

  RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = v_new_id);
END;
$$;

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

  SELECT li.quantity INTO v_purchased FROM public.line_items li WHERE li.id = v_item.line_item_id;

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
