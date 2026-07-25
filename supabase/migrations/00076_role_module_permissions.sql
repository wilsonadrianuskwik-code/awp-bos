-- Construction BOS Phase 3: module-capability permission matrix (master
-- plan §6.2 Phase 1). Extends, does not replace, the existing
-- viewer<staff<admin<owner hierarchy — get_user_role()/hasMinRole()/
-- withWorkspace() remain the enforced backbone; this adds an optional
-- per-module override so e.g. a Procurement-tagged staff member can
-- write POs/Suppliers but only view Invoices.
--
-- Absence of a row for (workspace, role, module) means "fall back to the
-- default hierarchy behavior" — this table only stores overrides, so
-- workspaces that never touch Settings > Permissions behave exactly as
-- before.
CREATE TABLE IF NOT EXISTS role_module_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  role          TEXT NOT NULL CHECK (role IN ('viewer', 'staff', 'admin', 'owner')),
  module        TEXT NOT NULL, -- free-form key: 'leads','clients','quotations','proforma_invoices','invoices','purchase_orders','delivery_orders','suppliers','catalog','projects','payments','reports','settings'
  can_view      BOOLEAN NOT NULL DEFAULT true,
  can_write     BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, role, module)
);

ALTER TABLE role_module_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view module permissions" ON role_module_permissions;
CREATE POLICY "Members can view module permissions"
  ON role_module_permissions FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
DROP POLICY IF EXISTS "Admins can manage module permissions" ON role_module_permissions;
CREATE POLICY "Admins can manage module permissions"
  ON role_module_permissions FOR ALL
  USING (get_user_role(workspace_id) IN ('admin', 'owner'))
  WITH CHECK (get_user_role(workspace_id) IN ('admin', 'owner'));

CREATE OR REPLACE FUNCTION get_module_permissions(p_workspace_id UUID)
RETURNS SETOF public.role_module_permissions LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT * FROM public.role_module_permissions WHERE workspace_id = p_workspace_id;
$$;

CREATE OR REPLACE FUNCTION set_module_permission(p_workspace_id UUID, p_actor_id UUID, p_role TEXT, p_module TEXT, p_can_view BOOLEAN, p_can_write BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.role_module_permissions%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO public.role_module_permissions (workspace_id, role, module, can_view, can_write)
  VALUES (p_workspace_id, p_role, p_module, p_can_view, p_can_write)
  ON CONFLICT (workspace_id, role, module)
  DO UPDATE SET can_view = p_can_view, can_write = p_can_write, updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', format('Set %s permission for %s: view=%s write=%s', p_module, p_role, p_can_view, p_can_write), 'role_module_permission', v_row.id);

  RETURN to_jsonb(v_row);
END;
$$;

-- Resolve effective view/write for a (workspace, user, module) — the one
-- function both server actions and RLS-adjacent checks should call.
-- Falls back to the base hierarchy (module-agnostic 'staff' == full
-- read/write, matching every table's existing RLS policy) when no
-- override row exists.
CREATE OR REPLACE FUNCTION get_effective_module_permission(p_workspace_id UUID, p_module TEXT)
RETURNS TABLE(can_view BOOLEAN, can_write BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
DECLARE v_role TEXT; v_override public.role_module_permissions%ROWTYPE;
BEGIN
  v_role := public.get_user_role(p_workspace_id);
  IF v_role IS NULL THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  SELECT * INTO v_override FROM public.role_module_permissions
  WHERE workspace_id = p_workspace_id AND role = v_role AND module = p_module;

  IF v_override.id IS NOT NULL THEN
    RETURN QUERY SELECT v_override.can_view, v_override.can_write;
  ELSE
    RETURN QUERY SELECT true, (v_role IN ('staff', 'admin', 'owner'));
  END IF;
END;
$$;
