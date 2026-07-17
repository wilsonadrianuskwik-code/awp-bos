-- Bulk delete requirement: status must never prevent deletion (invoices in
-- any of draft/sent/paid/cancelled/etc., quotations in any of
-- draft/sent/approved/rejected/expired/etc. must all be deletable). Both
-- delete_invoice and delete_quotation previously rejected non-draft (and,
-- for quotations, non-cancelled) rows with an exception — that restriction
-- is removed here. Everything else (permission check, soft delete via
-- deleted_at, audit log) is unchanged.

CREATE OR REPLACE FUNCTION delete_invoice(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.invoices%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  UPDATE public.invoices SET deleted_at = now() WHERE id = p_invoice_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'invoice', p_invoice_id);

  RETURN jsonb_build_object('success', true, 'id', p_invoice_id);
END;
$$;

CREATE OR REPLACE FUNCTION delete_quotation(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.quotations%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this quotation';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  UPDATE public.quotations SET deleted_at = now() WHERE id = p_quotation_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'quotation', p_quotation_id);

  RETURN jsonb_build_object('success', true, 'id', p_quotation_id);
END;
$$;
