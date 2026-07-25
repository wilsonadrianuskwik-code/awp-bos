-- Construction BOS: generate Delivery Orders and Purchase Orders from an
-- Invoice, and show the resulting links with their document numbers.
--
-- Two gaps this closes:
--
--   1. document_generation_rules only covered the sales chain out of a
--      Quotation plus Proforma Invoice -> Invoice. There was no rule from
--      an Invoice to anything, so an Invoice could not seed the delivery
--      or procurement it implies.
--
--   2. get_document_relationships returns bare (type, id) pairs. Every
--      caller then had to fetch each related document separately just to
--      show its number, so in practice the UI showed nothing useful. The
--      registry knows which table holds each document type but not which
--      column holds its human-readable number — adding that makes a
--      single generic "what is this linked to" query possible.

-- Which column carries the user-facing number for each document type.
-- Kept on the registry (rather than hardcoded in a CASE) so a new
-- document type stays a one-row change, per the engine's design.
-- status_column is nullable on purpose: payments record a completed fact
-- and carry no status column at all, so the reader below must not assume
-- every document type has one.
ALTER TABLE document_type_registry ADD COLUMN IF NOT EXISTS number_column TEXT;
ALTER TABLE document_type_registry ADD COLUMN IF NOT EXISTS status_column TEXT;

UPDATE document_type_registry SET number_column = 'quotation_number', status_column = 'status' WHERE key = 'quotation';
UPDATE document_type_registry SET number_column = 'pi_number',        status_column = 'status' WHERE key = 'proforma_invoice';
UPDATE document_type_registry SET number_column = 'invoice_number',   status_column = 'status' WHERE key = 'invoice';
UPDATE document_type_registry SET number_column = 'po_number',        status_column = 'status' WHERE key = 'purchase_order';
UPDATE document_type_registry SET number_column = 'do_number',        status_column = 'status' WHERE key = 'delivery_order';
UPDATE document_type_registry SET number_column = 'payment_number',   status_column = NULL     WHERE key = 'payment';

-- An Invoice is the point where a sale becomes physical: it justifies
-- shipping goods out (Delivery Order) and, when stock has to be bought
-- in for it, ordering from a supplier (Purchase Order).
--
-- delivery_order maps the invoice's own id into invoice_id, which
-- create_delivery_order requires; project/client are then inherited from
-- that invoice inside the function.
--
-- purchase_order cannot inherit a supplier — an Invoice is customer-facing
-- and names none — so the caller supplies supplier_id through
-- generate_document's p_overrides (create_purchase_order rejects the call
-- without one).
INSERT INTO document_generation_rules (from_type, to_type, field_mapping, copy_line_items) VALUES
  ('invoice', 'delivery_order', '{"invoice_id":"id","project_id":"project_id","notes":"notes"}', true),
  ('invoice', 'purchase_order', '{"project_id":"project_id","currency":"currency","title":"title","notes":"notes"}', true)
ON CONFLICT (from_type, to_type) DO NOTHING;

-- Resolves the traceability graph into something directly renderable:
-- each linked document's type, label, number and status, in one query,
-- for both directions. Replaces the pattern of reading
-- get_document_relationships and then fetching each document separately.
CREATE OR REPLACE FUNCTION get_document_links(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_document_id UUID
)
RETURNS TABLE (
  direction TEXT,
  related_type TEXT,
  related_label TEXT,
  related_id UUID,
  related_number TEXT,
  related_status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_edge RECORD;
  v_reg public.document_type_registry%ROWTYPE;
  v_number TEXT;
  v_status TEXT;
BEGIN
  IF p_workspace_id NOT IN (SELECT public.get_user_workspace_ids()) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  FOR v_edge IN
    SELECT 'generated_to'::TEXT AS dir, r.to_type AS rel_type, r.to_id AS rel_id
    FROM public.document_relationships r
    WHERE r.workspace_id = p_workspace_id
      AND r.from_type = p_document_type AND r.from_id = p_document_id
    UNION ALL
    SELECT 'generated_from'::TEXT, r.from_type, r.from_id
    FROM public.document_relationships r
    WHERE r.workspace_id = p_workspace_id
      AND r.to_type = p_document_type AND r.to_id = p_document_id
  LOOP
    SELECT * INTO v_reg FROM public.document_type_registry WHERE key = v_edge.rel_type;
    CONTINUE WHEN v_reg.key IS NULL OR v_reg.number_column IS NULL;

    -- Identifiers come from the trusted registry, never from user input.
    -- Types without a status column (payments) select a NULL literal.
    EXECUTE format(
      'SELECT t.%I::TEXT, %s FROM public.%I t WHERE t.id = $1 AND t.deleted_at IS NULL',
      v_reg.number_column,
      CASE WHEN v_reg.status_column IS NULL
           THEN 'NULL::TEXT'
           ELSE format('t.%I::TEXT', v_reg.status_column) END,
      v_reg.table_name
    ) INTO v_number, v_status USING v_edge.rel_id;

    -- Skip rows that have since been soft-deleted.
    CONTINUE WHEN v_number IS NULL;

    direction := v_edge.dir;
    related_type := v_edge.rel_type;
    related_label := v_reg.label;
    related_id := v_edge.rel_id;
    related_number := v_number;
    related_status := v_status;
    RETURN NEXT;
  END LOOP;
END;
$$;
