-- Construction BOS: company logo and approver signature on documents.
--
-- Documents currently print the workspace name as plain text and carry no
-- signature block, so every issued PDF has to be signed by hand. This adds
-- a storage bucket for the two images and the settings that describe the
-- signatory.

-- Public bucket: these images are embedded in customer- and
-- supplier-facing PDFs and the quotation/invoice portal, which are viewed
-- without a session, so signed URLs would break those pages. Nothing
-- confidential lives here — a logo and a signature graphic that already
-- appear on every document sent out.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding', 'branding', true, 2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Files are stored under <workspace_id>/..., so membership of the folder's
-- workspace is what grants write. Reads are open, matching the bucket.
DROP POLICY IF EXISTS "Anyone can view branding assets" ON storage.objects;
CREATE POLICY "Anyone can view branding assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admins can upload branding assets" ON storage.objects;
CREATE POLICY "Admins can upload branding assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding'
    AND public.get_user_role((storage.foldername(name))[1]::UUID) IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS "Admins can update branding assets" ON storage.objects;
CREATE POLICY "Admins can update branding assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding'
    AND public.get_user_role((storage.foldername(name))[1]::UUID) IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS "Admins can delete branding assets" ON storage.objects;
CREATE POLICY "Admins can delete branding assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding'
    AND public.get_user_role((storage.foldername(name))[1]::UUID) IN ('admin', 'owner')
  );

-- The logo lives on workspaces.logo_url (already present, never populated
-- by any UI until now). The signature block is workspace settings, so it
-- rides along in the existing settings JSONB under 'branding':
--
--   branding: {
--     tagline,                     -- pre-existing
--     signature_url,               -- storage public URL
--     signatory_name,              -- e.g. "Suhardjono"
--     signatory_title,             -- e.g. "Director"
--     signatory_company,           -- e.g. "PT. Andalan Warna Prima"
--     signature_label              -- e.g. "Approved by,"
--   }
--
-- 'branding' is already in update_workspace_settings' allowed-keys list
-- (00034), so no change is needed there.

-- Lets an admin set the logo without a general-purpose workspace update
-- path, and keeps the write role-checked in the same place as every other
-- mutation rather than relying on the storage policy alone.
CREATE OR REPLACE FUNCTION set_workspace_logo(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_logo_url TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace public.workspaces%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE public.workspaces
  SET logo_url = NULLIF(p_logo_url, ''), updated_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO v_workspace;

  IF v_workspace.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
    CASE WHEN NULLIF(p_logo_url, '') IS NULL THEN 'Removed company logo' ELSE 'Updated company logo' END,
    'workspace', p_workspace_id);

  RETURN to_jsonb(v_workspace);
END;
$$;
