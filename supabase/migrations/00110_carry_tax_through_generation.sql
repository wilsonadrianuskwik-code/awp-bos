-- Carries the tax configuration through every document-generation path.
--
-- THE BUG
-- generate_invoice_from_quotation, duplicate_invoice, duplicate_quotation
-- and create_quotation_version all INSERT with an explicit column list
-- that omits dpp_numerator/dpp_denominator/ppn_percent/pph_percent/
-- retensi_percent/show_dpp. Until 00088 that was harmless -- ppn_percent
-- was NOT NULL DEFAULT 12, so the new row inherited the standard rate by
-- accident. 00088 made PPN optional and dropped both the NOT NULL and the
-- DEFAULT, at which point these paths started producing ppn_percent NULL,
-- and recompute_*_totals reads COALESCE(ppn_percent, 0).
--
-- Net effect, reproduced: an approved quotation for Rp 109,000,000
-- (100,000,000 + 11,000,000 PPN - 2,000,000 PPH) generates an invoice
-- totalling Rp 100,000,000, with no PPN row on the faktur. The client is
-- under-billed by the entire tax, and nothing in the app corrects it --
-- tax settings are only ever written by a separate, explicit call the
-- generation path never makes.
--
-- THE FIX
-- Each of the four INSERTs now carries the six tax columns from its
-- source row. The function bodies are otherwise byte-for-byte what 00079
-- defined -- only the column list and VALUES list changed -- so the
-- permission checks, status guards, one-invoice-per-quotation rule,
-- numbering and traceability edges are all untouched.
--
-- generate_document (the generic engine path) is handled separately
-- below: it does not INSERT directly, it dispatches to create_invoice /
-- create_quotation etc., whose signatures carry no tax settings. So the
-- settings are copied onto the new row after it is created.
--
-- No data is repaired here. Invoices already generated with the tax
-- dropped are a judgement call -- an issued one may have been sent to the
-- client at the wrong figure -- so they are reported, not silently
-- rewritten. See the SELECT at the bottom of this file.

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
    currency, issue_date, due_date, title, summary, notes, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_quotation.client_id, v_quotation.project_id, v_invoice_number, v_internal_id, p_quotation_id, 'draft',
    v_quotation.currency, p_invoice_date, v_due_date, v_quotation.title, v_quotation.summary,
    CASE WHEN p_copy_notes THEN v_quotation.notes ELSE NULL END, p_actor_id,
    v_quotation.dpp_numerator, v_quotation.dpp_denominator, v_quotation.ppn_percent, v_quotation.pph_percent, v_quotation.retensi_percent, v_quotation.show_dpp)
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
    notes, internal_notes, version, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_number, v_internal_id, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, 1, p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent, v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
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
    issue_date, due_date, title, summary, payment_terms, notes, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_number, v_internal_id, 'draft', v_source.currency,
    CURRENT_DATE, v_source.due_date, v_source.title, v_source.summary,
    v_source.payment_terms, v_source.notes, p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent, v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
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
    notes, internal_notes, version, parent_quotation_id, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_new_number, v_internal_id, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, v_next_version, v_root_id, p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent, v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
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


-- ---------------------------------------------------------------------
-- The generic engine path.
-- ---------------------------------------------------------------------
--
-- generate_document does not INSERT directly -- it dispatches to
-- create_<type>(workspace, actor, jsonb), and those signatures carry no
-- tax settings. So rather than widen four create_* functions, the tax
-- columns are copied onto the new row immediately afterwards and the
-- totals recomputed.
--
-- The source read is also scoped: it had no workspace or deleted_at
-- predicate, and from_type/from_id reach it straight from the browser.
-- Everything else is exactly as 00081 defined it.
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

  -- Scoped to the caller's own workspace and to live rows. Without both
  -- predicates this reads any row in the table by id -- and from_type /
  -- from_id come straight from the browser, so another workspace's title,
  -- notes and every line item could be copied across.
  EXECUTE format(
    'SELECT to_jsonb(t.*) FROM public.%I t
      WHERE t.id = $1 AND t.workspace_id = $2 AND t.deleted_at IS NULL',
    v_from_type.table_name)
    INTO v_source USING p_from_id, p_workspace_id;
  IF v_source IS NULL THEN RAISE EXCEPTION 'Source document not found'; END IF;

  FOR v_key, v_src_col IN SELECT * FROM jsonb_each_text(v_rule.field_mapping)
  LOOP
    v_input := v_input || jsonb_build_object(v_key, (v_source->>v_src_col));
  END LOOP;
  v_input := v_input || p_overrides;

  IF v_rule.copy_line_items AND v_from_type.items_entity_type IS NOT NULL AND v_to_type.items_entity_type IS NOT NULL THEN
    v_input := v_input || jsonb_build_object('line_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category', li.category, 'description', li.description, 'quantity', li.quantity,
        'unit_price', li.unit_price, 'unit', li.unit, 'discount_percent', li.discount_percent,
        'tax_percent', li.tax_percent, 'catalog_item_id', li.catalog_item_id,
        'source_line_item_id', li.id
      ) ORDER BY li.sort_order), '[]'::jsonb)
      FROM public.line_items li WHERE li.entity_type = v_from_type.items_entity_type AND li.entity_id = p_from_id
    ));
  END IF;

  v_create_fn := 'create_' || p_to_type;
  EXECUTE format('SELECT public.%I($1, $2, $3)', v_create_fn)
    INTO v_result USING p_workspace_id, p_actor_id, v_input;

  v_new_id := (v_result->>'id')::UUID;

  -- Carry the tax configuration across. create_* takes no tax settings,
  -- so without this the new document is born on the column defaults --
  -- which since 00088 means ppn_percent NULL, i.e. no PPN at all.
  -- Guarded on the source actually carrying tax: a Delivery Order has no
  -- money on it and its table has no such columns.
  IF v_source ? 'ppn_percent' AND v_to_type.items_entity_type IS NOT NULL THEN
    BEGIN
      EXECUTE format(
        'UPDATE public.%I
            SET dpp_numerator   = COALESCE($1, dpp_numerator),
                dpp_denominator = COALESCE($2, dpp_denominator),
                ppn_percent     = $3,
                pph_percent     = $4,
                retensi_percent = $5,
                show_dpp        = COALESCE($6, show_dpp),
                updated_at      = now()
          WHERE id = $7 AND workspace_id = $8', v_to_type.table_name)
        USING (v_source->>'dpp_numerator')::INTEGER,
              (v_source->>'dpp_denominator')::INTEGER,
              (v_source->>'ppn_percent')::NUMERIC,
              (v_source->>'pph_percent')::NUMERIC,
              (v_source->>'retensi_percent')::NUMERIC,
              (v_source->>'show_dpp')::BOOLEAN,
              v_new_id, p_workspace_id;

      EXECUTE format('SELECT public.recompute_%s_totals($1)',
                     CASE p_to_type WHEN 'proforma_invoice' THEN 'proforma_invoice'
                                    ELSE p_to_type END)
        USING v_new_id;
    EXCEPTION WHEN undefined_column OR undefined_function THEN
      -- Target type carries no tax columns; nothing to copy.
      NULL;
    END;
  END IF;

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, p_to_type, v_new_id, p_from_type, p_from_id, 'generated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id, secondary_entity_type, secondary_entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Generated ' || v_to_type.label || ' from ' || v_from_type.label, p_to_type, v_new_id, p_from_type, p_from_id);

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Reporting query -- run by hand, changes nothing.
-- ---------------------------------------------------------------------
-- Invoices generated from a quotation whose tax configuration does not
-- match their source. Anything listed was billed without the PPN the
-- client approved. Deliberately a report and not an UPDATE: an issued
-- invoice may already be in the client's hands at the wrong figure, and
-- correcting that is a business decision, not a migration's.
--
--   SELECT i.invoice_number, i.status, i.total AS invoice_total,
--          q.quotation_number, q.total AS quotation_total,
--          q.total - i.total AS shortfall
--     FROM public.invoices i
--     JOIN public.quotations q ON q.id = i.source_quotation_id
--    WHERE i.deleted_at IS NULL
--      AND i.ppn_percent IS DISTINCT FROM q.ppn_percent
--    ORDER BY shortfall DESC;
