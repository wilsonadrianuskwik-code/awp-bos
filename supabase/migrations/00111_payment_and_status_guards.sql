-- Guards on money and on status.
--
-- Four defects, all reproduced against a real database before writing
-- this:
--
--   1. record_payment accepted payments on cancelled, refunded and draft
--      invoices, driving them to 'paid'. A cancelled invoice then counted
--      as revenue.
--   2. record_payment had no upper bound. Two full payments on one
--      invoice gave amount_paid = 2x total and amount_due = -total
--      (amount_due is GENERATED with no CHECK), understating every
--      outstanding-balance figure.
--   3. update_purchase_order_status / update_proforma_invoice_status /
--      update_delivery_order_status were bare `SET status = p_status`
--      with no transition rules at all -- a received PO could be sent
--      back to draft, which re-opens it for editing after the goods have
--      arrived. Invoices and quotations have had real state machines
--      since 00015/00020; these three never got one.
--   4. proforma_invoices.generated_invoice_id was declared in 00072 and
--      never written by anything, so the "already generated" guard in the
--      UI never engaged and one PI could mint unlimited invoices.
--
-- The invoice state machine (00020) is the model followed here.

-- ---------------------------------------------------------------------
-- 1 + 2. Payment guards.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_payment(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_reference TEXT,
  p_notes TEXT,
  p_bank_name TEXT,
  p_receiver_account_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment_id UUID;
  v_payment_number TEXT;
  v_ordinal INTEGER;
  v_amount_paid NUMERIC(15,2);
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to record a payment';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0';
  END IF;

  -- A cancelled or refunded invoice is a closed record, and a draft has
  -- never been issued to anyone -- money cannot arrive against either.
  -- Without this, paying a cancelled invoice silently drove it to 'paid'
  -- and put it back into revenue.
  IF v_invoice.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION
      'Invoice % is % and cannot take a payment.', v_invoice.invoice_number, v_invoice.status;
  END IF;

  IF v_invoice.status = 'draft' THEN
    RAISE EXCEPTION
      'Invoice % is still a draft. Send it before recording a payment.', v_invoice.invoice_number;
  END IF;

  -- Overpayment: amount_due is GENERATED as total - amount_paid with no
  -- CHECK, so an accidental second full payment silently drove it
  -- negative and understated every outstanding-balance report.
  IF p_amount > (v_invoice.total - COALESCE(v_invoice.amount_paid, 0)) THEN
    RAISE EXCEPTION
      'Payment of % exceeds the % still outstanding on invoice %. Record the exact amount, or raise a credit note.',
      p_amount,
      (v_invoice.total - COALESCE(v_invoice.amount_paid, 0)),
      v_invoice.invoice_number;
  END IF;

  v_old_status := v_invoice.status;

  v_payment_number := public.next_document_number(p_workspace_id, 'payment', 'PAY', p_payment_date);

  SELECT COUNT(*) + 1 INTO v_ordinal
  FROM public.payments
  WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  INSERT INTO public.payments (
    workspace_id, invoice_id, payment_number, amount, currency, payment_method,
    bank_name, receiver_account_name, payment_date, reference, notes, recorded_by
  )
  VALUES (
    p_workspace_id, p_invoice_id, v_payment_number, p_amount, COALESCE(p_currency, v_invoice.currency), p_payment_method,
    CASE WHEN p_payment_method = 'bank_transfer' THEN NULLIF(p_bank_name, '') ELSE NULL END,
    CASE WHEN p_payment_method = 'bank_transfer' THEN NULLIF(p_receiver_account_name, '') ELSE NULL END,
    p_payment_date, NULLIF(p_reference, ''), NULLIF(p_notes, ''), p_actor_id
  )
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
  FROM public.payments WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_amount_paid >= v_invoice.total THEN 'paid'
    WHEN v_amount_paid > 0 THEN 'partial'
    ELSE v_invoice.status
  END;

  UPDATE public.invoices SET
    amount_paid = v_amount_paid,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'payment_recorded',
    'recorded Payment #' || v_ordinal || ' (' || v_payment_number || ') — ' ||
      p_amount || ' via ' || p_payment_method,
    'invoice', p_invoice_id, 'payment', v_payment_id,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_number', v_payment_number,
      'amount', p_amount,
      'currency', COALESCE(p_currency, v_invoice.currency),
      'payment_method', p_payment_method,
      'ordinal', v_ordinal
    )
  );

  IF v_new_status = 'paid' THEN
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'invoice ' || v_invoice.invoice_number || ' fully paid', 'invoice', p_invoice_id
    );
  END IF;

  IF v_new_status IN ('partial', 'paid') THEN
    PERFORM public.sync_fulfillment_items_for_invoice(p_workspace_id, p_invoice_id);
    PERFORM public.get_or_create_fulfillment_project_for_invoice(p_workspace_id, p_invoice_id, p_actor_id);
  END IF;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'payment', v_payment_id);
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id,
      jsonb_build_object('status', jsonb_build_object('old', v_old_status, 'new', v_new_status))
    );
  END IF;

  RETURN jsonb_build_object(
    'invoice', (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id),
    'payment', (SELECT to_jsonb(p) FROM public.payments p WHERE p.id = v_payment_id)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Status machines for the three document types that had none.
-- ---------------------------------------------------------------------
--
-- Shape matches update_invoice_status: a per-status allowlist of next
-- states, an explicit no-op when the status is unchanged, and a clear
-- message naming both ends of the refused transition. Terminal states
-- have an empty allowlist.
CREATE OR REPLACE FUNCTION update_purchase_order_status(
  p_workspace_id UUID, p_actor_id UUID, p_po_id UUID, p_status TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_po    public.purchase_orders%ROWTYPE;
  v_valid TEXT[];
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders
   WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  IF v_po.status = p_status THEN
    RETURN to_jsonb(v_po);
  END IF;

  -- Goods arriving is the point of no return: 'received' and 'cancelled'
  -- are terminal, so a PO cannot be re-opened and rewritten to
  -- contradict what was actually delivered. partially_received can still
  -- complete or be cancelled.
  v_valid := CASE v_po.status
    WHEN 'draft'              THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'               THEN ARRAY['acknowledged', 'partially_received', 'received', 'cancelled']
    WHEN 'acknowledged'       THEN ARRAY['partially_received', 'received', 'cancelled']
    WHEN 'partially_received' THEN ARRAY['received', 'cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_status = ANY(v_valid)) THEN
    RAISE EXCEPTION 'Cannot transition purchase order from % to %', v_po.status, p_status;
  END IF;

  UPDATE public.purchase_orders SET status = p_status, updated_at = now()
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
          'Purchase order ' || v_po.po_number || ' marked ' || p_status, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$$;

CREATE OR REPLACE FUNCTION update_proforma_invoice_status(
  p_workspace_id UUID, p_actor_id UUID, p_pi_id UUID, p_status TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pi    public.proforma_invoices%ROWTYPE;
  v_valid TEXT[];
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_pi FROM public.proforma_invoices
   WHERE id = p_pi_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_pi.id IS NULL THEN RAISE EXCEPTION 'Proforma invoice not found'; END IF;

  IF v_pi.status = p_status THEN
    RETURN to_jsonb(v_pi);
  END IF;

  -- 'converted' is set by the generation path below, not by hand, and is
  -- terminal along with cancelled/expired.
  v_valid := CASE v_pi.status
    WHEN 'draft'    THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'     THEN ARRAY['viewed', 'accepted', 'cancelled', 'expired']
    WHEN 'viewed'   THEN ARRAY['accepted', 'cancelled', 'expired']
    WHEN 'accepted' THEN ARRAY['cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_status = ANY(v_valid)) THEN
    RAISE EXCEPTION 'Cannot transition proforma invoice from % to %', v_pi.status, p_status;
  END IF;

  UPDATE public.proforma_invoices SET status = p_status, updated_at = now()
   WHERE id = p_pi_id
   RETURNING * INTO v_pi;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
          'Proforma invoice ' || v_pi.pi_number || ' marked ' || p_status, 'proforma_invoice', v_pi.id);

  RETURN to_jsonb(v_pi);
END;
$$;

-- Delivery orders additionally guard against the delivered <-> cancelled
-- toggle. revert_fulfillment_from_delivery_order SOFT-deletes the events
-- it reverses, and the re-sync's idempotency check only looks at live
-- rows -- so flipping a DO delivered/cancelled/delivered inserted a
-- fresh set of events each cycle and inflated the delivered quantity in
-- the fulfillment ledger. Making 'delivered' terminal removes the cycle;
-- correcting a wrongly-delivered DO is a new document, as it is on paper.
CREATE OR REPLACE FUNCTION update_delivery_order_status(
  p_workspace_id UUID, p_actor_id UUID, p_do_id UUID, p_status TEXT,
  p_received_by TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_do       public.delivery_orders%ROWTYPE;
  v_previous TEXT;
  v_valid    TEXT[];
  v_synced   INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_do FROM public.delivery_orders
   WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_do.id IS NULL THEN RAISE EXCEPTION 'Delivery order not found'; END IF;

  v_previous := v_do.status;

  IF v_previous = p_status THEN
    RETURN to_jsonb(v_do);
  END IF;

  v_valid := CASE v_previous
    WHEN 'draft'      THEN ARRAY['prepared', 'cancelled']
    WHEN 'prepared'   THEN ARRAY['dispatched', 'cancelled']
    WHEN 'dispatched' THEN ARRAY['delivered', 'cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_status = ANY(v_valid)) THEN
    RAISE EXCEPTION 'Cannot transition delivery order from % to %', v_previous, p_status;
  END IF;

  UPDATE public.delivery_orders SET
    status = p_status,
    received_by = COALESCE(p_received_by, received_by),
    delivery_date = CASE WHEN p_status = 'delivered' THEN COALESCE(delivery_date, CURRENT_DATE) ELSE delivery_date END,
    updated_at = now()
  WHERE id = p_do_id
  RETURNING * INTO v_do;

  IF p_status = 'delivered' THEN
    v_synced := public.sync_fulfillment_from_delivery_order(p_do_id, p_workspace_id, p_actor_id);
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
    'Delivery order ' || v_do.do_number || ' marked ' || p_status
      || CASE WHEN v_synced > 0 THEN ' (' || v_synced || ' fulfillment line(s) updated)' ELSE '' END,
    'delivery_order', v_do.id);

  RETURN to_jsonb(v_do);
END;
$$;

-- ---------------------------------------------------------------------
-- 4. One invoice per proforma invoice.
-- ---------------------------------------------------------------------
--
-- generate_document dispatches to create_invoice generically and has no
-- idea a proforma invoice is supposed to convert only once. Rather than
-- teach the generic engine about one specific pair, the rule is enforced
-- where the relationship is recorded: a trigger on
-- document_relationships, which every generation path writes to.
--
-- It stamps generated_invoice_id (so the UI's existing
-- `!generated_invoice_id` gate finally works) and refuses a second edge
-- from the same proforma invoice.
CREATE OR REPLACE FUNCTION enforce_one_invoice_per_proforma()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing UUID;
BEGIN
  IF NEW.from_type <> 'proforma_invoice' OR NEW.to_type <> 'invoice' THEN
    RETURN NEW;
  END IF;

  SELECT generated_invoice_id INTO v_existing
    FROM public.proforma_invoices
   WHERE id = NEW.from_id AND workspace_id = NEW.workspace_id
   FOR UPDATE;

  IF v_existing IS NOT NULL AND v_existing <> NEW.to_id THEN
    RAISE EXCEPTION 'An invoice has already been generated for this proforma invoice';
  END IF;

  UPDATE public.proforma_invoices
     SET generated_invoice_id = NEW.to_id,
         status = CASE WHEN status = 'accepted' THEN 'converted' ELSE status END,
         updated_at = now()
   WHERE id = NEW.from_id AND workspace_id = NEW.workspace_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_one_invoice_per_proforma ON public.document_relationships;
CREATE TRIGGER trg_one_invoice_per_proforma
  BEFORE INSERT ON public.document_relationships
  FOR EACH ROW EXECUTE FUNCTION enforce_one_invoice_per_proforma();

-- ---------------------------------------------------------------------
-- 5. Bound the withholding rates.
-- ---------------------------------------------------------------------
--
-- pph_percent and retensi_percent had no upper bound, so a 120% PPH made
-- the total negative -- and record_payment's `amount_paid >= total` test
-- is then trivially true, marking the invoice paid on any amount.
-- Percentages are percentages on all four document types.
-- PPH and retensi are clean across all four tables today, so those
-- constraints are added validated.
--
-- PPN is added NOT VALID. Exactly one historical row breaks it: invoice
-- 8918/AWP/2022, imported by 00100 carrying ppn_percent 110. Its source
-- spreadsheet row did not reconcile -- the line items sum to 22,200,000
-- against a stated total of 46,620,000 -- and the import's solver fitted
-- an absurd rate to close the gap. The money is right (it is paid, and
-- amount_paid matches the total); only the split is nonsense.
--
-- NOT VALID still enforces the rule on every INSERT and UPDATE from here
-- on, which is the point -- it just doesn't reject the existing row. It
-- is deliberately not rewritten here: choosing the real split is a
-- bookkeeping decision, not a migration's. To find it again:
--
--   SELECT invoice_number, subtotal, ppn_percent, ppn_amount, total
--     FROM public.invoices WHERE ppn_percent > 100;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'quotations', 'proforma_invoices', 'purchase_orders'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_pph_percent_range');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I
         CHECK (pph_percent IS NULL OR (pph_percent >= 0 AND pph_percent <= 100))',
      t, t || '_pph_percent_range');

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_retensi_percent_range');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I
         CHECK (retensi_percent IS NULL OR (retensi_percent >= 0 AND retensi_percent <= 100))',
      t, t || '_retensi_percent_range');

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_ppn_percent_range');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I
         CHECK (ppn_percent IS NULL OR (ppn_percent >= 0 AND ppn_percent <= 100)) NOT VALID',
      t, t || '_ppn_percent_range');
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
