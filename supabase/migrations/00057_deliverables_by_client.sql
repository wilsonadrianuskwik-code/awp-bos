-- Cockpit follow-up: the /fulfillment landing page's client panel
-- (ClientWorkPanel) only ever showed aggregate tracker/unit counts —
-- zero visibility into actual scheduled deliverables ("Post #N", dates).
-- Clicking a client's "Project: X" pill was the only way to see anything
-- concrete, which bounced the user away from the cockpit entirely. This
-- adds a read-only, cross-project lookup so the panel can show a
-- client's outstanding deliverables inline without navigating away.
--
-- get_fulfillment_deliverables (00054) is scoped to one project; a
-- client can have multiple projects (one per eligible invoice), so this
-- joins through fulfillment_projects on client_id instead.

CREATE FUNCTION get_fulfillment_deliverables_by_client(
  p_workspace_id UUID,
  p_client_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  project_name TEXT,
  invoice_id UUID,
  fulfillment_item_id UUID,
  tracker_description TEXT,
  title TEXT,
  scheduled_date DATE,
  status TEXT,
  is_overdue BOOLEAN,
  assigned_to UUID
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
    fd.project_id,
    COALESCE(fp.name, 'Project') AS project_name,
    fp.invoice_id,
    fd.fulfillment_item_id,
    CASE WHEN fd.fulfillment_item_id IS NOT NULL
      THEN (CASE WHEN fi.package_item_index >= 0 THEN li.description || ' — ' || fi.package_item_name ELSE li.description END)
      ELSE NULL
    END AS tracker_description,
    fd.title,
    fd.scheduled_date,
    fd.status,
    (fd.scheduled_date < CURRENT_DATE AND fd.status = 'scheduled') AS is_overdue,
    fd.assigned_to
  FROM public.fulfillment_deliverables fd
  JOIN public.fulfillment_projects fp ON fp.id = fd.project_id AND fp.deleted_at IS NULL
  LEFT JOIN public.fulfillment_items fi ON fi.id = fd.fulfillment_item_id
  LEFT JOIN public.line_items li ON li.id = fi.line_item_id
  WHERE fd.workspace_id = p_workspace_id
    AND fd.deleted_at IS NULL
    AND fp.client_id = p_client_id
    AND fd.status = 'scheduled'
  ORDER BY fd.scheduled_date ASC
  LIMIT p_limit;
END;
$$;
