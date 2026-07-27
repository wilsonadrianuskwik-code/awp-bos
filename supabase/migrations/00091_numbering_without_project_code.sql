-- Construction BOS: drop the project code from document numbers, and
-- reset the sequence yearly.
--
-- New standard:  <PREFIX>/AWP/<DDMMYYYY>-<SEQ:3>
--   e.g.  INV/AWP/27072026-001
--
-- Supersedes the 00078/00090 standard, which embedded the project code
-- and ran one never-resetting counter per project. Two changes:
--
--   1. {PROJECT_CODE} leaves the template. The placeholder itself stays
--      supported by the engine — a workspace can still put it back from
--      Settings > Numbering — it is simply no longer the default.
--
--   2. The counter resets yearly and is scoped workspace-wide, so each
--      document type runs one sequence per year: 001, 002, 003...
--      restarting at 001 each January.
--
-- Note on the first numbers issued after this migration: the counter is
-- keyed by (workspace, document_type, scope_key), and scope_key changes
-- from 'ALL' / '<project>:ALL' to the year. That is a new key, so the
-- sequence starts at 001 for the current year rather than continuing the
-- old per-project count. That is the intended reading of "reset every
-- year" — and it cannot collide with anything already issued, because
-- every previously issued number carries a different shape (either a
-- project code or the older INV-YYYYMMDD-NNN form).

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

  LOOP
    v_attempt := v_attempt + 1;
    v_result := v_template_str;
    v_result := REPLACE(v_result, '{PREFIX}', COALESCE(p_default_prefix, ''));
    v_result := REPLACE(v_result, '{PROJECT_CODE}', COALESCE(p_project_code, ''));
    v_result := REPLACE(v_result, '{YYYY}', TO_CHAR(p_date, 'YYYY'));
    v_result := REPLACE(v_result, '{YY}', TO_CHAR(p_date, 'YY'));
    v_result := REPLACE(v_result, '{MM}', TO_CHAR(p_date, 'MM'));
    v_result := REPLACE(v_result, '{DD}', TO_CHAR(p_date, 'DD'));

    -- {SEQ:n} — atomic increment, never read-then-write, so concurrent
    -- document creation can't hand out the same number twice.
    IF v_result ~ '\{SEQ:\d+\}' THEN
      v_seq_width := (regexp_match(v_result, '\{SEQ:(\d+)\}'))[1]::INT;

      INSERT INTO public.document_number_counters (workspace_id, document_type, scope_key, current_number)
      VALUES (p_workspace_id, p_document_type, v_scope_key, 1)
      ON CONFLICT (workspace_id, document_type, scope_key)
      DO UPDATE SET current_number = public.document_number_counters.current_number + 1
      RETURNING current_number INTO v_number;

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

-- Retire stored templates that are exactly the previous standard, so
-- workspaces that had it saved fall through to the new built-in. A
-- template edited into something else is a deliberate choice and stays.
DELETE FROM public.document_number_templates
WHERE template = '{PREFIX}/AWP-{PROJECT_CODE}/{DD}{MM}{YYYY}-{SEQ:3}';

NOTIFY pgrst, 'reload schema';
