-- Billing Preferences: client-level currency override.
--
-- clients.preferred_currency has existed since Phase 2 with a hardcoded
-- 'USD' default, but was never exposed in the create/edit UI — no user
-- could ever have intentionally set it. This migration turns the column
-- into the "custom override" half of a two-state model:
--   NULL           -> use the workspace's default currency (the default)
--   a 3-letter code -> an explicit per-client override
--
-- Existing rows are backfilled to NULL since their 'USD' values never
-- reflected real user intent (they're just the old column default).
ALTER TABLE clients ALTER COLUMN preferred_currency DROP DEFAULT;

UPDATE clients SET preferred_currency = NULL WHERE preferred_currency IS NOT NULL;
