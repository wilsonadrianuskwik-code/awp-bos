-- Construction BOS: let an issued invoice be revised.
--
-- update_invoice only accepted drafts, but a client asking for a revision
-- after the invoice has been sent is ordinary business — and the only way
-- to serve it was to cancel and re-issue under a new number, which breaks
-- the reference the client is already holding.
--
-- The gate moves from "is it a draft" to "has money moved against it".
-- Editing an invoice that has payments recorded would silently rewrite
-- total and therefore amount_due underneath a settled balance, so those
-- stay locked; so do cancelled and refunded invoices, which are closed
-- records rather than works in progress.
--
--   draft, sent, viewed, overdue   -> editable (no payments recorded)
--   partial, paid                  -> locked (amount_paid > 0)
--   cancelled, refunded            -> locked (terminal)
--
-- amount_paid is checked directly rather than trusting status alone: it
-- is the actual money-has-moved signal, and a status can lag behind it.
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
  p_line_items JSONB,
  p_project_id UUID DEFAULT NULL
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
  v_project_id UUID;
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

  IF v_old.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Invoice in status % cannot be edited', v_old.status;
  END IF;

  IF COALESCE(v_old.amount_paid, 0) > 0 THEN
    RAISE EXCEPTION
      'This invoice has payments recorded against it and cannot be edited. Void the payment first, or issue a credit note.';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_project_id := COALESCE(p_project_id, v_old.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
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
      project_id = v_project_id,
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

  -- Revising an issued invoice is a materially different event from
  -- tweaking a draft, and the client is holding the earlier version — so
  -- it gets its own activity wording rather than a generic "updated".
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    CASE
      WHEN v_old.status = 'draft'
        THEN 'updated invoice ' || v_old.invoice_number
      ELSE 'revised issued invoice ' || v_old.invoice_number
           || ' (status ' || v_old.status || ')'
    END,
    'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$$;

-- Tax settings follow the same rule, for the same reason: they change the
-- total. 00082 gated them on nothing at all beyond role, so this is the
-- first time they're protected against editing a settled invoice.
CREATE OR REPLACE FUNCTION set_document_tax_settings(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_document_type TEXT,
  p_document_id UUID,
  p_input JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_table TEXT;
  v_result JSONB;
  v_amount_paid NUMERIC;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table := CASE p_document_type
    WHEN 'invoice' THEN 'invoices'
    WHEN 'proforma_invoice' THEN 'proforma_invoices'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Tax settings do not apply to %', p_document_type;
  END IF;

  IF p_document_type = 'invoice' THEN
    SELECT COALESCE(amount_paid, 0) INTO v_amount_paid
    FROM public.invoices WHERE id = p_document_id AND workspace_id = p_workspace_id;
    IF COALESCE(v_amount_paid, 0) > 0 THEN
      RAISE EXCEPTION
        'This invoice has payments recorded against it; its tax settings cannot be changed.';
    END IF;
  END IF;

  IF COALESCE((p_input->>'dpp_denominator')::INTEGER, 12) <= 0 THEN
    RAISE EXCEPTION 'DPP denominator must be greater than 0';
  END IF;

  EXECUTE format($f$
    UPDATE public.%I SET
      dpp_numerator   = COALESCE(($2->>'dpp_numerator')::INTEGER, dpp_numerator),
      dpp_denominator = COALESCE(($2->>'dpp_denominator')::INTEGER, dpp_denominator),
      ppn_percent     = COALESCE(($2->>'ppn_percent')::NUMERIC, ppn_percent),
      pph_percent     = CASE WHEN $2 ? 'pph_percent'     THEN ($2->>'pph_percent')::NUMERIC     ELSE pph_percent END,
      retensi_percent = CASE WHEN $2 ? 'retensi_percent' THEN ($2->>'retensi_percent')::NUMERIC ELSE retensi_percent END,
      show_dpp        = COALESCE(($2->>'show_dpp')::BOOLEAN, show_dpp),
      updated_at = now()
    WHERE id = $1 AND workspace_id = $3 AND deleted_at IS NULL
  $f$, v_table) USING p_document_id, p_input, p_workspace_id;

  IF p_document_type = 'invoice' THEN
    PERFORM public.recompute_invoice_totals(p_document_id);
  ELSE
    PERFORM public.recompute_proforma_invoice_totals(p_document_id);
  END IF;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', v_table)
    INTO v_result USING p_document_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated tax settings', p_document_type, p_document_id);

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------
-- The same rule for the other document types that can be revised.
--
-- Each was locked to 'draft'. The gate becomes "has this document
-- already had a real-world consequence", which is what actually makes an
-- edit unsafe — not whether it has been sent:
--
--   Quotation  editable until rejected / expired / cancelled.
--   Proforma   editable until cancelled / expired / converted. Once it
--              has become an Invoice, that Invoice is the live document.
--   Purchase   editable until goods start arriving (partially_received /
--     Order    received) or it is cancelled — editing quantities after a
--              receipt would contradict what was physically delivered.
--
-- Delivery Orders are deliberately absent: they have no content-edit RPC
-- at all (status transitions only), and marking one delivered posts
-- fulfillment events, so their lines must not move afterwards.
-- ---------------------------------------------------------------------

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
  p_line_items JSONB,
  p_project_id UUID DEFAULT NULL
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
  v_project_id UUID;
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

  IF v_old.status IN ('rejected', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Quotation in status % cannot be edited', v_old.status;
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_project_id := COALESCE(p_project_id, v_old.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.project_id IS DISTINCT FROM v_project_id THEN
    v_changes := v_changes || jsonb_build_object('project_id', jsonb_build_object('old', v_old.project_id, 'new', v_project_id));
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
      project_id = v_project_id,
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

CREATE OR REPLACE FUNCTION update_proforma_invoice(p_workspace_id UUID, p_actor_id UUID, p_pi_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pi public.proforma_invoices%ROWTYPE; v_item JSONB; v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO v_pi FROM public.proforma_invoices WHERE id = p_pi_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_pi.id IS NULL THEN RAISE EXCEPTION 'Proforma invoice not found'; END IF;
  IF v_pi.status IN ('cancelled', 'expired', 'converted') THEN
    RAISE EXCEPTION 'Proforma invoice in status % cannot be edited', v_pi.status;
  END IF;

  UPDATE public.proforma_invoices SET
    client_id = COALESCE((p_input->>'client_id')::UUID, client_id),
    project_id = COALESCE((p_input->>'project_id')::UUID, project_id),
    currency = COALESCE(p_input->>'currency', currency),
    issue_date = COALESCE((p_input->>'issue_date')::DATE, issue_date),
    expiry_date = COALESCE((p_input->>'expiry_date')::DATE, expiry_date),
    title = COALESCE(p_input->>'title', title),
    notes = COALESCE(p_input->>'notes', notes),
    terms_and_conditions = COALESCE(p_input->>'terms_and_conditions', terms_and_conditions),
    updated_at = now()
  WHERE id = p_pi_id;

  IF p_input ? 'line_items' THEN
    DELETE FROM public.line_items WHERE entity_type = 'proforma_invoice' AND entity_id = p_pi_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'line_items')
    LOOP
      INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
      VALUES (p_workspace_id, 'proforma_invoice', p_pi_id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
        v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
        COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
        (v_item->>'catalog_item_id')::UUID);
      v_sort := v_sort + 1;
    END LOOP;
    PERFORM public.recompute_proforma_invoice_totals(p_pi_id);
  END IF;

  SELECT * INTO v_pi FROM public.proforma_invoices WHERE id = p_pi_id;
  RETURN to_jsonb(v_pi);
END;
$$;

CREATE OR REPLACE FUNCTION update_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_po_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE; v_item JSONB; v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status IN ('cancelled', 'partially_received', 'received') THEN
    RAISE EXCEPTION 'Purchase order in status % cannot be edited', v_po.status;
  END IF;

  UPDATE public.purchase_orders SET
    supplier_id = COALESCE((p_input->>'supplier_id')::UUID, supplier_id),
    project_id = COALESCE((p_input->>'project_id')::UUID, project_id),
    currency = COALESCE(p_input->>'currency', currency),
    issue_date = COALESCE((p_input->>'issue_date')::DATE, issue_date),
    expected_date = COALESCE((p_input->>'expected_date')::DATE, expected_date),
    title = COALESCE(p_input->>'title', title),
    terms_and_conditions = COALESCE(p_input->>'terms_and_conditions', terms_and_conditions),
    notes = COALESCE(p_input->>'notes', notes),
    internal_notes = COALESCE(p_input->>'internal_notes', internal_notes),
    updated_at = now()
  WHERE id = p_po_id;

  IF p_input ? 'line_items' THEN
    DELETE FROM public.line_items WHERE entity_type = 'purchase_order' AND entity_id = p_po_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'line_items')
    LOOP
      INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
      VALUES (p_workspace_id, 'purchase_order', p_po_id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
        v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
        COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
        (v_item->>'catalog_item_id')::UUID);
      v_sort := v_sort + 1;
    END LOOP;
    PERFORM public.recompute_purchase_order_totals(p_po_id);
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated purchase order ' || v_po.po_number, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$$;
