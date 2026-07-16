-- Phase 13 Pivot: Document Management System.
--
-- Generic RPC for updating any section of the workspaces.settings JSONB
-- column. Replaces the per-section-RPC pattern (update_company_profile)
-- with a single function that accepts a section key + value, validated
-- against a whitelist. Keeps the same atomic jsonb_set + activity/audit
-- logging pattern.

CREATE OR REPLACE FUNCTION update_workspace_settings(
  p_workspace_id UUID,
  p_actor_id     UUID,
  p_section_key  TEXT,
  p_section_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.workspaces%ROWTYPE;
  v_allowed_keys TEXT[] := ARRAY['company_profile', 'payment_details', 'default_terms', 'branding'];
BEGIN
  IF NOT (p_section_key = ANY(v_allowed_keys)) THEN
    RAISE EXCEPTION 'Invalid settings section: %', p_section_key;
  END IF;

  IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update workspace settings';
  END IF;

  SELECT * INTO v_old FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  UPDATE public.workspaces
  SET settings = jsonb_set(settings, ARRAY[p_section_key], p_section_value, true),
      updated_at = now()
  WHERE id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated ' || replace(p_section_key, '_', ' '), 'workspace', p_workspace_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace', p_workspace_id,
    jsonb_build_object(p_section_key, jsonb_build_object(
      'old', v_old.settings->p_section_key,
      'new', p_section_value
    ))
  );

  RETURN (SELECT to_jsonb(w) FROM public.workspaces w WHERE w.id = p_workspace_id);
END;
$$;
