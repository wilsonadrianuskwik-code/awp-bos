-- Makes the signature block optional per document.
--
-- The signature is configured once in Settings -> Branding and has so far
-- appeared on every printed document. Some documents shouldn't carry it --
-- a draft going out for comment, a document a client counter-signs -- so
-- this adds a per-document flag the builder can toggle.
--
-- Defaults to true on every table, and on every row that already exists,
-- so nothing that prints with a signature today stops doing so.
--
-- Purely presentational, exactly like show_dpp (00084): it decides whether
-- the block renders, and touches no total, status or stored amount.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quotations', 'invoices', 'proforma_invoices',
    'purchase_orders', 'delivery_orders'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS show_signature BOOLEAN NOT NULL DEFAULT true',
      t);
  END LOOP;
END $$;

-- A dedicated setter rather than threading the flag through each type's
-- create_/update_ RPC: those take positional parameters, so adding one
-- would mean changing five function signatures (and every caller) for a
-- field that has nothing to do with line items or totals. This mirrors
-- set_document_tax_settings (00082) -- same permission check, same
-- table-name mapping, same activity log -- and covers all five types
-- including the two that have no tax settings at all.
CREATE OR REPLACE FUNCTION set_document_signature_visibility(
  p_workspace_id  UUID,
  p_actor_id      UUID,
  p_document_type TEXT,
  p_document_id   UUID,
  p_show          BOOLEAN
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_table  TEXT;
  v_result JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table := CASE p_document_type
    WHEN 'quotation'         THEN 'quotations'
    WHEN 'invoice'           THEN 'invoices'
    WHEN 'proforma_invoice'  THEN 'proforma_invoices'
    WHEN 'purchase_order'    THEN 'purchase_orders'
    WHEN 'delivery_order'    THEN 'delivery_orders'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown document type %', p_document_type;
  END IF;

  IF p_show IS NULL THEN
    RAISE EXCEPTION 'show_signature cannot be null';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET show_signature = $1, updated_at = now()
      WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL',
    v_table) USING p_show, p_document_id, p_workspace_id;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', v_table)
    INTO v_result USING p_document_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  INSERT INTO public.activities (
    workspace_id, actor_id, action, description, entity_type, entity_id
  )
  VALUES (
    p_workspace_id, p_actor_id, 'update',
    CASE WHEN p_show THEN 'Signature shown on document'
         ELSE 'Signature hidden on document' END,
    p_document_type, p_document_id
  );

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
