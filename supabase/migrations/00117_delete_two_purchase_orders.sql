-- Deletes PO/AWP/05082026-002 and PO/AWP/05082026-003 by request.
--
-- Soft delete, the same thing the Delete button does: the rows stay for
-- audit, deleted_at stops them appearing anywhere in the app. With 00116
-- in place their numbers become free immediately -- the next two POs
-- created that year will take 002 and 003 -- so nothing needs to touch
-- document_number_counters here.
--
-- Line items are left attached to the soft-deleted rows, exactly as
-- delete_purchase_order leaves them.

DO $$
DECLARE
  v_workspace_id UUID;
  v_actor_id     UUID;
  r              RECORD;
  v_count        INTEGER := 0;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting PO deletion';
  END IF;

  -- Attribute the deletion to a workspace owner, since a migration has no
  -- session user of its own.
  SELECT user_id INTO v_actor_id
  FROM public.workspace_members
  WHERE workspace_id = v_workspace_id AND role = 'owner' AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  FOR r IN
    SELECT id, po_number
    FROM public.purchase_orders
    WHERE workspace_id = v_workspace_id
      AND deleted_at IS NULL
      AND po_number IN ('PO/AWP/05082026-002', 'PO/AWP/05082026-003')
  LOOP
    UPDATE public.purchase_orders SET deleted_at = now() WHERE id = r.id;

    IF v_actor_id IS NOT NULL THEN
      INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
      VALUES (v_workspace_id, v_actor_id, 'delete',
              'Deleted purchase order ' || r.po_number, 'purchase_order', r.id);
    END IF;

    v_count := v_count + 1;
    RAISE NOTICE 'Deleted %', r.po_number;
  END LOOP;

  RAISE NOTICE 'Deleted % purchase order(s)', v_count;
END $$;
