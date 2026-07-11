CREATE TABLE IF NOT EXISTS payments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID NOT NULL REFERENCES workspaces(id),
  invoice_id             UUID NOT NULL REFERENCES invoices(id),
  payment_number         TEXT NOT NULL,
  amount                 NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency               TEXT NOT NULL DEFAULT 'USD',
  payment_method         TEXT NOT NULL
                         CHECK (payment_method IN ('bank_transfer','credit_card','cash','check','paypal','stripe','other')),
  -- bank_name/receiver_account_name are only meaningful when payment_method
  -- = 'bank_transfer'. Plain TEXT rather than an enum: the bank picker
  -- (BCA, Mandiri, BNI, ...) is a UI-level list with a free-text "Other"
  -- fallback, so new banks never require a migration.
  bank_name              TEXT,
  receiver_account_name  TEXT,
  payment_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  reference              TEXT,
  notes                  TEXT,
  proof_file_path        TEXT,
  recorded_by            UUID NOT NULL REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ,
  UNIQUE (workspace_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id) WHERE deleted_at IS NULL;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view payments" ON payments;
CREATE POLICY "Members can view payments"
  ON payments FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create payments" ON payments;
CREATE POLICY "Staff can create payments"
  ON payments FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can update payments" ON payments;
CREATE POLICY "Staff can update payments"
  ON payments FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- Extend the existing generic document numbering (Phase 3) with a third
-- document_type so record_payment can call next_document_number(...,
-- 'payment', 'PAY', year) exactly like invoices call it with 'invoice'/'INV'.
ALTER TABLE document_sequences DROP CONSTRAINT IF EXISTS document_sequences_document_type_check;
ALTER TABLE document_sequences ADD CONSTRAINT document_sequences_document_type_check
  CHECK (document_type IN ('quotation','invoice','payment'));
