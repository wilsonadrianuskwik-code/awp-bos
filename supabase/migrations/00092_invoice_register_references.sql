-- Construction BOS: reference numbers the invoice register needs.
--
-- The recap spreadsheet PT Andalan Warna Prima keeps has two columns
-- that no field in the system could fill:
--
--   NO PO         the *customer's* purchase order number — the reference
--                 the client asks us to quote back so their AP can match
--                 our invoice to their commitment. Not to be confused
--                 with purchase_orders, which are the orders we place
--                 with our own suppliers, pointing the other direction.
--
--   NO.SERI FPN   the Faktur Pajak serial issued through Coretax/e-Faktur.
--                 It is assigned by DJP after the invoice exists, so it
--                 has to be editable on an already-issued invoice — which
--                 is exactly what 00087 made possible.
--
-- Both are references, recorded and printed and exported, and neither
-- takes part in any calculation. They are deliberately plain TEXT with
-- no format CHECK: a serial format set by tax regulation is not
-- something this schema should be the one enforcing.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_po_number TEXT,
  ADD COLUMN IF NOT EXISTS tax_invoice_number TEXT;

COMMENT ON COLUMN public.invoices.customer_po_number IS
  'The client''s own PO number for this invoice (register column "NO PO"). Reference only.';
COMMENT ON COLUMN public.invoices.tax_invoice_number IS
  'Faktur Pajak serial (register column "NO.SERI FPN"), assigned by DJP after issue. Reference only.';

-- Extends 00087's update_invoice with the two reference fields. Absent
-- keys leave the stored value alone; an explicit null clears it.
CREATE OR REPLACE FUNCTION set_invoice_references(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_invoice_id UUID,
  p_input JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- No payment guard here, unlike update_invoice: a Faktur Pajak serial
  -- routinely arrives after the invoice has been paid, and refusing to
  -- record it then would make the register permanently incomplete.
  -- Neither column feeds a total, so there is nothing to recompute.
  UPDATE public.invoices SET
    customer_po_number = CASE WHEN p_input ? 'customer_po_number'
                              THEN NULLIF(TRIM(p_input->>'customer_po_number'), '')
                              ELSE customer_po_number END,
    tax_invoice_number = CASE WHEN p_input ? 'tax_invoice_number'
                              THEN NULLIF(TRIM(p_input->>'tax_invoice_number'), '')
                              ELSE tax_invoice_number END,
    updated_at = now()
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  SELECT to_jsonb(t.*) INTO v_result
  FROM public.invoices t WHERE t.id = p_invoice_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated invoice references', 'invoice', p_invoice_id);

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
