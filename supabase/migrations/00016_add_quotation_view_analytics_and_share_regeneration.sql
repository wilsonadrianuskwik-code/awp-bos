-- View analytics: distinct from first_viewed_at (which gates the one-time
-- sent -> viewed transition + activity log entry). view_count/last_viewed_at
-- track every subsequent portal visit without spamming the activity log.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

-- Extend record_quotation_first_view: always bump view_count/last_viewed_at,
-- but only run the first-view side effects (status transition, activity +
-- audit log) the first time.
CREATE OR REPLACE FUNCTION record_quotation_first_view(p_share_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.quotations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.quotations
  WHERE share_token = p_share_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_row.first_viewed_at IS NULL THEN
    UPDATE public.quotations
    SET first_viewed_at = now(),
        last_viewed_at = now(),
        view_count = view_count + 1,
        status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        updated_at = now()
    WHERE id = v_row.id;

    PERFORM public.log_activity(
      v_row.workspace_id, NULL, 'customer', 'viewed',
      'customer viewed quotation ' || v_row.quotation_number, 'quotation', v_row.id
    );
    IF v_row.status = 'sent' THEN
      PERFORM public.log_audit_entry(
        v_row.workspace_id, NULL, 'customer', 'update', 'quotation', v_row.id,
        jsonb_build_object('status', jsonb_build_object('old', 'sent', 'new', 'viewed'))
      );
    END IF;
  ELSE
    UPDATE public.quotations
    SET last_viewed_at = now(),
        view_count = view_count + 1
    WHERE id = v_row.id;
  END IF;

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_row.id);
END;
$$;

-- Regenerating the share link immediately invalidates the old one: any
-- request bearing the previous token no longer matches any row.
CREATE OR REPLACE FUNCTION regenerate_quotation_share_token(
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
  v_new_token UUID := gen_random_uuid();
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to regenerate this quotation''s share link';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  UPDATE public.quotations
  SET share_token = v_new_token, updated_at = now()
  WHERE id = p_quotation_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'regenerated the portal link for quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  -- Do not persist actual token values in the audit trail, even though
  -- audit_logs is admin-only — just record that a rotation happened.
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id,
    jsonb_build_object('share_token_regenerated', jsonb_build_object('old', true, 'new', true))
  );

  RETURN jsonb_build_object('id', p_quotation_id, 'share_token', v_new_token);
END;
$$;
