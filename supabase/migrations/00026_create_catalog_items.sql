-- Phase 8: Product & Service Catalog.
--
-- catalog_items is the canonical "things we sell" entity — distinct from
-- line_items (entries inside a specific quotation/invoice draft) and
-- quotation_templates (saved multi-item bundles). Catalog items are
-- copied into a document's line_items at insert time (see the
-- catalog_item_id column added below), never live-referenced, so a later
-- price change never retroactively alters an already-issued document.
--
-- Scope is deliberately narrow: name/description/SKU/unit/price/category/
-- currency only. Discount and tax stay document-specific (entered per
-- line item, same as today) rather than being catalog defaults — a
-- discount is a negotiated term for a particular deal, not a property of
-- what's being sold.
--
-- item_type ('product'/'service') is the only hook a future inventory
-- phase needs ("only product rows get stock tracking") — no stock
-- columns are added now.
CREATE TABLE IF NOT EXISTS catalog_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id),
  name               TEXT NOT NULL,
  description        TEXT,
  sku                TEXT,
  item_type          TEXT NOT NULL DEFAULT 'service' CHECK (item_type IN ('product', 'service')),
  default_category   TEXT NOT NULL DEFAULT 'per_unit' CHECK (default_category IN ('package', 'add_on', 'per_unit')),
  default_unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  default_unit       TEXT,
  currency           TEXT NOT NULL DEFAULT 'USD',
  created_by         UUID NOT NULL REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_workspace ON catalog_items(workspace_id) WHERE deleted_at IS NULL;

-- Name is deliberately NOT unique — two catalog items may share a name
-- within a workspace (e.g. "Logo Design" priced differently per tier).
-- SKU is optional, but when provided must be unique within a workspace
-- among currently-active (non-deleted) items — a deleted item's SKU
-- becomes reusable, same posture as the Phase 7 pending-invite partial
-- unique index (uniqueness scoped to "live" rows, not all rows ever).
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_sku
  ON catalog_items(workspace_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view catalog items"
  ON catalog_items FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

CREATE POLICY "Staff can create catalog items"
  ON catalog_items FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE POLICY "Staff can update catalog items"
  ON catalog_items FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- Additive, isolated traceability link: written once when a line item is
-- inserted from the catalog (never read back for pricing — copy
-- semantics only, per the financial-immutability decision). Nullable so
-- every existing line_items row is unaffected; ON DELETE SET NULL so a
-- hard-deleted catalog item (there is none today — catalog items are
-- soft-deleted) can never orphan a reference.
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL;
