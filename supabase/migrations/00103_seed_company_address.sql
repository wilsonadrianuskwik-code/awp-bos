-- Fills in the company's postal address so the new address line under the
-- document masthead has something to render.
--
-- The address is stored where Settings -> Company Profile already keeps it
-- (workspaces.settings -> company_profile -> address, the structured
-- line1/line2/city/state/postal_code shape from 00033), not as a string
-- baked into the print component -- correcting it later is then an edit in
-- the app rather than a deploy.
--
-- Split across the structured fields so it round-trips through that form
-- intact; formatCompanyAddress() rejoins them into the single line the
-- masthead shows:
--   JL TUANKU TAMBUSAI NO.303 C, RT 002, RW 003, WONOREJO,
--   MARPOYAN DAMAI, KOTA PEKANBARU, RIAU 28254
--
-- jsonb_set with create_missing on the nested path, rather than replacing
-- company_profile wholesale, so display_name/email/phone/tax_id and
-- anything else already set there survive untouched.
--
-- Idempotent: re-running writes the same value.

DO $$
DECLARE
  v_workspace_id UUID;
  v_profile      JSONB;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting company address seed';
  END IF;

  SELECT COALESCE(settings -> 'company_profile', '{}'::jsonb)
    INTO v_profile
    FROM public.workspaces
   WHERE id = v_workspace_id;

  v_profile := jsonb_set(
    v_profile,
    '{address}',
    jsonb_build_object(
      'line1',       'JL TUANKU TAMBUSAI NO.303 C, RT 002, RW 003',
      'line2',       'WONOREJO, MARPOYAN DAMAI',
      'city',        'KOTA PEKANBARU',
      'state',       'RIAU',
      'postal_code', '28254',
      'country',     ''
    ),
    true
  );

  UPDATE public.workspaces
     SET settings   = jsonb_set(COALESCE(settings, '{}'::jsonb),
                                '{company_profile}', v_profile, true),
         updated_at = now()
   WHERE id = v_workspace_id;
END $$;

NOTIFY pgrst, 'reload schema';
