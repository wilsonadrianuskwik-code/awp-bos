-- Fixes get_revenue_by_period (00022) to zero-fill periods with no
-- payments instead of omitting them. Previously a plain GROUP BY over
-- existing payments rows, so a month with zero payments produced no row
-- at all — inconsistent with get_ar_aging in the same original migration,
-- which already zero-fills its four buckets via a LEFT JOIN against a
-- fixed VALUES list. This generalizes that same idea to a dynamic period
-- series spanning the requested date range, so every future consumer of
-- this RPC (not just the current chart) gets a complete, gap-free series
-- for free.
--
-- Same signature and RETURNS TABLE contract as 00022 — CREATE OR REPLACE
-- replaces the function body in place, no TS/component changes needed.
CREATE OR REPLACE FUNCTION get_revenue_by_period(
  p_workspace_id UUID,
  p_currency TEXT,
  p_granularity TEXT,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (period DATE, total NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_interval INTERVAL;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  -- Defensive validation even though the TS layer already restricts this
  -- to a Zod enum — an RPC can always be called directly, bypassing the
  -- client-side validator.
  IF p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'Invalid granularity: %', p_granularity;
  END IF;

  -- Fixed literals, not p_granularity handed straight into date_trunc()/
  -- an interval cast — same rule as the original function.
  v_start := CASE p_granularity
    WHEN 'day' THEN date_trunc('day', p_from_date)
    WHEN 'week' THEN date_trunc('week', p_from_date)
    WHEN 'month' THEN date_trunc('month', p_from_date)
  END;
  v_end := CASE p_granularity
    WHEN 'day' THEN date_trunc('day', p_to_date)
    WHEN 'week' THEN date_trunc('week', p_to_date)
    WHEN 'month' THEN date_trunc('month', p_to_date)
  END;
  v_interval := CASE p_granularity
    WHEN 'day' THEN INTERVAL '1 day'
    WHEN 'week' THEN INTERVAL '1 week'
    WHEN 'month' THEN INTERVAL '1 month'
  END;

  RETURN QUERY
  SELECT
    gs.period::DATE,
    COALESCE(SUM(p.amount), 0) AS total
  FROM generate_series(v_start, v_end, v_interval) AS gs(period)
  LEFT JOIN public.payments p
    ON p.workspace_id = p_workspace_id
   AND p.currency = p_currency
   AND p.deleted_at IS NULL
   AND p.payment_date BETWEEN p_from_date AND p_to_date
   AND (CASE p_granularity
          WHEN 'day' THEN date_trunc('day', p.payment_date)
          WHEN 'week' THEN date_trunc('week', p.payment_date)
          WHEN 'month' THEN date_trunc('month', p.payment_date)
        END) = gs.period
  GROUP BY gs.period
  ORDER BY gs.period;
END;
$$;
