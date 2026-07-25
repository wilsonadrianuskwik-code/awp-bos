-- Construction BOS Phase 0: Document Engine core.
--
-- Replaces the "one nullable source_*_id FK column per document pair"
-- pattern with a generic, config-driven engine so future document types
-- (Goods Receipt, Credit Note, Work Order, ...) never require a schema
-- change to existing tables — only a new typed table + one registry row.
--
-- document_type_registry: the single source of truth every subsystem
-- (numbering, generation, reporting) reads instead of hardcoding a
-- per-type branch.
CREATE TABLE IF NOT EXISTS document_type_registry (
  key                     TEXT PRIMARY KEY,
  label                   TEXT NOT NULL,
  category                TEXT NOT NULL CHECK (category IN ('sales', 'purchase', 'inventory', 'finance')),
  table_name              TEXT NOT NULL,
  items_entity_type       TEXT, -- value used in line_items.entity_type for this doc type, NULL if it has none
  default_status_flow     JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Not workspace-scoped: this is platform-level configuration describing
-- what document types the codebase knows how to render/generate, not
-- tenant data. Every workspace shares the same registry.
ALTER TABLE document_type_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Any authenticated user can view the document type registry" ON document_type_registry;
CREATE POLICY "Any authenticated user can view the document type registry"
  ON document_type_registry FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- document_relationships: a generic traceability graph edge, replacing
-- per-table source_*_id columns. "What generated this document" and
-- "what did this document generate" both resolve via one indexed query
-- regardless of how many document types exist.
CREATE TABLE IF NOT EXISTS document_relationships (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),
  from_type      TEXT NOT NULL REFERENCES document_type_registry(key),
  from_id        UUID NOT NULL,
  to_type        TEXT NOT NULL REFERENCES document_type_registry(key),
  to_id          UUID NOT NULL,
  relationship   TEXT NOT NULL CHECK (relationship IN ('generated_from', 'duplicated_from', 'references', 'fulfills')),
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_type, from_id, to_type, to_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_document_relationships_to ON document_relationships(workspace_id, to_type, to_id);
CREATE INDEX IF NOT EXISTS idx_document_relationships_from ON document_relationships(workspace_id, from_type, from_id);

ALTER TABLE document_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view document relationships" ON document_relationships;
CREATE POLICY "Members can view document relationships"
  ON document_relationships FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
DROP POLICY IF EXISTS "Staff can create document relationships" ON document_relationships;
CREATE POLICY "Staff can create document relationships"
  ON document_relationships FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- document_generation_rules: per (from_type,to_type) config for the
-- generic generate_document() RPC — which header fields and line-item
-- columns to copy. A new "Generate From..." pair is a config row, not a
-- new PL/pgSQL function.
CREATE TABLE IF NOT EXISTS document_generation_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type           TEXT NOT NULL REFERENCES document_type_registry(key),
  to_type             TEXT NOT NULL REFERENCES document_type_registry(key),
  field_mapping       JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "target_column": "source_column" }
  copy_line_items     BOOLEAN NOT NULL DEFAULT true,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (from_type, to_type)
);

ALTER TABLE document_generation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Any authenticated user can view generation rules" ON document_generation_rules;
CREATE POLICY "Any authenticated user can view generation rules"
  ON document_generation_rules FOR SELECT
  USING (auth.uid() IS NOT NULL);
