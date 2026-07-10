CREATE TABLE IF NOT EXISTS quotation_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  description  TEXT,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS quotation_template_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  category         TEXT NOT NULL DEFAULT 'per_unit' CHECK (category IN ('package','add_on','per_unit')),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  description      TEXT NOT NULL,
  quantity         NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price       NUMERIC(15,2) NOT NULL DEFAULT 0,
  unit             TEXT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  tax_percent      NUMERIC(5,2) DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_templates_workspace ON quotation_templates(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotation_template_items_template ON quotation_template_items(template_id, sort_order);

ALTER TABLE quotation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view quotation templates" ON quotation_templates;
CREATE POLICY "Members can view quotation templates"
  ON quotation_templates FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create quotation templates" ON quotation_templates;
CREATE POLICY "Staff can create quotation templates"
  ON quotation_templates FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can update quotation templates" ON quotation_templates;
CREATE POLICY "Staff can update quotation templates"
  ON quotation_templates FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Members can view quotation template items" ON quotation_template_items;
CREATE POLICY "Members can view quotation template items"
  ON quotation_template_items FOR SELECT
  USING (
    template_id IN (
      SELECT id FROM quotation_templates
      WHERE workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Staff can create quotation template items" ON quotation_template_items;
CREATE POLICY "Staff can create quotation template items"
  ON quotation_template_items FOR INSERT
  WITH CHECK (
    template_id IN (
      SELECT id FROM quotation_templates
      WHERE get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Staff can update quotation template items" ON quotation_template_items;
CREATE POLICY "Staff can update quotation template items"
  ON quotation_template_items FOR UPDATE
  USING (
    template_id IN (
      SELECT id FROM quotation_templates
      WHERE get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Staff can delete quotation template items" ON quotation_template_items;
CREATE POLICY "Staff can delete quotation template items"
  ON quotation_template_items FOR DELETE
  USING (
    template_id IN (
      SELECT id FROM quotation_templates
      WHERE get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
    )
  );
