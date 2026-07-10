CREATE TABLE IF NOT EXISTS line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('quotation','invoice')),
  entity_id        UUID NOT NULL,
  category         TEXT NOT NULL DEFAULT 'per_unit' CHECK (category IN ('package','add_on','per_unit')),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  description      TEXT NOT NULL,
  quantity         NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price       NUMERIC(15,2) NOT NULL DEFAULT 0,
  unit             TEXT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  tax_percent      NUMERIC(5,2) DEFAULT 0,
  line_total       NUMERIC(15,2) GENERATED ALWAYS AS (
                     quantity * unit_price * (1 - COALESCE(discount_percent,0)/100)
                   ) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_items_entity ON line_items(entity_type, entity_id, sort_order);

ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view line items" ON line_items;
CREATE POLICY "Members can view line items"
  ON line_items FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

DROP POLICY IF EXISTS "Staff can create line items" ON line_items;
CREATE POLICY "Staff can create line items"
  ON line_items FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can update line items" ON line_items;
CREATE POLICY "Staff can update line items"
  ON line_items FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can delete line items" ON line_items;
CREATE POLICY "Staff can delete line items"
  ON line_items FOR DELETE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));
