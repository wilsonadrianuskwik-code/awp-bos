CREATE TABLE IF NOT EXISTS invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),
  client_id           UUID NOT NULL REFERENCES clients(id),
  invoice_number      TEXT NOT NULL,
  source_quotation_id UUID REFERENCES quotations(id),
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled','refunded')),
  subtotal            NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total               NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_paid         NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_due          NUMERIC(15,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  currency            TEXT NOT NULL DEFAULT 'USD',
  issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date            DATE,
  paid_at             TIMESTAMPTZ,
  title               TEXT,
  summary             TEXT,
  payment_terms       TEXT,
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES auth.users(id),
  custom_fields       JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (workspace_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON invoices(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_overdue ON invoices(due_date)
  WHERE deleted_at IS NULL AND status IN ('sent','partial');

-- Now that invoices exists, add the FK from quotations.generated_invoice_id
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS fk_quotations_generated_invoice;
ALTER TABLE quotations ADD CONSTRAINT fk_quotations_generated_invoice
  FOREIGN KEY (generated_invoice_id) REFERENCES invoices(id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view invoices" ON invoices;
CREATE POLICY "Members can view invoices"
  ON invoices FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create invoices" ON invoices;
CREATE POLICY "Staff can create invoices"
  ON invoices FOR INSERT
  WITH CHECK (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );

DROP POLICY IF EXISTS "Staff can update invoices" ON invoices;
CREATE POLICY "Staff can update invoices"
  ON invoices FOR UPDATE
  USING (
    get_user_role(workspace_id) IN ('staff', 'admin', 'owner')
  );
