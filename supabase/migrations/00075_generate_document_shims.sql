-- generate_document() (00074) dispatches generically to create_<type>(
-- workspace_id, actor_id, input jsonb) — the convention every new
-- document type (purchase_order/proforma_invoice/delivery_order) already
-- follows. The pre-existing create_quotation/create_invoice use an older
-- positional-argument signature; rather than rewriting those (and every
-- caller of them) to the new convention, add a same-name JSONB-input
-- overload that unpacks and delegates. Postgres function overloading
-- resolves generate_document's EXECUTE format(...) call to this overload
-- by argument type, leaving the existing positional functions and their
-- callers completely untouched.
CREATE OR REPLACE FUNCTION create_quotation(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result JSONB; v_quotation_id UUID;
BEGIN
  v_result := public.create_quotation(
    p_workspace_id, p_actor_id, (p_input->>'client_id')::UUID,
    p_input->>'title', p_input->>'summary', p_input->>'currency',
    COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'expiry_date')::DATE, p_input->>'terms_and_conditions', p_input->>'notes',
    p_input->>'internal_notes',
    COALESCE(p_input->'line_items', '[]'::jsonb)
  );
  v_quotation_id := (v_result->>'id')::UUID;
  IF p_input->>'project_id' IS NOT NULL THEN
    UPDATE public.quotations SET project_id = (p_input->>'project_id')::UUID WHERE id = v_quotation_id;
    SELECT to_jsonb(q.*) INTO v_result FROM public.quotations q WHERE q.id = v_quotation_id;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION create_invoice(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result JSONB; v_invoice_id UUID;
BEGIN
  v_result := public.create_invoice(
    p_workspace_id, p_actor_id, (p_input->>'client_id')::UUID,
    p_input->>'title', p_input->>'summary', p_input->>'currency',
    COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'due_date')::DATE, p_input->>'payment_terms', p_input->>'notes',
    COALESCE(p_input->'line_items', '[]'::jsonb)
  );
  v_invoice_id := (v_result->>'id')::UUID;
  IF p_input->>'project_id' IS NOT NULL THEN
    UPDATE public.invoices SET project_id = (p_input->>'project_id')::UUID WHERE id = v_invoice_id;
    SELECT to_jsonb(i.*) INTO v_result FROM public.invoices i WHERE i.id = v_invoice_id;
  END IF;
  RETURN v_result;
END;
$$;
