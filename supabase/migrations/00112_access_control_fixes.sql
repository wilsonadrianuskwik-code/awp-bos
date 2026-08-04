-- Closes the access-control gaps found in the audit.
--
-- Everything here was verified against a real database before writing.
-- Each fix is the smallest one that closes the hole; no behaviour changes
-- for a legitimate caller.

-- ---------------------------------------------------------------------
-- 1. proforma_invoices: an RLS policy that means "always true".
-- ---------------------------------------------------------------------
--
-- 00072 shipped:
--
--   CREATE POLICY "Anyone with a share token can view a proforma invoice"
--     ON proforma_invoices FOR SELECT USING (share_token IS NOT NULL);
--
-- share_token is `UUID UNIQUE DEFAULT gen_random_uuid()`, so every row
-- has one and the predicate is true for all of them. It never compares
-- the token to anything the caller supplies. RLS policies are OR'd, so
-- this nullified the workspace-scoped policy sitting beside it, and it
-- omits deleted_at so soft-deleted rows leak too.
--
-- Reproduced: a user who is a member of no workspace at all read every
-- proforma invoice in the database, including notes, while the same user
-- correctly got zero rows from `invoices`. /signup is open, so this is
-- reachable by anyone who registers.
--
-- Dropped rather than rewritten. The portal does not read this table
-- through RLS: like quotations and invoices, portal reads go through the
-- service-role client keyed by the token (see the comment in 00010), so
-- nothing legitimate depends on this policy.
DROP POLICY IF EXISTS "Anyone with a share token can view a proforma invoice"
  ON public.proforma_invoices;

-- ---------------------------------------------------------------------
-- 2. SECURITY DEFINER reads with no membership check.
-- ---------------------------------------------------------------------
--
-- These run as the definer, so RLS never applies to them, and they took
-- the workspace purely from an argument. Every sibling reporting RPC
-- already gates on get_user_role (get_ap_aging, get_revenue_by_period,
-- get_project_health, get_document_links...); these were missed. The
-- workspace id is not a secret -- it is in every request the app makes.
--
-- get_user_role derives identity from auth.uid(), so it cannot be
-- spoofed by passing a different p_actor_id.
--
-- The three stats functions were LANGUAGE sql and are converted to
-- plpgsql so they can raise; the queries themselves are unchanged.
CREATE OR REPLACE FUNCTION get_invoice_stats(p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN (
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
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_quotation_stats(p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN (
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
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_catalog_stats(p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN (
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
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_delivery_orders_for_invoice(
  p_invoice_id UUID, p_workspace_id UUID
)
RETURNS SETOF public.delivery_orders
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  SELECT * FROM public.delivery_orders
   WHERE invoice_id = p_invoice_id
     AND workspace_id = p_workspace_id
     AND deleted_at IS NULL
   ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_module_permissions(p_workspace_id UUID)
RETURNS SETOF public.role_module_permissions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  SELECT * FROM public.role_module_permissions
   WHERE workspace_id = p_workspace_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. A SECURITY DEFINER *write* with no permission check.
-- ---------------------------------------------------------------------
--
-- mark_next_scheduled_deliverables_posted had no role gate at all, and
-- selected rows by fulfillment_item_id alone -- p_workspace_id was used
-- only to label the activity and audit rows it wrote. So a caller could
-- name any fulfillment item in the database and mark another workspace's
-- deliverables posted, while the forged audit trail landed in their own.
--
-- Both are fixed: the role check matches every other mutating RPC, and
-- the row selection is scoped to the workspace being claimed.
CREATE OR REPLACE FUNCTION mark_next_scheduled_deliverables_posted(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_count INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deliverable RECORD;
  v_marked INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_count IS NULL OR p_count < 1 THEN
    RETURN 0;
  END IF;

  FOR v_deliverable IN
    SELECT id, title, project_id
    FROM public.fulfillment_deliverables
    WHERE fulfillment_item_id = p_fulfillment_item_id
      AND workspace_id = p_workspace_id
      AND status IN ('scheduled', 'in_progress')
      AND deleted_at IS NULL
    ORDER BY scheduled_date ASC NULLS LAST
    LIMIT p_count
  LOOP
    UPDATE public.fulfillment_deliverables
    SET status = 'posted', posted_at = now(), updated_at = now()
    WHERE id = v_deliverable.id;

    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'changed deliverable "' || v_deliverable.title || '" status to posted (from a manual delivery record)',
      'fulfillment_deliverable', v_deliverable.id, 'fulfillment_project', v_deliverable.project_id
    );
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', v_deliverable.id,
      jsonb_build_object('status', jsonb_build_object('old', 'scheduled', 'new', 'posted'))
    );

    v_marked := v_marked + 1;
  END LOOP;

  RETURN v_marked;
END;
$$;

NOTIFY pgrst, 'reload schema';
