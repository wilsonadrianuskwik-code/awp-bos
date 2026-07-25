-- Construction BOS Phase 0: Suppliers — mirrors clients structurally so
-- the same form/list/detail component patterns already built for Clients
-- can be reused directly for the Procurement side of the business.
CREATE TABLE IF NOT EXISTS suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  company          TEXT,
  website          TEXT,
  address          JSONB,
  billing_email    TEXT,
  tax_id           TEXT,
  payment_terms    INTEGER NOT NULL DEFAULT 30,
  preferred_currency TEXT,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  custom_fields    JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes            TEXT,
  assigned_to      UUID REFERENCES auth.users(id),
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON suppliers(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_assigned ON suppliers(assigned_to) WHERE deleted_at IS NULL;

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view suppliers" ON suppliers;
CREATE POLICY "Members can view suppliers"
  ON suppliers FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);
DROP POLICY IF EXISTS "Staff can create suppliers" ON suppliers;
CREATE POLICY "Staff can create suppliers"
  ON suppliers FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));
DROP POLICY IF EXISTS "Staff can update suppliers" ON suppliers;
CREATE POLICY "Staff can update suppliers"
  ON suppliers FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE OR REPLACE FUNCTION create_supplier(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_supplier public.suppliers%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO public.suppliers (
    workspace_id, name, email, phone, company, website, address, billing_email, tax_id,
    payment_terms, preferred_currency, tags, custom_fields, notes, assigned_to, created_by
  ) VALUES (
    p_workspace_id, p_input->>'name', p_input->>'email', p_input->>'phone', p_input->>'company',
    p_input->>'website', p_input->'address', p_input->>'billing_email', p_input->>'tax_id',
    COALESCE((p_input->>'payment_terms')::INTEGER, 30), p_input->>'preferred_currency',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_input->'tags', '[]'::jsonb)) x), '{}'),
    COALESCE(p_input->'custom_fields', '{}'::jsonb), p_input->>'notes',
    (p_input->>'assigned_to')::UUID, p_actor_id
  ) RETURNING * INTO v_supplier;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created supplier ' || v_supplier.name, 'supplier', v_supplier.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'supplier', v_supplier.id, to_jsonb(v_supplier));

  RETURN to_jsonb(v_supplier);
END;
$$;

CREATE OR REPLACE FUNCTION update_supplier(p_workspace_id UUID, p_actor_id UUID, p_supplier_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before public.suppliers%ROWTYPE; v_after public.suppliers%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO v_before FROM public.suppliers WHERE id = p_supplier_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;

  UPDATE public.suppliers SET
    name = COALESCE(p_input->>'name', name),
    email = COALESCE(p_input->>'email', email),
    phone = COALESCE(p_input->>'phone', phone),
    company = COALESCE(p_input->>'company', company),
    website = COALESCE(p_input->>'website', website),
    address = COALESCE(p_input->'address', address),
    billing_email = COALESCE(p_input->>'billing_email', billing_email),
    tax_id = COALESCE(p_input->>'tax_id', tax_id),
    payment_terms = COALESCE((p_input->>'payment_terms')::INTEGER, payment_terms),
    preferred_currency = COALESCE(p_input->>'preferred_currency', preferred_currency),
    tags = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_input->'tags') x), tags),
    custom_fields = COALESCE(p_input->'custom_fields', custom_fields),
    notes = COALESCE(p_input->>'notes', notes),
    assigned_to = COALESCE((p_input->>'assigned_to')::UUID, assigned_to),
    updated_at = now()
  WHERE id = p_supplier_id
  RETURNING * INTO v_after;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated supplier ' || v_after.name, 'supplier', v_after.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'update', 'supplier', v_after.id, jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after)));

  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION delete_supplier(p_workspace_id UUID, p_actor_id UUID, p_supplier_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_supplier public.suppliers%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.suppliers SET deleted_at = now() WHERE id = p_supplier_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_supplier;
  IF v_supplier.id IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted supplier ' || v_supplier.name, 'supplier', v_supplier.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'supplier', v_supplier.id, to_jsonb(v_supplier));

  RETURN to_jsonb(v_supplier);
END;
$$;
