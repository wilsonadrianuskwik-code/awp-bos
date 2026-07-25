-- Construction BOS Phase 1: Proforma Invoices — kept as a fully separate
-- document/table rather than an invoice status flag (per master plan
-- §12.1): a PI is not yet a receivable, so it must never leak into AR
-- aging or payment logic. Builder UI clones the Quotation builder.
CREATE TABLE IF NOT EXISTS proforma_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  pi_number         TEXT NOT NULL,
  client_id         UUID NOT NULL REFERENCES clients(id),
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'expired', 'cancelled', 'converted')),
  subtotal          NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total             NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date       DATE,
  title             TEXT,
  notes             TEXT,
  terms_and_conditions TEXT,
  generated_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  share_token       UUID UNIQUE DEFAULT gen_random_uuid(),
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proforma_invoices_number ON proforma_invoices(workspace_id, pi_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_workspace ON proforma_invoices(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_project ON proforma_invoices(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_client ON proforma_invoices(client_id) WHERE deleted_at IS NULL;

ALTER TABLE proforma_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view proforma invoices"
  ON proforma_invoices FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);
CREATE POLICY "Staff can create proforma invoices"
  ON proforma_invoices FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));
CREATE POLICY "Staff can update proforma invoices"
  ON proforma_invoices FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));
CREATE POLICY "Anyone with a share token can view a proforma invoice"
  ON proforma_invoices FOR SELECT
  USING (share_token IS NOT NULL);

CREATE OR REPLACE FUNCTION recompute_proforma_invoice_totals(p_pi_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_subtotal NUMERIC; v_tax NUMERIC; v_discount NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * discount_percent / 100), 0),
    COALESCE(SUM((quantity * unit_price * (1 - discount_percent / 100)) * tax_percent / 100), 0)
  INTO v_subtotal, v_discount, v_tax
  FROM public.line_items WHERE entity_type = 'proforma_invoice' AND entity_id = p_pi_id;

  UPDATE public.proforma_invoices SET
    subtotal = v_subtotal, discount_amount = v_discount, tax_amount = v_tax,
    total = v_subtotal - v_discount + v_tax, updated_at = now()
  WHERE id = p_pi_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_proforma_invoice(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pi public.proforma_invoices%ROWTYPE; v_project_code TEXT; v_number TEXT; v_item JSONB; v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_input->>'project_id' IS NOT NULL THEN
    SELECT code INTO v_project_code FROM public.projects WHERE id = (p_input->>'project_id')::UUID;
  END IF;

  v_number := public.generate_document_number(
    p_workspace_id, 'proforma_invoice', COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    v_project_code, (p_input->>'project_id')::UUID, 'PI'
  );

  INSERT INTO public.proforma_invoices (
    workspace_id, pi_number, client_id, project_id, currency, issue_date, expiry_date, title, notes, terms_and_conditions, created_by
  ) VALUES (
    p_workspace_id, v_number, (p_input->>'client_id')::UUID, (p_input->>'project_id')::UUID,
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

  RETURN to_jsonb(v_pi);
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
  IF v_pi.status != 'draft' THEN RAISE EXCEPTION 'Only draft proforma invoices can be edited'; END IF;

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

CREATE OR REPLACE FUNCTION update_proforma_invoice_status(p_workspace_id UUID, p_actor_id UUID, p_pi_id UUID, p_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pi public.proforma_invoices%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.proforma_invoices SET status = p_status, updated_at = now()
  WHERE id = p_pi_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  RETURNING * INTO v_pi;
  IF v_pi.id IS NULL THEN RAISE EXCEPTION 'Proforma invoice not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Proforma invoice ' || v_pi.pi_number || ' marked ' || p_status, 'proforma_invoice', v_pi.id);

  RETURN to_jsonb(v_pi);
END;
$$;

CREATE OR REPLACE FUNCTION delete_proforma_invoice(p_workspace_id UUID, p_actor_id UUID, p_pi_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pi public.proforma_invoices%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.proforma_invoices SET deleted_at = now() WHERE id = p_pi_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_pi;
  IF v_pi.id IS NULL THEN RAISE EXCEPTION 'Proforma invoice not found'; END IF;
  RETURN to_jsonb(v_pi);
END;
$$;
