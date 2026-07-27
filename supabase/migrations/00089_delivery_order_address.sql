-- Construction BOS: let a Delivery Order carry its own delivery address.
--
-- delivery_orders.delivery_address has existed since 00073 but nothing
-- ever wrote to it — the printed DO addressed the billing client, which
-- is wrong whenever goods go to a site rather than to the client's
-- office. That is the normal case in construction: the client is a head
-- office in one city, the material goes to a project site in another.
--
-- No schema change is needed (the JSONB column is already there); what
-- was missing is a way to edit it after creation, since the only DO
-- mutation until now was update_delivery_order_status.

CREATE OR REPLACE FUNCTION update_delivery_order(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_do_id UUID,
  p_input JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_do public.delivery_orders%ROWTYPE;
  v_result JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_do FROM public.delivery_orders
  WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_do.id IS NULL THEN
    RAISE EXCEPTION 'Delivery order not found';
  END IF;

  -- A cancelled DO is a closed record. A delivered one stays editable on
  -- purpose: correcting the address or the received-by name after the
  -- fact is ordinary bookkeeping, and neither field feeds the
  -- fulfillment sync (00081) — that keys off line items, which this
  -- function deliberately does not touch.
  IF v_do.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled delivery order cannot be edited';
  END IF;

  UPDATE public.delivery_orders SET
    delivery_date    = CASE WHEN p_input ? 'delivery_date'
                            THEN (p_input->>'delivery_date')::DATE
                            ELSE delivery_date END,
    -- An explicit null clears the override, which makes the document
    -- fall back to the client's own address when printed.
    delivery_address = CASE WHEN p_input ? 'delivery_address'
                            THEN p_input->'delivery_address'
                            ELSE delivery_address END,
    received_by      = CASE WHEN p_input ? 'received_by'
                            THEN p_input->>'received_by'
                            ELSE received_by END,
    notes            = CASE WHEN p_input ? 'notes'
                            THEN p_input->>'notes'
                            ELSE notes END,
    updated_at = now()
  WHERE id = p_do_id AND workspace_id = p_workspace_id;

  SELECT to_jsonb(t.*) INTO v_result
  FROM public.delivery_orders t WHERE t.id = p_do_id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
          'Updated delivery order ' || v_do.do_number, 'delivery_order', p_do_id);

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
