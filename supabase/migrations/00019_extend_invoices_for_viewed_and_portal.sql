-- Adds the 'viewed' status (customer opened the invoice portal link) to the
-- invoice lifecycle, and the portal-token columns mirroring the quotation
-- portal (share_token, first_viewed_at, view_count, last_viewed_at).

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','sent','viewed','partial','paid','overdue','cancelled','refunded'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_share_token ON invoices(share_token);
