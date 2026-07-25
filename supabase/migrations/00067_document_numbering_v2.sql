-- Construction BOS Phase 0: configurable document numbering engine.
--
-- Replaces next_document_number / generate_invoice_number / next_internal_id
-- (three incompatible hardcoded formatters) with one workspace-configurable,
-- placeholder-driven formatter. Existing document_sequences rows are left
-- untouched (already-issued numbers are just strings on existing rows);
-- this migration only changes how *new* numbers are minted.
CREATE TABLE IF NOT EXISTS document_number_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  document_type   TEXT NOT NULL REFERENCES document_type_registry(key),
  template        TEXT NOT NULL, -- e.g. '{PREFIX}-{PROJECT_CODE}-{YYYY}{MM}-{SEQ:4}'
  reset_cadence   TEXT NOT NULL DEFAULT 'daily' CHECK (reset_cadence IN ('never', 'yearly', 'monthly', 'daily')),
  sequence_scope  TEXT NOT NULL DEFAULT 'workspace' CHECK (sequence_scope IN ('workspace', 'project')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_number_templates_active
  ON document_number_templates(workspace_id, document_type) WHERE is_active;

ALTER TABLE document_number_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view numbering templates" ON document_number_templates;
CREATE POLICY "Members can view numbering templates"
  ON document_number_templates FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
DROP POLICY IF EXISTS "Admins can manage numbering templates" ON document_number_templates;
CREATE POLICY "Admins can manage numbering templates"
  ON document_number_templates FOR ALL
  USING (get_user_role(workspace_id) IN ('admin', 'owner'))
  WITH CHECK (get_user_role(workspace_id) IN ('admin', 'owner'));

-- Generic counter, keyed by whatever scope the template implies. Replaces
-- document_sequences' single hardcoded (workspace_id, document_type, period)
-- key with a computed scope_key so per-project and per-cadence counters
-- can coexist.
CREATE TABLE IF NOT EXISTS document_number_counters (
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  document_type    TEXT NOT NULL,
  scope_key        TEXT NOT NULL, -- e.g. 'WS:20260724' or 'PRJ:<id>:2026'
  current_number   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, document_type, scope_key)
);

ALTER TABLE document_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can use numbering counters" ON document_number_counters;
CREATE POLICY "Staff can use numbering counters"
  ON document_number_counters FOR ALL
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'))
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- generate_document_number: single formatter replacing the three legacy
-- functions. Placeholders: {PREFIX} {PROJECT_CODE} {YYYY} {YY} {MM} {DD}
-- {SEQ:n} {RANDOM:n}. Falls back to a sensible built-in template
-- ('{PREFIX}-{YYYY}{MM}{DD}-{SEQ:3}') when the workspace hasn't
-- configured one, so the system works before Settings is touched.
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
    v_template_str := '{PREFIX}-{YYYY}{MM}{DD}-{SEQ:3}';
    v_cadence := 'daily';
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

    -- {SEQ:n}
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
