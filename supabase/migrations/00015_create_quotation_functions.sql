-- All quotation/invoice mutations that touch more than one table are
-- implemented as single Postgres functions so that a single RPC call is a
-- single transaction: any RAISE EXCEPTION inside rolls back every insert,
-- update, and delete the function has performed so far. This is the only
-- way to get true atomic rollback from the Supabase JS client, which has no
-- multi-statement transaction primitive of its own.
--
-- Every mutation also recomputes subtotal/discount/tax/total from the
-- line_items actually written to the database (never from caller-supplied
-- totals), and every mutation writes its own activity + audit log entry
-- inside the same transaction, so a logging failure rolls back the mutation
-- and vice versa.

-- ---------------------------------------------------------------------
-- Shared logging helpers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_activity(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_actor_type TEXT,
  p_action TEXT,
  p_description TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_secondary_entity_type TEXT DEFAULT NULL,
  p_secondary_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activities (
    workspace_id, actor_id, actor_type, action, description,
    entity_type, entity_id, secondary_entity_type, secondary_entity_id, metadata
  )
  VALUES (
    p_workspace_id, p_actor_id, p_actor_type, p_action, p_description,
    p_entity_type, p_entity_id, p_secondary_entity_type, p_secondary_entity_id, p_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION log_audit_entry(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_actor_type TEXT,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_changes JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (workspace_id, actor_id, actor_type, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, p_actor_type, p_action, p_entity_type, p_entity_id, p_changes);
END;
$$;

-- Recomputes subtotal/discount_amount/tax_amount/total from the line_items
-- rows actually stored for an entity, and writes them onto the parent row.
-- Called after line items are inserted/copied, so the persisted totals are
-- always derived from what is actually in the database.
CREATE OR REPLACE FUNCTION recompute_quotation_totals(p_quotation_id UUID)
RETURNS TABLE (subtotal NUMERIC, discount_amount NUMERIC, tax_amount NUMERIC, total NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subtotal NUMERIC(15,2);
  v_discount NUMERIC(15,2);
  v_tax NUMERIC(15,2);
  v_total NUMERIC(15,2);
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100), 0),
    COALESCE(SUM(line_total * COALESCE(tax_percent, 0) / 100), 0)
  INTO v_subtotal, v_discount, v_tax
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  v_total := v_subtotal - v_discount + v_tax;

  UPDATE public.quotations
  SET subtotal = v_subtotal, discount_amount = v_discount, tax_amount = v_tax, total = v_total
  WHERE id = p_quotation_id;

  RETURN QUERY SELECT v_subtotal, v_discount, v_tax, v_total;
END;
$$;

-- Same recompute, scoped to an invoice's copied line items.
CREATE OR REPLACE FUNCTION recompute_invoice_totals(p_invoice_id UUID)
RETURNS TABLE (subtotal NUMERIC, discount_amount NUMERIC, tax_amount NUMERIC, total NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subtotal NUMERIC(15,2);
  v_discount NUMERIC(15,2);
  v_tax NUMERIC(15,2);
  v_total NUMERIC(15,2);
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100), 0),
    COALESCE(SUM(line_total * COALESCE(tax_percent, 0) / 100), 0)
  INTO v_subtotal, v_discount, v_tax
  FROM public.line_items
  WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  v_total := v_subtotal - v_discount + v_tax;

  UPDATE public.invoices
  SET subtotal = v_subtotal, discount_amount = v_discount, tax_amount = v_tax, total = v_total
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_subtotal, v_discount, v_tax, v_total;
END;
$$;

-- ---------------------------------------------------------------------
-- create_quotation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_quotation(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_client_id UUID,
  p_title TEXT,
  p_summary TEXT,
  p_currency TEXT,
  p_issue_date DATE,
  p_expiry_date DATE,
  p_terms_and_conditions TEXT,
  p_notes TEXT,
  p_internal_notes TEXT,
  p_line_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quotation_number TEXT;
  v_quotation_id UUID;
  v_year INTEGER := EXTRACT(YEAR FROM p_issue_date);
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a quotation';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_quotation_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', v_year);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, created_by
  )
  VALUES (
    p_workspace_id, p_client_id, v_quotation_number, 'draft', COALESCE(p_currency, 'USD'),
    p_issue_date, p_expiry_date, NULLIF(p_title, ''), NULLIF(p_summary, ''), NULLIF(p_terms_and_conditions, ''),
    NULLIF(p_notes, ''), NULLIF(p_internal_notes, ''), p_actor_id
  )
  RETURNING id INTO v_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    p_workspace_id, 'quotation', v_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(v_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created quotation ' || v_quotation_number, 'quotation', v_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_quotation_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_quotation_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_quotation (only draft / revision_requested quotations are editable)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_quotation(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_client_id UUID,
  p_title TEXT,
  p_summary TEXT,
  p_currency TEXT,
  p_issue_date DATE,
  p_expiry_date DATE,
  p_terms_and_conditions TEXT,
  p_notes TEXT,
  p_internal_notes TEXT,
  p_line_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.quotations%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this quotation';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_old.status NOT IN ('draft', 'revision_requested') THEN
    RAISE EXCEPTION 'Quotation in status % cannot be edited', v_old.status;
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM p_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', p_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.expiry_date IS DISTINCT FROM p_expiry_date THEN
    v_changes := v_changes || jsonb_build_object('expiry_date', jsonb_build_object('old', v_old.expiry_date, 'new', p_expiry_date));
  END IF;

  UPDATE public.quotations
  SET client_id = p_client_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = COALESCE(p_currency, 'USD'),
      issue_date = p_issue_date,
      expiry_date = p_expiry_date,
      terms_and_conditions = NULLIF(p_terms_and_conditions, ''),
      notes = NULLIF(p_notes, ''),
      internal_notes = NULLIF(p_internal_notes, ''),
      updated_at = now()
  WHERE id = p_quotation_id;

  DELETE FROM public.line_items WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    p_workspace_id, 'quotation', p_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(p_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = p_quotation_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_quotation_status (staff-driven lifecycle transitions)
-- Mirrors src/features/quotations/helpers.ts VALID_TRANSITIONS — keep in sync.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_quotation_status(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.quotations%ROWTYPE;
  v_valid_next TEXT[];
  v_action_label TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to change this quotation''s status';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  v_valid_next := CASE v_old.status
    WHEN 'draft' THEN ARRAY['sent', 'cancelled']
    WHEN 'sent' THEN ARRAY['viewed', 'expired', 'cancelled']
    WHEN 'viewed' THEN ARRAY['approved', 'rejected', 'revision_requested', 'expired', 'cancelled']
    WHEN 'revision_requested' THEN ARRAY['draft', 'sent', 'cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Cannot transition quotation from % to %', v_old.status, p_new_status;
  END IF;

  v_action_label := CASE p_new_status
    WHEN 'sent' THEN 'sent'
    WHEN 'viewed' THEN 'viewed'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'expired' THEN 'expired'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'revision_requested' THEN 'requested revision on'
    WHEN 'draft' THEN 'reopened'
    ELSE p_new_status
  END;

  UPDATE public.quotations
  SET status = p_new_status,
      approved_at = CASE WHEN p_new_status = 'approved' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN p_new_status = 'approved' THEN p_actor_id ELSE approved_by END,
      updated_at = now()
  WHERE id = p_quotation_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    v_action_label || ' quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id,
    jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = p_quotation_id);
END;
$$;

-- ---------------------------------------------------------------------
-- duplicate_quotation — independent copy, new number, version reset to 1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION duplicate_quotation(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.quotations%ROWTYPE;
  v_new_id UUID;
  v_new_number TEXT;
  v_year INTEGER;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this quotation';
  END IF;

  SELECT * INTO v_source FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  v_new_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', v_year);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_new_number, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, 1, p_actor_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT workspace_id, 'quotation', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_quotation_totals(v_new_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated quotation ' || v_source.quotation_number || ' to create ' || v_new_number,
    'quotation', p_quotation_id, 'quotation', v_new_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated from quotation ' || v_source.quotation_number,
    'quotation', v_new_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_new_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_new_id);
END;
$$;

-- ---------------------------------------------------------------------
-- create_quotation_version — V2/V3 linked to the same lineage
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_quotation_version(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.quotations%ROWTYPE;
  v_root_id UUID;
  v_next_version INTEGER;
  v_new_id UUID;
  v_new_number TEXT;
  v_year INTEGER;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to version this quotation';
  END IF;

  SELECT * INTO v_source FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  v_root_id := COALESCE(v_source.parent_quotation_id, v_source.id);

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.quotations
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
    AND (id = v_root_id OR parent_quotation_id = v_root_id);

  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  v_new_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', v_year);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, parent_quotation_id, created_by
  )
  VALUES (
    p_workspace_id, v_source.client_id, v_new_number, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, v_next_version, v_root_id, p_actor_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT workspace_id, 'quotation', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_quotation_totals(v_new_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'versioned',
    'created version ' || v_next_version || ' (' || v_new_number || ') of quotation ' || v_source.quotation_number,
    'quotation', v_new_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_new_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_new_id);
END;
$$;

-- ---------------------------------------------------------------------
-- delete_quotation — soft delete, only draft/cancelled, audit only (no activity)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_quotation(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.quotations%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this quotation';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_old.status NOT IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Quotation in status % cannot be deleted', v_old.status;
  END IF;

  UPDATE public.quotations SET deleted_at = now() WHERE id = p_quotation_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'quotation', p_quotation_id);

  RETURN jsonb_build_object('success', true, 'id', p_quotation_id);
END;
$$;

-- ---------------------------------------------------------------------
-- generate_invoice_from_quotation — creates a DRAFT invoice only.
-- Never transitions the invoice past 'draft'; sending is a manual,
-- not-yet-built finance action reserved for a later phase.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_invoice_from_quotation(
  p_quotation_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_invoice_date DATE,
  p_due_date DATE,
  p_copy_notes BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quotation public.quotations%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_year INTEGER;
  v_due_date DATE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to generate an invoice';
  END IF;

  SELECT * INTO v_quotation FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_quotation.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_quotation.status != 'approved' THEN
    RAISE EXCEPTION 'Only approved quotations can generate an invoice';
  END IF;

  IF v_quotation.generated_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'An invoice has already been generated for this quotation';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = v_quotation.client_id;

  v_year := EXTRACT(YEAR FROM p_invoice_date);
  v_invoice_number := public.next_document_number(p_workspace_id, 'invoice', 'INV', v_year);
  v_due_date := COALESCE(p_due_date, p_invoice_date + (COALESCE(v_client.payment_terms, 30) || ' days')::INTERVAL);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, source_quotation_id, status,
    currency, issue_date, due_date, title, summary, notes, created_by
  )
  VALUES (
    p_workspace_id, v_quotation.client_id, v_invoice_number, p_quotation_id, 'draft',
    v_quotation.currency, p_invoice_date, v_due_date, v_quotation.title, v_quotation.summary,
    CASE WHEN p_copy_notes THEN v_quotation.notes ELSE NULL END, p_actor_id
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT workspace_id, 'invoice', v_invoice_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_invoice_totals(v_invoice_id);

  UPDATE public.quotations SET generated_invoice_id = v_invoice_id, updated_at = now() WHERE id = p_quotation_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'invoice_generated',
    'generated invoice ' || v_invoice_number || ' from quotation ' || v_quotation.quotation_number,
    'quotation', p_quotation_id, 'invoice', v_invoice_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'invoice ' || v_invoice_number || ' generated from quotation ' || v_quotation.quotation_number,
    'invoice', v_invoice_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id,
    jsonb_build_object('generated_invoice_id', jsonb_build_object('old', NULL, 'new', v_invoice_id))
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_invoice_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_invoice_id);
END;
$$;

-- ---------------------------------------------------------------------
-- Quotation templates
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_quotation_template(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a template';
  END IF;

  IF jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  INSERT INTO public.quotation_templates (workspace_id, name, description, created_by)
  VALUES (p_workspace_id, p_name, NULLIF(p_description, ''), p_actor_id)
  RETURNING id INTO v_template_id;

  INSERT INTO public.quotation_template_items (
    template_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    v_template_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created quotation template "' || p_name || '"', 'quotation_template', v_template_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation_template', v_template_id);

  RETURN (SELECT to_jsonb(t) FROM public.quotation_templates t WHERE t.id = v_template_id);
END;
$$;

CREATE OR REPLACE FUNCTION update_quotation_template(
  p_template_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.quotation_templates%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this template';
  END IF;

  SELECT * INTO v_old FROM public.quotation_templates
  WHERE id = p_template_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  IF jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  UPDATE public.quotation_templates
  SET name = p_name, description = NULLIF(p_description, ''), updated_at = now()
  WHERE id = p_template_id;

  DELETE FROM public.quotation_template_items WHERE template_id = p_template_id;

  INSERT INTO public.quotation_template_items (
    template_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    p_template_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated quotation template "' || p_name || '"', 'quotation_template', p_template_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'quotation_template', p_template_id);

  RETURN (SELECT to_jsonb(t) FROM public.quotation_templates t WHERE t.id = p_template_id);
END;
$$;

CREATE OR REPLACE FUNCTION delete_quotation_template(
  p_template_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.quotation_templates%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this template';
  END IF;

  SELECT * INTO v_old FROM public.quotation_templates
  WHERE id = p_template_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  UPDATE public.quotation_templates SET deleted_at = now() WHERE id = p_template_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'quotation_template', p_template_id);

  RETURN jsonb_build_object('success', true, 'id', p_template_id);
END;
$$;

-- ---------------------------------------------------------------------
-- Customer portal actions — authenticated only by possession of the
-- share_token (a capability URL), never by auth.uid(). actor_id is NULL,
-- actor_type is 'customer'.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_quotation_first_view(p_share_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.quotations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.quotations
  WHERE share_token = p_share_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_row.first_viewed_at IS NULL THEN
    UPDATE public.quotations
    SET first_viewed_at = now(),
        status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        updated_at = now()
    WHERE id = v_row.id;

    PERFORM public.log_activity(
      v_row.workspace_id, NULL, 'customer', 'viewed',
      'customer viewed quotation ' || v_row.quotation_number, 'quotation', v_row.id
    );
    IF v_row.status = 'sent' THEN
      PERFORM public.log_audit_entry(
        v_row.workspace_id, NULL, 'customer', 'update', 'quotation', v_row.id,
        jsonb_build_object('status', jsonb_build_object('old', 'sent', 'new', 'viewed'))
      );
    END IF;
  END IF;

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION approve_quotation_by_customer(p_share_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.quotations%ROWTYPE;
  v_client_name TEXT;
BEGIN
  SELECT * INTO v_row FROM public.quotations
  WHERE share_token = p_share_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_row.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'This quotation cannot be approved in its current status';
  END IF;

  SELECT name INTO v_client_name FROM public.clients WHERE id = v_row.client_id;

  UPDATE public.quotations
  SET status = 'approved', approved_at = now(), first_viewed_at = COALESCE(first_viewed_at, now()), updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.log_activity(
    v_row.workspace_id, NULL, 'customer', 'status_change',
    COALESCE(v_client_name, 'Customer') || ' approved quotation ' || v_row.quotation_number, 'quotation', v_row.id
  );
  PERFORM public.log_audit_entry(
    v_row.workspace_id, NULL, 'customer', 'update', 'quotation', v_row.id,
    jsonb_build_object('status', jsonb_build_object('old', v_row.status, 'new', 'approved'))
  );

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION reject_quotation_by_customer(p_share_token UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.quotations%ROWTYPE;
  v_client_name TEXT;
BEGIN
  SELECT * INTO v_row FROM public.quotations
  WHERE share_token = p_share_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_row.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'This quotation cannot be rejected in its current status';
  END IF;

  SELECT name INTO v_client_name FROM public.clients WHERE id = v_row.client_id;

  UPDATE public.quotations
  SET status = 'rejected',
      customer_response_notes = NULLIF(p_reason, ''),
      first_viewed_at = COALESCE(first_viewed_at, now()),
      updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.log_activity(
    v_row.workspace_id, NULL, 'customer', 'status_change',
    COALESCE(v_client_name, 'Customer') || ' rejected quotation ' || v_row.quotation_number, 'quotation', v_row.id
  );
  PERFORM public.log_audit_entry(
    v_row.workspace_id, NULL, 'customer', 'update', 'quotation', v_row.id,
    jsonb_build_object('status', jsonb_build_object('old', v_row.status, 'new', 'rejected'))
  );

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION request_quotation_revision(p_share_token UUID, p_message TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.quotations%ROWTYPE;
  v_client_name TEXT;
BEGIN
  SELECT * INTO v_row FROM public.quotations
  WHERE share_token = p_share_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_row.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'A revision cannot be requested in this quotation''s current status';
  END IF;

  SELECT name INTO v_client_name FROM public.clients WHERE id = v_row.client_id;

  UPDATE public.quotations
  SET status = 'revision_requested',
      customer_response_notes = NULLIF(p_message, ''),
      first_viewed_at = COALESCE(first_viewed_at, now()),
      updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.log_activity(
    v_row.workspace_id, NULL, 'customer', 'status_change',
    COALESCE(v_client_name, 'Customer') || ' requested a revision on quotation ' || v_row.quotation_number, 'quotation', v_row.id
  );
  PERFORM public.log_audit_entry(
    v_row.workspace_id, NULL, 'customer', 'update', 'quotation', v_row.id,
    jsonb_build_object('status', jsonb_build_object('old', v_row.status, 'new', 'revision_requested'))
  );

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_row.id);
END;
$$;
