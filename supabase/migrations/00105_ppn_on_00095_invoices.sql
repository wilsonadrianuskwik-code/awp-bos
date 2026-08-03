-- Applies PPN 12% to the 23 invoices imported by 00095, and re-tallies
-- what was recorded as paid against them.
--
-- WHY THEY HAD NO PPN
-- 00095 imported these from extracted PDF/DOCX originals whose totals
-- carried no tax line, so it wrote ppn_percent NULL — which since 00088
-- means "no PPN on this document", deliberately distinct from 0 ("PPN
-- charged at zero"). That faithfully reproduced the extracted source
-- rather than inventing a tax; the source itself was what omitted it.
-- These invoices should have carried PPN, so it is applied here.
--
-- WHAT CHANGES
-- ppn_percent 12 against the DPP 11/12 base already on the rows (the
-- 2025-onward regime, and every one of these is dated 2026), giving an
-- effective 11% of harga jual. PPH and retensi stay NULL — the source
-- stated neither and none is being invented.
--
-- The arithmetic is not written out here: recompute_invoice_totals()
-- (00088) is called instead, so these rows are totalled by exactly the
-- same function the app uses when anyone edits an invoice. Hardcoding
-- the figures would risk them disagreeing with what the app would
-- recompute the moment one of these is opened and saved.
--
-- THE TWO PAK DHANI / MASJID AL HIJRAH INVOICES ARE DIFFERENT
-- AWP-P/06072026-211 and AWP-P/08072026-213 were quoted at prices that
-- already included PPN, so their stored totals are gross, not harga
-- jual. Adding 11% on top of them the way the other 21 are treated
-- would overstate both the invoice and what was actually received.
-- Instead the PPN is separated out of the price: each unit price is
-- divided by 1.11 to recover the ex-PPN figure, and PPN is then applied
-- on top, landing back on the same gross the client paid. The money
-- does not move; only its split between harga jual and PPN appears.
--
-- 1.11 is the divisor because PPN 12% on an 11/12 DPP is exactly 11% of
-- harga jual — the same effective rate the other 21 get, just worked
-- backwards.
--
-- Guarded by ppn_percent IS NULL rather than by matching the old prices,
-- so a second run cannot divide an already-divided price again.
--
-- One rupiah cent of rounding on -213: its single line is 2 PAIL, and
-- the exact ex-PPN unit price is 1,315,315.315 — a third decimal
-- NUMERIC(15,2) cannot hold. Rounding the unit to 1,315,315.32 makes
-- the total 2,920,000.01 rather than 2,920,000. Preferred over splitting
-- the line into two 1-PAIL rows to absorb the cent, which would make
-- the printed invoice differ from the original document; a hundredth of
-- a rupiah is below the smallest unit of the currency and displays as
-- Rp 2,920,000 everywhere in the app.
--
-- amount_paid is raised to the new total, per instruction that the paid
-- figure should tally with the post-PPN amount, and the matching
-- payment row from 00096 is raised with it. Both, not just the invoice
-- column: amount_paid that disagrees with the sum of its own payments
-- makes the Payments ledger and the invoice contradict each other.
-- These are all status 'paid' and stay fully paid.
--
-- SCOPE
-- Strictly the 23 invoice numbers 00095 created, listed literally. Not
-- "invoices without an import marker" or "invoices dated 2026" — either
-- would also sweep up real invoices created in the app since. The
-- numbers are the current, post-00098 ones (00098 renamed all 23 from
-- "INV AWP-P/..." to "AWP-P/..." after 00095 inserted them).
--
-- Idempotent: re-running recomputes the same totals and re-sets the same
-- amounts.

DO $$
DECLARE
  v_workspace_id UUID;
  v_numbers      TEXT[] := ARRAY[
    'AWP-P/02062026-204', 'AWP-P/02072026-208', 'AWP-P/03072026-209',
    'AWP-P/06072026-210', 'AWP-P/06072026-211', 'AWP-P/06072026-212',
    'AWP-P/08072026-213', 'AWP-P/11072026-214', 'AWP-P/14072026-215',
    'AWP-P/16072026-216', 'AWP-P/17062026-205 Rev1', 'AWP-P/19052026-201',
    'AWP-P/19062026-206', 'AWP-P/20072026-217', 'AWP-P/21072026-218',
    'AWP-P/24062026-207', 'AWP-P/24072026-219', 'AWP-P/29052026-202',
    'AWP-P/29072026-220', 'AWP-P/29072026-221', 'AWP-P/30052026-203',
    'AWP-P/30062026-206', 'AWP-P/30062026-207'
  ];
  -- The two whose prices already included PPN — see header.
  v_gross        TEXT[] := ARRAY[
    'AWP-P/06072026-211', 'AWP-P/08072026-213'
  ];
  v_id           UUID;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting PPN correction';
  END IF;

  -- Separate the included PPN out of the two gross-priced invoices,
  -- before the loop below applies PPN on top of whatever it finds.
  UPDATE public.line_items li
     SET unit_price = ROUND(li.unit_price / 1.11, 2)
    FROM public.invoices i
   WHERE li.entity_type = 'invoice'
     AND li.entity_id   = i.id
     AND i.workspace_id = v_workspace_id
     AND i.invoice_number = ANY(v_gross)
     AND i.deleted_at IS NULL
     AND i.ppn_percent IS NULL;

  FOR v_id IN
    SELECT id FROM public.invoices
     WHERE workspace_id = v_workspace_id
       AND invoice_number = ANY(v_numbers)
       AND deleted_at IS NULL
  LOOP
    UPDATE public.invoices
       SET ppn_percent     = 12,
           dpp_numerator   = 11,
           dpp_denominator = 12,
           updated_at      = now()
     WHERE id = v_id;

    PERFORM public.recompute_invoice_totals(v_id);

    UPDATE public.invoices
       SET amount_paid = total,
           updated_at  = now()
     WHERE id = v_id;

    UPDATE public.payments p
       SET amount = i.total
      FROM public.invoices i
     WHERE p.invoice_id = v_id
       AND i.id = v_id
       AND p.deleted_at IS NULL;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
