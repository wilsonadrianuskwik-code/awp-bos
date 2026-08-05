-- Numbers freed by deleting a document get reused: the next document
-- takes the lowest number not currently in use, instead of always taking
-- one more than the highest ever issued.
--
-- WHAT WAS WRONG
-- generate_document_number allocated from document_number_counters, which
-- only ever increments. 00108 and 00115 softened that by decrementing the
-- counter when the deleted document happened to hold the very top of the
-- sequence, but that only covers one case. Delete 003 while 004 exists,
-- or delete a document that was already sent, and the gap was permanent —
-- the next document went to 005 with 003 sitting empty forever.
--
-- WHAT THIS DOES
-- The sequence is now derived from the documents that actually exist,
-- not from a counter's memory of what once did. Allocation reads the live
-- rows of that document type in the same scope period, and picks the
-- lowest positive number none of them is using. Deleting 003 therefore
-- frees 003, whether it was a draft or had been sent, and whether or not
-- it was the newest.
--
-- CANCELLING STILL DOES NOT FREE A NUMBER, and that is deliberate: a
-- cancelled document is still a row in your register, still listed, still
-- printable. Reusing its number would put two unrelated documents in
-- circulation under one number. Deleting is the action that says the
-- document should not exist; cancelling says it exists and did not go
-- ahead.
--
-- The counter table is kept and still moved forward, so nothing that
-- reads it breaks, but it is no longer what decides the number.
--
-- CONCURRENCY
-- The old INSERT ... ON CONFLICT DO UPDATE was atomic on its own. Reading
-- the live rows and choosing a gap is not, so allocation now takes a
-- transaction-scoped advisory lock keyed on workspace + type + scope.
-- Two documents created at the same instant queue behind each other
-- rather than both seeing the same gap. The partial UNIQUE index on each
-- table remains the backstop.
--
-- PAYMENTS ARE EXCLUDED. payments has no deleted_at and its uniqueness
-- constraint is not partial, so there is no such thing as a freed payment
-- number; it keeps the counter path unchanged.

CREATE OR REPLACE FUNCTION generate_document_number(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_date DATE,
  p_project_code TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_default_prefix TEXT DEFAULT ''
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template      public.document_number_templates%ROWTYPE;
  v_template_str  TEXT;
  v_cadence       TEXT;
  v_scope         TEXT;
  v_scope_key     TEXT;
  v_result        TEXT;
  v_seq_width     INT;
  v_random_width  INT;
  v_number        INTEGER;
  v_attempt       INTEGER := 0;
  v_alphabet      CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_random_part   TEXT;
  v_table         TEXT;
  v_number_col    TEXT;
  v_date_col      TEXT;
  v_taken         INTEGER[];
  v_date_expr     TEXT;
BEGIN
  SELECT * INTO v_template
  FROM public.document_number_templates
  WHERE workspace_id = p_workspace_id AND document_type = p_document_type AND is_active
  LIMIT 1;

  IF v_template.template IS NULL THEN
    -- Built-in standard: <PREFIX>/AWP/<DDMMYYYY>-<SEQ:3>, one sequence
    -- per document type per year, workspace-wide.
    v_template_str := '{PREFIX}/AWP/{DD}{MM}{YYYY}-{SEQ:3}';
    v_cadence := 'yearly';
    v_scope := 'workspace';
  ELSE
    v_template_str := v_template.template;
    v_cadence := v_template.reset_cadence;
    v_scope := v_template.sequence_scope;
  END IF;

  v_scope_key := CASE v_cadence
    WHEN 'never' THEN 'ALL'
    WHEN 'yearly' THEN TO_CHAR(p_date, 'YYYY')
    WHEN 'monthly' THEN TO_CHAR(p_date, 'YYYYMM')
    ELSE TO_CHAR(p_date, 'YYYYMMDD')
  END;
  IF v_scope = 'project' AND p_project_id IS NOT NULL THEN
    v_scope_key := p_project_id::TEXT || ':' || v_scope_key;
  END IF;

  -- Where the live documents of this type are, so the gap search can read
  -- them. Absent (payment, or an unregistered type) means fall back to
  -- the counter.
  SELECT r.table_name, r.number_column INTO v_table, v_number_col
  FROM public.document_type_registry r
  WHERE r.key = p_document_type AND p_document_type <> 'payment';

  v_date_col := CASE p_document_type
    WHEN 'delivery_order' THEN 'delivery_date'
    ELSE 'issue_date'
  END;

  LOOP
    v_attempt := v_attempt + 1;
    v_result := v_template_str;
    v_result := REPLACE(v_result, '{PREFIX}', COALESCE(p_default_prefix, ''));
    v_result := REPLACE(v_result, '{PROJECT_CODE}', COALESCE(p_project_code, ''));
    v_result := REPLACE(v_result, '{YYYY}', TO_CHAR(p_date, 'YYYY'));
    v_result := REPLACE(v_result, '{YY}', TO_CHAR(p_date, 'YY'));
    v_result := REPLACE(v_result, '{MM}', TO_CHAR(p_date, 'MM'));
    v_result := REPLACE(v_result, '{DD}', TO_CHAR(p_date, 'DD'));

    IF v_result ~ '\{SEQ:\d+\}' THEN
      v_seq_width := (regexp_match(v_result, '\{SEQ:(\d+)\}'))[1]::INT;

      IF v_table IS NOT NULL AND v_number_col IS NOT NULL THEN
        -- Serialize allocation for this exact sequence. Transaction
        -- scoped, so it is released on commit or rollback either way.
        PERFORM pg_advisory_xact_lock(
          hashtext(p_workspace_id::TEXT || '|' || p_document_type || '|' || v_scope_key)
        );

        -- Numbers currently in use, read from the documents themselves.
        -- Scope is matched the same way the counter's scope_key is built,
        -- so only documents competing for this sequence are considered --
        -- comparing whole number strings instead is the bug 00109 had to
        -- repair, and it is not repeated here.
        v_date_expr := CASE v_cadence
          WHEN 'never' THEN '''ALL'''
          WHEN 'yearly' THEN format('TO_CHAR(t.%I, ''YYYY'')', v_date_col)
          WHEN 'monthly' THEN format('TO_CHAR(t.%I, ''YYYYMM'')', v_date_col)
          ELSE format('TO_CHAR(t.%I, ''YYYYMMDD'')', v_date_col)
        END;

        EXECUTE format($q$
          SELECT COALESCE(
                   array_agg((regexp_match(t.%I, '-(\d+)$'))[1]::INTEGER),
                   '{}')
          FROM public.%I t
          WHERE t.workspace_id = $1
            AND t.deleted_at IS NULL
            AND t.%I ~ '-\d+$'
            AND %s = $2
            AND (%L <> 'project' OR $3 IS NULL OR t.project_id = $3)
        $q$, v_number_col, v_table, v_number_col, v_date_expr, v_scope)
        INTO v_taken
        USING p_workspace_id, CASE WHEN v_cadence = 'never' THEN 'ALL'
                                   ELSE split_part(v_scope_key, ':', -1) END,
              p_project_id;

        -- Lowest number nobody is using. A gap left by a deleted document
        -- is filled; a number a live document holds is skipped, cancelled
        -- documents included.
        v_number := 1;
        WHILE v_number = ANY(v_taken) LOOP
          v_number := v_number + 1;
        END LOOP;

        -- Keep the counter meaningful for anything still reading it, but
        -- never let it drag the sequence upward again.
        INSERT INTO public.document_number_counters (workspace_id, document_type, scope_key, current_number)
        VALUES (p_workspace_id, p_document_type, v_scope_key, v_number)
        ON CONFLICT (workspace_id, document_type, scope_key)
        DO UPDATE SET current_number = GREATEST(public.document_number_counters.current_number, EXCLUDED.current_number);
      ELSE
        -- Counter path, unchanged: atomic increment, never read-then-write.
        INSERT INTO public.document_number_counters (workspace_id, document_type, scope_key, current_number)
        VALUES (p_workspace_id, p_document_type, v_scope_key, 1)
        ON CONFLICT (workspace_id, document_type, scope_key)
        DO UPDATE SET current_number = public.document_number_counters.current_number + 1
        RETURNING current_number INTO v_number;
      END IF;

      v_result := regexp_replace(v_result, '\{SEQ:\d+\}', LPAD(v_number::TEXT, v_seq_width, '0'));
    END IF;

    -- {RANDOM:n}
    IF v_result ~ '\{RANDOM:\d+\}' THEN
      v_random_width := (regexp_match(v_result, '\{RANDOM:(\d+)\}'))[1]::INT;
      SELECT string_agg(substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::INT, 1), '')
        INTO v_random_part
        FROM generate_series(1, v_random_width);
      v_result := regexp_replace(v_result, '\{RANDOM:\d+\}', v_random_part);
    END IF;

    EXIT WHEN NOT (v_result ~ '\{RANDOM:');
    EXIT WHEN v_attempt > 25;
  END LOOP;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------
-- The delete-time counter rollbacks from 00108 and 00115 are now dead
-- weight: the number comes back on its own the moment the row is soft
-- deleted, because the gap search stops seeing it. Leaving them in would
-- pull the counter below a number that is still in use whenever the
-- deleted document was not the top.
--
-- 00108's VOID/ renaming stays. It is not about the counter: the invoice
-- UNIQUE indexes reach across soft-deleted rows, so an invoice number
-- cannot be reissued until the deleted row stops occupying the string.
-- Purchase orders need no equivalent, their index is partial.
-- ---------------------------------------------------------------------
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
  v_old public.invoices%ROWTYPE;
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

  -- Free the strings so the number can be issued again. Both UNIQUE
  -- indexes on invoices reach across soft-deleted rows, so the row has to
  -- stop occupying them. The row id is part of the marker because a plain
  -- 'VOID/' prefix is not unique: reissue a number, delete it again, and
  -- the second void collides with the first on that same index.
  UPDATE public.invoices
     SET invoice_number = 'VOID/' || LEFT(id::TEXT, 8) || '/' || invoice_number,
         internal_id    = CASE
           WHEN internal_id IS NULL THEN NULL
           ELSE 'VOID/' || LEFT(id::TEXT, 8) || '/' || internal_id
         END
   WHERE id = p_invoice_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'invoice', p_invoice_id);

  RETURN jsonb_build_object('success', true, 'id', p_invoice_id);
END;
$$;

CREATE OR REPLACE FUNCTION delete_purchase_order(p_workspace_id UUID, p_actor_id UUID, p_po_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.purchase_orders SET deleted_at = now() WHERE id = p_po_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_po;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted purchase order ' || v_po.po_number, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- internal_id follows the same rule. It is the other half of the number
-- users see on the list page, and leaving it on a pure counter meant an
-- invoice could come out as INV/AWP/05082026-002 carrying internal id
-- 2026-00005 -- the gap the document number just closed, reopened one
-- column to the left.
--
-- Same shape as above: read the ids live documents are actually using,
-- take the lowest free one, hold an advisory lock while doing it, and
-- keep document_sequences moving forward for anything still reading it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_internal_id(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_year INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_number INTEGER;
  v_table  TEXT;
  v_taken  INTEGER[];
BEGIN
  -- 'invoice_internal' / 'quotation_internal' -> the table that holds them.
  v_table := CASE p_document_type
    WHEN 'invoice_internal' THEN 'invoices'
    WHEN 'quotation_internal' THEN 'quotations'
    ELSE NULL
  END;

  IF v_table IS NULL THEN
    -- Unknown kind: counter path, unchanged.
    INSERT INTO public.document_sequences (workspace_id, document_type, prefix, current_number, period)
    VALUES (p_workspace_id, p_document_type, '', 1, p_year)
    ON CONFLICT (workspace_id, document_type, period)
    DO UPDATE SET current_number = public.document_sequences.current_number + 1
    RETURNING current_number INTO v_number;

    RETURN p_year || '-' || LPAD(v_number::TEXT, 5, '0');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_workspace_id::TEXT || '|' || p_document_type || '|' || p_year::TEXT)
  );

  EXECUTE format($q$
    SELECT COALESCE(array_agg((regexp_match(t.internal_id, '-(\d+)$'))[1]::INTEGER), '{}')
    FROM public.%I t
    WHERE t.workspace_id = $1
      AND t.deleted_at IS NULL
      AND t.internal_id ~ ('^' || $2 || '-\d+$')
  $q$, v_table)
  INTO v_taken
  USING p_workspace_id, p_year::TEXT;

  v_number := 1;
  WHILE v_number = ANY(v_taken) LOOP
    v_number := v_number + 1;
  END LOOP;

  INSERT INTO public.document_sequences (workspace_id, document_type, prefix, current_number, period)
  VALUES (p_workspace_id, p_document_type, '', v_number, p_year)
  ON CONFLICT (workspace_id, document_type, period)
  DO UPDATE SET current_number = GREATEST(public.document_sequences.current_number, EXCLUDED.current_number);

  RETURN p_year || '-' || LPAD(v_number::TEXT, 5, '0');
END;
$$;

NOTIFY pgrst, 'reload schema';
