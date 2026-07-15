-- Phase 13: Document Design System — Milestone 1 (Foundations).
--
-- template_themes holds a reusable visual identity (colors, typography,
-- spacing, borders) as a JSONB ThemeConfig. document_templates holds a
-- document's structure (an ordered array of blocks) and references a
-- theme by id — changing a theme updates every template that uses it,
-- which is what makes theme a brand-level concern rather than a
-- per-document one. Both tables follow the exact RLS/shape precedent set
-- by catalog_items (00026): plain-table CRUD via withWorkspace(), no
-- RPCs, since there is no cross-table invariant to protect atomically.
CREATE TABLE IF NOT EXISTS template_themes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  description  TEXT,
  config       JSONB NOT NULL DEFAULT '{}',
  is_preset    BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_template_themes_workspace
  ON template_themes(workspace_id) WHERE deleted_at IS NULL;

ALTER TABLE template_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view template themes"
  ON template_themes FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

CREATE POLICY "Staff can create template themes"
  ON template_themes FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE POLICY "Staff can update template themes"
  ON template_themes FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE TABLE IF NOT EXISTS document_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  name          TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN
                  ('invoice', 'quotation', 'receipt', 'purchase_order', 'delivery_order')),
  theme_id      UUID REFERENCES template_themes(id) ON DELETE SET NULL,
  blocks        JSONB NOT NULL DEFAULT '[]',
  page_settings JSONB NOT NULL DEFAULT '{}',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  thumbnail_url TEXT,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_document_templates_workspace
  ON document_templates(workspace_id) WHERE deleted_at IS NULL;

-- One default template per document type per workspace — this is the
-- template every invoice/quotation renders with unless explicitly
-- overridden, so at most one row can hold that flag per (workspace,
-- document_type) pair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_default
  ON document_templates(workspace_id, document_type)
  WHERE is_default = true AND deleted_at IS NULL;

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view document templates"
  ON document_templates FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

CREATE POLICY "Staff can create document templates"
  ON document_templates FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE POLICY "Staff can update document templates"
  ON document_templates FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- ---------------------------------------------------------------------
-- update_company_profile — the Easy Mode "Your Brand" panel (and the
-- workspace settings "Company Profile" section) writes structured
-- company details into the existing workspaces.settings JSONB under a
-- `company_profile` key. No new column: settings has been available
-- since Phase 1 (00002) and is a generic per-workspace bag, and this is
-- simply its first real consumer. Wrapped in an RPC (rather than a bare
-- RLS UPDATE like update_workspace uses) purely to merge into the
-- existing settings JSONB atomically and log activity/audit consistently
-- with every other workspace mutation — the underlying RLS UPDATE policy
-- on workspaces already permits admin/owner to write this column.
CREATE OR REPLACE FUNCTION update_company_profile(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_company_profile JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.workspaces%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update company profile';
  END IF;

  SELECT * INTO v_old FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  UPDATE public.workspaces
  SET settings = jsonb_set(settings, '{company_profile}', p_company_profile, true),
      updated_at = now()
  WHERE id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated company profile', 'workspace', p_workspace_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace', p_workspace_id,
    jsonb_build_object('company_profile', jsonb_build_object('old', v_old.settings->'company_profile', 'new', p_company_profile))
  );

  RETURN (SELECT to_jsonb(w) FROM public.workspaces w WHERE w.id = p_workspace_id);
END;
$$;
