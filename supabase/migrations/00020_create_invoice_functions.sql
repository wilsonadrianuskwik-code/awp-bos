-- Invoice/payment mutations, following the same pattern as
-- 00015_create_quotation_functions.sql: one RPC call = one transaction,
-- staff-role checks enforced inside the function, totals always
-- recomputed from persisted rows, activity + audit log writes inside the
-- same transaction as the mutation they describe.
--
-- Reused unchanged from 00015/00009: log_activity, log_audit_entry,
-- recompute_invoice_totals, next_document_number.

-- ---------------------------------------------------------------------
-- create_invoice — standalone invoice creation (mirrors create_quotation)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_invoice(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_client_id UUID,
  p_title TEXT,
  p_summary TEXT,
  p_currency TEXT,
  p_issue_date DATE,
  p_due_date DATE,
  p_payment_terms TEXT,
  p_notes TEXT,
  p_line_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_number TEXT;
  v_invoice_id UUID;
  v_year INTEGER := EXTRACT(YEAR FROM p_issue_date);
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create an invoice';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_invoice_number := public.next_document_number(p_workspace_id, 'invoice', 'INV', v_year);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by
  )
  VALUES (
    p_workspace_id, p_client_id, v_invoice_number, 'draft', COALESCE(p_currency, 'USD'),
    p_issue_date, p_due_date, NULLIF(p_title, ''), NULLIF(p_summary, ''),
    NULLIF(p_payment_terms, ''), NULLIF(p_notes, ''), p_actor_id
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    p_workspace_id, 'invoice', v_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_invoice_totals(v_invoice_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created invoice ' || v_invoice_number, 'invoice', v_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_invoice_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_invoice_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_invoice — only status='draft' invoices are editable
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_invoice(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_client_id UUID,
  p_title TEXT,
  p_summary TEXT,
  p_currency TEXT,
  p_issue_date DATE,
  p_due_date DATE,
  p_payment_terms TEXT,
  p_notes TEXT,
  p_line_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.invoices%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_old.status != 'draft' THEN
    RAISE EXCEPTION 'Invoice in status % cannot be edited', v_old.status;
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM p_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', p_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.due_date IS DISTINCT FROM p_due_date THEN
    v_changes := v_changes || jsonb_build_object('due_date', jsonb_build_object('old', v_old.due_date, 'new', p_due_date));
  END IF;

  UPDATE public.invoices
  SET client_id = p_client_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = COALESCE(p_currency, 'USD'),
      issue_date = p_issue_date,
      due_date = p_due_date,
      payment_terms = NULLIF(p_payment_terms, ''),
      notes = NULLIF(p_notes, ''),
      updated_at = now()
  WHERE id = p_invoice_id;

  DELETE FROM public.line_items WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    p_workspace_id, 'invoice', p_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_invoice_totals(p_invoice_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated invoice ' || v_old.invoice_number, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_invoice_status — staff-driven manual lifecycle transitions.
-- partial/paid are never reached through this function — those statuses
-- are a derived consequence of record_payment/delete_payment, not a
-- manual staff choice.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_invoice_status(
  p_invoice_id UUID,
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
  v_old public.invoices%ROWTYPE;
  v_valid_next TEXT[];
  v_action_label TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to change this invoice''s status';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_valid_next := CASE v_old.status
    WHEN 'draft' THEN ARRAY['sent', 'cancelled']
    WHEN 'sent' THEN ARRAY['viewed', 'cancelled']
    WHEN 'viewed' THEN ARRAY['cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Cannot transition invoice from % to %', v_old.status, p_new_status;
  END IF;

  v_action_label := CASE p_new_status
    WHEN 'sent' THEN 'sent'
    WHEN 'viewed' THEN 'marked viewed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE p_new_status
  END;

  UPDATE public.invoices
  SET status = p_new_status, updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    v_action_label || ' invoice ' || v_old.invoice_number, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id,
    jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$$;

-- ---------------------------------------------------------------------
-- delete_invoice — soft delete, draft-only, audit only (no activity),
-- mirrors delete_quotation.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_invoice(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.invoices%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_old.status != 'draft' THEN
    RAISE EXCEPTION 'Invoice in status % cannot be deleted', v_old.status;
  END IF;

  UPDATE public.invoices SET deleted_at = now() WHERE id = p_invoice_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'invoice', p_invoice_id);

  RETURN jsonb_build_object('success', true, 'id', p_invoice_id);
END;
$$;

-- ---------------------------------------------------------------------
-- record_payment — the core payment-recording transaction:
--   1. Generates a workspace-scoped payment_number via next_document_number.
--   2. Inserts the payment row (bank_name/receiver_account_name only
--      meaningful when payment_method = 'bank_transfer'; callers are
--      expected to pass NULL otherwise, but nothing here enforces that at
--      the DB layer — validation lives in the Zod schema, Milestone 4).
--   3. Recomputes amount_paid from the sum of non-deleted payments and
--      derives the invoice's new status (paid/partial).
--   4. Logs a payment activity carrying enough metadata (payment_number,
--      amount, currency, payment_method, ordinal) for the timeline to
--      render a rich row instead of parsing the description string.
--   5. If the invoice becomes fully paid, logs a second, distinct
--      "fully paid" activity — so the timeline shows "Payment #2
--      Recorded" and "Fully Paid" as separate entries.
-- ---------------------------------------------------------------------
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
  v_year INTEGER := EXTRACT(YEAR FROM p_payment_date);
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

  v_payment_number := public.next_document_number(p_workspace_id, 'payment', 'PAY', v_year);

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

-- ---------------------------------------------------------------------
-- delete_payment — soft-deletes the payment and re-runs the same
-- recompute, so removing a payment can correctly revert paid->partial or
-- partial->sent if amount_paid drops to 0. Does not retroactively
-- renumber other payments' "Payment #N" activity text — historical log
-- entries stay immutable, consistent with audit logs elsewhere.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_payment(
  p_payment_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_amount_paid NUMERIC(15,2);
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this payment';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE id = p_payment_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = v_payment.invoice_id
  FOR UPDATE;

  v_old_status := v_invoice.status;

  UPDATE public.payments SET deleted_at = now() WHERE id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
  FROM public.payments WHERE invoice_id = v_invoice.id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_amount_paid >= v_invoice.total THEN 'paid'
    WHEN v_amount_paid > 0 THEN 'partial'
    WHEN v_invoice.status IN ('partial', 'paid') THEN 'sent'
    ELSE v_invoice.status
  END;

  UPDATE public.invoices SET
    amount_paid = v_amount_paid,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = v_invoice.id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'payment', p_payment_id);
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'invoice', v_invoice.id,
      jsonb_build_object('status', jsonb_build_object('old', v_old_status, 'new', v_new_status))
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_payment_id);
END;
$$;

-- ---------------------------------------------------------------------
-- check_overdue_invoices — bulk-transitions sent/viewed/partial invoices
-- past due_date to overdue. Called from the invoice list page's server
-- component on each load (lazy "automatic status update"), not a real
-- cron job — mirrors how quotation expiry was left opportunistic in
-- Phase 3. Also the natural future hook point for late-fee application
-- (see the Phase 4 plan's "Future Extensibility: Late Fees" note).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_overdue_invoices(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_count INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to check overdue invoices';
  END IF;

  FOR v_invoice IN
    SELECT * FROM public.invoices
    WHERE workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND status IN ('sent', 'viewed', 'partial')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE public.invoices SET status = 'overdue', updated_at = now() WHERE id = v_invoice.id;

    PERFORM public.log_activity(
      p_workspace_id, NULL, 'system', 'status_change',
      'invoice ' || v_invoice.invoice_number || ' became overdue', 'invoice', v_invoice.id
    );
    PERFORM public.log_audit_entry(
      p_workspace_id, NULL, 'system', 'update', 'invoice', v_invoice.id,
      jsonb_build_object('status', jsonb_build_object('old', v_invoice.status, 'new', 'overdue'))
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- record_invoice_first_view — customer portal action, authenticated only
-- by possession of the share_token (a capability URL), never auth.uid().
-- Mirrors record_quotation_first_view: increments view_count/
-- last_viewed_at on every visit, but only transitions sent->viewed and
-- logs an activity once, on the first view.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_invoice_first_view(p_share_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.invoices
  WHERE share_token = p_share_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_row.first_viewed_at IS NULL THEN
    UPDATE public.invoices
    SET first_viewed_at = now(),
        last_viewed_at = now(),
        view_count = view_count + 1,
        status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        updated_at = now()
    WHERE id = v_row.id;

    PERFORM public.log_activity(
      v_row.workspace_id, NULL, 'customer', 'viewed',
      'customer viewed invoice ' || v_row.invoice_number, 'invoice', v_row.id
    );
    IF v_row.status = 'sent' THEN
      PERFORM public.log_audit_entry(
        v_row.workspace_id, NULL, 'customer', 'update', 'invoice', v_row.id,
        jsonb_build_object('status', jsonb_build_object('old', 'sent', 'new', 'viewed'))
      );
    END IF;
  ELSE
    UPDATE public.invoices
    SET last_viewed_at = now(),
        view_count = view_count + 1
    WHERE id = v_row.id;
  END IF;

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_row.id);
END;
$$;
