-- Bulk delete in invoice-list-page.tsx/quotation-list-page.tsx/
-- catalog-list-page.tsx fans a selection out into N concurrent
-- Promise.all(...map(id => deleteX(id))) calls — each its own network
-- round-trip, transaction, and audit-log write. Fine for a handful of
-- rows, but selecting hundreds means hundreds of concurrent connections
-- hitting Postgres at once instead of one batched round-trip.
--
-- These RPCs do the same soft-delete + audit-log work as
-- delete_invoice/delete_quotation/deleteCatalogItem, just once per call
-- for a whole array of ids inside a single transaction. Skips ids that
-- don't exist/aren't in this workspace/are already deleted (same
-- ON-CONFLICT-shaped tolerance the single-item versions have via their
-- "not found" check) rather than aborting the whole batch.

CREATE FUNCTION bulk_delete_invoices(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_invoice_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_deleted_ids UUID[] := '{}';
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete invoices';
  END IF;

  FOREACH v_id IN ARRAY p_invoice_ids LOOP
    UPDATE public.invoices SET deleted_at = now()
    WHERE id = v_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

    IF FOUND THEN
      PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'invoice', v_id);
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
    'deleted_ids', to_jsonb(v_deleted_ids)
  );
END;
$$;

CREATE FUNCTION bulk_delete_quotations(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_quotation_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_deleted_ids UUID[] := '{}';
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete quotations';
  END IF;

  FOREACH v_id IN ARRAY p_quotation_ids LOOP
    UPDATE public.quotations SET deleted_at = now()
    WHERE id = v_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

    IF FOUND THEN
      PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'quotation', v_id);
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
    'deleted_ids', to_jsonb(v_deleted_ids)
  );
END;
$$;

CREATE FUNCTION bulk_delete_catalog_items(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_catalog_item_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_deleted_ids UUID[] := '{}';
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete catalog items';
  END IF;

  FOREACH v_id IN ARRAY p_catalog_item_ids LOOP
    UPDATE public.catalog_items SET deleted_at = now()
    WHERE id = v_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

    IF FOUND THEN
      PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'catalog_item', v_id);
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
    'deleted_ids', to_jsonb(v_deleted_ids)
  );
END;
$$;
