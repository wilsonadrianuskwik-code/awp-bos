-- Root cause of "Outstanding Deliverables always shows empty": migration
-- 00061's CREATE OR REPLACE FUNCTION get_fulfillment_deliverables_by_client
-- dropped the original 00057 signature's third parameter
-- (p_limit INT DEFAULT 50) and changed the RETURNS TABLE column list.
-- Postgres resolves CREATE OR REPLACE by parameter signature, not return
-- type — since the parameter list changed (2 args instead of 3), this did
-- NOT replace the original function, it created a second overloaded one.
-- Confirmed directly:
--
--   SELECT p.oid, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p WHERE p.proname = 'get_fulfillment_deliverables_by_client';
--   -- returned two rows: (p_workspace_id, p_client_id) and
--   -- (p_workspace_id, p_client_id, p_limit integer)
--
-- Because the 3-arg version's third parameter has a DEFAULT, a 2-argument
-- call matches both overloads, which Postgres rejects outright:
--
--   ERROR: function get_fulfillment_deliverables_by_client(...) is not unique
--
-- The app's RPC call always passes exactly 2 arguments, so this error
-- fired on every single call — which getFulfillmentDeliverablesByClient
-- (queries-projects.ts) propagates as a normal ActionResult error, and
-- ClientWorkPanel's fetch effect (fulfillment-cockpit.tsx) silently
-- swallows into an empty array with no toast, making a hard failure look
-- exactly like "genuinely no outstanding deliverables" for every client,
-- every time.

DROP FUNCTION IF EXISTS public.get_fulfillment_deliverables_by_client(UUID, UUID, INT);

-- Restate the single canonical 2-arg version (identical to 00061's
-- intended definition) so exactly one overload exists going forward.
CREATE OR REPLACE FUNCTION get_fulfillment_deliverables_by_client(
  p_workspace_id UUID,
  p_client_id UUID
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  scheduled_date DATE,
  status TEXT,
  is_overdue BOOLEAN,
  project_id UUID,
  project_name TEXT,
  fulfillment_item_id UUID,
  tracker_description TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view deliverables';
  END IF;

  RETURN QUERY
  SELECT
    fd.id,
    fd.title,
    fd.scheduled_date,
    fd.status,
    (fd.scheduled_date IS NOT NULL AND fd.scheduled_date < CURRENT_DATE AND fd.status IN ('scheduled', 'in_progress')) AS is_overdue,
    fd.project_id,
    COALESCE(fp.name, 'Untitled Project') AS project_name,
    fd.fulfillment_item_id,
    CASE WHEN fd.fulfillment_item_id IS NOT NULL
      THEN (CASE WHEN fi.package_item_index >= 0 THEN li.description || ' — ' || fi.package_item_name ELSE li.description END)
      ELSE NULL
    END AS tracker_description
  FROM public.fulfillment_deliverables fd
  JOIN public.fulfillment_projects fp ON fp.id = fd.project_id AND fp.deleted_at IS NULL
  LEFT JOIN public.fulfillment_items fi ON fi.id = fd.fulfillment_item_id
  LEFT JOIN public.line_items li ON li.id = fi.line_item_id
  WHERE fd.workspace_id = p_workspace_id
    AND fp.client_id = p_client_id
    AND fd.deleted_at IS NULL
    AND fd.status IN ('scheduled', 'in_progress')
  ORDER BY fd.scheduled_date ASC NULLS LAST;
END;
$$;
