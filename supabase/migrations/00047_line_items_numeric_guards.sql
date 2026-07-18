-- create_invoice/create_quotation/update_invoice/update_quotation/
-- generate_invoice_from_quotation/create_quotation_version all insert
-- line_items rows from caller-supplied JSONB (p_line_items) with a bare
-- cast — (elem->>'quantity')::NUMERIC etc — and no bounds check. The only
-- validation of quantity > 0 / unit_price >= 0 / discount_percent &
-- tax_percent in [0,100] lives in the Zod schema
-- (line-items/validators.ts), which is client-adjacent: any other caller
-- of these RPCs (a future integration, a replayed request, a bug in the
-- form) has no server-side backstop.
--
-- A table-level CHECK is defense-in-depth in one place instead of
-- threading a validation call through every line-item-inserting function
-- (there are half a dozen, cascaded across several earlier migrations) —
-- it covers every insert path, present and future, not just the ones
-- patched today. Bounds match the Zod schema exactly so a row that passes
-- client validation always passes here too.

ALTER TABLE line_items DROP CONSTRAINT IF EXISTS line_items_quantity_positive_check;
ALTER TABLE line_items ADD CONSTRAINT line_items_quantity_positive_check
  CHECK (quantity > 0);

ALTER TABLE line_items DROP CONSTRAINT IF EXISTS line_items_unit_price_nonnegative_check;
ALTER TABLE line_items ADD CONSTRAINT line_items_unit_price_nonnegative_check
  CHECK (unit_price >= 0);

ALTER TABLE line_items DROP CONSTRAINT IF EXISTS line_items_discount_percent_range_check;
ALTER TABLE line_items ADD CONSTRAINT line_items_discount_percent_range_check
  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));

ALTER TABLE line_items DROP CONSTRAINT IF EXISTS line_items_tax_percent_range_check;
ALTER TABLE line_items ADD CONSTRAINT line_items_tax_percent_range_check
  CHECK (tax_percent IS NULL OR (tax_percent >= 0 AND tax_percent <= 100));
