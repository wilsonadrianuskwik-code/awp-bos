-- getInvoiceStats/getQuotationStats/getCatalogStats (queries.ts) each fetched
-- every non-deleted row's status/total/currency (or item_type/is_active/
-- default_unit_price/currency for catalog) and reduced them into counts +
-- per-currency totals in JS, on every single list-page load — a full table
-- scan and transfer that only gets worse as a workspace's data grows,
-- independent of and in addition to the already-paginated main list query.
--
-- Replace all three with a single round-trip RPC each that does the
-- grouping/summing in Postgres and returns the exact same shape the TS
-- layer already expects (InvoiceStats/QuotationStats/CatalogStats), so
-- queries.ts only needs to swap the data-fetching, not the return type.

CREATE FUNCTION get_invoice_stats(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'totalCount', COUNT(*),
    'draftCount', COUNT(*) FILTER (WHERE status = 'draft'),
    'outstandingCount', COUNT(*) FILTER (WHERE status IN ('sent', 'viewed', 'partial', 'overdue')),
    'paidCount', COUNT(*) FILTER (WHERE status = 'paid'),
    'totalValueByCurrency', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount))
        FROM (
          SELECT currency, SUM(total) AS amount
          FROM public.invoices
          WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
          GROUP BY currency
        ) currency_totals
      ),
      '[]'::jsonb
    )
  )
  FROM public.invoices
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL;
$$;

CREATE FUNCTION get_quotation_stats(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'totalCount', COUNT(*),
    'draftCount', COUNT(*) FILTER (WHERE status = 'draft'),
    'awaitingApprovalCount', COUNT(*) FILTER (WHERE status IN ('sent', 'viewed')),
    'approvedCount', COUNT(*) FILTER (WHERE status = 'approved'),
    'totalValueByCurrency', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount))
        FROM (
          SELECT currency, SUM(total) AS amount
          FROM public.quotations
          WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
          GROUP BY currency
        ) currency_totals
      ),
      '[]'::jsonb
    )
  )
  FROM public.quotations
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL;
$$;

CREATE FUNCTION get_catalog_stats(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'totalCount', COUNT(*),
    'activeCount', COUNT(*) FILTER (WHERE is_active),
    'inactiveCount', COUNT(*) FILTER (WHERE NOT is_active),
    'productCount', COUNT(*) FILTER (WHERE item_type = 'product'),
    'serviceCount', COUNT(*) FILTER (WHERE item_type = 'service'),
    'totalValueByCurrency', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount))
        FROM (
          SELECT currency, SUM(default_unit_price) AS amount
          FROM public.catalog_items
          WHERE workspace_id = p_workspace_id AND deleted_at IS NULL AND is_active
          GROUP BY currency
        ) currency_totals
      ),
      '[]'::jsonb
    )
  )
  FROM public.catalog_items
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL;
$$;
