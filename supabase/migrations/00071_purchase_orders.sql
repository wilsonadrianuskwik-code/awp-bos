-- Construction BOS Phase 1: Purchase Orders — the flagship new document
-- type demonstrating the Document Engine (00066). Line items reuse the
-- existing polymorphic line_items table rather than a new physical
-- table, so computeLineItemTotals()/the line-items editor UI/the totals
-- recompute pattern all carry over unchanged.
ALTER TABLE line_items DROP CONSTRAINT IF EXISTS line_items_entity_type_check;
ALTER TABLE line_items ADD CONSTRAINT line_items_entity_type_check
  CHECK (entity_type IN ('quotation', 'invoice', 'purchase_order', 'delivery_order', 'proforma_invoice'));

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  po_number         TEXT NOT NULL,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged', 'partially_received', 'received', 'cancelled')),
  subtotal          NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total             NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date     DATE,
  title             TEXT,
  terms_and_conditions TEXT,
  notes             TEXT,
  internal_notes    TEXT,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(workspace_id, po_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_workspace ON purchase_orders(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON purchase_orders(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id) WHERE deleted_at IS NULL;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view purchase orders" ON purchase_orders;
CREATE POLICY "Members can view purchase orders"
  ON purchase_orders FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);
DROP POLICY IF EXISTS "Staff can create purchase orders" ON purchase_orders;
CREATE POLICY "Staff can create purchase orders"
  ON purchase_orders FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));
DROP POLICY IF EXISTS "Staff can update purchase orders" ON purchase_orders;
CREATE POLICY "Staff can update purchase orders"
  ON purchase_orders FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE OR REPLACE FUNCTION recompute_purchase_order_totals(p_po_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_subtotal NUMERIC; v_tax NUMERIC; v_discount NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * discount_percent / 100), 0),
    COALESCE(SUM((quantity * unit_price * (1 - discount_percent / 100)) * tax_percent / 100), 0)
  INTO v_subtotal, v_discount, v_tax
  FROM public.line_items WHERE entity_type = 'purchase_order' AND entity_id = p_po_id;

  UPDATE public.purchase_orders SET
    subtotal = v_subtotal, discount_amount = v_discount, tax_amount = v_tax,
    total = v_subtotal - v_discount + v_tax, updated_at = now()
  WHERE id = p_po_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_input->>'project_id' IS NOT NULL THEN
    SELECT code INTO v_project_code FROM public.projects WHERE id = (p_input->>'project_id')::UUID;
  END IF;

  v_number := public.generate_document_number(
    p_workspace_id, 'purchase_order', COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    v_project_code, (p_input->>'project_id')::UUID, 'PO'
  );

  INSERT INTO public.purchase_orders (
    workspace_id, po_number, supplier_id, project_id, currency, issue_date, expected_date,
    title, terms_and_conditions, notes, internal_notes, created_by
  ) VALUES (
    p_workspace_id, v_number, (p_input->>'supplier_id')::UUID, (p_input->>'project_id')::UUID,
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

CREATE OR REPLACE FUNCTION update_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_po_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE; v_item JSONB; v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status != 'draft' THEN RAISE EXCEPTION 'Only draft purchase orders can be edited'; END IF;

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

CREATE OR REPLACE FUNCTION update_purchase_order_status(p_workspace_id UUID, p_actor_id UUID, p_po_id UUID, p_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.purchase_orders SET status = p_status, updated_at = now()
  WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  RETURNING * INTO v_po;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Purchase order ' || v_po.po_number || ' marked ' || p_status, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$$;

CREATE OR REPLACE FUNCTION delete_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_po_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.purchase_orders SET deleted_at = now() WHERE id = p_po_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_po;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted purchase order ' || v_po.po_number, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$$;
