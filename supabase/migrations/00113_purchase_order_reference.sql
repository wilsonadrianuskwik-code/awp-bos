-- A free-text reference on the purchase order: the invoice number, the
-- customer's project reference, whatever the supplier needs to see so
-- they can tie our order back to the job it belongs to.
--
-- Deliberately TEXT and unvalidated. It routinely holds something that
-- is not one of our own document numbers (a client's project code, a
-- tender number), so an FK to invoices would be wrong.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS reference TEXT;

COMMENT ON COLUMN public.purchase_orders.reference IS
  'Free-text reference printed on the PO — invoice number, project reference, or similar. Not a foreign key.';

-- create_purchase_order: 00079's definition plus reference. Everything
-- else is unchanged.
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
    reference, title, terms_and_conditions, notes, internal_notes, created_by
  ) VALUES (
    p_workspace_id, v_number, v_supplier_id, v_project_id,
    COALESCE(p_input->>'currency', 'IDR'), COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'expected_date')::DATE, NULLIF(TRIM(COALESCE(p_input->>'reference', '')), ''),
    p_input->>'title', p_input->>'terms_and_conditions',
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

-- update_purchase_order: 00087's definition plus reference. Note the
-- key-presence test rather than COALESCE — every other field here can't
-- be cleared once set, which is a pre-existing wart, but a reference
-- typed by mistake has to be removable.
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
    reference = CASE WHEN p_input ? 'reference'
                     THEN NULLIF(TRIM(COALESCE(p_input->>'reference', '')), '')
                     ELSE reference END,
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

NOTIFY pgrst, 'reload schema';
