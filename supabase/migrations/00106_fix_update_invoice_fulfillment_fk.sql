-- Fixes: editing a sent/viewed/overdue invoice fails with
--   update or delete on table "line_items" violates foreign key
--   constraint "fulfillment_items_line_item_id_fkey"
--
-- ROOT CAUSE
-- fulfillment_items.line_item_id is ON DELETE RESTRICT (00030), added on
-- the explicit assumption "invoices are immutable once non-draft" -- true
-- when 00030 shipped. 00087 later allowed editing sent/viewed/overdue
-- invoices (anything with amount_paid = 0), but update_invoice's line-item
-- replacement strategy is still the original blanket
-- DELETE FROM line_items + re-INSERT, unchanged since 00020.
--
-- Meanwhile sync_fulfillment_items runs on every invoice-detail page
-- load and auto-creates a fulfillment_items tracker (status 'pending', no
-- events) for every qty > 1 line on any sent+ invoice. So: send an
-- invoice with a multi-quantity line, open its detail page once, then
-- edit it -- the DELETE hits the RESTRICT the moment it reaches that
-- line, and the raw constraint violation reaches the user as-is (see
-- withWorkspace, which surfaces error.message directly).
--
-- FIX
-- Before the blanket delete, update_invoice now:
--
--   1. Raises a clear, actionable exception -- same tone as the existing
--      amount_paid guard -- if any current line item has real delivery
--      history: at least one fulfillment_events row, ever, including
--      reverted ones. A reverted delivery is still something that
--      happened; silently discarding that line would erase the record of
--      it. (fulfillment_events itself RESTRICTs against fulfillment_items,
--      so a tracker with any event -- alive or reverted -- could never be
--      hard-deleted here anyway; the exception makes that explicit instead
--      of the caller hitting a second, more confusing FK error.)
--
--   2. Otherwise hard-deletes the empty auto-synced trackers (the
--      ordinary case -- created by merely viewing the page, holding no
--      data of their own) so the line-item replacement can proceed.
--      sync_fulfillment_items recreates them, identically, next time the
--      invoice-detail page loads.
--
-- Scoped to update_invoice only: fulfillment_items.invoice_id references
-- invoices exclusively, so no other document type's update function needs
-- this guard.

CREATE OR REPLACE FUNCTION update_invoice(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_client_id UUID,
  p_title TEXT,
  p_summary TEXT,
  p_currency TEXT,
  p_issue_date DATE,
  p_due_date DATE,
  p_payment_terms TEXT,
  p_notes TEXT,
  p_line_items JSONB,
  p_project_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.invoices%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
  v_currency TEXT;
  v_project_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_old.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Invoice in status % cannot be edited', v_old.status;
  END IF;

  IF COALESCE(v_old.amount_paid, 0) > 0 THEN
    RAISE EXCEPTION
      'This invoice has payments recorded against it and cannot be edited. Void the payment first, or issue a credit note.';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  -- See header: block outright on real delivery history rather than let
  -- the DELETE below crash on it.
  IF EXISTS (
    SELECT 1
    FROM public.fulfillment_items fi
    JOIN public.line_items li ON li.id = fi.line_item_id
    WHERE li.entity_type = 'invoice' AND li.entity_id = p_invoice_id
      AND EXISTS (
        SELECT 1 FROM public.fulfillment_events fe
        WHERE fe.fulfillment_item_id = fi.id
      )
  ) THEN
    RAISE EXCEPTION
      'This invoice has delivery history recorded against it and cannot have its items changed. Void the delivery record first, or issue the revision as a new invoice.';
  END IF;

  v_project_id := COALESCE(p_project_id, v_old.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM v_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', v_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.due_date IS DISTINCT FROM p_due_date THEN
    v_changes := v_changes || jsonb_build_object('due_date', jsonb_build_object('old', v_old.due_date, 'new', p_due_date));
  END IF;

  UPDATE public.invoices
  SET client_id = p_client_id,
      project_id = v_project_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = v_currency,
      issue_date = p_issue_date,
      due_date = p_due_date,
      payment_terms = NULLIF(p_payment_terms, ''),
      notes = NULLIF(p_notes, ''),
      updated_at = now()
  WHERE id = p_invoice_id;

  -- Clear the way for the line-item replacement below: an empty
  -- auto-synced tracker holds nothing worth preserving (no event ever
  -- reached it -- guaranteed by the guard above), so it is discarded
  -- rather than left to RESTRICT the delete. sync_fulfillment_items
  -- recreates it, identically, next time the invoice is viewed.
  DELETE FROM public.fulfillment_items fi
  USING public.line_items li
  WHERE li.id = fi.line_item_id
    AND li.entity_type = 'invoice' AND li.entity_id = p_invoice_id;

  DELETE FROM public.line_items WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'invoice', p_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_invoice_totals(p_invoice_id);

  -- Revising an issued invoice is a materially different event from
  -- tweaking a draft, and the client is holding the earlier version — so
  -- it gets its own activity wording rather than a generic "updated".
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    CASE
      WHEN v_old.status = 'draft'
        THEN 'updated invoice ' || v_old.invoice_number
      ELSE 'revised issued invoice ' || v_old.invoice_number
           || ' (status ' || v_old.status || ')'
    END,
    'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
