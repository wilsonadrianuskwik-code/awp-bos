-- Construction BOS Phase 2: seed the document type registry and
-- implement the generic generate_document() RPC (master plan §14).
INSERT INTO document_type_registry (key, label, category, table_name, items_entity_type, default_status_flow) VALUES
  ('quotation', 'Quotation', 'sales', 'quotations', 'quotation', '["draft","sent","viewed","approved","rejected","expired","cancelled","revision_requested"]'),
  ('proforma_invoice', 'Proforma Invoice', 'sales', 'proforma_invoices', 'proforma_invoice', '["draft","sent","accepted","expired","cancelled","converted"]'),
  ('invoice', 'Invoice', 'finance', 'invoices', 'invoice', '["draft","sent","partial","paid","overdue","cancelled","refunded"]'),
  ('purchase_order', 'Purchase Order', 'purchase', 'purchase_orders', 'purchase_order', '["draft","sent","acknowledged","partially_received","received","cancelled"]'),
  ('delivery_order', 'Delivery Order', 'inventory', 'delivery_orders', 'delivery_order', '["draft","prepared","dispatched","delivered","cancelled"]'),
  ('payment', 'Payment', 'finance', 'payments', NULL, '["recorded"]')
ON CONFLICT (key) DO NOTHING;

INSERT INTO document_generation_rules (from_type, to_type, field_mapping, copy_line_items) VALUES
  ('quotation', 'proforma_invoice', '{"client_id":"client_id","project_id":"project_id","currency":"currency","title":"title","notes":"notes"}', true),
  ('quotation', 'invoice', '{"client_id":"client_id","project_id":"project_id","currency":"currency","title":"title","notes":"notes"}', true),
  ('quotation', 'purchase_order', '{"project_id":"project_id","currency":"currency","title":"title","notes":"notes"}', true),
  ('proforma_invoice', 'invoice', '{"client_id":"client_id","project_id":"project_id","currency":"currency","title":"title","notes":"notes"}', true)
ON CONFLICT (from_type, to_type) DO NOTHING;

-- generate_document: the single engine behind every "Generate From..."
-- action. Uses dynamic SQL against document_type_registry.table_name —
-- safe because table_name is sourced from the trusted registry, never
-- from caller input (p_to_type is validated against the registry by the
-- FK-backed lookup below before it's used to build any identifier).
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
  v_source RECORD;
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
    v_input := v_input || jsonb_build_object(v_key, (to_jsonb(v_source)->>v_src_col));
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

-- Traceability chain reader — the Inspector panel's "Linked Documents".
CREATE OR REPLACE FUNCTION get_document_relationships(p_workspace_id UUID, p_document_type TEXT, p_document_id UUID)
RETURNS TABLE(direction TEXT, related_type TEXT, related_id UUID, relationship TEXT) LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT 'generated_to' AS direction, to_type AS related_type, to_id AS related_id, relationship
  FROM public.document_relationships
  WHERE workspace_id = p_workspace_id AND from_type = p_document_type AND from_id = p_document_id
  UNION ALL
  SELECT 'generated_from' AS direction, from_type AS related_type, from_id AS related_id, relationship
  FROM public.document_relationships
  WHERE workspace_id = p_workspace_id AND to_type = p_document_type AND to_id = p_document_id;
$$;
