-- Packages: a catalog item can now be a bundle of other items sold at one
-- fixed price, not only a standalone product/service.
--
-- Three additive columns on catalog_items — nothing is removed, and every
-- existing row keeps working unchanged (is_package defaults false, so all
-- current items stay "standalone" with their existing default_unit_price):
--
--   is_package    — true = this item is a package priced as a whole.
--   package_price — the single price shown to the client for the package;
--                   used instead of default_unit_price when is_package.
--   package_items — the breakdown definition, a JSONB array of
--                   { product_id?, name, quantity, unit, note }. Entries
--                   may reference a standalone catalog product (product_id,
--                   for autofill/traceability) OR be free-form "included"
--                   lines that aren't priced products of their own
--                   (e.g. "Caption & Hashtag", "Posting Schedule PDF").
--
-- Per the product decision, a document's package breakdown is resolved
-- LIVE from these columns at render time (keyed by the line item's existing
-- catalog_item_id) rather than snapshotted onto the line item — so editing
-- a package restyles how past documents display it. The captured package
-- PRICE on each document stays fixed (line_items.unit_price snapshot), so
-- totals/payments/balances never change retroactively; only the descriptive
-- breakdown is live. No line_items schema change is needed for this.

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS is_package BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS package_price NUMERIC(15,2);
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS package_items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- A package must carry a non-negative price when priced at all; a
-- standalone item must not carry package_price. Kept lenient (package_price
-- may be NULL on a half-built draft package) so the app layer owns the
-- "packages need a price before sending" UX rather than the DB rejecting
-- an in-progress edit.
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_package_price_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_package_price_check
  CHECK (
    (is_package AND (package_price IS NULL OR package_price >= 0))
    OR (NOT is_package AND package_price IS NULL)
  );
