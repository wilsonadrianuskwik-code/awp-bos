-- Construction BOS Phase 0: Projects — first-class entity, the
-- operational spine of the Construction BOS. Deliberately independent of
-- fulfillment_projects (retired in 00073), which was a 1:1 invoice
-- satellite with no identity of its own — this is a real, freely
-- creatable entity that documents optionally link to.
--
-- project_id is nullable on every operational document (see 00071-00073)
-- because documents must remain independently creatable without a
-- project — Projects are guidance, never a restriction.
CREATE TABLE IF NOT EXISTS projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),
  code           TEXT NOT NULL, -- free-form, admin-defined; no format assumptions
  name           TEXT NOT NULL,
  client_id      UUID REFERENCES clients(id),
  status         TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  site_address   JSONB,
  start_date     DATE,
  end_date       DATE,
  budget         NUMERIC(15,2),
  currency       TEXT NOT NULL DEFAULT 'USD',
  assigned_to    UUID REFERENCES auth.users(id),
  notes          TEXT,
  custom_fields  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code ON projects(workspace_id, code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_assigned ON projects(assigned_to) WHERE deleted_at IS NULL;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view projects" ON projects;
CREATE POLICY "Members can view projects"
  ON projects FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);
DROP POLICY IF EXISTS "Staff can create projects" ON projects;
CREATE POLICY "Staff can create projects"
  ON projects FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));
DROP POLICY IF EXISTS "Staff can update projects" ON projects;
CREATE POLICY "Staff can update projects"
  ON projects FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE OR REPLACE FUNCTION create_project(
  p_workspace_id UUID, p_actor_id UUID, p_code TEXT, p_name TEXT, p_client_id UUID,
  p_status TEXT DEFAULT 'planning', p_site_address JSONB DEFAULT NULL,
  p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL,
  p_budget NUMERIC DEFAULT NULL, p_currency TEXT DEFAULT 'USD',
  p_assigned_to UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO public.projects (workspace_id, code, name, client_id, status, site_address, start_date, end_date, budget, currency, assigned_to, notes, created_by)
  VALUES (p_workspace_id, p_code, p_name, p_client_id, p_status, p_site_address, p_start_date, p_end_date, p_budget, p_currency, p_assigned_to, p_notes, p_actor_id)
  RETURNING * INTO v_project;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created project ' || v_project.code, 'project', v_project.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'project', v_project.id, to_jsonb(v_project));

  RETURN to_jsonb(v_project);
END;
$$;

CREATE OR REPLACE FUNCTION update_project(
  p_workspace_id UUID, p_actor_id UUID, p_project_id UUID, p_updates JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before public.projects%ROWTYPE; v_after public.projects%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_before FROM public.projects WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;

  UPDATE public.projects SET
    code = COALESCE(p_updates->>'code', code),
    name = COALESCE(p_updates->>'name', name),
    client_id = COALESCE((p_updates->>'client_id')::UUID, client_id),
    status = COALESCE(p_updates->>'status', status),
    site_address = COALESCE(p_updates->'site_address', site_address),
    start_date = COALESCE((p_updates->>'start_date')::DATE, start_date),
    end_date = COALESCE((p_updates->>'end_date')::DATE, end_date),
    budget = COALESCE((p_updates->>'budget')::NUMERIC, budget),
    assigned_to = COALESCE((p_updates->>'assigned_to')::UUID, assigned_to),
    notes = COALESCE(p_updates->>'notes', notes),
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_after;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated project ' || v_after.code, 'project', v_after.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'update', 'project', v_after.id, jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after)));

  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION delete_project(p_workspace_id UUID, p_actor_id UUID, p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.projects SET deleted_at = now() WHERE id = p_project_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_project;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted project ' || v_project.code, 'project', v_project.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'project', v_project.id, to_jsonb(v_project));

  RETURN to_jsonb(v_project);
END;
$$;

-- Every operational document gets an optional project_id — optional
-- because documents must remain independently creatable (Projects are
-- guidance, never a restriction), nullable FK so existing rows are
-- unaffected.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_project ON quotations(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id) WHERE deleted_at IS NULL;

-- Aggregate "document health" for a project — the 4-segment strip used
-- on the dashboard's Active Projects grid and the Project Overview tab.
-- Reads document_relationships + the typed tables directly rather than
-- assuming a fixed set of document types, so it stays correct as new
-- document types are registered.
CREATE OR REPLACE FUNCTION get_project_health(p_project_id UUID, p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_quoted NUMERIC; v_invoiced NUMERIC; v_delivered_count INT; v_delivered_total INT; v_paid NUMERIC;
BEGIN
  IF p_workspace_id NOT IN (SELECT public.get_user_workspace_ids()) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_quoted FROM public.quotations WHERE project_id = p_project_id AND deleted_at IS NULL;
  SELECT COALESCE(SUM(total), 0), COALESCE(SUM(amount_paid), 0) INTO v_invoiced, v_paid
    FROM public.invoices WHERE project_id = p_project_id AND deleted_at IS NULL;
  SELECT COUNT(*) FILTER (WHERE status = 'delivered'), COUNT(*) INTO v_delivered_count, v_delivered_total
    FROM public.delivery_orders WHERE project_id = p_project_id AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'quoted_total', v_quoted,
    'invoiced_total', v_invoiced,
    'paid_total', v_paid,
    'delivered_count', v_delivered_count,
    'delivery_total', v_delivered_total
  );
END;
$$;
