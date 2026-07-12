-- Bug fix found during Milestone 5 verification: get_revenue_by_period
-- and get_ar_aging (00022/00023) rejected the 'viewer' role entirely
-- (get_user_role(...) NOT IN ('staff','admin','owner')), unlike every
-- other read path in this codebase — the RLS SELECT policies on
-- quotations/invoices/etc. all grant read access to ANY workspace member
-- via get_user_workspace_ids(), reserving staff+ restrictions for
-- mutations only. Reports are read-only, so a viewer should be able to
-- view them, the same as they can already view the invoice/quotation
-- lists. Only non-members (get_user_role() returns NULL for a workspace
-- the caller doesn't belong to) should be rejected.
--
-- Same signatures/RETURNS TABLE contracts — only the permission check
-- changes, function bodies are otherwise identical to 00023/00022.

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
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  IF p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'Invalid granularity: %', p_granularity;
  END IF;

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
  IF public.get_user_role(p_workspace_id) IS NULL THEN
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
