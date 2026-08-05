-- Deletes PO/AWP/05082026-002 by request.
--
-- Separate from 00117, which deleted the -002 and -003 that existed when
-- it was written. If 00117 has already run, this is a different document
-- that took the freed number afterwards; if it has not, this still does
-- the right thing. Either way the migration is a no-op when nothing
-- matches, so it is safe to apply whatever order things ran in.
--
-- Soft delete, the same thing the Delete button does: the row stays for
-- audit and deleted_at removes it from every view. With 00116 applied the
-- number is free again immediately, so the next PO of the year takes 002.

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

  SELECT user_id INTO v_actor_id
  FROM public.workspace_members
  WHERE workspace_id = v_workspace_id AND role = 'owner' AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  -- Both spellings are matched as exact strings, never as a pattern: the
  -- request came in with hyphens, the app writes slashes, and a LIKE here
  -- could reach documents nobody asked to delete.
  FOR r IN
    SELECT id, po_number
    FROM public.purchase_orders
    WHERE workspace_id = v_workspace_id
      AND deleted_at IS NULL
      AND po_number IN ('PO/AWP/05082026-002', 'PO-AWP-05082026-002')
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

  IF v_count = 0 THEN
    RAISE NOTICE 'No live PO/AWP/05082026-002 found -- nothing to do';
  END IF;
END $$;
