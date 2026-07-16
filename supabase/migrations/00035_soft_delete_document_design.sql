-- Bugfix: deleting a document design or theme failed with
--   "new row violates row-level security policy for table document_templates"
--
-- Delete in this app is a soft delete (UPDATE ... SET deleted_at). The
-- theme/template tables' UPDATE policies use USING with no explicit
-- WITH CHECK, so Postgres re-evaluates USING as the WITH CHECK against
-- the soft-deleted row — a shape that produces a 42501 on the update.
--
-- Every other privileged, single-purpose workspace mutation in this
-- codebase already runs through a SECURITY DEFINER RPC that does its own
-- get_user_role check and bypasses RLS (update_company_profile,
-- update_workspace_settings). These two RPCs bring the theme/template
-- soft-deletes in line with that pattern: they sidestep the RLS UPDATE
-- edge case, return a clear message on a genuine authorization failure,
-- and enforce the built-in-protection rules (a design's is_default, a
-- theme's is_preset, "theme still in use") server-side rather than only
-- in the UI.

CREATE OR REPLACE FUNCTION soft_delete_document_template(
  p_workspace_id UUID,
  p_actor_id     UUID,
  p_template_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tpl public.document_templates%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete a design';
  END IF;

  SELECT * INTO v_tpl
  FROM public.document_templates
  WHERE id = p_template_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Design not found';
  END IF;

  IF v_tpl.is_default THEN
    RAISE EXCEPTION 'Cannot delete the default design. Set another design as default first.';
  END IF;

  UPDATE public.document_templates
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_template_id AND workspace_id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'deleted',
    'deleted document design "' || v_tpl.name || '"', 'document_template', p_template_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'delete', 'document_template', p_template_id, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION soft_delete_template_theme(
  p_workspace_id UUID,
  p_actor_id     UUID,
  p_theme_id     UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_theme public.template_themes%ROWTYPE;
  v_in_use INTEGER;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete a theme';
  END IF;

  SELECT * INTO v_theme
  FROM public.template_themes
  WHERE id = p_theme_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_theme.id IS NULL THEN
    RAISE EXCEPTION 'Theme not found';
  END IF;

  IF v_theme.is_preset THEN
    RAISE EXCEPTION 'Built-in themes can''t be deleted.';
  END IF;

  SELECT count(*) INTO v_in_use
  FROM public.document_templates
  WHERE theme_id = p_theme_id AND deleted_at IS NULL;

  IF v_in_use > 0 THEN
    RAISE EXCEPTION 'This theme is used by one or more designs. Remove it from those designs first.';
  END IF;

  UPDATE public.template_themes
  SET deleted_at = now()
  WHERE id = p_theme_id AND workspace_id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'deleted',
    'deleted theme "' || v_theme.name || '"', 'template_theme', p_theme_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'delete', 'template_theme', p_theme_id, NULL
  );
END;
$$;
