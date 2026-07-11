-- Lets staff invalidate a leaked/expired invoice portal link and issue a
-- new one, mirroring regenerate_quotation_share_token (00016).
CREATE OR REPLACE FUNCTION regenerate_invoice_share_token(
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
  v_new_token UUID := gen_random_uuid();
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to regenerate this invoice''s share link';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  UPDATE public.invoices
  SET share_token = v_new_token, updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'regenerated the portal link for invoice ' || v_old.invoice_number, 'invoice', p_invoice_id
  );
  -- Do not persist actual token values in the audit trail, even though
  -- audit_logs is admin-only — just record that a rotation happened.
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id,
    jsonb_build_object('share_token_regenerated', jsonb_build_object('old', true, 'new', true))
  );

  RETURN jsonb_build_object('id', p_invoice_id, 'share_token', v_new_token);
END;
$$;
