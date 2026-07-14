-- Phase 12 M4: Reports card. Mirrors get_ar_aging's exact shape (00022) —
-- a point-in-time snapshot, always returning all four status rows
-- zero-filled, not date-range-scoped. Unlike every other reporting RPC,
-- this counts items/quantities rather than money, so it takes no currency
-- parameter at all.
CREATE OR REPLACE FUNCTION get_fulfillment_overview(p_workspace_id UUID)
RETURNS TABLE (status TEXT, item_count BIGINT, total_remaining NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  RETURN QUERY
  WITH statuses(status, status_order) AS (
    VALUES ('pending', 0), ('in_progress', 1), ('completed', 2), ('cancelled', 3)
  ),
  delivered_sums AS (
    SELECT fulfillment_item_id, SUM(quantity_delivered) AS delivered
    FROM public.fulfillment_events
    WHERE deleted_at IS NULL
    GROUP BY fulfillment_item_id
  ),
  item_remaining AS (
    SELECT
      fi.id,
      fi.status,
      GREATEST(0, li.quantity - COALESCE(ds.delivered, 0)) AS remaining
    FROM public.fulfillment_items fi
    JOIN public.line_items li ON li.id = fi.line_item_id
    LEFT JOIN delivered_sums ds ON ds.fulfillment_item_id = fi.id
    WHERE fi.workspace_id = p_workspace_id AND fi.deleted_at IS NULL
  )
  SELECT
    s.status,
    COUNT(ir.id) AS item_count,
    COALESCE(SUM(ir.remaining), 0) AS total_remaining
  FROM statuses s
  LEFT JOIN item_remaining ir ON ir.status = s.status
  GROUP BY s.status, s.status_order
  ORDER BY s.status_order;
END;
$$;
