CREATE TABLE IF NOT EXISTS quotations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id),
  client_id               UUID NOT NULL REFERENCES clients(id),
  quotation_number        TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','sent','viewed','approved','rejected','expired','cancelled','revision_requested')),
  subtotal                NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount              NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  total                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency                TEXT NOT NULL DEFAULT 'USD',
  issue_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date             DATE,
  approved_at             TIMESTAMPTZ,
  title                   TEXT,
  summary                 TEXT,
  terms_and_conditions    TEXT,
  notes                   TEXT,
  internal_notes          TEXT,
  version                 INTEGER NOT NULL DEFAULT 1,
  parent_quotation_id     UUID REFERENCES quotations(id),
  share_token             UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  first_viewed_at         TIMESTAMPTZ,
  customer_response_notes TEXT,
  generated_invoice_id    UUID,
  created_by              UUID NOT NULL REFERENCES auth.users(id),
  approved_by             UUID REFERENCES auth.users(id),
  custom_fields           JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  UNIQUE (workspace_id, quotation_number)
);

CREATE INDEX IF NOT EXISTS idx_quotations_workspace ON quotations(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_client ON quotations(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_parent ON quotations(parent_quotation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_share_token ON quotations(share_token);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

-- No public/anon SELECT policy: the customer portal reads via the admin client
-- (service role, bypasses RLS) keyed by share_token, never through the browser client.
DROP POLICY IF EXISTS "Members can view quotations" ON quotations;
CREATE POLICY "Members can view quotations"
  ON quotations FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create quotations" ON quotations;
CREATE POLICY "Staff can create quotations"
  ON quotations FOR INSERT
  WITH CHECK (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );

DROP POLICY IF EXISTS "Staff can update quotations" ON quotations;
CREATE POLICY "Staff can update quotations"
  ON quotations FOR UPDATE
  USING (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );
