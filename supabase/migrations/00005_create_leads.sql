CREATE TABLE leads (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id),
  name                     TEXT NOT NULL,
  email                    TEXT,
  phone                    TEXT,
  company                  TEXT,
  source                   TEXT,
  status                   TEXT NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new','contacted','qualified','proposal','negotiation','won','lost')),
  conversion_probability   INTEGER CHECK (conversion_probability BETWEEN 0 AND 100),
  expected_value           NUMERIC(15,2),
  expected_currency        TEXT DEFAULT 'USD',
  lost_reason              TEXT,
  converted_client_id      UUID,
  converted_at             TIMESTAMPTZ,
  converted_by             UUID REFERENCES auth.users(id),
  assigned_to              UUID REFERENCES auth.users(id),
  tags                     TEXT[] DEFAULT '{}',
  custom_fields            JSONB NOT NULL DEFAULT '{}',
  notes_text               TEXT,
  created_by               UUID NOT NULL REFERENCES auth.users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX idx_leads_workspace ON leads(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_status ON leads(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned ON leads(assigned_to) WHERE deleted_at IS NULL;

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view leads"
  ON leads FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

CREATE POLICY "Staff can create leads"
  ON leads FOR INSERT
  WITH CHECK (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );

CREATE POLICY "Staff can update leads"
  ON leads FOR UPDATE
  USING (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );
