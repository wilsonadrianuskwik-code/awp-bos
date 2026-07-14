-- Phase 10: Catalog Revenue Report.
--
-- Closes the "catalog-based reporting" hook Phase 8 explicitly deferred
-- (line_items.catalog_item_id, written once at insert time, never
-- re-read for pricing). This RPC is the first thing to actually read it.
--
-- Unlike get_revenue_by_period (payments-based, i.e. cash collected),
-- there is no data path from a payment to an individual line item —
-- payments are recorded against a whole invoice. So a per-item breakdown
-- can only be based on invoiced amounts (line_items.line_total), scoped
-- to invoice statuses that represent "actually billed and still
-- standing": sent/viewed/partial/paid/overdue. This excludes draft
-- (never billed), cancelled (voided), and refunded (reversed) — a third,
-- distinct definition of "revenue" from get_revenue_by_period's
-- (collected) and get_ar_aging's (still outstanding), not an
-- inconsistency, just what this data model can actually answer.
--
-- Same read-only pattern as 00022_create_reporting_functions.sql: no
-- log_activity/log_audit_entry (nothing mutates), still enforces
-- get_user_role() for defense in depth.

-- Supporting index — line_items has had catalog_item_id since Phase 8
-- but nothing has queried by it until now.
CREATE INDEX IF NOT EXISTS idx_line_items_catalog_item
  ON line_items(catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION get_revenue_by_catalog_item(
  p_workspace_id UUID,
  p_currency TEXT,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  catalog_item_id UUID,
  catalog_item_name TEXT,
  quantity NUMERIC,
  total NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  RETURN QUERY
  SELECT
    ci.id AS catalog_item_id,
    ci.name AS catalog_item_name,
    SUM(li.quantity) AS quantity,
    SUM(li.line_total) AS total
  FROM public.line_items li
  JOIN public.invoices i ON i.id = li.entity_id AND li.entity_type = 'invoice'
  JOIN public.catalog_items ci ON ci.id = li.catalog_item_id
  WHERE li.workspace_id = p_workspace_id
    AND li.catalog_item_id IS NOT NULL
    AND i.currency = p_currency
    AND i.deleted_at IS NULL
    AND i.status IN ('sent', 'viewed', 'partial', 'paid', 'overdue')
    AND i.issue_date BETWEEN p_from_date AND p_to_date
  GROUP BY ci.id, ci.name
  ORDER BY total DESC
  LIMIT 10;
END;
$$;
