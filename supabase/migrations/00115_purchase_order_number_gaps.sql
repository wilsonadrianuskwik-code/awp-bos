-- Closes the gaps deleted purchase orders leave in the number sequence,
-- and stops new ones appearing. The PO counterpart of 00108/00109.
--
-- WHY A NEW PO CAME OUT AS 002
-- create_purchase_order mints the number the moment the draft is created,
-- through generate_document_number -> document_number_counters. That
-- counter increments atomically and never gives a number back;
-- delete_purchase_order soft-deletes the row and leaves the counter where
-- it is. So starting a PO, deleting it, and starting another burns 001
-- and hands out 002.
--
-- WHAT THIS DOES
--   1. Renumbers live DRAFT POs to close existing gaps, and resets the
--      counter to match.
--   2. Teaches delete_purchase_order to return the number when the
--      deleted PO is a draft holding the top of the sequence.
--
-- WHAT IT DELIBERATELY WILL NOT DO
-- Issued POs are never renumbered and never return their number. A sent
-- PO's number is on a document the supplier is holding and quotes back on
-- their delivery note and invoice; reusing it would put two different
-- orders in circulation under one number. Only drafts are touched.
--
-- Two things make this simpler than the invoice version: a PO has no
-- internal_id sequence to keep in step, and idx_purchase_orders_number is
-- partial (WHERE deleted_at IS NULL), so a soft-deleted row stops
-- occupying its number the moment it is deleted. The invoice version
-- needed a VOID/ prefix to work around a unique index that reached across
-- deleted rows; nothing like that is needed here.

-- ---------------------------------------------------------------------
-- 1. Close the existing gaps.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_workspace_id UUID;
  v_year         TEXT;
  v_taken        INTEGER[];
  v_next         INTEGER;
  v_target       TEXT;
  r              RECORD;
  v_moved        INTEGER := 0;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting PO renumber';
  END IF;

  -- One year scope at a time: the counter resets yearly, so sequence
  -- numbers only compete within their own year. Comparing whole number
  -- strings instead of the sequence within its scope is the bug 00109
  -- had to repair on the invoice side; it is not repeated here.
  FOR v_year IN
    SELECT DISTINCT TO_CHAR(issue_date, 'YYYY')
    FROM public.purchase_orders
    WHERE workspace_id = v_workspace_id
      AND deleted_at IS NULL
      AND po_number ~ '^PO/AWP/\d{8}-\d+$'
    ORDER BY 1
  LOOP
    -- Numbers held by POs that have left the building. These are fixed
    -- points; drafts fill in around them.
    SELECT COALESCE(array_agg((regexp_match(po_number, '-(\d+)$'))[1]::INTEGER), '{}')
      INTO v_taken
    FROM public.purchase_orders
    WHERE workspace_id = v_workspace_id
      AND deleted_at IS NULL
      AND status <> 'draft'
      AND po_number ~ '^PO/AWP/\d{8}-\d+$'
      AND TO_CHAR(issue_date, 'YYYY') = v_year;

    -- Park every draft under a temporary number first. Without this a
    -- draft moving down into a number another draft still holds trips
    -- the unique index mid-pass.
    UPDATE public.purchase_orders
       SET po_number = 'TMP/' || LEFT(id::TEXT, 8) || '/' || po_number
     WHERE workspace_id = v_workspace_id
       AND deleted_at IS NULL
       AND status = 'draft'
       AND po_number ~ '^PO/AWP/\d{8}-\d+$'
       AND TO_CHAR(issue_date, 'YYYY') = v_year;

    -- Oldest draft takes the lowest free number, so the order people
    -- created them in is the order they end up in.
    v_next := 1;
    FOR r IN
      SELECT id, po_number, issue_date
      FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id
        AND deleted_at IS NULL
        AND status = 'draft'
        AND po_number ~ '^TMP/[0-9a-f]{8}/PO/AWP/\d{8}-\d+$'
        AND TO_CHAR(issue_date, 'YYYY') = v_year
      ORDER BY created_at
    LOOP
      WHILE v_next = ANY(v_taken) LOOP
        v_next := v_next + 1;
      END LOOP;

      v_target := 'PO/AWP/' || TO_CHAR(r.issue_date, 'DDMMYYYY') || '-' || LPAD(v_next::TEXT, 3, '0');

      UPDATE public.purchase_orders SET po_number = v_target WHERE id = r.id;
      IF v_target <> regexp_replace(r.po_number, '^TMP/[0-9a-f]{8}/', '') THEN
        v_moved := v_moved + 1;
      END IF;

      v_taken := v_taken || v_next;
      v_next := v_next + 1;
    END LOOP;

    -- The counter follows the highest number now actually in use, so the
    -- next PO continues from there rather than from the old high-water
    -- mark. GREATEST(...,0) keeps it sane if a year has no live POs left.
    UPDATE public.document_number_counters
       SET current_number = GREATEST(COALESCE((
             SELECT MAX((regexp_match(po_number, '-(\d+)$'))[1]::INTEGER)
             FROM public.purchase_orders
             WHERE workspace_id = v_workspace_id
               AND deleted_at IS NULL
               AND po_number ~ '^PO/AWP/\d{8}-\d+$'
               AND TO_CHAR(issue_date, 'YYYY') = v_year
           ), 0), 0)
     WHERE workspace_id = v_workspace_id
       AND document_type = 'purchase_order'
       AND scope_key = v_year;
  END LOOP;

  RAISE NOTICE 'Renumbered % draft purchase order(s)', v_moved;
END $$;

-- ---------------------------------------------------------------------
-- 2. Stop new gaps appearing: a deleted draft gives its number back.
-- ---------------------------------------------------------------------
--
-- Only when the draft holds the top of the sequence. Decrementing on a
-- middle deletion would hand the same number to two live POs, so that
-- case still leaves a gap. Deleting the newest draft -- what actually
-- happens when someone starts a PO by mistake -- is the case this closes.
CREATE OR REPLACE FUNCTION delete_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_po_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_po    public.purchase_orders%ROWTYPE;
  v_seq   INTEGER;
  v_scope TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.purchase_orders SET deleted_at = now() WHERE id = p_po_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_po;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  -- Give the number back, drafts only -- see header.
  IF v_po.status = 'draft' AND v_po.po_number ~ '^PO/AWP/\d{8}-\d+$' THEN
    v_scope := TO_CHAR(v_po.issue_date, 'YYYY');
    v_seq   := (regexp_match(v_po.po_number, '-(\d+)$'))[1]::INTEGER;

    -- The counter only moves when it still reads exactly this PO's
    -- number, i.e. nothing has been created since. Otherwise this draft
    -- is no longer the top and returning its number would hand the same
    -- one to two live documents.
    UPDATE public.document_number_counters
       SET current_number = current_number - 1
     WHERE workspace_id = p_workspace_id
       AND document_type = 'purchase_order'
       AND scope_key = v_scope
       AND current_number = v_seq;
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted purchase order ' || v_po.po_number, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$$;

NOTIFY pgrst, 'reload schema';
