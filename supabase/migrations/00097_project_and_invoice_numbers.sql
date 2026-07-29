-- Tags every document imported by 00095 to one catch-all project, and
-- renames migrated invoices so their number reads like an invoice
-- instead of carrying the old Proforma Invoice "PI" prefix.

DO $$
DECLARE
  v_workspace_id UUID;
  v_actor_id     UUID;
  v_project_id   UUID;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting';
  END IF;

  SELECT id INTO v_actor_id FROM auth.users WHERE email = 'wilsonadrianuskwik@gmail.com';
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User wilsonadrianuskwik@gmail.com not found -- aborting';
  END IF;

  -- ---------------------------------------------------------------
  -- Project: all migrated historical documents belong here.
  -- ---------------------------------------------------------------
  SELECT id INTO v_project_id FROM public.projects
    WHERE workspace_id = v_workspace_id AND code = 'PS' AND deleted_at IS NULL;

  IF v_project_id IS NULL THEN
    INSERT INTO public.projects (workspace_id, code, name, status, created_by)
    VALUES (v_workspace_id, 'PS', 'Paint Supplying', 'active', v_actor_id)
    RETURNING id INTO v_project_id;
  END IF;

  -- ---------------------------------------------------------------
  -- Purchase Orders
  -- ---------------------------------------------------------------

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/08012025-10' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/09122024-03' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/10122024-05' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/11112024-02' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/17122024-06' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/31102024-01' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO 001/07042026' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/01072026-93' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/01082025-43' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/01092025-60' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02022026-76' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02042026-78' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02072025-32' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02072026-94' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02092025-61' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02112025-70' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/03072026-95' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/04072025-33' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/04072026-96' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/05062026-87' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/05082025-44' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/05092025-62' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/06052026-82' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/06072026-97' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/06072026-98' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/07052025-23' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/07082025-45' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08052025-24' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08052025-25' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08072025-34' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08072026-99' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08082025-46' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08092025-63' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08112025-71' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/09082025-47' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/09122025-73' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/10072025-35' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/11062025-28' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/12032025-16' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/12032025-17' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13022025-11' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13072026-100' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13072026-101' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13082025-48' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13092025-64' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/14012026-74' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/14072026-102' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/15052026-83' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/16082025-49' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/17062026-88 REV1' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/18062025-29' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19032025-18' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19052026-84rev1' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19072025-37' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19072026-89' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19082025-50' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/20072026-103' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/20082025-51' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/20102025-68' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/21052026-85rev1' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/21072025-38' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/21072026-104' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22052025-26' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22052025-27' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22072025-39' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22102025-69' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/23072026-105' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/23082025-52' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/23092025-65' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24032025-15' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24042025-19' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24072025-40' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24072026-106' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25042025-20' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25062025-30' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25062025-31' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25072026-90' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25082025-53' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/26042025-21' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/26082025-54' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/26092025-66' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27042026-79 Revisi' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27042026-80' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27082025-55' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27082025-56' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27112025-72' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28012026-75' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13022025-12' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13022025-13' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28022025-14' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28042025-22' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28082025-57' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29052026-86' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29062026-91REV2' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29072025-41' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29072026-107' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29072026-108' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29082025-58' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29092025-67' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30042026-81' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30062026-92' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30072025-42' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30082025-59' AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET project_id = v_project_id
    WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/31032026-77' AND deleted_at IS NULL;

  -- ---------------------------------------------------------------
  -- Invoices: tag to the project, and rename PI-prefixed numbers so
  -- they read as invoice numbers.
  -- ---------------------------------------------------------------

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/02062026-204'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/02062026-204' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/02072026-208'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/02072026-208' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/03072026-209'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/03072026-209' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/06072026-210'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-210' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/06072026-211'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-211' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/06072026-212'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-212' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/08072026-213'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/08072026-213' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/11072026-214'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/11072026-214' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/14072026-215'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/14072026-215' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/16072026-216'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/16072026-216' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/17062026-205 Rev1'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/17062026-205 Rev1' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/19052026-201'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/19052026-201' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/19062026-206'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/19062026-206' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/20072026-217'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/20072026-217' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/21072026-218'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/21072026-218' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/24062026-207'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/24062026-207' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/24072026-219'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/24072026-219' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/29052026-202'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29052026-202' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/29072026-220'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29072026-220' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/29072026-221'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29072026-221' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/30052026-203'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30052026-203' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/30062026-206'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30062026-206' AND deleted_at IS NULL;

  UPDATE public.invoices SET project_id = v_project_id, invoice_number = 'INV AWP-P/30062026-207'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30062026-207' AND deleted_at IS NULL;

END $$;

NOTIFY pgrst, 'reload schema';
