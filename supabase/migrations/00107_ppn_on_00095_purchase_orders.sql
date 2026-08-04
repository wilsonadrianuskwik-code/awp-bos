-- Applies PPN to the 104 purchase orders imported by 00095.
--
-- WHY THEY HAD NONE
-- 00095's purchase_orders INSERTs never set ppn_percent, so all 104 got
-- the column default of NULL -- which since 00088 means "no PPN on this
-- document", deliberately distinct from 0. Both suppliers in the import
-- (Nippon Paint Pekanbaru, PT SUMINSURYA MESINDOLESTARI) are PKP
-- companies whose invoices carry PPN, so the omission was the import's,
-- not the source documents'.
--
-- SEVEN WERE WORSE THAN MISSING
-- PO AWP-P/07052025-23, -63, -71, -35, -37, -19 and -56 were imported
-- with a non-zero tax_amount (exactly 11% of subtotal) baked into their
-- stored total, but still ppn_percent NULL and ppn_amount 0. So the
-- stored total already included tax the totals block would not print,
-- and the next recompute of those rows -- triggered by any edit -- would
-- silently drop it. Applying the standard treatment below reproduces
-- each of their stored totals to the rupiah, so this fixes the
-- inconsistency without moving any money. Verified against all seven.
--
-- TWO TAX REGIMES, BY DOCUMENT DATE
-- The 99 POs dated 2025-2026 get the current regime: PPN 12% on an 11/12
-- DPP, an effective 11% of harga jual.
--
-- The 5 dated 2024 predate PMK 131/2024, which took effect 1 January
-- 2025. In 2024 PPN was 11% of the full DPP, so they get ppn_percent 11
-- with a 1/1 fraction and show_dpp false -- printing "DPP 1/1" on a 2024
-- document would state a rule that did not exist yet. The arithmetic
-- lands on the same effective 11% either way; what differs is what the
-- document says about itself.
--
-- WHAT CHANGES
-- Per instruction, the stored amounts are the price before PPN, so PPN
-- is added on top and totals rise -- unlike the two Pak Dhani invoices
-- in 00105, whose prices already included it. Purchase orders record no
-- payment (no amount_paid column), so there is nothing to re-tally the
-- way 00105 had to for invoices.
--
-- Totals come from recompute_purchase_order_totals() (00088), the same
-- function the app uses when anyone edits a PO, so these rows cannot
-- disagree with what the app would recompute. It derives subtotal from
-- the line items rather than trusting the stored column.
--
-- SCOPE
-- Strictly the 104 PO numbers 00095 created, listed literally -- not
-- "POs dated before X", which would also sweep up POs created in the app
-- since.
--
-- Idempotent: recompute derives everything from the line items, so
-- re-running lands on the same figures rather than compounding.

DO $$
DECLARE
  v_workspace_id UUID;
  -- Dated 2024: PPN 11% of the full DPP (pre-PMK-131/2024).
  v_2024 TEXT[] := ARRAY[
    'AWP-P/09122024-03', 'AWP-P/10122024-05', 'AWP-P/11112024-02',
    'AWP-P/17122024-06', 'AWP-P/31102024-01'
  ];
  -- Dated 2025-2026: PPN 12% on an 11/12 DPP.
  v_2025 TEXT[] := ARRAY[
    'AWP-P/08012025-10', 'PO 001/07042026', 'PO AWP-P/01072026-93',
    'PO AWP-P/01082025-43', 'PO AWP-P/01092025-60',
    'PO AWP-P/02022026-76', 'PO AWP-P/02042026-78',
    'PO AWP-P/02072025-32', 'PO AWP-P/02072026-94',
    'PO AWP-P/02092025-61', 'PO AWP-P/02112025-70',
    'PO AWP-P/03072026-95', 'PO AWP-P/04072025-33',
    'PO AWP-P/04072026-96', 'PO AWP-P/05062026-87',
    'PO AWP-P/05082025-44', 'PO AWP-P/05092025-62',
    'PO AWP-P/06052026-82', 'PO AWP-P/06072026-97',
    'PO AWP-P/06072026-98', 'PO AWP-P/07052025-23',
    'PO AWP-P/07082025-45', 'PO AWP-P/08052025-24',
    'PO AWP-P/08052025-25', 'PO AWP-P/08072025-34',
    'PO AWP-P/08072026-99', 'PO AWP-P/08082025-46',
    'PO AWP-P/08092025-63', 'PO AWP-P/08112025-71',
    'PO AWP-P/09082025-47', 'PO AWP-P/09122025-73',
    'PO AWP-P/10072025-35', 'PO AWP-P/11062025-28',
    'PO AWP-P/12032025-16', 'PO AWP-P/12032025-17',
    'PO AWP-P/13022025-11', 'PO AWP-P/13022025-12',
    'PO AWP-P/13022025-13', 'PO AWP-P/13072026-100',
    'PO AWP-P/13072026-101', 'PO AWP-P/13082025-48',
    'PO AWP-P/13092025-64', 'PO AWP-P/14012026-74',
    'PO AWP-P/14072026-102', 'PO AWP-P/15052026-83',
    'PO AWP-P/16082025-49', 'PO AWP-P/17062026-88 REV1',
    'PO AWP-P/18062025-29', 'PO AWP-P/19032025-18',
    'PO AWP-P/19052026-84rev1', 'PO AWP-P/19072025-37',
    'PO AWP-P/19072026-89', 'PO AWP-P/19082025-50',
    'PO AWP-P/20072026-103', 'PO AWP-P/20082025-51',
    'PO AWP-P/20102025-68', 'PO AWP-P/21052026-85rev1',
    'PO AWP-P/21072025-38', 'PO AWP-P/21072026-104',
    'PO AWP-P/22052025-26', 'PO AWP-P/22052025-27',
    'PO AWP-P/22072025-39', 'PO AWP-P/22102025-69',
    'PO AWP-P/23072026-105', 'PO AWP-P/23082025-52',
    'PO AWP-P/23092025-65', 'PO AWP-P/24032025-15',
    'PO AWP-P/24042025-19', 'PO AWP-P/24072025-40',
    'PO AWP-P/24072026-106', 'PO AWP-P/25042025-20',
    'PO AWP-P/25062025-30', 'PO AWP-P/25062025-31',
    'PO AWP-P/25072026-90', 'PO AWP-P/25082025-53',
    'PO AWP-P/26042025-21', 'PO AWP-P/26082025-54',
    'PO AWP-P/26092025-66', 'PO AWP-P/27042026-79 Revisi',
    'PO AWP-P/27042026-80', 'PO AWP-P/27082025-55',
    'PO AWP-P/27082025-56', 'PO AWP-P/27112025-72',
    'PO AWP-P/28012026-75', 'PO AWP-P/28022025-14',
    'PO AWP-P/28042025-22', 'PO AWP-P/28082025-57',
    'PO AWP-P/29052026-86', 'PO AWP-P/29062026-91REV2',
    'PO AWP-P/29072025-41', 'PO AWP-P/29072026-107',
    'PO AWP-P/29072026-108', 'PO AWP-P/29082025-58',
    'PO AWP-P/29092025-67', 'PO AWP-P/30042026-81',
    'PO AWP-P/30062026-92', 'PO AWP-P/30072025-42',
    'PO AWP-P/30082025-59', 'PO AWP-P/31032026-77'
  ];
  v_id UUID;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting PO PPN correction';
  END IF;

  FOR v_id IN
    SELECT id FROM public.purchase_orders
     WHERE workspace_id = v_workspace_id
       AND po_number = ANY(v_2024)
       AND deleted_at IS NULL
  LOOP
    UPDATE public.purchase_orders
       SET ppn_percent     = 11,
           dpp_numerator   = 1,
           dpp_denominator = 1,
           show_dpp        = false,
           updated_at      = now()
     WHERE id = v_id;
    PERFORM public.recompute_purchase_order_totals(v_id);
  END LOOP;

  FOR v_id IN
    SELECT id FROM public.purchase_orders
     WHERE workspace_id = v_workspace_id
       AND po_number = ANY(v_2025)
       AND deleted_at IS NULL
  LOOP
    UPDATE public.purchase_orders
       SET ppn_percent     = 12,
           dpp_numerator   = 11,
           dpp_denominator = 12,
           show_dpp        = true,
           updated_at      = now()
     WHERE id = v_id;
    PERFORM public.recompute_purchase_order_totals(v_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
