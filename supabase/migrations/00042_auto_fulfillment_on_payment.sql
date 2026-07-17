-- Fulfillment should start automatically from the first payment, not from
-- a lazy read-path sync. sync_fulfillment_items() (00030) already does the
-- actual creation work — idempotent, ON CONFLICT DO NOTHING on the
-- partial unique index over line_item_id — but only ever runs when a
-- staff member happens to open the ledger/invoice-detail/dashboard. This
-- adds a per-invoice variant of that same logic and calls it from inside
-- record_payment's own transaction, so tracking begins the moment the
-- invoice actually gets money against it (Partial or Full), matching:
--   Quotation -> Approved -> Generate Invoice -> Invoice
--   -> First Payment Recorded -> Automatically Create Fulfillment
--   -> Operations Team begins fulfillment -> Track Progress -> Completed
--
-- No new "Fulfillment" table or invoice/quotation reference column is
-- needed: fulfillment_items.invoice_id already ties every tracker back to
-- its invoice, and invoices.source_quotation_id (already on the table)
-- reaches the originating quotation one hop away when one exists.

-- ---------------------------------------------------------------------
-- sync_fulfillment_items_for_invoice — same eligibility rule and
-- ON CONFLICT DO NOTHING idempotency as sync_fulfillment_items, scoped to
-- one invoice instead of scanning the whole workspace, so it's cheap to
-- call inline from record_payment. No role check here: it's an internal
-- helper called only from record_payment, which already authorized the
-- actor as staff+ before reaching this point.
-- ---------------------------------------------------------------------
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

    -- A concurrent call (another payment on the same invoice, or the
    -- lazy workspace-wide sync) already created this tracker between the
    -- NOT EXISTS check and this INSERT — v_new_id is NULL; skip logging a
    -- row this call didn't create.
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

-- record_payment, unchanged except for one call added right after the
-- invoice's new status is committed: whenever a payment brings the
-- invoice to partial or paid, make sure fulfillment tracking exists for
-- its eligible line items. Safe to call on every payment (not just the
-- first) — the idempotent INSERT above means the 2nd, 3rd, etc. payment
-- on an already-tracked invoice is a no-op.
CREATE OR REPLACE FUNCTION record_payment(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_reference TEXT,
  p_notes TEXT,
  p_bank_name TEXT,
  p_receiver_account_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment_id UUID;
  v_payment_number TEXT;
  v_ordinal INTEGER;
  v_amount_paid NUMERIC(15,2);
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to record a payment';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0';
  END IF;

  v_old_status := v_invoice.status;

  v_payment_number := public.next_document_number(p_workspace_id, 'payment', 'PAY', p_payment_date);

  SELECT COUNT(*) + 1 INTO v_ordinal
  FROM public.payments
  WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  INSERT INTO public.payments (
    workspace_id, invoice_id, payment_number, amount, currency, payment_method,
    bank_name, receiver_account_name, payment_date, reference, notes, recorded_by
  )
  VALUES (
    p_workspace_id, p_invoice_id, v_payment_number, p_amount, COALESCE(p_currency, v_invoice.currency), p_payment_method,
    CASE WHEN p_payment_method = 'bank_transfer' THEN NULLIF(p_bank_name, '') ELSE NULL END,
    CASE WHEN p_payment_method = 'bank_transfer' THEN NULLIF(p_receiver_account_name, '') ELSE NULL END,
    p_payment_date, NULLIF(p_reference, ''), NULLIF(p_notes, ''), p_actor_id
  )
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
  FROM public.payments WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_amount_paid >= v_invoice.total THEN 'paid'
    WHEN v_amount_paid > 0 THEN 'partial'
    ELSE v_invoice.status
  END;

  UPDATE public.invoices SET
    amount_paid = v_amount_paid,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'payment_recorded',
    'recorded Payment #' || v_ordinal || ' (' || v_payment_number || ') — ' ||
      p_amount || ' via ' || p_payment_method,
    'invoice', p_invoice_id, 'payment', v_payment_id,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_number', v_payment_number,
      'amount', p_amount,
      'currency', COALESCE(p_currency, v_invoice.currency),
      'payment_method', p_payment_method,
      'ordinal', v_ordinal
    )
  );

  IF v_new_status = 'paid' THEN
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'invoice ' || v_invoice.invoice_number || ' fully paid', 'invoice', p_invoice_id
    );
  END IF;

  IF v_new_status IN ('partial', 'paid') THEN
    PERFORM public.sync_fulfillment_items_for_invoice(p_workspace_id, p_invoice_id);
  END IF;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'payment', v_payment_id);
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id,
      jsonb_build_object('status', jsonb_build_object('old', v_old_status, 'new', v_new_status))
    );
  END IF;

  RETURN jsonb_build_object(
    'invoice', (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id),
    'payment', (SELECT to_jsonb(p) FROM public.payments p WHERE p.id = v_payment_id)
  );
END;
$$;
