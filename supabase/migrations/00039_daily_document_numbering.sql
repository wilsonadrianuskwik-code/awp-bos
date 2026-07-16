-- Document numbering: switch from a yearly-reset "PREFIX-YYYY-0001" scheme
-- to a daily-reset "PREFIX-DDMMYYYY-001" one (e.g. INV-17092027-001),
-- across all three document types that share this numbering mechanism
-- (quotation/QUO, invoice/INV, payment/PAY) for consistency.
--
-- document_sequences.year was purely an internal partition key for the
-- UNIQUE(workspace_id, document_type, year) reset boundary — never read
-- by any application code (confirmed: every quotation/invoice/payment
-- number is treated as an opaque display string everywhere it's used).
-- Renamed to `period` and repurposed to hold a YYYYMMDD-encoded integer,
-- which resets the sequence daily instead of yearly using the exact same
-- ON CONFLICT mechanism.
ALTER TABLE document_sequences RENAME COLUMN year TO period;

-- Signature changes (INTEGER year -> DATE), so this can't be a plain
-- CREATE OR REPLACE (Postgres treats a different parameter type as a new
-- overload, not a replacement) — drop the old one first.
DROP FUNCTION IF EXISTS next_document_number(UUID, TEXT, TEXT, INTEGER);

CREATE FUNCTION next_document_number(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_prefix TEXT,
  p_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_number INTEGER;
  v_period INTEGER := TO_CHAR(p_date, 'YYYYMMDD')::INTEGER;
BEGIN
  INSERT INTO public.document_sequences (workspace_id, document_type, prefix, current_number, period)
  VALUES (p_workspace_id, p_document_type, p_prefix, 1, v_period)
  ON CONFLICT (workspace_id, document_type, period)
  DO UPDATE SET current_number = public.document_sequences.current_number + 1
  RETURNING current_number INTO v_number;

  RETURN p_prefix || '-' || TO_CHAR(p_date, 'DDMMYYYY') || '-' || LPAD(v_number::TEXT, 3, '0');
END;
$$;

-- Every caller below is CREATE OR REPLACE with an unchanged signature —
-- purely swapping "compute a year, pass it" for "pass the actual date
-- directly" now that next_document_number formats the whole date itself.

CREATE OR REPLACE FUNCTION create_quotation(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_client_id UUID,
  p_title TEXT,
  p_summary TEXT,
  p_currency TEXT,
  p_issue_date DATE,
  p_expiry_date DATE,
  p_terms_and_conditions TEXT,
  p_notes TEXT,
  p_internal_notes TEXT,
  p_line_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quotation_number TEXT;
  v_quotation_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a quotation';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_quotation_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', p_issue_date);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, created_by
  )
  VALUES (
    p_workspace_id, p_client_id, v_quotation_number, 'draft', COALESCE(p_currency, 'USD'),
    p_issue_date, p_expiry_date, NULLIF(p_title, ''), NULLIF(p_summary, ''), NULLIF(p_terms_and_conditions, ''),
    NULLIF(p_notes, ''), NULLIF(p_internal_notes, ''), p_actor_id
  )
  RETURNING id INTO v_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'quotation', v_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(v_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created quotation ' || v_quotation_number, 'quotation', v_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_quotation_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_quotation_id);
END;
$$;

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
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create an invoice';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_invoice_number := public.next_document_number(p_workspace_id, 'invoice', 'INV', p_issue_date);

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
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'invoice', v_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
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

CREATE OR REPLACE FUNCTION duplicate_quotation(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.quotations%ROWTYPE;
  v_new_id UUID;
  v_new_number TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this quotation';
  END IF;

  SELECT * INTO v_source FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  v_new_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', CURRENT_DATE);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_new_number, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, 1, p_actor_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'quotation', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_quotation_totals(v_new_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated quotation ' || v_source.quotation_number || ' to create ' || v_new_number,
    'quotation', p_quotation_id, 'quotation', v_new_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated from quotation ' || v_source.quotation_number,
    'quotation', v_new_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_new_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION create_quotation_version(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.quotations%ROWTYPE;
  v_root_id UUID;
  v_next_version INTEGER;
  v_new_id UUID;
  v_new_number TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to version this quotation';
  END IF;

  SELECT * INTO v_source FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  v_root_id := COALESCE(v_source.parent_quotation_id, v_source.id);

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.quotations
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
    AND (id = v_root_id OR parent_quotation_id = v_root_id);

  v_new_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', CURRENT_DATE);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, parent_quotation_id, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_new_number, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, v_next_version, v_root_id, p_actor_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'quotation', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_quotation_totals(v_new_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'versioned',
    'created version ' || v_next_version || ' (' || v_new_number || ') of quotation ' || v_source.quotation_number,
    'quotation', v_new_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_new_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION generate_invoice_from_quotation(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_invoice_date DATE,
  p_due_date DATE,
  p_copy_notes BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quotation public.quotations%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_due_date DATE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to generate an invoice';
  END IF;

  SELECT * INTO v_quotation FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_quotation.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_quotation.status != 'approved' THEN
    RAISE EXCEPTION 'Only approved quotations can generate an invoice';
  END IF;

  IF v_quotation.generated_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'An invoice has already been generated for this quotation';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = v_quotation.client_id;

  v_invoice_number := public.next_document_number(p_workspace_id, 'invoice', 'INV', p_invoice_date);
  v_due_date := COALESCE(p_due_date, p_invoice_date + (COALESCE(v_client.payment_terms, 30) || ' days')::INTERVAL);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, source_quotation_id, status,
    currency, issue_date, due_date, title, summary, notes, created_by
  )
  VALUES (
    p_workspace_id, v_quotation.client_id, v_invoice_number, p_quotation_id, 'draft',
    v_quotation.currency, p_invoice_date, v_due_date, v_quotation.title, v_quotation.summary,
    CASE WHEN p_copy_notes THEN v_quotation.notes ELSE NULL END, p_actor_id
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'invoice', v_invoice_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_invoice_totals(v_invoice_id);

  UPDATE public.quotations SET generated_invoice_id = v_invoice_id, updated_at = now() WHERE id = p_quotation_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'invoice_generated',
    'generated invoice ' || v_invoice_number || ' from quotation ' || v_quotation.quotation_number,
    'quotation', p_quotation_id, 'invoice', v_invoice_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'invoice ' || v_invoice_number || ' generated from quotation ' || v_quotation.quotation_number,
    'invoice', v_invoice_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id,
    jsonb_build_object('generated_invoice_id', jsonb_build_object('old', NULL, 'new', v_invoice_id))
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_invoice_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_invoice_id);
END;
$$;

CREATE OR REPLACE FUNCTION duplicate_invoice(
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
  v_source public.invoices%ROWTYPE;
  v_new_id UUID;
  v_new_number TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this invoice';
  END IF;

  SELECT * INTO v_source FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_new_number := public.next_document_number(p_workspace_id, 'invoice', 'INV', CURRENT_DATE);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_new_number, 'draft', v_source.currency,
    CURRENT_DATE, v_source.due_date, v_source.title, v_source.summary,
    v_source.payment_terms, v_source.notes, p_actor_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'invoice', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  PERFORM public.recompute_invoice_totals(v_new_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated invoice ' || v_source.invoice_number || ' to create ' || v_new_number,
    'invoice', p_invoice_id, 'invoice', v_new_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated from invoice ' || v_source.invoice_number,
    'invoice', v_new_id, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_new_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_new_id);
END;
$$;

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
