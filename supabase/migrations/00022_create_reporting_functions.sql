-- Read-only reporting aggregations for Phase 6 (Revenue Trend, AR Aging).
-- Unlike every prior RPC in this codebase (00015/00020, transactional
-- SECURITY DEFINER mutations that write activities/audit_logs), these two
-- functions mutate nothing — no log_activity, no log_audit_entry calls.
-- They still enforce get_user_role() for defense in depth, consistent with
-- every existing RPC, but are pure SELECT-only aggregations pushed into
-- Postgres because PostgREST has no server-side GROUP BY/date_trunc
-- without a function.

-- ---------------------------------------------------------------------
-- get_revenue_by_period — payments grouped by date_trunc(granularity),
-- scoped to a single currency (no exchange-rate table exists to convert
-- between currencies, so callers must never mix them).
-- ---------------------------------------------------------------------
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

  -- Fixed literals rather than passing p_granularity straight into
  -- date_trunc(): the value is already validated above, but an explicit
  -- CASE over the three supported literals avoids handing a runtime
  -- string to date_trunc() at all.
  RETURN QUERY
  SELECT
    CASE p_granularity
      WHEN 'day' THEN date_trunc('day', p.payment_date)::DATE
      WHEN 'week' THEN date_trunc('week', p.payment_date)::DATE
      WHEN 'month' THEN date_trunc('month', p.payment_date)::DATE
    END AS period,
    COALESCE(SUM(p.amount), 0) AS total
  FROM public.payments p
  WHERE p.workspace_id = p_workspace_id
    AND p.currency = p_currency
    AND p.deleted_at IS NULL
    AND p.payment_date BETWEEN p_from_date AND p_to_date
  GROUP BY period
  ORDER BY period;
END;
$$;

-- ---------------------------------------------------------------------
-- get_ar_aging — outstanding invoice balances bucketed by days past due,
-- scoped to a single currency. Always returns exactly four rows (current,
-- 1-30, 31-60, 61+), zero-filled when a bucket has no invoices, so the UI
-- never has to special-case a missing bucket. A point-in-time snapshot
-- ("as of today") — not date-range-scoped, unlike get_revenue_by_period.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_ar_aging(
  p_workspace_id UUID,
  p_currency TEXT
)
RETURNS TABLE (bucket TEXT, invoice_count BIGINT, outstanding_amount NUMERIC)
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
  WITH buckets(bucket, bucket_order) AS (
    VALUES ('current', 0), ('1-30', 1), ('31-60', 2), ('61+', 3)
  ),
  invoice_buckets AS (
    SELECT
      CASE
        WHEN i.due_date IS NULL OR i.due_date >= CURRENT_DATE THEN 'current'
        WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30 THEN '1-30'
        WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60 THEN '31-60'
        ELSE '61+'
      END AS bucket,
      i.amount_due
    FROM public.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.currency = p_currency
      AND i.deleted_at IS NULL
      AND i.status IN ('sent', 'viewed', 'partial', 'overdue')
  )
  SELECT
    b.bucket,
    COUNT(ib.amount_due) AS invoice_count,
    COALESCE(SUM(ib.amount_due), 0) AS outstanding_amount
  FROM buckets b
  LEFT JOIN invoice_buckets ib ON ib.bucket = b.bucket
  GROUP BY b.bucket, b.bucket_order
  ORDER BY b.bucket_order;
END;
$$;
