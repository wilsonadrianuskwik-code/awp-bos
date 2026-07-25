-- Construction BOS: connect Delivery Orders to Fulfillment.
--
-- These were two independent trackers of the same fact. fulfillment_items
-- are auto-created per invoice line item and accumulate delivered
-- quantities through fulfillment_events; Delivery Orders are separate
-- numbered documents whose own line items were pure free text. Marking a
-- Delivery Order "delivered" moved no fulfillment progress, and recording
-- fulfillment left the Delivery Orders untouched — two sources of truth
-- for "how much has actually been delivered", guaranteed to disagree.
--
-- The missing piece was a link from a delivery order's line back to the
-- invoice line it fulfils. With that, marking a DO delivered can post the
-- corresponding fulfillment events automatically.

-- Which line this line fulfils. Generic on line_items (rather than a
-- delivery-order-specific table) because the same idea applies to any
-- document generated from another — a PO line sourced from a quotation
-- line, a goods receipt line sourced from a PO line.
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS source_line_item_id UUID REFERENCES line_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_line_items_source ON line_items(source_line_item_id) WHERE source_line_item_id IS NOT NULL;

-- Posts fulfillment progress for every line of a delivered Delivery Order.
--
-- Deliberately writes fulfillment_events directly instead of calling
-- record_fulfillment_event: that function enforces whole-number
-- quantities (an artifact of the content-agency origin, wrong for m2/kg
-- deliveries) and raises when a tracker is already complete, which would
-- abort the whole status change instead of skipping one line.
--
-- Idempotent via fulfillment_events.idempotency_key, so re-marking a
-- Delivery Order delivered — or moving it back and forth — never
-- double-counts.
CREATE OR REPLACE FUNCTION sync_fulfillment_from_delivery_order(
  p_do_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_do public.delivery_orders%ROWTYPE;
  v_line RECORD;
  v_item public.fulfillment_items%ROWTYPE;
  v_key TEXT;
  v_purchased NUMERIC;
  v_delivered NUMERIC;
  v_recorded INTEGER := 0;
BEGIN
  SELECT * INTO v_do FROM public.delivery_orders
  WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_do.id IS NULL THEN RETURN 0; END IF;

  FOR v_line IN
    SELECT li.id, li.source_line_item_id, li.quantity
    FROM public.line_items li
    WHERE li.entity_type = 'delivery_order'
      AND li.entity_id = p_do_id
      AND li.source_line_item_id IS NOT NULL
      AND li.quantity > 0
  LOOP
    -- The tracker for the invoice line this delivery line fulfils.
    -- package_item_index < 0 selects the plain (non-package) tracker;
    -- package sub-trackers are fulfilled through their own flow.
    SELECT * INTO v_item FROM public.fulfillment_items
    WHERE workspace_id = p_workspace_id
      AND invoice_id = v_do.invoice_id
      AND line_item_id = v_line.source_line_item_id
      AND COALESCE(package_item_index, -1) < 0
      AND deleted_at IS NULL
    LIMIT 1;

    CONTINUE WHEN v_item.id IS NULL OR v_item.status = 'cancelled';

    v_key := 'delivery_order:' || p_do_id::TEXT || ':' || v_line.id::TEXT;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.fulfillment_events
      WHERE idempotency_key = v_key AND deleted_at IS NULL
    );

    INSERT INTO public.fulfillment_events (
      workspace_id, fulfillment_item_id, quantity_delivered, event_date,
      notes, idempotency_key, recorded_by
    )
    VALUES (
      p_workspace_id, v_item.id, v_line.quantity,
      COALESCE(v_do.delivery_date, CURRENT_DATE),
      'Delivered on ' || v_do.do_number, v_key, p_actor_id
    );

    SELECT li.quantity INTO v_purchased FROM public.line_items li WHERE li.id = v_item.line_item_id;
    SELECT COALESCE(SUM(quantity_delivered), 0) INTO v_delivered
    FROM public.fulfillment_events
    WHERE fulfillment_item_id = v_item.id AND deleted_at IS NULL;

    UPDATE public.fulfillment_items
    SET status = CASE
          WHEN v_delivered >= v_purchased THEN 'completed'
          WHEN v_delivered > 0 THEN 'in_progress'
          ELSE status
        END,
        updated_at = now()
    WHERE id = v_item.id;

    v_recorded := v_recorded + 1;
  END LOOP;

  RETURN v_recorded;
END;
$$;

-- Reverses the above when a delivered Delivery Order is cancelled, so the
-- invoice's fulfillment progress doesn't keep counting goods that were
-- never delivered. Soft-deletes only this DO's own events (matched by
-- idempotency key), leaving manually recorded progress alone.
CREATE OR REPLACE FUNCTION revert_fulfillment_from_delivery_order(
  p_do_id UUID,
  p_workspace_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_event RECORD;
  v_purchased NUMERIC;
  v_delivered NUMERIC;
  v_reverted INTEGER := 0;
BEGIN
  FOR v_event IN
    SELECT fe.id, fe.fulfillment_item_id
    FROM public.fulfillment_events fe
    WHERE fe.workspace_id = p_workspace_id
      AND fe.deleted_at IS NULL
      AND fe.idempotency_key LIKE 'delivery_order:' || p_do_id::TEXT || ':%'
  LOOP
    UPDATE public.fulfillment_events SET deleted_at = now() WHERE id = v_event.id;

    SELECT li.quantity INTO v_purchased
    FROM public.line_items li
    JOIN public.fulfillment_items fi ON fi.line_item_id = li.id
    WHERE fi.id = v_event.fulfillment_item_id;

    SELECT COALESCE(SUM(quantity_delivered), 0) INTO v_delivered
    FROM public.fulfillment_events
    WHERE fulfillment_item_id = v_event.fulfillment_item_id AND deleted_at IS NULL;

    UPDATE public.fulfillment_items
    SET status = CASE
          WHEN v_delivered >= v_purchased AND v_delivered > 0 THEN 'completed'
          WHEN v_delivered > 0 THEN 'in_progress'
          ELSE 'pending'
        END,
        updated_at = now()
    WHERE id = v_event.fulfillment_item_id AND status <> 'cancelled';

    v_reverted := v_reverted + 1;
  END LOOP;

  RETURN v_reverted;
END;
$$;

-- Status changes now drive fulfillment in both directions.
CREATE OR REPLACE FUNCTION update_delivery_order_status(p_workspace_id UUID, p_actor_id UUID, p_do_id UUID, p_status TEXT, p_received_by TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_do public.delivery_orders%ROWTYPE;
  v_previous TEXT;
  v_synced INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT status INTO v_previous FROM public.delivery_orders
  WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  UPDATE public.delivery_orders SET
    status = p_status,
    received_by = COALESCE(p_received_by, received_by),
    delivery_date = CASE WHEN p_status = 'delivered' THEN COALESCE(delivery_date, CURRENT_DATE) ELSE delivery_date END,
    updated_at = now()
  WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  RETURNING * INTO v_do;
  IF v_do.id IS NULL THEN RAISE EXCEPTION 'Delivery order not found'; END IF;

  IF p_status = 'delivered' THEN
    v_synced := public.sync_fulfillment_from_delivery_order(p_do_id, p_workspace_id, p_actor_id);
  ELSIF v_previous = 'delivered' AND p_status <> 'delivered' THEN
    v_synced := public.revert_fulfillment_from_delivery_order(p_do_id, p_workspace_id);
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
    'Delivery order ' || v_do.do_number || ' marked ' || p_status
      || CASE WHEN v_synced > 0 THEN ' (' || v_synced || ' fulfillment line(s) updated)' ELSE '' END,
    'delivery_order', v_do.id);

  RETURN to_jsonb(v_do);
END;
$$;

-- Soft-deleting a delivered Delivery Order must also release its
-- fulfillment progress, for the same reason cancelling does.
CREATE OR REPLACE FUNCTION delete_delivery_order(p_workspace_id UUID, p_actor_id UUID, p_do_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_do public.delivery_orders%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  PERFORM public.revert_fulfillment_from_delivery_order(p_do_id, p_workspace_id);

  UPDATE public.delivery_orders SET deleted_at = now()
  WHERE id = p_do_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_do;
  IF v_do.id IS NULL THEN RAISE EXCEPTION 'Delivery order not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted delivery order ' || v_do.do_number, 'delivery_order', v_do.id);

  RETURN to_jsonb(v_do);
END;
$$;

-- create_delivery_order now stores the source link on each line, which is
-- what makes the sync above possible. Callers that don't supply one still
-- work; those lines simply won't post fulfillment automatically.
CREATE OR REPLACE FUNCTION create_delivery_order(p_workspace_id UUID, p_actor_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_do public.delivery_orders%ROWTYPE;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = (p_input->>'invoice_id')::UUID AND workspace_id = p_workspace_id;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  v_project_id := COALESCE((p_input->>'project_id')::UUID, v_invoice.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'delivery_order', CURRENT_DATE,
    v_project_code, v_project_id, 'DO'
  );

  INSERT INTO public.delivery_orders (workspace_id, do_number, invoice_id, project_id, client_id, delivery_date, delivery_address, notes, created_by)
  VALUES (p_workspace_id, v_number, v_invoice.id, v_project_id,
    v_invoice.client_id, (p_input->>'delivery_date')::DATE, p_input->'delivery_address', p_input->>'notes', p_actor_id)
  RETURNING * INTO v_do;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'line_items', '[]'::jsonb))
  LOOP
    INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, source_line_item_id)
    VALUES (p_workspace_id, 'delivery_order', v_do.id, 'per_unit', v_sort,
      v_item->>'description', (v_item->>'quantity')::NUMERIC, 0, v_item->>'unit',
      NULLIF(v_item->>'source_line_item_id', '')::UUID);
    v_sort := v_sort + 1;
  END LOOP;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created delivery order ' || v_do.do_number, 'delivery_order', v_do.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'delivery_order', v_do.id, to_jsonb(v_do));

  RETURN to_jsonb(v_do);
END;
$$;

-- The generic copy now carries each source line's id forward, so any
-- document generated from another can trace its lines back. Target
-- create_* functions that don't read it are unaffected.
CREATE OR REPLACE FUNCTION generate_document(
  p_workspace_id UUID, p_actor_id UUID,
  p_from_type TEXT, p_from_id UUID, p_to_type TEXT,
  p_overrides JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_rule public.document_generation_rules%ROWTYPE;
  v_from_type public.document_type_registry%ROWTYPE;
  v_to_type public.document_type_registry%ROWTYPE;
  v_source JSONB;
  v_input JSONB := '{}'::jsonb;
  v_key TEXT; v_src_col TEXT;
  v_new_id UUID;
  v_result JSONB;
  v_create_fn TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_from_type FROM public.document_type_registry WHERE key = p_from_type AND is_active;
  SELECT * INTO v_to_type FROM public.document_type_registry WHERE key = p_to_type AND is_active;
  IF v_from_type.key IS NULL OR v_to_type.key IS NULL THEN
    RAISE EXCEPTION 'Unknown document type';
  END IF;

  SELECT * INTO v_rule FROM public.document_generation_rules WHERE from_type = p_from_type AND to_type = p_to_type AND is_active;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'No generation rule from % to %', p_from_type, p_to_type;
  END IF;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', v_from_type.table_name)
    INTO v_source USING p_from_id;
  IF v_source IS NULL THEN RAISE EXCEPTION 'Source document not found'; END IF;

  FOR v_key, v_src_col IN SELECT * FROM jsonb_each_text(v_rule.field_mapping)
  LOOP
    v_input := v_input || jsonb_build_object(v_key, (v_source->>v_src_col));
  END LOOP;
  v_input := v_input || p_overrides;

  IF v_rule.copy_line_items AND v_from_type.items_entity_type IS NOT NULL AND v_to_type.items_entity_type IS NOT NULL THEN
    v_input := v_input || jsonb_build_object('line_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category', li.category, 'description', li.description, 'quantity', li.quantity,
        'unit_price', li.unit_price, 'unit', li.unit, 'discount_percent', li.discount_percent,
        'tax_percent', li.tax_percent, 'catalog_item_id', li.catalog_item_id,
        'source_line_item_id', li.id
      ) ORDER BY li.sort_order), '[]'::jsonb)
      FROM public.line_items li WHERE li.entity_type = v_from_type.items_entity_type AND li.entity_id = p_from_id
    ));
  END IF;

  v_create_fn := 'create_' || p_to_type;
  EXECUTE format('SELECT public.%I($1, $2, $3)', v_create_fn)
    INTO v_result USING p_workspace_id, p_actor_id, v_input;

  v_new_id := (v_result->>'id')::UUID;

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, p_to_type, v_new_id, p_from_type, p_from_id, 'generated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id, secondary_entity_type, secondary_entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Generated ' || v_to_type.label || ' from ' || v_from_type.label, p_to_type, v_new_id, p_from_type, p_from_id);

  RETURN v_result;
END;
$$;
