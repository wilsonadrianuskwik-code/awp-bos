CREATE TABLE clients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id),
  name               TEXT NOT NULL,
  email              TEXT,
  phone              TEXT,
  company            TEXT,
  website            TEXT,
  address            JSONB,
  billing_email      TEXT,
  tax_id             TEXT,
  payment_terms      INTEGER DEFAULT 30,
  preferred_currency TEXT DEFAULT 'USD',
  tags               TEXT[] DEFAULT '{}',
  custom_fields      JSONB NOT NULL DEFAULT '{}',
  source_lead_id     UUID REFERENCES leads(id),
  assigned_to        UUID REFERENCES auth.users(id),
  created_by         UUID NOT NULL REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_clients_workspace ON clients(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_tags ON clients USING gin(tags) WHERE deleted_at IS NULL;

-- Add the FK from leads.converted_client_id now that clients table exists
ALTER TABLE leads ADD CONSTRAINT fk_leads_converted_client
  FOREIGN KEY (converted_client_id) REFERENCES clients(id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view clients"
  ON clients FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

CREATE POLICY "Staff can create clients"
  ON clients FOR INSERT
  WITH CHECK (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );

CREATE POLICY "Staff can update clients"
  ON clients FOR UPDATE
  USING (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );
