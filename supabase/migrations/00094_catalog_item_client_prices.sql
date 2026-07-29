-- Customer-specific pricing: the same catalog item can be sold to
-- different clients at different unit prices (a negotiated rate, a
-- volume discount, a long-standing account). default_unit_price on
-- catalog_items stays the fallback shown to everyone else; this table
-- holds the overrides, one row per (catalog_item, client) pair.
--
-- Deliberately a separate table rather than a price column per client on
-- catalog_items (which would require a schema change every time a client
-- is added) — same "generic override table beats per-row columns"
-- reasoning already used for document_relationships (00066).
--
-- Only standalone items are priced this way — a package's price is the
-- whole bundle's package_price, not a sum of per-client item prices, so
-- there's no override concept for is_package=true items; the UI simply
-- never offers one.
CREATE TABLE IF NOT EXISTS catalog_item_client_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_price      NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One override per item/client pair — setting a new price for the same
-- pair is an update (upsert), not a second row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_item_client_prices_pair
  ON catalog_item_client_prices(catalog_item_id, client_id);

CREATE INDEX IF NOT EXISTS idx_catalog_item_client_prices_workspace
  ON catalog_item_client_prices(workspace_id);

-- Builders need every override for the workspace up front (they resolve
-- price client-side as the user picks a client, with no extra round
-- trip), so the read path is a plain per-workspace list — indexed above.
ALTER TABLE catalog_item_client_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view catalog item client prices" ON catalog_item_client_prices;
CREATE POLICY "Members can view catalog item client prices"
  ON catalog_item_client_prices FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

DROP POLICY IF EXISTS "Staff can manage catalog item client prices" ON catalog_item_client_prices;
CREATE POLICY "Staff can manage catalog item client prices"
  ON catalog_item_client_prices FOR ALL
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'))
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

NOTIFY pgrst, 'reload schema';
