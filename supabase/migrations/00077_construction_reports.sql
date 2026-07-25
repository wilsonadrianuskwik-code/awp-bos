-- Construction BOS Phase 3: reporting extensions (master plan §7).
-- Mirrors the existing get_ar_aging (00024) pattern exactly, applied to
-- Purchase Orders/Suppliers, plus new Project Profitability and Delivery
-- Performance reports.

CREATE OR REPLACE FUNCTION get_ap_aging(p_workspace_id UUID, p_currency TEXT)
RETURNS TABLE (bucket TEXT, po_count BIGINT, outstanding_amount NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  RETURN QUERY
  WITH buckets(bucket, bucket_order) AS (
    VALUES ('current', 0), ('1-30', 1), ('31-60', 2), ('61+', 3)
  ),
  po_buckets AS (
    SELECT
      CASE
        WHEN po.expected_date IS NULL OR po.expected_date >= CURRENT_DATE THEN 'current'
        WHEN CURRENT_DATE - po.expected_date BETWEEN 1 AND 30 THEN '1-30'
        WHEN CURRENT_DATE - po.expected_date BETWEEN 31 AND 60 THEN '31-60'
        ELSE '61+'
      END AS bucket,
      po.total
    FROM public.purchase_orders po
    WHERE po.workspace_id = p_workspace_id
      AND po.currency = p_currency
      AND po.deleted_at IS NULL
      AND po.status IN ('sent', 'acknowledged', 'partially_received')
  )
  SELECT b.bucket, COUNT(pb.total), COALESCE(SUM(pb.total), 0)
  FROM buckets b
  LEFT JOIN po_buckets pb ON pb.bucket = b.bucket
  GROUP BY b.bucket, b.bucket_order
  ORDER BY b.bucket_order;
END;
$$;

CREATE OR REPLACE FUNCTION get_purchase_order_status_summary(p_workspace_id UUID)
RETURNS TABLE (status TEXT, po_count BIGINT, total_by_currency JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  RETURN QUERY
  SELECT po.status, COUNT(*),
    jsonb_object_agg(po.currency, currency_total) FILTER (WHERE currency_total IS NOT NULL)
  FROM public.purchase_orders po
  LEFT JOIN LATERAL (SELECT SUM(total) AS currency_total FROM public.purchase_orders p2
    WHERE p2.workspace_id = p_workspace_id AND p2.status = po.status AND p2.currency = po.currency AND p2.deleted_at IS NULL) t ON true
  WHERE po.workspace_id = p_workspace_id AND po.deleted_at IS NULL
  GROUP BY po.status;
END;
$$;

CREATE OR REPLACE FUNCTION get_project_profitability(p_workspace_id UUID)
RETURNS TABLE (
  project_id UUID, project_code TEXT, project_name TEXT, currency TEXT,
  invoiced_total NUMERIC, paid_total NUMERIC, po_cost_total NUMERIC, budget NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.code, p.name, p.currency,
    COALESCE((SELECT SUM(i.total) FROM public.invoices i WHERE i.project_id = p.id AND i.deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(i.amount_paid) FROM public.invoices i WHERE i.project_id = p.id AND i.deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(po.total) FROM public.purchase_orders po WHERE po.project_id = p.id AND po.deleted_at IS NULL), 0),
    p.budget
  FROM public.projects p
  WHERE p.workspace_id = p_workspace_id AND p.deleted_at IS NULL
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_delivery_performance(p_workspace_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (status TEXT, do_count BIGINT, avg_days_to_deliver NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  RETURN QUERY
  SELECT
    d.status, COUNT(*),
    AVG(EXTRACT(DAY FROM (d.updated_at - d.created_at)))::NUMERIC
  FROM public.delivery_orders d
  WHERE d.workspace_id = p_workspace_id AND d.deleted_at IS NULL
    AND d.created_at::DATE BETWEEN p_from_date AND p_to_date
  GROUP BY d.status;
END;
$$;
