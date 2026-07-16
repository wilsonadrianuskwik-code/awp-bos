-- "Duplicate" quick action for invoices, mirroring duplicate_quotation
-- (00015_create_quotation_functions.sql): copies the invoice's core
-- fields + line items into a new draft invoice with a fresh number. This
-- is the same "start a new document from an existing one" workflow
-- already available for quotations, now available for invoices too (the
-- invoice card's Quick Actions menu needs it).
CREATE OR REPLACE FUNCTION duplicate_invoice(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.invoices%ROWTYPE;
  v_new_id UUID;
  v_new_number TEXT;
  v_year INTEGER;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this invoice';
  END IF;

  SELECT * INTO v_source FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  v_new_number := public.next_document_number(p_workspace_id, 'invoice', 'INV', v_year);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_new_number, 'draft', v_source.currency,
    CURRENT_DATE, v_source.due_date, v_source.title, v_source.summary,
    v_source.payment_terms, v_source.notes, p_actor_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'invoice', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  PERFORM public.recompute_invoice_totals(v_new_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated invoice ' || v_source.invoice_number || ' to create ' || v_new_number,
    'invoice', p_invoice_id, 'invoice', v_new_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated from invoice ' || v_source.invoice_number,
    'invoice', v_new_id, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_new_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_new_id);
END;
$$;
