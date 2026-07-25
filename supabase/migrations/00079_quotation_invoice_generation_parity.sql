-- Construction BOS: bring the legacy Quotation -> Invoice generation path
-- up to the same standard as every other document path.
--
-- generate_invoice_from_quotation (last redefined in 00044) predates both
-- the numbering engine and Projects. It inserts into public.invoices
-- directly instead of delegating to create_invoice, so migration 00078's
-- two guarantees never applied to it:
--
--   1. It still minted numbers with the legacy random-suffix
--      generate_invoice_number() instead of the approved standard
--      INV/AWP-<PROJECT_CODE>/<DDMMYYYY>-<SEQ>.
--   2. It never carried project_id across, so invoices created through
--      the Quotation detail page's "Generate Invoice" button — the most
--      commonly used path in the app — landed with a NULL project,
--      violating "every document must reference exactly one Project"
--      even though the manual create path enforces it.
--
-- Rather than duplicate create_invoice's logic here, this keeps the
-- function's quotation-specific behavior (status guard, one-invoice-per-
-- quotation guard, source_quotation_id + generated_invoice_id back-links,
-- the two paired activity entries) and inherits the project from the
-- source quotation, which 00078 already made mandatory on quotations.
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
  v_internal_id TEXT;
  v_due_date DATE;
  v_project_code TEXT;
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

  -- Inherited from the source quotation (required there since 00078).
  -- Quotations created before 00078 may still carry NULL — surface that
  -- as a clear, actionable message instead of silently producing a
  -- project-less invoice.
  IF v_quotation.project_id IS NULL THEN
    RAISE EXCEPTION 'This quotation has no project. Assign a project to the quotation before generating an invoice.';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_quotation.project_id;

  SELECT * INTO v_client FROM public.clients WHERE id = v_quotation.client_id;

  v_invoice_number := public.generate_document_number(
    p_workspace_id, 'invoice', p_invoice_date, v_project_code, v_quotation.project_id, 'INV'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM p_invoice_date)::INTEGER);
  v_due_date := COALESCE(p_due_date, p_invoice_date + (COALESCE(v_client.payment_terms, 30) || ' days')::INTERVAL);

  INSERT INTO public.invoices (
    workspace_id, client_id, project_id, invoice_number, internal_id, source_quotation_id, status,
    currency, issue_date, due_date, title, summary, notes, created_by
  )
  VALUES (
    p_workspace_id, v_quotation.client_id, v_quotation.project_id, v_invoice_number, v_internal_id, p_quotation_id, 'draft',
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

  -- Also record the edge in the generic traceability graph so this path
  -- shows up in get_document_relationships() alongside documents made
  -- through generate_document(), instead of only via the legacy
  -- source_quotation_id FK.
  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'invoice', v_invoice_id, 'quotation', p_quotation_id, 'generated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

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

-- duplicate_quotation / duplicate_invoice mint a new number for the copy.
-- Both still called the legacy formatters, so a duplicated document came
-- out in the old format while a freshly-created one used the approved
-- standard. Route both through the numbering engine, inheriting the
-- source document's project the same way the rest of 00078/00079 does.
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
  v_number TEXT;
  v_internal_id TEXT;
  v_project_code TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this quotation';
  END IF;

  SELECT * INTO v_source FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'quotation', CURRENT_DATE, v_project_code, v_source.project_id, 'QT'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, project_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_number, v_internal_id, 'draft', v_source.currency,
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

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'quotation', v_new_id, 'quotation', p_quotation_id, 'duplicated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated quotation ' || v_source.quotation_number || ' to create ' || v_number,
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
  v_number TEXT;
  v_internal_id TEXT;
  v_project_code TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this invoice';
  END IF;

  SELECT * INTO v_source FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'invoice', CURRENT_DATE, v_project_code, v_source.project_id, 'INV'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  INSERT INTO public.invoices (
    workspace_id, client_id, project_id, invoice_number, internal_id, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_number, v_internal_id, 'draft', v_source.currency,
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

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'invoice', v_new_id, 'invoice', p_invoice_id, 'duplicated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated invoice ' || v_source.invoice_number || ' to create ' || v_number,
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

-- create_quotation_version has the same two problems: legacy numbering and
-- a dropped project_id, so revising a quotation silently detached it from
-- its project and renumbered it in the old format.
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
  v_internal_id TEXT;
  v_project_code TEXT;
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

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_new_number := public.generate_document_number(
    p_workspace_id, 'quotation', CURRENT_DATE, v_project_code, v_source.project_id, 'QT'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, project_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, parent_quotation_id, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_new_number, v_internal_id, 'draft', v_source.currency,
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

-- A Purchase Order is issued to a supplier, but nothing in a Quotation
-- identifies which one — so document_generation_rules' quotation ->
-- purchase_order mapping legitimately cannot supply supplier_id, and the
-- caller must pass it through generate_document's p_overrides. Without a
-- guard, omitting it surfaced as a raw NOT NULL constraint violation.
-- Fail with an actionable message instead.
CREATE OR REPLACE FUNCTION create_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_supplier_id UUID;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_supplier_id := (p_input->>'supplier_id')::UUID;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Supplier is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier_id AND workspace_id = p_workspace_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Invalid supplier';
  END IF;

  v_project_id := (p_input->>'project_id')::UUID;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_project_id AND workspace_id = p_workspace_id;
  IF v_project_code IS NULL THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_number := public.generate_document_number(
    p_workspace_id, 'purchase_order', COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    v_project_code, v_project_id, 'PO'
  );

  INSERT INTO public.purchase_orders (
    workspace_id, po_number, supplier_id, project_id, currency, issue_date, expected_date,
    title, terms_and_conditions, notes, internal_notes, created_by
  ) VALUES (
    p_workspace_id, v_number, v_supplier_id, v_project_id,
    COALESCE(p_input->>'currency', 'USD'), COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'expected_date')::DATE, p_input->>'title', p_input->>'terms_and_conditions',
    p_input->>'notes', p_input->>'internal_notes', p_actor_id
  ) RETURNING * INTO v_po;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'line_items', '[]'::jsonb))
  LOOP
    INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
    VALUES (p_workspace_id, 'purchase_order', v_po.id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
      v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
      (v_item->>'catalog_item_id')::UUID);
    v_sort := v_sort + 1;
  END LOOP;

  PERFORM public.recompute_purchase_order_totals(v_po.id);
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po.id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created purchase order ' || v_po.po_number, 'purchase_order', v_po.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'purchase_order', v_po.id, to_jsonb(v_po));

  RETURN to_jsonb(v_po);
END;
$$;
