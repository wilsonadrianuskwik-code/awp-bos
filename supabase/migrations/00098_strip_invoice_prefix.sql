-- 00097 renamed migrated invoices from "PI ..." to "INV ...", but the
-- Type column already reads "Invoice" -- repeating it in the Number
-- column right next to that badge was redundant, not clarifying, and
-- inconsistent with how Purchase Order numbers already look (most carry
-- no "PO " prefix at all, just "AWP-P/..."). Strips the prefix entirely
-- instead, matching that convention.

DO $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting';
  END IF;


  UPDATE public.invoices SET invoice_number = 'AWP-P/02062026-204'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/02062026-204' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/02072026-208'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/02072026-208' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/03072026-209'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/03072026-209' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/06072026-210'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/06072026-210' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/06072026-211'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/06072026-211' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/06072026-212'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/06072026-212' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/08072026-213'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/08072026-213' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/11072026-214'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/11072026-214' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/14072026-215'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/14072026-215' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/16072026-216'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/16072026-216' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/17062026-205 Rev1'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/17062026-205 Rev1' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/19052026-201'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/19052026-201' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/19062026-206'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/19062026-206' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/20072026-217'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/20072026-217' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/21072026-218'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/21072026-218' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/24062026-207'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/24062026-207' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/24072026-219'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/24072026-219' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/29052026-202'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/29052026-202' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/29072026-220'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/29072026-220' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/29072026-221'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/29072026-221' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/30052026-203'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/30052026-203' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/30062026-206'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/30062026-206' AND deleted_at IS NULL;

  UPDATE public.invoices SET invoice_number = 'AWP-P/30062026-207'
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV AWP-P/30062026-207' AND deleted_at IS NULL;

END $$;

NOTIFY pgrst, 'reload schema';
