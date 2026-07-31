-- 00095_import_historical_data.sql and 00096_backfill_historical_payments.sql
-- had the same created_at bug as 00100 originally did: none of their
-- INSERT statements listed created_at, so every row silently took the
-- column's own DEFAULT now() -- 23 invoices, 104 purchase orders, their
-- 269 line items, and 23 backfilled payments were all stamped with
-- whenever those two migrations happened to run, not the historical date
-- each row actually represents.
--
-- Both source migrations have been fixed at the file level (via
-- scripts/fix_00095_created_at.py, run once and its edits committed
-- directly into 00095/00096 -- there was no prior generator for these two,
-- unlike 00100) so a fresh apply gets this right from the start. This
-- migration is the one-time correction for rows already written to
-- production by the pre-fix versions.
--
-- Unlike 00100/00101, these two migrations never tagged their rows with a
-- custom_fields marker, so the correction is scoped by the exact
-- invoice_number / po_number literals that exist TODAY, after the full
-- migration chain -- not as 00095 originally inserted them. This matters
-- for invoices specifically: 00098_strip_invoice_prefix.sql renames all 23
-- of them ("INV AWP-P/..." -> "AWP-P/...") after 00095 runs, so matching
-- on 00095's own as-inserted literals would silently match zero rows by
-- the time this migration runs. The invoice_number list below is 00098's
-- own SET targets (the current, post-rename values); po_number is never
-- renamed anywhere in this codebase, so 00095's original literals are
-- still correct for purchase_orders.
--
-- Rule, same as 00101: created_at becomes midnight, Asia/Jakarta, on the
-- date the row represents -- issue_date for invoices/purchase_orders and
-- whatever their line_items inherit from the parent, payment_date for
-- payments. Idempotent: only rows not already correct are touched.

DO $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting created_at correction';
  END IF;

  UPDATE public.invoices
  SET created_at = (issue_date::timestamp AT TIME ZONE 'Asia/Jakarta')
  WHERE workspace_id = v_workspace_id
    AND invoice_number IN (
  'AWP-P/02062026-204', 'AWP-P/02072026-208', 'AWP-P/03072026-209', 'AWP-P/06072026-210',
  'AWP-P/06072026-211', 'AWP-P/06072026-212', 'AWP-P/08072026-213', 'AWP-P/11072026-214',
  'AWP-P/14072026-215', 'AWP-P/16072026-216', 'AWP-P/17062026-205 Rev1', 'AWP-P/19052026-201',
  'AWP-P/19062026-206', 'AWP-P/20072026-217', 'AWP-P/21072026-218', 'AWP-P/24062026-207',
  'AWP-P/24072026-219', 'AWP-P/29052026-202', 'AWP-P/29072026-220', 'AWP-P/29072026-221',
  'AWP-P/30052026-203', 'AWP-P/30062026-206', 'AWP-P/30062026-207'
    )
    AND created_at IS DISTINCT FROM (issue_date::timestamp AT TIME ZONE 'Asia/Jakarta');

  UPDATE public.purchase_orders
  SET created_at = (issue_date::timestamp AT TIME ZONE 'Asia/Jakarta')
  WHERE workspace_id = v_workspace_id
    AND po_number IN (
  'AWP-P/08012025-10', 'AWP-P/09122024-03', 'AWP-P/10122024-05', 'AWP-P/11112024-02',
  'AWP-P/17122024-06', 'AWP-P/31102024-01', 'PO 001/07042026', 'PO AWP-P/01072026-93',
  'PO AWP-P/01082025-43', 'PO AWP-P/01092025-60', 'PO AWP-P/02022026-76', 'PO AWP-P/02042026-78',
  'PO AWP-P/02072025-32', 'PO AWP-P/02072026-94', 'PO AWP-P/02092025-61', 'PO AWP-P/02112025-70',
  'PO AWP-P/03072026-95', 'PO AWP-P/04072025-33', 'PO AWP-P/04072026-96', 'PO AWP-P/05062026-87',
  'PO AWP-P/05082025-44', 'PO AWP-P/05092025-62', 'PO AWP-P/06052026-82', 'PO AWP-P/06072026-97',
  'PO AWP-P/06072026-98', 'PO AWP-P/07052025-23', 'PO AWP-P/07082025-45', 'PO AWP-P/08052025-24',
  'PO AWP-P/08052025-25', 'PO AWP-P/08072025-34', 'PO AWP-P/08072026-99', 'PO AWP-P/08082025-46',
  'PO AWP-P/08092025-63', 'PO AWP-P/08112025-71', 'PO AWP-P/09082025-47', 'PO AWP-P/09122025-73',
  'PO AWP-P/10072025-35', 'PO AWP-P/11062025-28', 'PO AWP-P/12032025-16', 'PO AWP-P/12032025-17',
  'PO AWP-P/13022025-11', 'PO AWP-P/13072026-100', 'PO AWP-P/13072026-101', 'PO AWP-P/13082025-48',
  'PO AWP-P/13092025-64', 'PO AWP-P/14012026-74', 'PO AWP-P/14072026-102', 'PO AWP-P/15052026-83',
  'PO AWP-P/16082025-49', 'PO AWP-P/17062026-88 REV1', 'PO AWP-P/18062025-29', 'PO AWP-P/19032025-18',
  'PO AWP-P/19052026-84rev1', 'PO AWP-P/19072025-37', 'PO AWP-P/19072026-89', 'PO AWP-P/19082025-50',
  'PO AWP-P/20072026-103', 'PO AWP-P/20082025-51', 'PO AWP-P/20102025-68', 'PO AWP-P/21052026-85rev1',
  'PO AWP-P/21072025-38', 'PO AWP-P/21072026-104', 'PO AWP-P/22052025-26', 'PO AWP-P/22052025-27',
  'PO AWP-P/22072025-39', 'PO AWP-P/22102025-69', 'PO AWP-P/23072026-105', 'PO AWP-P/23082025-52',
  'PO AWP-P/23092025-65', 'PO AWP-P/24032025-15', 'PO AWP-P/24042025-19', 'PO AWP-P/24072025-40',
  'PO AWP-P/24072026-106', 'PO AWP-P/25042025-20', 'PO AWP-P/25062025-30', 'PO AWP-P/25062025-31',
  'PO AWP-P/25072026-90', 'PO AWP-P/25082025-53', 'PO AWP-P/26042025-21', 'PO AWP-P/26082025-54',
  'PO AWP-P/26092025-66', 'PO AWP-P/27042026-79 Revisi', 'PO AWP-P/27042026-80', 'PO AWP-P/27082025-55',
  'PO AWP-P/27082025-56', 'PO AWP-P/27112025-72', 'PO AWP-P/28012026-75', 'PO AWP-P/13022025-12',
  'PO AWP-P/13022025-13', 'PO AWP-P/28022025-14', 'PO AWP-P/28042025-22', 'PO AWP-P/28082025-57',
  'PO AWP-P/29052026-86', 'PO AWP-P/29062026-91REV2', 'PO AWP-P/29072025-41', 'PO AWP-P/29072026-107',
  'PO AWP-P/29072026-108', 'PO AWP-P/29082025-58', 'PO AWP-P/29092025-67', 'PO AWP-P/30042026-81',
  'PO AWP-P/30062026-92', 'PO AWP-P/30072025-42', 'PO AWP-P/30082025-59', 'PO AWP-P/31032026-77'
    )
    AND created_at IS DISTINCT FROM (issue_date::timestamp AT TIME ZONE 'Asia/Jakarta');

  UPDATE public.line_items li
  SET created_at = (i.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta')
  FROM public.invoices i
  WHERE li.entity_type = 'invoice'
    AND li.entity_id = i.id
    AND i.workspace_id = v_workspace_id
    AND i.invoice_number IN (
  'AWP-P/02062026-204', 'AWP-P/02072026-208', 'AWP-P/03072026-209', 'AWP-P/06072026-210',
  'AWP-P/06072026-211', 'AWP-P/06072026-212', 'AWP-P/08072026-213', 'AWP-P/11072026-214',
  'AWP-P/14072026-215', 'AWP-P/16072026-216', 'AWP-P/17062026-205 Rev1', 'AWP-P/19052026-201',
  'AWP-P/19062026-206', 'AWP-P/20072026-217', 'AWP-P/21072026-218', 'AWP-P/24062026-207',
  'AWP-P/24072026-219', 'AWP-P/29052026-202', 'AWP-P/29072026-220', 'AWP-P/29072026-221',
  'AWP-P/30052026-203', 'AWP-P/30062026-206', 'AWP-P/30062026-207'
    )
    AND li.created_at IS DISTINCT FROM (i.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta');

  UPDATE public.line_items li
  SET created_at = (p.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta')
  FROM public.purchase_orders p
  WHERE li.entity_type = 'purchase_order'
    AND li.entity_id = p.id
    AND p.workspace_id = v_workspace_id
    AND p.po_number IN (
  'AWP-P/08012025-10', 'AWP-P/09122024-03', 'AWP-P/10122024-05', 'AWP-P/11112024-02',
  'AWP-P/17122024-06', 'AWP-P/31102024-01', 'PO 001/07042026', 'PO AWP-P/01072026-93',
  'PO AWP-P/01082025-43', 'PO AWP-P/01092025-60', 'PO AWP-P/02022026-76', 'PO AWP-P/02042026-78',
  'PO AWP-P/02072025-32', 'PO AWP-P/02072026-94', 'PO AWP-P/02092025-61', 'PO AWP-P/02112025-70',
  'PO AWP-P/03072026-95', 'PO AWP-P/04072025-33', 'PO AWP-P/04072026-96', 'PO AWP-P/05062026-87',
  'PO AWP-P/05082025-44', 'PO AWP-P/05092025-62', 'PO AWP-P/06052026-82', 'PO AWP-P/06072026-97',
  'PO AWP-P/06072026-98', 'PO AWP-P/07052025-23', 'PO AWP-P/07082025-45', 'PO AWP-P/08052025-24',
  'PO AWP-P/08052025-25', 'PO AWP-P/08072025-34', 'PO AWP-P/08072026-99', 'PO AWP-P/08082025-46',
  'PO AWP-P/08092025-63', 'PO AWP-P/08112025-71', 'PO AWP-P/09082025-47', 'PO AWP-P/09122025-73',
  'PO AWP-P/10072025-35', 'PO AWP-P/11062025-28', 'PO AWP-P/12032025-16', 'PO AWP-P/12032025-17',
  'PO AWP-P/13022025-11', 'PO AWP-P/13072026-100', 'PO AWP-P/13072026-101', 'PO AWP-P/13082025-48',
  'PO AWP-P/13092025-64', 'PO AWP-P/14012026-74', 'PO AWP-P/14072026-102', 'PO AWP-P/15052026-83',
  'PO AWP-P/16082025-49', 'PO AWP-P/17062026-88 REV1', 'PO AWP-P/18062025-29', 'PO AWP-P/19032025-18',
  'PO AWP-P/19052026-84rev1', 'PO AWP-P/19072025-37', 'PO AWP-P/19072026-89', 'PO AWP-P/19082025-50',
  'PO AWP-P/20072026-103', 'PO AWP-P/20082025-51', 'PO AWP-P/20102025-68', 'PO AWP-P/21052026-85rev1',
  'PO AWP-P/21072025-38', 'PO AWP-P/21072026-104', 'PO AWP-P/22052025-26', 'PO AWP-P/22052025-27',
  'PO AWP-P/22072025-39', 'PO AWP-P/22102025-69', 'PO AWP-P/23072026-105', 'PO AWP-P/23082025-52',
  'PO AWP-P/23092025-65', 'PO AWP-P/24032025-15', 'PO AWP-P/24042025-19', 'PO AWP-P/24072025-40',
  'PO AWP-P/24072026-106', 'PO AWP-P/25042025-20', 'PO AWP-P/25062025-30', 'PO AWP-P/25062025-31',
  'PO AWP-P/25072026-90', 'PO AWP-P/25082025-53', 'PO AWP-P/26042025-21', 'PO AWP-P/26082025-54',
  'PO AWP-P/26092025-66', 'PO AWP-P/27042026-79 Revisi', 'PO AWP-P/27042026-80', 'PO AWP-P/27082025-55',
  'PO AWP-P/27082025-56', 'PO AWP-P/27112025-72', 'PO AWP-P/28012026-75', 'PO AWP-P/13022025-12',
  'PO AWP-P/13022025-13', 'PO AWP-P/28022025-14', 'PO AWP-P/28042025-22', 'PO AWP-P/28082025-57',
  'PO AWP-P/29052026-86', 'PO AWP-P/29062026-91REV2', 'PO AWP-P/29072025-41', 'PO AWP-P/29072026-107',
  'PO AWP-P/29072026-108', 'PO AWP-P/29082025-58', 'PO AWP-P/29092025-67', 'PO AWP-P/30042026-81',
  'PO AWP-P/30062026-92', 'PO AWP-P/30072025-42', 'PO AWP-P/30082025-59', 'PO AWP-P/31032026-77'
    )
    AND li.created_at IS DISTINCT FROM (p.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta');

  UPDATE public.payments
  SET created_at = (payment_date::timestamp AT TIME ZONE 'Asia/Jakarta')
  WHERE workspace_id = v_workspace_id
    AND notes = 'Backfilled from historical import (00095) -- payment date assumed = issue date.'
    AND created_at IS DISTINCT FROM (payment_date::timestamp AT TIME ZONE 'Asia/Jakarta');
END $$;
