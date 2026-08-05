-- Repair: "Tax settings do not apply to purchase_order" when saving a PO
-- draft.
--
-- 00088 widened set_document_tax_settings from invoice/proforma_invoice
-- to also cover quotation and purchase_order, and gave those two tables
-- the tax columns plus tax-aware recompute functions. The production
-- database is answering with 00087's error message, which means it is
-- running 00087's definition of that function — so 00088 either never
-- landed there or was overwritten by a later out-of-order run of 00087
-- (CREATE OR REPLACE takes whichever ran last, not whichever is newest).
--
-- Everything below is 00088's own content, re-applied. All of it is
-- idempotent, so this is a no-op on a database where 00088 is intact.
-- Deliberately omitted: 00088's one-time backfill loop that recomputed
-- every existing quotation and PO. 00107 has since set PO tax explicitly,
-- and re-running a blanket recompute over historical documents is a
-- bigger blast radius than this repair needs.

-- 1. Columns on quotations and purchase_orders.
DO $$
DECLARE t TEXT;
BEGIN
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

  -- PPN is optional everywhere: NULL means "no PPN on this document",
  -- which is a different statement from a printed "PPN Rp 0" row.
  FOREACH t IN ARRAY ARRAY['invoices', 'proforma_invoices'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN ppn_percent DROP NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN ppn_percent DROP DEFAULT', t);
  END LOOP;
END $$;

-- 2. Tax-aware totals for quotations and POs. Without these the document
-- still totals off the retired per-line tax_percent model, so the stored
-- total and the printed breakdown disagree.
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

-- 3. The function that actually threw. Same body as 00088's, with all
-- four document types in the table map and the recompute switch.
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

NOTIFY pgrst, 'reload schema';
