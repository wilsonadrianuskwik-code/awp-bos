-- Duplicate a purchase order, the counterpart of duplicate_invoice and
-- duplicate_quotation. The PO row-actions menu offered Copy Number but no
-- Duplicate, so re-ordering the same materials from the same supplier
-- meant retyping every line.
--
-- Same rules as the invoice version: the copy is always a fresh draft
-- dated today with its own number, carries the tax settings across so the
-- copy totals like the original, and records a duplicated_from
-- relationship in both directions. Status, receipts and any delivery
-- history are deliberately not copied -- this is a new order, not a
-- restatement of an old one.

CREATE OR REPLACE FUNCTION duplicate_purchase_order(
  p_po_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source       public.purchase_orders%ROWTYPE;
  v_new_id       UUID;
  v_number       TEXT;
  v_project_code TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this purchase order';
  END IF;

  SELECT * INTO v_source FROM public.purchase_orders
  WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'purchase_order', CURRENT_DATE, v_project_code, v_source.project_id, 'PO'
  );

  INSERT INTO public.purchase_orders (
    workspace_id, po_number, supplier_id, project_id, currency, issue_date, expected_date,
    reference, title, terms_and_conditions, notes, internal_notes, status, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_number, v_source.supplier_id, v_source.project_id, v_source.currency,
    CURRENT_DATE, v_source.expected_date,
    v_source.reference, v_source.title, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, 'draft', p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent,
    v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'purchase_order', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'purchase_order' AND entity_id = p_po_id;

  PERFORM public.recompute_purchase_order_totals(v_new_id);

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'purchase_order', v_new_id, 'purchase_order', p_po_id, 'duplicated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create',
          'Duplicated purchase order ' || v_source.po_number || ' to create ' || v_number,
          'purchase_order', v_new_id);

  RETURN (SELECT to_jsonb(p) FROM public.purchase_orders p WHERE p.id = v_new_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
