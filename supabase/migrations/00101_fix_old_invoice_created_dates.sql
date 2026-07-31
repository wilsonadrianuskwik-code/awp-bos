-- 00100's INSERT statements never listed created_at, so every row from the
-- historical invoice import silently took the column's own DEFAULT now()
-- -- meaning all 386 invoices, their line items, and their payments were
-- stamped with whenever 00100 actually ran (29-30 Jul), not their real
-- historical dates. Anywhere the app reads created_at -- the "Created"
-- column on the documents table, most obviously -- every one of these
-- invoices read as created in the last two days instead of spanning
-- 2021-2026, which is the opposite of what a historical import should do.
--
-- 00100 itself has been fixed at the generator level (created_at is now
-- set explicitly on every INSERT, per the "wib_expr" helper in
-- scripts/generate_old_invoice_migration.py) so a fresh apply -- a new
-- environment, disaster recovery -- gets this right from the start. This
-- migration is the one-time correction for the rows already written to
-- production by the version of 00100 that predates that fix.
--
-- Rule: created_at becomes midnight, Asia/Jakarta (the business's own
-- timezone), on the date the row actually represents --
--   invoices/line_items -> the invoice's issue_date
--   payments             -> that payment's own payment_date, which can
--                           differ from the invoice's issue_date
-- matching exactly what the corrected generator now produces, so a row
-- fixed here is indistinguishable from one that had gone through the
-- fixed 00100 from the start.
--
-- Scoped to rows this import actually created, via
-- custom_fields->>'import' = 'old_invoice_register' on invoices (set by
-- 00100 on every row it inserts) rather than by project code alone --
-- belt-and-braces against ever touching an invoice that merely happens to
-- share the "Old Invoice" project for some other reason. line_items and
-- payments are reached by joining back to that same set of invoices.
--
-- Idempotent: re-running recomputes the same target timestamp each time,
-- so a second run is a no-op (WHERE excludes rows already correct).

UPDATE public.invoices i
SET created_at = (i.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta')
WHERE i.custom_fields->>'import' = 'old_invoice_register'
  AND i.created_at IS DISTINCT FROM (i.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta');

UPDATE public.line_items li
SET created_at = (i.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta')
FROM public.invoices i
WHERE li.entity_type = 'invoice'
  AND li.entity_id = i.id
  AND i.custom_fields->>'import' = 'old_invoice_register'
  AND li.created_at IS DISTINCT FROM (i.issue_date::timestamp AT TIME ZONE 'Asia/Jakarta');

UPDATE public.payments p
SET created_at = (p.payment_date::timestamp AT TIME ZONE 'Asia/Jakarta')
FROM public.invoices i
WHERE p.invoice_id = i.id
  AND i.custom_fields->>'import' = 'old_invoice_register'
  AND p.created_at IS DISTINCT FROM (p.payment_date::timestamp AT TIME ZONE 'Asia/Jakarta');
