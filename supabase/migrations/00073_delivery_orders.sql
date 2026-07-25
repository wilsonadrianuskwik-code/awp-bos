-- Construction BOS Phase 1: Delivery Orders replace the agency-specific
-- Fulfillment module. One Invoice may have MANY delivery orders
-- (explicit requirement); fulfillment is tracked primarily from the
-- Invoice, not from an independent project satellite.
--
-- fulfillment_projects/fulfillment_deliverables are retired outright:
-- fulfillment_projects was already stripped of name/status in 00065
-- specifically because it was redundant scaffolding over a 1:1 invoice
-- relationship (see that migration's own comment) — promoting it further
-- would reverse that reasoning. fulfillment_deliverables (a scheduled
-- social-post calendar) has no construction analog. fulfillment_items/
-- fulfillment_events are left in place (harmless, unreferenced by new
-- code) rather than dropped, since dropping risks destroying
-- already-recorded delivery history from the prior CRM usage; new code
-- never reads them again.
CREATE TABLE IF NOT EXISTS delivery_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  do_number        TEXT NOT NULL,
  invoice_id       UUID NOT NULL REFERENCES invoices(id),
  project_id       UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id        UUID NOT NULL REFERENCES clients(id),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'prepared', 'dispatched', 'delivered', 'cancelled')),
  delivery_date    DATE,
  delivery_address JSONB,
  received_by      TEXT,
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_number ON delivery_orders(workspace_id, do_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_orders_workspace ON delivery_orders(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice ON delivery_orders(invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_orders_project ON delivery_orders(project_id) WHERE deleted_at IS NULL;

ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view delivery orders"
  ON delivery_orders FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);
CREATE POLICY "Staff can create delivery orders"
  ON delivery_orders FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));
CREATE POLICY "Staff can update delivery orders"
  ON delivery_orders FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE OR REPLACE FUNCTION create_delivery_order(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_do public.delivery_orders%ROWTYPE; v_invoice public.invoices%ROWTYPE; v_project_code TEXT; v_number TEXT;
  v_item JSONB; v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = (p_input->>'invoice_id')::UUID AND workspace_id = p_workspace_id;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  IF COALESCE(p_input->>'project_id', v_invoice.project_id::TEXT) IS NOT NULL THEN
    SELECT code INTO v_project_code FROM public.projects
    WHERE id = COALESCE((p_input->>'project_id')::UUID, v_invoice.project_id);
  END IF;

  v_number := public.generate_document_number(
    p_workspace_id, 'delivery_order', CURRENT_DATE,
    v_project_code, COALESCE((p_input->>'project_id')::UUID, v_invoice.project_id), 'DO'
  );

  INSERT INTO public.delivery_orders (workspace_id, do_number, invoice_id, project_id, client_id, delivery_date, delivery_address, notes, created_by)
  VALUES (p_workspace_id, v_number, v_invoice.id, COALESCE((p_input->>'project_id')::UUID, v_invoice.project_id),
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

  RETURN to_jsonb(v_do);
END;
$$;

CREATE OR REPLACE FUNCTION update_delivery_order_status(p_workspace_id UUID, p_actor_id UUID, p_do_id UUID, p_status TEXT, p_received_by TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_do public.delivery_orders%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.delivery_orders SET
    status = p_status,
    received_by = COALESCE(p_received_by, received_by),
    delivery_date = CASE WHEN p_status = 'delivered' THEN COALESCE(delivery_date, CURRENT_DATE) ELSE delivery_date END,
    updated_at = now()
  WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  RETURNING * INTO v_do;
  IF v_do.id IS NULL THEN RAISE EXCEPTION 'Delivery order not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Delivery order ' || v_do.do_number || ' marked ' || p_status, 'delivery_order', v_do.id);

  RETURN to_jsonb(v_do);
END;
$$;

CREATE OR REPLACE FUNCTION delete_delivery_order(p_workspace_id UUID, p_actor_id UUID, p_do_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_do public.delivery_orders%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.delivery_orders SET deleted_at = now() WHERE id = p_do_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_do;
  IF v_do.id IS NULL THEN RAISE EXCEPTION 'Delivery order not found'; END IF;
  RETURN to_jsonb(v_do);
END;
$$;

-- List delivery orders for an invoice — the Invoice detail page's
-- "Delivery Orders" section (fulfillment tracked primarily from the
-- Invoice, per the explicit requirement).
CREATE OR REPLACE FUNCTION get_delivery_orders_for_invoice(p_invoice_id UUID, p_workspace_id UUID)
RETURNS SETOF public.delivery_orders LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT * FROM public.delivery_orders
  WHERE invoice_id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  ORDER BY created_at DESC;
$$;
