-- Construction BOS: document workflow fixes (approved standard).
--
-- Fixes four issues found in a live audit:
--
-- 1. generate_document() (00074) had a latent bug: it selected the
--    source document into a RECORD variable via `SELECT to_jsonb(t.*)
--    INTO v_source`, which wraps the row in an extra {"to_jsonb": {...}}
--    layer once re-serialized with `to_jsonb(v_source)`. Every mapped
--    field (client_id, project_id, currency, title, notes) therefore
--    always resolved to NULL, and generating an Invoice from a Proforma
--    Invoice failed on invoices.client_id's NOT NULL constraint — this
--    is the root cause of "cannot generate an Invoice after issuing a
--    Proforma Invoice." Declaring v_source as JSONB directly and reading
--    it without the redundant to_jsonb() wrap fixes every "Generate..."
--    pair uniformly (Quotation -> PI/Invoice/PO, PI -> Invoice), not
--    just the one that was reported.
--
-- 2. Document numbering standardized to
--    <TYPE>/AWP-<PROJECT_CODE>/<DDMMYYYY>-<SEQ>, sequence scoped per
--    project + document type (never resets), as the approved format.
--    Quotations and Invoices previously used two entirely different
--    legacy formatters (next_document_number, generate_invoice_number)
--    that never participated in the numbering engine at all — they now
--    both go through generate_document_number() like every other type.
--
-- 3. Project is now a required field (not optional) for Quotations,
--    Proforma Invoices, Purchase Orders, and Invoices — enforced in the
--    create_* RPCs, which is what every "documents must be creatable
--    standalone" caller ultimately goes through regardless of UI.
--    Delivery Orders continue to inherit project_id from their required
--    Invoice, so they're covered transitively; a defensive check is
--    added so that chain can never silently produce a NULL project.

-- 1. generate_document(): fix the RECORD/JSONB double-wrap bug.
CREATE OR REPLACE FUNCTION generate_document(
  p_workspace_id UUID, p_actor_id UUID,
  p_from_type TEXT, p_from_id UUID, p_to_type TEXT,
  p_overrides JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_rule public.document_generation_rules%ROWTYPE;
  v_from_type public.document_type_registry%ROWTYPE;
  v_to_type public.document_type_registry%ROWTYPE;
  v_source JSONB;
  v_input JSONB := '{}'::jsonb;
  v_key TEXT; v_src_col TEXT;
  v_new_id UUID;
  v_result JSONB;
  v_create_fn TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_from_type FROM public.document_type_registry WHERE key = p_from_type AND is_active;
  SELECT * INTO v_to_type FROM public.document_type_registry WHERE key = p_to_type AND is_active;
  IF v_from_type.key IS NULL OR v_to_type.key IS NULL THEN
    RAISE EXCEPTION 'Unknown document type';
  END IF;

  SELECT * INTO v_rule FROM public.document_generation_rules WHERE from_type = p_from_type AND to_type = p_to_type AND is_active;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'No generation rule from % to %', p_from_type, p_to_type;
  END IF;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', v_from_type.table_name)
    INTO v_source USING p_from_id;
  IF v_source IS NULL THEN RAISE EXCEPTION 'Source document not found'; END IF;

  -- Build the target's create-input JSONB from the field mapping.
  FOR v_key, v_src_col IN SELECT * FROM jsonb_each_text(v_rule.field_mapping)
  LOOP
    v_input := v_input || jsonb_build_object(v_key, (v_source->>v_src_col));
  END LOOP;
  v_input := v_input || p_overrides;

  -- Carry line items forward if the rule says to, and both types have items.
  IF v_rule.copy_line_items AND v_from_type.items_entity_type IS NOT NULL AND v_to_type.items_entity_type IS NOT NULL THEN
    v_input := v_input || jsonb_build_object('line_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category', li.category, 'description', li.description, 'quantity', li.quantity,
        'unit_price', li.unit_price, 'unit', li.unit, 'discount_percent', li.discount_percent,
        'tax_percent', li.tax_percent, 'catalog_item_id', li.catalog_item_id
      ) ORDER BY li.sort_order), '[]'::jsonb)
      FROM public.line_items li WHERE li.entity_type = v_from_type.items_entity_type AND li.entity_id = p_from_id
    ));
  END IF;

  -- Dispatch to the target type's existing typed create_* RPC — reuses
  -- all existing validation/numbering/totals logic rather than
  -- duplicating insert statements here.
  v_create_fn := 'create_' || p_to_type;
  EXECUTE format('SELECT public.%I($1, $2, $3)', v_create_fn)
    INTO v_result USING p_workspace_id, p_actor_id, v_input;

  v_new_id := (v_result->>'id')::UUID;

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, p_to_type, v_new_id, p_from_type, p_from_id, 'generated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id, secondary_entity_type, secondary_entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Generated ' || v_to_type.label || ' from ' || v_from_type.label, p_to_type, v_new_id, p_from_type, p_from_id);

  RETURN v_result;
END;
$$;

-- 2. Approved numbering standard as the built-in default (still
-- overridable per-workspace via document_number_templates/Settings):
-- <PREFIX>/AWP-<PROJECT_CODE>/<DDMMYYYY>-<SEQ:3>, counter scoped to
-- (workspace, document_type, project) and never reset.
CREATE OR REPLACE FUNCTION generate_document_number(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_date DATE,
  p_project_code TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_default_prefix TEXT DEFAULT ''
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template      public.document_number_templates%ROWTYPE;
  v_template_str  TEXT;
  v_cadence       TEXT;
  v_scope         TEXT;
  v_scope_key     TEXT;
  v_result        TEXT;
  v_seq_width     INT;
  v_random_width  INT;
  v_number        INTEGER;
  v_attempt       INTEGER := 0;
  v_alphabet      CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_random_part   TEXT;
BEGIN
  SELECT * INTO v_template
  FROM public.document_number_templates
  WHERE workspace_id = p_workspace_id AND document_type = p_document_type AND is_active
  LIMIT 1;

  IF v_template.template IS NULL THEN
    -- Approved standard: <PREFIX>/AWP-<PROJECT_CODE>/<DDMMYYYY>-<SEQ>,
    -- sequence per project + document type, never reset.
    v_template_str := '{PREFIX}/AWP-{PROJECT_CODE}/{DD}{MM}{YYYY}-{SEQ:3}';
    v_cadence := 'never';
    v_scope := 'project';
  ELSE
    v_template_str := v_template.template;
    v_cadence := v_template.reset_cadence;
    v_scope := v_template.sequence_scope;
  END IF;

  v_scope_key := CASE v_cadence
    WHEN 'never' THEN 'ALL'
    WHEN 'yearly' THEN TO_CHAR(p_date, 'YYYY')
    WHEN 'monthly' THEN TO_CHAR(p_date, 'YYYYMM')
    ELSE TO_CHAR(p_date, 'YYYYMMDD')
  END;
  IF v_scope = 'project' AND p_project_id IS NOT NULL THEN
    v_scope_key := p_project_id::TEXT || ':' || v_scope_key;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_result := v_template_str;
    v_result := REPLACE(v_result, '{PREFIX}', COALESCE(p_default_prefix, ''));
    v_result := REPLACE(v_result, '{PROJECT_CODE}', COALESCE(p_project_code, ''));
    v_result := REPLACE(v_result, '{YYYY}', TO_CHAR(p_date, 'YYYY'));
    v_result := REPLACE(v_result, '{YY}', TO_CHAR(p_date, 'YY'));
    v_result := REPLACE(v_result, '{MM}', TO_CHAR(p_date, 'MM'));
    v_result := REPLACE(v_result, '{DD}', TO_CHAR(p_date, 'DD'));

    -- {SEQ:n}
    IF v_result ~ '\{SEQ:\d+\}' THEN
      v_seq_width := (regexp_match(v_result, '\{SEQ:(\d+)\}'))[1]::INT;

      INSERT INTO public.document_number_counters (workspace_id, document_type, scope_key, current_number)
      VALUES (p_workspace_id, p_document_type, v_scope_key, 1)
      ON CONFLICT (workspace_id, document_type, scope_key)
      DO UPDATE SET current_number = public.document_number_counters.current_number + 1
      RETURNING current_number INTO v_number;

      v_result := regexp_replace(v_result, '\{SEQ:\d+\}', LPAD(v_number::TEXT, v_seq_width, '0'));
    END IF;

    -- {RANDOM:n}
    IF v_result ~ '\{RANDOM:\d+\}' THEN
      v_random_width := (regexp_match(v_result, '\{RANDOM:(\d+)\}'))[1]::INT;
      SELECT string_agg(substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::INT, 1), '')
        INTO v_random_part
        FROM generate_series(1, v_random_width);
      v_result := regexp_replace(v_result, '\{RANDOM:\d+\}', v_random_part);
    END IF;

    EXIT WHEN NOT (v_result ~ '\{RANDOM:');
    EXIT WHEN v_attempt > 25;
  END LOOP;

  RETURN v_result;
END;
$$;

-- 3. Quotations: project required, numbering switched to the engine.
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
  p_line_items JSONB,
  p_project_id UUID DEFAULT NULL
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
  v_project_code TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a quotation';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = p_project_id AND workspace_id = p_workspace_id;
  IF v_project_code IS NULL THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_quotation_number := public.generate_document_number(p_workspace_id, 'quotation', p_issue_date, v_project_code, p_project_id, 'QT');
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions, notes, internal_notes,
    created_by, project_id
  )
  VALUES (
    p_workspace_id, p_client_id, v_quotation_number, v_internal_id, 'draft', v_currency,
    p_issue_date, p_expiry_date, NULLIF(p_title, ''), NULLIF(p_summary, ''),
    NULLIF(p_terms_and_conditions, ''), NULLIF(p_notes, ''), NULLIF(p_internal_notes, ''), p_actor_id,
    p_project_id
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

  IF v_old.status NOT IN ('draft', 'revision_requested') THEN
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

-- 4. Invoices: project required, numbering switched from
-- generate_invoice_number (random suffix, workspace-global) to the
-- shared engine.
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
  p_line_items JSONB,
  p_project_id UUID DEFAULT NULL
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
  v_project_code TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create an invoice';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = p_project_id AND workspace_id = p_workspace_id;
  IF v_project_code IS NULL THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_invoice_number := public.generate_document_number(p_workspace_id, 'invoice', p_issue_date, v_project_code, p_project_id, 'INV');
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, internal_id, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by, project_id
  )
  VALUES (
    p_workspace_id, p_client_id, v_invoice_number, v_internal_id, 'draft', v_currency,
    p_issue_date, p_due_date, NULLIF(p_title, ''), NULLIF(p_summary, ''),
    NULLIF(p_payment_terms, ''), NULLIF(p_notes, ''), p_actor_id, p_project_id
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

  IF v_old.status != 'draft' THEN
    RAISE EXCEPTION 'Invoice in status % cannot be edited', v_old.status;
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

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated invoice ' || v_old.invoice_number, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$$;

-- 5. The JSONB-input overloads (00075) that generate_document() dispatches
-- to now pass project_id as a real argument instead of a post-insert
-- UPDATE, and inherit the "project is required" behavior for free.
CREATE OR REPLACE FUNCTION create_quotation(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN public.create_quotation(
    p_workspace_id, p_actor_id, (p_input->>'client_id')::UUID,
    p_input->>'title', p_input->>'summary', p_input->>'currency',
    COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'expiry_date')::DATE, p_input->>'terms_and_conditions', p_input->>'notes',
    p_input->>'internal_notes',
    COALESCE(p_input->'line_items', '[]'::jsonb),
    (p_input->>'project_id')::UUID
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_invoice(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN public.create_invoice(
    p_workspace_id, p_actor_id, (p_input->>'client_id')::UUID,
    p_input->>'title', p_input->>'summary', p_input->>'currency',
    COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'due_date')::DATE, p_input->>'payment_terms', p_input->>'notes',
    COALESCE(p_input->'line_items', '[]'::jsonb),
    (p_input->>'project_id')::UUID
  );
END;
$$;

-- 6. Purchase Orders and Proforma Invoices: project was previously
-- optional (documents linked it only if the builder happened to set
-- one) — now required, same as every other operational document.
CREATE OR REPLACE FUNCTION create_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
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
    p_workspace_id, v_number, (p_input->>'supplier_id')::UUID, v_project_id,
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

CREATE OR REPLACE FUNCTION create_proforma_invoice(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pi public.proforma_invoices%ROWTYPE;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
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
    p_workspace_id, 'proforma_invoice', COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    v_project_code, v_project_id, 'PI'
  );

  INSERT INTO public.proforma_invoices (
    workspace_id, pi_number, client_id, project_id, currency, issue_date, expiry_date, title, notes, terms_and_conditions, created_by
  ) VALUES (
    p_workspace_id, v_number, (p_input->>'client_id')::UUID, v_project_id,
    COALESCE(p_input->>'currency', 'USD'), COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'expiry_date')::DATE, p_input->>'title', p_input->>'notes', p_input->>'terms_and_conditions', p_actor_id
  ) RETURNING * INTO v_pi;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'line_items', '[]'::jsonb))
  LOOP
    INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
    VALUES (p_workspace_id, 'proforma_invoice', v_pi.id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
      v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
      (v_item->>'catalog_item_id')::UUID);
    v_sort := v_sort + 1;
  END LOOP;

  PERFORM public.recompute_proforma_invoice_totals(v_pi.id);
  SELECT * INTO v_pi FROM public.proforma_invoices WHERE id = v_pi.id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created proforma invoice ' || v_pi.pi_number, 'proforma_invoice', v_pi.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'proforma_invoice', v_pi.id, to_jsonb(v_pi));

  RETURN to_jsonb(v_pi);
END;
$$;

-- 7. Delivery Orders: defensive guard now that the project always
-- traces back through a required Invoice.
CREATE OR REPLACE FUNCTION create_delivery_order(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_do public.delivery_orders%ROWTYPE;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = (p_input->>'invoice_id')::UUID AND workspace_id = p_workspace_id;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  v_project_id := COALESCE((p_input->>'project_id')::UUID, v_invoice.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'delivery_order', CURRENT_DATE,
    v_project_code, v_project_id, 'DO'
  );

  INSERT INTO public.delivery_orders (workspace_id, do_number, invoice_id, project_id, client_id, delivery_date, delivery_address, notes, created_by)
  VALUES (p_workspace_id, v_number, v_invoice.id, v_project_id,
    v_invoice.client_id, (p_input->>'delivery_date')::DATE, p_input->'delivery_address', p_input->>'notes', p_actor_id)
  RETURNING * INTO v_do;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'line_items', '[]'::jsonb))
  LOOP
    INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit)
    VALUES (p_workspace_id, 'delivery_order', v_do.id, 'per_unit', v_sort,
      v_item->>'description', (v_item->>'quantity')::NUMERIC, 0, v_item->>'unit');
    v_sort := v_sort + 1;
  END LOOP;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created delivery order ' || v_do.do_number, 'delivery_order', v_do.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'delivery_order', v_do.id, to_jsonb(v_do));

  RETURN to_jsonb(v_do);
END;
$$;
