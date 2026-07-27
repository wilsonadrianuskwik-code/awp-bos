-- Construction BOS: PPN becomes optional, and the Indonesian breakdown
-- extends to Quotations and Purchase Orders.
--
-- Two changes, both driven by the same requirement: some customers are
-- quoted and billed PPN-inclusive, others PPN-exclusive, and the choice
-- belongs to the document rather than to a global setting.
--
--   1. ppn_percent becomes NULLable on every document that carries the
--      breakdown. NULL means "no PPN on this document" — the same
--      "absent, not zero" semantics pph_percent and retensi_percent have
--      had since 00082, and for the same reason: a printed "PPN Rp 0"
--      row asserts something different from no row at all.
--
--   2. quotations and purchase_orders gain the same columns, so the
--      per-line tax_percent model can be retired from the builders. It
--      was an agency-era design (each line its own rate); nothing in
--      Indonesian construction billing works that way, and leaving two
--      tax models live meant a quotation and the invoice generated from
--      it could total differently from the same line items.
--
-- Existing rows are unaffected: ppn_percent keeps its stored value, so
-- documents already issued with PPN keep it. Quotations and POs default
-- to NULL — no PPN — which matches how their totals compute today when
-- no line carries a tax_percent.

DO $$
DECLARE t TEXT;
BEGIN
  -- Quotations and POs get the full column set; invoices and PIs already
  -- have it from 00082/00084.
  FOREACH t IN ARRAY ARRAY['quotations', 'purchase_orders'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS dpp_numerator   INTEGER       NOT NULL DEFAULT 11,
        ADD COLUMN IF NOT EXISTS dpp_denominator INTEGER       NOT NULL DEFAULT 12,
        ADD COLUMN IF NOT EXISTS ppn_percent     NUMERIC(6,3),
        ADD COLUMN IF NOT EXISTS pph_percent     NUMERIC(6,3),
        ADD COLUMN IF NOT EXISTS retensi_percent NUMERIC(6,3),
        ADD COLUMN IF NOT EXISTS dpp_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ppn_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pph_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS retensi_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS show_dpp        BOOLEAN       NOT NULL DEFAULT true
    $f$, t);

    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_dpp_denominator_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (dpp_denominator > 0)',
      t, t || '_dpp_denominator_check');
  END LOOP;

  -- PPN stops being mandatory everywhere. The DEFAULT is dropped too:
  -- a new document should inherit nothing, so the builder's explicit
  -- choice is the only thing that sets it.
  FOREACH t IN ARRAY ARRAY['invoices', 'proforma_invoices'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN ppn_percent DROP NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN ppn_percent DROP DEFAULT', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Recompute functions. All four now share one shape; the only
-- difference is which table and entity_type they read.
--
-- COALESCE(ppn_percent, 0) is what makes PPN optional without a second
-- code path: no rate means no PPN amount, and the total is simply harga
-- jual less any withholdings. dpp_amount is still computed and stored
-- regardless, because it is the basis PPN would be derived from and
-- hiding a row must never change stored figures (see 00084).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_invoice_totals(p_invoice_id UUID)
RETURNS TABLE (subtotal NUMERIC, discount_amount NUMERIC, tax_amount NUMERIC, total NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_subtotal NUMERIC(15,2); v_discount NUMERIC(15,2); v_harga_jual NUMERIC(15,2);
  v_dpp NUMERIC(15,2); v_ppn NUMERIC(15,2); v_pph NUMERIC(15,2);
  v_retensi NUMERIC(15,2); v_total NUMERIC(15,2);
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100), 0)
  INTO v_subtotal, v_discount
  FROM public.line_items
  WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  v_harga_jual := v_subtotal - v_discount;
  v_dpp     := ROUND(v_harga_jual * v_inv.dpp_numerator::NUMERIC / v_inv.dpp_denominator::NUMERIC, 2);
  v_ppn     := ROUND(v_dpp * COALESCE(v_inv.ppn_percent, 0) / 100, 2);
  v_pph     := ROUND(v_harga_jual * COALESCE(v_inv.pph_percent, 0) / 100, 2);
  v_retensi := ROUND(v_harga_jual * COALESCE(v_inv.retensi_percent, 0) / 100, 2);
  v_total   := v_harga_jual + v_ppn - v_pph - v_retensi;

  UPDATE public.invoices
  SET subtotal = v_subtotal, discount_amount = v_discount,
      dpp_amount = v_dpp, ppn_amount = v_ppn, pph_amount = v_pph,
      retensi_amount = v_retensi, tax_amount = v_ppn, total = v_total
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_subtotal, v_discount, v_ppn, v_total;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_proforma_invoice_totals(p_pi_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pi public.proforma_invoices%ROWTYPE;
  v_subtotal NUMERIC(15,2); v_discount NUMERIC(15,2); v_harga_jual NUMERIC(15,2);
  v_dpp NUMERIC(15,2); v_ppn NUMERIC(15,2); v_pph NUMERIC(15,2); v_retensi NUMERIC(15,2);
BEGIN
  SELECT * INTO v_pi FROM public.proforma_invoices WHERE id = p_pi_id;
  IF v_pi.id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100), 0)
  INTO v_subtotal, v_discount
  FROM public.line_items
  WHERE entity_type = 'proforma_invoice' AND entity_id = p_pi_id;

  v_harga_jual := v_subtotal - v_discount;
  v_dpp     := ROUND(v_harga_jual * v_pi.dpp_numerator::NUMERIC / v_pi.dpp_denominator::NUMERIC, 2);
  v_ppn     := ROUND(v_dpp * COALESCE(v_pi.ppn_percent, 0) / 100, 2);
  v_pph     := ROUND(v_harga_jual * COALESCE(v_pi.pph_percent, 0) / 100, 2);
  v_retensi := ROUND(v_harga_jual * COALESCE(v_pi.retensi_percent, 0) / 100, 2);

  UPDATE public.proforma_invoices
  SET subtotal = v_subtotal, discount_amount = v_discount,
      dpp_amount = v_dpp, ppn_amount = v_ppn, pph_amount = v_pph,
      retensi_amount = v_retensi, tax_amount = v_ppn,
      total = v_harga_jual + v_ppn - v_pph - v_retensi
  WHERE id = p_pi_id;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_quotation_totals(p_quotation_id UUID)
RETURNS TABLE (subtotal NUMERIC, discount_amount NUMERIC, tax_amount NUMERIC, total NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_q public.quotations%ROWTYPE;
  v_subtotal NUMERIC(15,2); v_discount NUMERIC(15,2); v_harga_jual NUMERIC(15,2);
  v_dpp NUMERIC(15,2); v_ppn NUMERIC(15,2); v_pph NUMERIC(15,2);
  v_retensi NUMERIC(15,2); v_total NUMERIC(15,2);
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id = p_quotation_id;
  IF v_q.id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100), 0)
  INTO v_subtotal, v_discount
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  v_harga_jual := v_subtotal - v_discount;
  v_dpp     := ROUND(v_harga_jual * v_q.dpp_numerator::NUMERIC / v_q.dpp_denominator::NUMERIC, 2);
  v_ppn     := ROUND(v_dpp * COALESCE(v_q.ppn_percent, 0) / 100, 2);
  v_pph     := ROUND(v_harga_jual * COALESCE(v_q.pph_percent, 0) / 100, 2);
  v_retensi := ROUND(v_harga_jual * COALESCE(v_q.retensi_percent, 0) / 100, 2);
  v_total   := v_harga_jual + v_ppn - v_pph - v_retensi;

  UPDATE public.quotations
  SET subtotal = v_subtotal, discount_amount = v_discount,
      dpp_amount = v_dpp, ppn_amount = v_ppn, pph_amount = v_pph,
      retensi_amount = v_retensi, tax_amount = v_ppn, total = v_total
  WHERE id = p_quotation_id;

  RETURN QUERY SELECT v_subtotal, v_discount, v_ppn, v_total;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_purchase_order_totals(p_po_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_subtotal NUMERIC(15,2); v_discount NUMERIC(15,2); v_harga_jual NUMERIC(15,2);
  v_dpp NUMERIC(15,2); v_ppn NUMERIC(15,2); v_pph NUMERIC(15,2); v_retensi NUMERIC(15,2);
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF v_po.id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100), 0)
  INTO v_subtotal, v_discount
  FROM public.line_items
  WHERE entity_type = 'purchase_order' AND entity_id = p_po_id;

  v_harga_jual := v_subtotal - v_discount;
  v_dpp     := ROUND(v_harga_jual * v_po.dpp_numerator::NUMERIC / v_po.dpp_denominator::NUMERIC, 2);
  v_ppn     := ROUND(v_dpp * COALESCE(v_po.ppn_percent, 0) / 100, 2);
  v_pph     := ROUND(v_harga_jual * COALESCE(v_po.pph_percent, 0) / 100, 2);
  v_retensi := ROUND(v_harga_jual * COALESCE(v_po.retensi_percent, 0) / 100, 2);

  UPDATE public.purchase_orders
  SET subtotal = v_subtotal, discount_amount = v_discount,
      dpp_amount = v_dpp, ppn_amount = v_ppn, pph_amount = v_pph,
      retensi_amount = v_retensi, tax_amount = v_ppn,
      total = v_harga_jual + v_ppn - v_pph - v_retensi,
      updated_at = now()
  WHERE id = p_po_id;
END;
$$;

-- ---------------------------------------------------------------------
-- One setter for all four document types. Extends 00087's version:
-- quotation/purchase_order are now valid targets, and ppn_percent takes
-- the same explicit-null handling as pph/retensi so it can be cleared,
-- not just changed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_document_tax_settings(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_document_type TEXT,
  p_document_id UUID,
  p_input JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_table TEXT;
  v_result JSONB;
  v_amount_paid NUMERIC;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table := CASE p_document_type
    WHEN 'invoice' THEN 'invoices'
    WHEN 'proforma_invoice' THEN 'proforma_invoices'
    WHEN 'quotation' THEN 'quotations'
    WHEN 'purchase_order' THEN 'purchase_orders'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Tax settings do not apply to %', p_document_type;
  END IF;

  -- Same rule as update_invoice (00087): money having moved against the
  -- document is what freezes its figures.
  IF p_document_type = 'invoice' THEN
    SELECT COALESCE(amount_paid, 0) INTO v_amount_paid
    FROM public.invoices WHERE id = p_document_id AND workspace_id = p_workspace_id;
    IF COALESCE(v_amount_paid, 0) > 0 THEN
      RAISE EXCEPTION
        'This invoice has payments recorded against it; its tax settings cannot be changed.';
    END IF;
  END IF;

  IF COALESCE((p_input->>'dpp_denominator')::INTEGER, 12) <= 0 THEN
    RAISE EXCEPTION 'DPP denominator must be greater than 0';
  END IF;

  EXECUTE format($f$
    UPDATE public.%I SET
      dpp_numerator   = COALESCE(($2->>'dpp_numerator')::INTEGER, dpp_numerator),
      dpp_denominator = COALESCE(($2->>'dpp_denominator')::INTEGER, dpp_denominator),
      ppn_percent     = CASE WHEN $2 ? 'ppn_percent'     THEN ($2->>'ppn_percent')::NUMERIC     ELSE ppn_percent END,
      pph_percent     = CASE WHEN $2 ? 'pph_percent'     THEN ($2->>'pph_percent')::NUMERIC     ELSE pph_percent END,
      retensi_percent = CASE WHEN $2 ? 'retensi_percent' THEN ($2->>'retensi_percent')::NUMERIC ELSE retensi_percent END,
      show_dpp        = COALESCE(($2->>'show_dpp')::BOOLEAN, show_dpp),
      updated_at = now()
    WHERE id = $1 AND workspace_id = $3 AND deleted_at IS NULL
  $f$, v_table) USING p_document_id, p_input, p_workspace_id;

  CASE p_document_type
    WHEN 'invoice' THEN PERFORM public.recompute_invoice_totals(p_document_id);
    WHEN 'proforma_invoice' THEN PERFORM public.recompute_proforma_invoice_totals(p_document_id);
    WHEN 'quotation' THEN PERFORM public.recompute_quotation_totals(p_document_id);
    WHEN 'purchase_order' THEN PERFORM public.recompute_purchase_order_totals(p_document_id);
  END CASE;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', v_table)
    INTO v_result USING p_document_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated tax settings', p_document_type, p_document_id);

  RETURN v_result;
END;
$$;

-- Quotations and POs previously totalled from per-line tax_percent. Any
-- that carried one would now show a breakdown that doesn't reconcile
-- with their stored total, so they are recomputed onto the new model.
-- Documents whose lines were all tax-free total identically either way,
-- so this is a no-op for them.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.quotations WHERE deleted_at IS NULL LOOP
    PERFORM public.recompute_quotation_totals(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.purchase_orders WHERE deleted_at IS NULL LOOP
    PERFORM public.recompute_purchase_order_totals(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
