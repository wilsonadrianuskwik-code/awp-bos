-- Repairs the renumber 00108 got wrong, and fixes the flaw that caused it.
--
-- THE BUG
-- 00108 decided whether a candidate number was free by comparing the
-- whole string. But the sequence sits inside a date-stamped number, so
--
--   INV/AWP/03082026-001   (PT Persada Bumi Etam, sent)
--   INV/AWP/04082026-001   (PT DIPO, draft)
--
-- are different strings holding the same sequence. The check passed and
-- the draft was handed 001 even though it was already taken, producing
-- two invoices numbered -001 in the same year. The sequence is
-- workspace-and-year scoped -- one counter, per generate_document_number
-- (00091) -- so freeness has to be judged on the sequence number, not
-- the string it is embedded in. That is what this migration does.
--
-- 00108's own DO block has been corrected in the repository too, so a
-- fresh environment applying the chain from scratch lands here directly.
-- This migration exists because the flawed version already ran against
-- production, and re-running the corrected 00108 would not undo it.
--
-- WHAT THE RESULT SHOULD BE
--   Persada (sent,  issued 3 Aug)  INV/AWP/03082026-001   2026-00001
--   DIPO    (draft, issued 4 Aug)  INV/AWP/04082026-002   2026-00002
--
-- Sent invoices still never move: Persada keeps 03082026-001 because it
-- already holds sequence 1, and the draft takes the next free one. No
-- client-facing number changes.
--
-- internal_id is resequenced across both, including the sent invoice, so
-- the two run in lockstep with the invoice sequence. That is a change to
-- an issued row, done deliberately: internal_id is a register key used
-- inside the app, it is not printed on the document the client holds, and
-- leaving Persada on 2026-00021 next to invoice -001 was the thing that
-- looked wrong.
--
-- SCOPE
-- Only app-generated numbers, matched as INV/AWP/DDMM<year>-NNN. The
-- imported historical invoices carry entirely different formats
-- (AWP-P/..., PI AWP-P/..., OLD/2021/...) and no internal_id at all, so
-- they cannot be caught by this.

DO $$
DECLARE
  v_workspace_id UUID;
  v_scope        TEXT := '2026';
  v_pattern      TEXT;
  v_reserved     INTEGER[];
  v_ids          UUID[];
  v_id           UUID;
  v_issue        DATE;
  v_seq          INTEGER;
  v_next         INTEGER := 0;
  v_max          INTEGER := 0;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting resequence';
  END IF;

  v_pattern := '^INV/AWP/\d{4}' || v_scope || '-\d+$';

  -- Sequences that must not be reissued: anything ever issued, whether
  -- it is still live or has since been deleted. Its number is printed on
  -- a document that left the building.
  SELECT COALESCE(array_agg((regexp_match(invoice_number, '-(\d+)$'))[1]::INTEGER), '{}')
    INTO v_reserved
    FROM public.invoices
   WHERE workspace_id = v_workspace_id
     AND status <> 'draft'
     AND invoice_number ~ v_pattern;

  -- ---------------------------------------------------------------
  -- Invoice numbers: drafts only, lowest free sequence, oldest first.
  -- ---------------------------------------------------------------
  SELECT array_agg(id ORDER BY created_at) INTO v_ids
    FROM public.invoices
   WHERE workspace_id = v_workspace_id
     AND deleted_at IS NULL
     AND status = 'draft'
     AND invoice_number ~ v_pattern;

  IF v_ids IS NOT NULL THEN
    -- Park first: both UNIQUE indexes span every row, so a draft moving
    -- onto a number another draft is about to vacate would collide.
    UPDATE public.invoices
       SET invoice_number = 'TMP/' || id::TEXT
     WHERE id = ANY(v_ids);

    FOREACH v_id IN ARRAY v_ids
    LOOP
      SELECT issue_date INTO v_issue FROM public.invoices WHERE id = v_id;

      LOOP
        v_next := v_next + 1;
        EXIT WHEN NOT (v_next = ANY(v_reserved));
      END LOOP;

      UPDATE public.invoices
         SET invoice_number = 'INV/AWP/' || TO_CHAR(v_issue, 'DDMMYYYY')
                            || '-' || LPAD(v_next::TEXT, 3, '0'),
             updated_at = now()
       WHERE id = v_id;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------
  -- internal_id: follows the invoice sequence, for every live invoice
  -- in scope. Parked first for the same reason as above.
  -- ---------------------------------------------------------------
  SELECT array_agg(id) INTO v_ids
    FROM public.invoices
   WHERE workspace_id = v_workspace_id
     AND deleted_at IS NULL
     AND invoice_number ~ v_pattern;

  IF v_ids IS NOT NULL THEN
    UPDATE public.invoices
       SET internal_id = 'TMP/' || id::TEXT
     WHERE id = ANY(v_ids);

    FOREACH v_id IN ARRAY v_ids
    LOOP
      SELECT (regexp_match(invoice_number, '-(\d+)$'))[1]::INTEGER
        INTO v_seq
        FROM public.invoices WHERE id = v_id;

      UPDATE public.invoices
         SET internal_id = v_scope || '-' || LPAD(v_seq::TEXT, 5, '0'),
             updated_at  = now()
       WHERE id = v_id;

      IF v_seq > v_max THEN v_max := v_seq; END IF;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------
  -- Both counters point at the highest sequence in use, so the next
  -- invoice continues rather than repeating or skipping.
  -- ---------------------------------------------------------------
  SELECT GREATEST(
           COALESCE(MAX((regexp_match(invoice_number, '-(\d+)$'))[1]::INTEGER), 0),
           v_max)
    INTO v_max
    FROM public.invoices
   WHERE workspace_id = v_workspace_id
     AND invoice_number ~ v_pattern;

  -- Upsert, not update: if the counter row is missing the next
  -- create_invoice would insert it at 1 and reissue a number already in
  -- use, which is the same class of collision this migration exists to
  -- clear up.
  INSERT INTO public.document_number_counters
              (workspace_id, document_type, scope_key, current_number)
       VALUES (v_workspace_id, 'invoice', v_scope, v_max)
  ON CONFLICT (workspace_id, document_type, scope_key)
  DO UPDATE SET current_number = EXCLUDED.current_number;

  INSERT INTO public.document_sequences
              (workspace_id, document_type, prefix, current_number, period)
       VALUES (v_workspace_id, 'invoice_internal', '', v_max, v_scope::INTEGER)
  ON CONFLICT (workspace_id, document_type, period)
  DO UPDATE SET current_number = EXCLUDED.current_number;
END $$;

NOTIFY pgrst, 'reload schema';
