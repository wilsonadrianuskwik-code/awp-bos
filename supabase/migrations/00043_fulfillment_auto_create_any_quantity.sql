-- Bug: "Record Payment -> nothing happens" for the extremely common case
-- of a single-quantity line item (e.g. one consulting fee, one flat-fee
-- service). Root cause: sync_fulfillment_items (00032) and
-- sync_fulfillment_items_for_invoice (00042) both gate automatic tracker
-- creation on `li.quantity > 1` — a leftover assumption that fulfillment
-- only matters for multi-unit deliveries. Nothing in the actual product
-- requirement supports that threshold: every eligible line item on an
-- invoice that just received its first (partial or full) payment should
-- get a tracker, one unit or ten. create_fulfillment_item (the manual
-- "Track Fulfillment" button) never had this restriction, which is why
-- the manual path kept working while the automatic one silently did
-- nothing for single-unit invoices.
--
-- Both functions are otherwise unchanged: same idempotent
-- ON CONFLICT (line_item_id) WHERE deleted_at IS NULL DO NOTHING, same
-- partial/paid-only eligibility, same activity/audit logging.

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

CREATE OR REPLACE FUNCTION sync_fulfillment_items_for_invoice(
  p_workspace_id UUID,
  p_invoice_id UUID
)
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
  FOR v_row IN
    SELECT li.id AS line_item_id, i.id AS invoice_id, i.invoice_number, i.client_id
    FROM public.line_items li
    JOIN public.invoices i ON i.id = li.entity_id AND li.entity_type = 'invoice'
    WHERE li.workspace_id = p_workspace_id
      AND i.id = p_invoice_id
      AND i.deleted_at IS NULL
      AND i.status IN ('sent', 'viewed', 'partial', 'paid', 'overdue')
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
        'started tracking fulfillment for invoice ' || v_row.invoice_number || ' after first payment',
        'fulfillment_item', v_new_id, 'invoice', v_row.invoice_id
      );
      PERFORM public.log_audit_entry(p_workspace_id, NULL, 'system', 'create', 'fulfillment_item', v_new_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
