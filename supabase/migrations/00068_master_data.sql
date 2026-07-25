-- Construction BOS Phase 0: Master Data.
--
-- Generic simple_lookups table for the master-data types that share an
-- identical shape (code/name/optional 1-2 extra fields) — one mechanism,
-- config-driven per lookup_type, instead of five near-identical CRUD
-- modules (units_of_measure, tax_rates, payment_terms, brands). Item
-- Categories gets its own table because it needs a parent_id tree, which
-- doesn't fit the generic shape.
CREATE TABLE IF NOT EXISTS simple_lookups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  lookup_type   TEXT NOT NULL CHECK (lookup_type IN ('unit_of_measure', 'tax_rate', 'payment_term', 'brand')),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  extra         JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. { "rate_percent": 11 } for tax_rate, { "net_days": 30 } for payment_term
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_simple_lookups_code
  ON simple_lookups(workspace_id, lookup_type, code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_simple_lookups_workspace ON simple_lookups(workspace_id, lookup_type) WHERE deleted_at IS NULL;

ALTER TABLE simple_lookups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view lookups" ON simple_lookups;
CREATE POLICY "Members can view lookups"
  ON simple_lookups FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);
DROP POLICY IF EXISTS "Admins can manage lookups" ON simple_lookups;
CREATE POLICY "Admins can manage lookups"
  ON simple_lookups FOR ALL
  USING (get_user_role(workspace_id) IN ('admin', 'owner'))
  WITH CHECK (get_user_role(workspace_id) IN ('admin', 'owner'));

CREATE TABLE IF NOT EXISTS item_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  parent_id     UUID REFERENCES item_categories(id) ON DELETE SET NULL,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_code
  ON item_categories(workspace_id, code) WHERE deleted_at IS NULL;

ALTER TABLE item_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view item categories" ON item_categories;
CREATE POLICY "Members can view item categories"
  ON item_categories FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);
DROP POLICY IF EXISTS "Admins can manage item categories" ON item_categories;
CREATE POLICY "Admins can manage item categories"
  ON item_categories FOR ALL
  USING (get_user_role(workspace_id) IN ('admin', 'owner'))
  WITH CHECK (get_user_role(workspace_id) IN ('admin', 'owner'));

-- Reserve the category/brand/UoM hooks on catalog_items now (§15.1 of the
-- master plan) — near-zero cost today, expensive to backfill later.
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES item_categories(id) ON DELETE SET NULL;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS brand_lookup_id UUID REFERENCES simple_lookups(id) ON DELETE SET NULL;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS unit_of_measure_id UUID REFERENCES simple_lookups(id) ON DELETE SET NULL;

-- Reserve tax_rate_id on line_items (resolved tax_percent stays the
-- stored, historically-accurate value — never recomputed when a rate
-- changes; this FK is only a "what rate produced this" reference).
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS tax_rate_lookup_id UUID REFERENCES simple_lookups(id) ON DELETE SET NULL;

-- Reserve warehouse_id placeholder on line_items now (§15.1) so a future
-- Inventory phase never needs to backfill a location dimension onto
-- historical transaction rows. No warehouses table yet — nullable UUID
-- with no FK target until Inventory ships.
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS warehouse_id UUID;
