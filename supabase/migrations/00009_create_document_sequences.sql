CREATE TABLE document_sequences (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),
  document_type  TEXT NOT NULL CHECK (document_type IN ('quotation','invoice')),
  prefix         TEXT NOT NULL,
  current_number INTEGER NOT NULL DEFAULT 0,
  year           INTEGER NOT NULL,
  UNIQUE (workspace_id, document_type, year)
);

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view document sequences"
  ON document_sequences FOR SELECT
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE POLICY "Staff can create document sequences"
  ON document_sequences FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE POLICY "Staff can update document sequences"
  ON document_sequences FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- Atomically increments (or creates) the sequence for a workspace/document_type/year
-- and returns the formatted document number, e.g. QUO-2026-0001.
CREATE OR REPLACE FUNCTION next_document_number(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_prefix TEXT,
  p_year INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_number INTEGER;
BEGIN
  INSERT INTO public.document_sequences (workspace_id, document_type, prefix, current_number, year)
  VALUES (p_workspace_id, p_document_type, p_prefix, 1, p_year)
  ON CONFLICT (workspace_id, document_type, year)
  DO UPDATE SET current_number = public.document_sequences.current_number + 1
  RETURNING current_number INTO v_number;

  RETURN p_prefix || '-' || p_year || '-' || LPAD(v_number::TEXT, 4, '0');
END;
$$;
