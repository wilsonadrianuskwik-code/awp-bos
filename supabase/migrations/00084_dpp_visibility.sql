-- Construction BOS: make the DPP row optional on the printed breakdown.
--
-- Purely presentational. dpp_amount is still always computed and stored,
-- because PPN is derived from it (PPN = DPP x ppn_percent) — hiding the
-- row must never change what the document totals to. This flag only
-- decides whether the "DPP 11/12" line is rendered.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'proforma_invoices'] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS show_dpp BOOLEAN NOT NULL DEFAULT true',
      t);
  END LOOP;
END $$;

-- Extends 00082's setter with the new flag. Same "key absent leaves it
-- alone" semantics as the rest of the input.
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

  EXECUTE format($f$
    UPDATE public.%I SET
      dpp_numerator   = COALESCE(($2->>'dpp_numerator')::INTEGER, dpp_numerator),
      dpp_denominator = COALESCE(($2->>'dpp_denominator')::INTEGER, dpp_denominator),
      ppn_percent     = COALESCE(($2->>'ppn_percent')::NUMERIC, ppn_percent),
      pph_percent     = CASE WHEN $2 ? 'pph_percent'     THEN ($2->>'pph_percent')::NUMERIC     ELSE pph_percent END,
      retensi_percent = CASE WHEN $2 ? 'retensi_percent' THEN ($2->>'retensi_percent')::NUMERIC ELSE retensi_percent END,
      show_dpp        = COALESCE(($2->>'show_dpp')::BOOLEAN, show_dpp),
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
