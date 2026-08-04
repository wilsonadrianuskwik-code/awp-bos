-- Closes the gaps deleted invoices leave in the number sequence, and
-- stops new ones appearing.
--
-- WHY 001 JUMPED TO 004
-- create_invoice mints the number the moment a draft is created, via
-- generate_document_number -> document_number_counters, which increments
-- atomically and never gives a number back. delete_invoice soft-deletes
-- the row and leaves the counter where it is. So starting two invoices
-- and deleting them burns 002 and 003, and the next one is 004. The
-- internal_id sequence (document_sequences) behaves the same way, which
-- is why 2026-00021 jumped to 2026-00024 alongside it.
--
-- WHAT THIS DOES
--
-- 1. Renumbers live DRAFT invoices to close existing gaps, and resets
--    both counters to match.
--
-- 2. Teaches delete_invoice to return the number when the deleted
--    invoice is a draft holding the top of the sequence.
--
-- WHAT IT DELIBERATELY WILL NOT DO
-- Issued documents are never renumbered and never return their number.
-- A sent invoice's number is on a document the client is holding and
-- quotes back on their remittance; reusing it would put two different
-- invoices in circulation under one number, and renumbering it would
-- break the reference. Only drafts -- which have never left the building
-- -- are touched. A gap left by deleting an issued invoice is correct
-- and stays.

-- ---------------------------------------------------------------------
-- 1. Close the existing gaps.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_workspace_id  UUID;
  v_scope         TEXT := '2026';
  v_ids           UUID[];
  v_id            UUID;
  v_issue         DATE;
  v_next          INTEGER := 0;
  v_reserved      INTEGER[];
  v_new_number    TEXT;
  v_new_internal  TEXT;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting renumber';
  END IF;

  -- Release the numbers held by soft-deleted DRAFTS. Both UNIQUE
  -- indexes span deleted rows, so a deleted draft sitting on 002 would
  -- otherwise block a live draft from moving onto it. A draft never left
  -- the building, so its number is free to reissue; the original stays
  -- readable inside the marker, and the row id keeps the marker unique
  -- (a bare 'VOID/' prefix collides the second time the same number is
  -- issued and deleted).
  --
  -- Deleted ISSUED invoices are deliberately excluded: their number is
  -- printed on a document a client is holding, so it stays occupied and
  -- the sequence skips it forever.
  UPDATE public.invoices
     SET invoice_number = 'VOID/' || LEFT(id::TEXT, 8) || '/' || invoice_number,
         internal_id    = CASE
           WHEN internal_id IS NULL THEN NULL
           ELSE 'VOID/' || LEFT(id::TEXT, 8) || '/' || internal_id
         END
   WHERE workspace_id = v_workspace_id
     AND deleted_at IS NOT NULL
     AND status = 'draft'
     AND invoice_number ~ ('^INV/AWP/\d{4}' || v_scope || '-\d+$');

  -- Sequences that must never be reissued: anything ever issued, live
  -- or since deleted -- its number is on a document that left the
  -- building.
  SELECT COALESCE(array_agg((regexp_match(invoice_number, '-(\d+)$'))[1]::INTEGER), '{}')
    INTO v_reserved
    FROM public.invoices
   WHERE workspace_id = v_workspace_id
     AND status <> 'draft'
     AND invoice_number ~ ('^INV/AWP/\d{4}' || v_scope || '-\d+$');

  -- The drafts to renumber, oldest first, captured before anything moves.
  SELECT array_agg(id ORDER BY created_at) INTO v_ids
    FROM public.invoices
   WHERE workspace_id = v_workspace_id
     AND deleted_at IS NULL
     AND status = 'draft'
     AND invoice_number ~ ('^INV/AWP/\d{4}' || v_scope || '-\d+$');

  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- Park them on unique throwaway strings first. Both UNIQUE indexes
  -- span every row in the table, so without this a draft moving down
  -- into 002 could collide with a draft still sitting on 002 that is
  -- itself about to move. Parking first means the only rows still
  -- holding real numbers are the ones that must keep them.
  UPDATE public.invoices
     SET invoice_number = 'TMP/' || id::TEXT,
         internal_id    = 'TMP/' || id::TEXT
   WHERE id = ANY(v_ids);

  -- Hand out the lowest free numbers, skipping any still held by a row
  -- that keeps it: a live issued invoice, or a deleted issued one (whose
  -- number is on a document that left the building and is never reused).
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT issue_date INTO v_issue FROM public.invoices WHERE id = v_id;

    -- Freeness is judged on the SEQUENCE, not the whole string. The
    -- sequence is workspace-and-year scoped (one counter per year, see
    -- generate_document_number in 00091), but it sits inside a
    -- date-stamped number -- so INV/AWP/03082026-001 and
    -- INV/AWP/04082026-001 are different strings holding the same
    -- sequence, and a string comparison hands 001 out twice.
    LOOP
      v_next := v_next + 1;
      EXIT WHEN NOT (v_next = ANY(v_reserved));
    END LOOP;
    v_new_number := 'INV/AWP/' || TO_CHAR(v_issue, 'DDMMYYYY')
                 || '-' || LPAD(v_next::TEXT, 3, '0');

    -- internal_id follows the invoice sequence, so the two stay in step.
    v_new_internal := v_scope || '-' || LPAD(v_next::TEXT, 5, '0');

    UPDATE public.invoices
       SET invoice_number = v_new_number,
           internal_id    = v_new_internal,
           updated_at     = now()
     WHERE id = v_id;
  END LOOP;

  -- Point both counters at the last number actually in use, so the next
  -- invoice continues the sequence instead of resuming from the burnt
  -- high-water mark.
  -- Upsert, not update: if the counter row is missing the next
  -- create_invoice would insert it at 1 and reissue a number already in
  -- use, which is the same class of collision this migration exists to
  -- clear up.
  INSERT INTO public.document_number_counters
              (workspace_id, document_type, scope_key, current_number)
       VALUES (v_workspace_id, 'invoice', v_scope, v_next)
  ON CONFLICT (workspace_id, document_type, scope_key)
  DO UPDATE SET current_number = EXCLUDED.current_number;

  INSERT INTO public.document_sequences
              (workspace_id, document_type, prefix, current_number, period)
       VALUES (v_workspace_id, 'invoice_internal', '', v_next, v_scope::INTEGER)
  ON CONFLICT (workspace_id, document_type, period)
  DO UPDATE SET current_number = EXCLUDED.current_number;
END $$;

-- ---------------------------------------------------------------------
-- 2. Stop new gaps appearing: a deleted draft gives its number back.
-- ---------------------------------------------------------------------
--
-- Only when the draft holds the top of the sequence. Decrementing on a
-- middle deletion would hand the same number to two live documents, so
-- that case still leaves a gap -- deleting the newest draft, which is
-- what actually happens when someone starts an invoice by mistake, is
-- the case this closes.
--
-- The counter is only rolled back when it still reads exactly this
-- document's sequence: if anything else was created in between, the
-- number is no longer the top and returning it would collide.
CREATE OR REPLACE FUNCTION delete_invoice(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old      public.invoices%ROWTYPE;
  v_seq      INTEGER;
  v_scope    TEXT;
  v_internal INTEGER;
  v_released BOOLEAN := false;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  UPDATE public.invoices SET deleted_at = now() WHERE id = p_invoice_id;

  -- Give the number back, drafts only -- see header.
  IF v_old.status = 'draft' THEN
    v_scope    := TO_CHAR(v_old.issue_date, 'YYYY');
    v_seq      := (regexp_match(v_old.invoice_number, '-(\d+)$'))[1]::INTEGER;
    v_internal := (regexp_match(COALESCE(v_old.internal_id, ''), '-(\d+)$'))[1]::INTEGER;

    -- Each counter only moves when it still reads exactly this
    -- document's number, i.e. nothing has been created since. Otherwise
    -- this draft is no longer the top and returning its number would
    -- hand the same one to two live documents.
    IF v_seq IS NOT NULL THEN
      UPDATE public.document_number_counters
         SET current_number = current_number - 1
       WHERE workspace_id = p_workspace_id
         AND document_type = 'invoice'
         AND scope_key = v_scope
         AND current_number = v_seq;
      v_released := FOUND;
    END IF;

    IF v_internal IS NOT NULL THEN
      UPDATE public.document_sequences
         SET current_number = current_number - 1
       WHERE workspace_id = p_workspace_id
         AND document_type = 'invoice_internal'
         AND period = v_scope::INTEGER
         AND current_number = v_internal;
      v_released := v_released OR FOUND;
    END IF;

    -- Both UNIQUE indexes reach across soft-deleted rows, so this row
    -- has to stop occupying the strings before they can be reissued --
    -- otherwise the next create_invoice would fail on a duplicate key.
    -- The original values stay readable inside the prefixed string.
    --
    -- The row id is part of the marker because a plain 'VOID/' prefix is
    -- not unique: reissue 003, delete it again, and the second void
    -- collides with the first on the very same UNIQUE index this is
    -- working around.
    IF v_released THEN
      UPDATE public.invoices
         SET invoice_number = 'VOID/' || LEFT(id::TEXT, 8) || '/' || invoice_number,
             internal_id    = CASE
               WHEN internal_id IS NULL THEN NULL
               ELSE 'VOID/' || LEFT(id::TEXT, 8) || '/' || internal_id
             END
       WHERE id = p_invoice_id;
    END IF;
  END IF;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'invoice', p_invoice_id);

  RETURN jsonb_build_object('success', true, 'id', p_invoice_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
