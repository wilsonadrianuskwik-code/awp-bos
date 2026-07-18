-- create_invoice/update_invoice/create_quotation/update_quotation all
-- fell back to a hardcoded COALESCE(p_currency, 'USD') whenever currency
-- was omitted — baking a US-centric assumption into the write path even
-- though every read/display path already resects each workspace's own
-- default_currency (workspaces.default_currency, already used everywhere
-- else: dashboard summaries, the invoice/quotation builder's initial
-- currency, formatCurrencyAmounts' fallback). In practice the builder UI
-- always submits an explicit currency, so this fallback rarely fires —
-- but when it does (a future integration, a stripped-down request), it
-- should resolve to the workspace's own default, not a fixed literal.
--
-- Every other line in each function is identical to its current
-- (create_quotation/update_quotation: 00040/00027; create_invoice: 00044;
-- update_invoice: 00027) body — only the currency fallback source
-- changes, from the literal 'USD' to a lookup against
-- workspaces.default_currency.

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
  v_internal_id TEXT;
  v_invoice_id UUID;
  v_currency TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create an invoice';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_invoice_number := public.generate_invoice_number(p_workspace_id, p_issue_date);
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, internal_id, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by
  )
  VALUES (
    p_workspace_id, p_client_id, v_invoice_number, v_internal_id, 'draft', v_currency,
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
  v_currency TEXT;
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

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM v_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', v_currency));
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
      currency = v_currency,
      issue_date = p_issue_date,
      due_date = p_due_date,
      payment_terms = NULLIF(p_payment_terms, ''),
      notes = NULLIF(p_notes, ''),
      updated_at = now()
  WHERE id = p_invoice_id;

  DELETE FROM public.line_items WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'invoice', p_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
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
  v_internal_id TEXT;
  v_quotation_id UUID;
  v_currency TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a quotation';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_quotation_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', p_issue_date);
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, created_by
  )
  VALUES (
    p_workspace_id, p_client_id, v_quotation_number, v_internal_id, 'draft', v_currency,
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

CREATE OR REPLACE FUNCTION update_quotation(
  p_quotation_id UUID,
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
  v_old public.quotations%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
  v_currency TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this quotation';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_old.status NOT IN ('draft', 'revision_requested') THEN
    RAISE EXCEPTION 'Quotation in status % cannot be edited', v_old.status;
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM v_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', v_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.expiry_date IS DISTINCT FROM p_expiry_date THEN
    v_changes := v_changes || jsonb_build_object('expiry_date', jsonb_build_object('old', v_old.expiry_date, 'new', p_expiry_date));
  END IF;

  UPDATE public.quotations
  SET client_id = p_client_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = v_currency,
      issue_date = p_issue_date,
      expiry_date = p_expiry_date,
      terms_and_conditions = NULLIF(p_terms_and_conditions, ''),
      notes = NULLIF(p_notes, ''),
      internal_notes = NULLIF(p_internal_notes, ''),
      updated_at = now()
  WHERE id = p_quotation_id;

  DELETE FROM public.line_items WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'quotation', p_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(p_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = p_quotation_id);
END;
$$;
