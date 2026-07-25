-- Construction BOS: Indonesian tax breakdown on Invoices and Proforma
-- Invoices.
--
-- Replaces per-line tax_percent (an agency-era model where each line
-- carried its own rate) with the document-level breakdown Indonesian
-- construction invoicing actually uses:
--
--   TOTAL HARGA JUAL   sum of lines, after line discounts
--   DPP 11/12          harga jual x 11/12   (PMK 131/2024 "nilai lain")
--   PPN 12%            DPP x 12%            (~11% of harga jual)
--   POTONG PPH 2%      harga jual x 2%      withheld, optional
--   POTONG RETENSI 5%  harga jual x 5%      retained, optional
--   TOTAL              harga jual + PPN - PPH - Retensi
--
-- The DPP fraction and PPN rate are stored per document rather than
-- hardcoded, so a regulation change is a data change and historical
-- documents keep the rates they were issued under. PPH and Retensi are
-- NULL when not applicable, which is what makes them "optional" — a
-- percentage of 0 would print a misleading zero row.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'proforma_invoices'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS dpp_numerator   INTEGER       NOT NULL DEFAULT 11,
        ADD COLUMN IF NOT EXISTS dpp_denominator INTEGER       NOT NULL DEFAULT 12,
        ADD COLUMN IF NOT EXISTS ppn_percent     NUMERIC(6,3)  NOT NULL DEFAULT 12,
        ADD COLUMN IF NOT EXISTS pph_percent     NUMERIC(6,3),
        ADD COLUMN IF NOT EXISTS retensi_percent NUMERIC(6,3),
        ADD COLUMN IF NOT EXISTS dpp_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ppn_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pph_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS retensi_amount  NUMERIC(15,2) NOT NULL DEFAULT 0
    $f$, t);

    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      t, t || '_dpp_denominator_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (dpp_denominator > 0)',
      t, t || '_dpp_denominator_check');
  END LOOP;
END $$;

-- Invoice totals. subtotal/discount_amount keep their meaning (sum of
-- lines, sum of line discounts); tax_amount is kept in sync with
-- ppn_amount so existing revenue/AR reporting that reads it stays
-- correct without every report needing to learn the new columns.
CREATE OR REPLACE FUNCTION recompute_invoice_totals(p_invoice_id UUID)
RETURNS TABLE (subtotal NUMERIC, discount_amount NUMERIC, tax_amount NUMERIC, total NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_subtotal NUMERIC(15,2);
  v_discount NUMERIC(15,2);
  v_harga_jual NUMERIC(15,2);
  v_dpp NUMERIC(15,2);
  v_ppn NUMERIC(15,2);
  v_pph NUMERIC(15,2);
  v_retensi NUMERIC(15,2);
  v_total NUMERIC(15,2);
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
  v_ppn     := ROUND(v_dpp * v_inv.ppn_percent / 100, 2);
  v_pph     := ROUND(v_harga_jual * COALESCE(v_inv.pph_percent, 0) / 100, 2);
  v_retensi := ROUND(v_harga_jual * COALESCE(v_inv.retensi_percent, 0) / 100, 2);

  v_total := v_harga_jual + v_ppn - v_pph - v_retensi;

  UPDATE public.invoices
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      dpp_amount = v_dpp,
      ppn_amount = v_ppn,
      pph_amount = v_pph,
      retensi_amount = v_retensi,
      tax_amount = v_ppn,
      total = v_total
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_subtotal, v_discount, v_ppn, v_total;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_proforma_invoice_totals(p_pi_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pi public.proforma_invoices%ROWTYPE;
  v_subtotal NUMERIC(15,2);
  v_discount NUMERIC(15,2);
  v_harga_jual NUMERIC(15,2);
  v_dpp NUMERIC(15,2);
  v_ppn NUMERIC(15,2);
  v_pph NUMERIC(15,2);
  v_retensi NUMERIC(15,2);
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
  v_ppn     := ROUND(v_dpp * v_pi.ppn_percent / 100, 2);
  v_pph     := ROUND(v_harga_jual * COALESCE(v_pi.pph_percent, 0) / 100, 2);
  v_retensi := ROUND(v_harga_jual * COALESCE(v_pi.retensi_percent, 0) / 100, 2);

  UPDATE public.proforma_invoices
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      dpp_amount = v_dpp,
      ppn_amount = v_ppn,
      pph_amount = v_pph,
      retensi_amount = v_retensi,
      tax_amount = v_ppn,
      total = v_harga_jual + v_ppn - v_pph - v_retensi
  WHERE id = p_pi_id;
END;
$$;

-- Applies the tax settings to a document, then recomputes. Separate from
-- create/update so changing a rate never requires resubmitting line items,
-- and so both document types share one entry point.
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
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table := CASE p_document_type
    WHEN 'invoice' THEN 'invoices'
    WHEN 'proforma_invoice' THEN 'proforma_invoices'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Tax settings do not apply to %', p_document_type;
  END IF;

  IF COALESCE((p_input->>'dpp_denominator')::INTEGER, 12) <= 0 THEN
    RAISE EXCEPTION 'DPP denominator must be greater than 0';
  END IF;

  -- NULL pph/retensi means "not applicable" and is preserved as such:
  -- the key being absent leaves the current value, an explicit null
  -- clears it.
  EXECUTE format($f$
    UPDATE public.%I SET
      dpp_numerator   = COALESCE(($2->>'dpp_numerator')::INTEGER, dpp_numerator),
      dpp_denominator = COALESCE(($2->>'dpp_denominator')::INTEGER, dpp_denominator),
      ppn_percent     = COALESCE(($2->>'ppn_percent')::NUMERIC, ppn_percent),
      pph_percent     = CASE WHEN $2 ? 'pph_percent'     THEN ($2->>'pph_percent')::NUMERIC     ELSE pph_percent END,
      retensi_percent = CASE WHEN $2 ? 'retensi_percent' THEN ($2->>'retensi_percent')::NUMERIC ELSE retensi_percent END,
      updated_at = now()
    WHERE id = $1 AND workspace_id = $3 AND deleted_at IS NULL
  $f$, v_table) USING p_document_id, p_input, p_workspace_id;

  IF p_document_type = 'invoice' THEN
    PERFORM public.recompute_invoice_totals(p_document_id);
  ELSE
    PERFORM public.recompute_proforma_invoice_totals(p_document_id);
  END IF;

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

-- Backfill: documents totalled under the old sum-of-line-tax model would
-- otherwise display a breakdown that doesn't add up to their stored
-- total. Recomputing fixes that, but it also *changes* the total (and
-- therefore amount_due) wherever the old line tax differed from the new
-- effective ~11% — so it is deliberately withheld from anything money
-- has already moved against. An invoice with a payment keeps its issued
-- figures; only its breakdown columns stay zero, which is correct: it
-- was never issued under this model.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.invoices
    WHERE deleted_at IS NULL AND COALESCE(amount_paid, 0) = 0
  LOOP
    PERFORM public.recompute_invoice_totals(r.id);
  END LOOP;

  FOR r IN SELECT id FROM public.proforma_invoices WHERE deleted_at IS NULL LOOP
    PERFORM public.recompute_proforma_invoice_totals(r.id);
  END LOOP;
END $$;
