-- One-time cleanup: hard-delete all test/demo business data ahead of
-- migrating PT Andalan Warna Prima's real historical records. Wipes every
-- workspace's transactional documents AND master data (clients, suppliers,
-- projects, catalog items), but leaves the workspace itself, its members,
-- branding/template/settings configuration, and the platform-level
-- document_type_registry / document_generation_rules untouched — those
-- aren't "test data," they're the app's own configuration.
--
-- This is a maintenance migration, not a schema change: it runs once and
-- every DELETE is idempotent (safe to re-run against an already-empty
-- database). Order matters — children before parents, to satisfy FKs
-- without CASCADE (explicit is safer than a silent cascade wiping
-- something unintended).

-- 1. Deepest children: payments, the generic relationship graph, and the
--    retired fulfillment trackers. fulfillment_items/fulfillment_events
--    RESTRICT (not CASCADE) against line_items/fulfillment_items, so they
--    must be cleared *before* line_items, not after.
DELETE FROM payments;
DELETE FROM document_relationships;
DELETE FROM fulfillment_events;
DELETE FROM fulfillment_items;
DELETE FROM fulfillment_deliverables;
DELETE FROM fulfillment_projects;
DELETE FROM line_items;

-- 2. Document headers, in dependency order (Delivery Order -> Invoice,
--    Invoice/Proforma/PO all optionally -> Project). leads stays until
--    step 3 — clients.source_lead_id still points at it until then.
DELETE FROM delivery_orders;
DELETE FROM invoices;
DELETE FROM proforma_invoices;
DELETE FROM purchase_orders;
DELETE FROM quotations;

-- 3. Master data. leads.converted_client_id and clients.source_lead_id
--    reference each other with no ON DELETE action, so null both out
--    first — otherwise deleting either table fails on the other's
--    still-live FK.
UPDATE leads SET converted_client_id = NULL;
UPDATE clients SET source_lead_id = NULL;

DELETE FROM leads;
DELETE FROM projects;
DELETE FROM suppliers;
DELETE FROM clients;
DELETE FROM catalog_items;
DELETE FROM item_categories;
DELETE FROM simple_lookups;

-- 4. Numbering counters, so the first real document minted after this
--    migration starts its sequence at 001 instead of continuing from
--    wherever test data left off.
DELETE FROM document_number_counters;

-- 5. Logs. Kept separate from step 1 since these are audit trail, not
--    operational data, but they reference the now-deleted records by
--    entity_id (not an FK, just a UUID column) so clearing them avoids
--    dangling "Invoice deleted" activity entries pointing at nothing.
DELETE FROM activities;
DELETE FROM audit_logs;

NOTIFY pgrst, 'reload schema';
