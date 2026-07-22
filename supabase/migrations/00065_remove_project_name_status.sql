-- Removes the Fulfilment Project's own `name` and `status` columns —
-- explicit user decision: a project's identity/status was a redundant
-- layer duplicating what the invoice + its trackers/deliverables already
-- represent (a client picks an invoice; a "project name" was just an
-- optional, independently-typed label on top of that, and `status`
-- (not_started/in_progress/completed/cancelled) was a manually-transitioned
-- field that nothing else in the system actually gated on — confirmed by
-- grepping every other RPC for a read of fp.status; only
-- update_fulfillment_project_status itself ever consumed it.
--
-- `status` is not simply deleted from the read side: every place that
-- displayed it is still useful (a header badge showing "in progress" is
-- real information), so it becomes a COMPUTED expression derived from the
-- project's own trackers (fulfillment_items.status), the same "derive it,
-- never store it independently" discipline already used for
-- purchased/delivered/remaining and deliverable rollups elsewhere in this
-- module:
--   - no trackers, or none have started      -> 'not_started'
--   - all trackers completed (tracker_count > 0) -> 'completed'
--   - otherwise (some tracker in progress/completed) -> 'in_progress'
-- 'cancelled' is dropped as a status value entirely — it was a business
-- decision with no computable signal once it's not stored, and invoices
-- already have their own cancelled/refunded lifecycle at the invoice
-- level, which is the correct place for that decision to live.
--
-- `name` has no computed replacement — every UI that showed a project name
-- now shows the invoice number and/or client name instead (already
-- available on every row that used to also carry project_name).

DROP INDEX IF EXISTS idx_fulfillment_projects_workspace_status;

ALTER TABLE fulfillment_projects DROP COLUMN IF EXISTS name;
ALTER TABLE fulfillment_projects DROP COLUMN IF EXISTS status;

-- update_fulfillment_project_status has nothing left to transition —
-- status is no longer a stored, independently-settable column.
DROP FUNCTION IF EXISTS update_fulfillment_project_status(UUID, UUID, UUID, TEXT);

-- ---------------------------------------------------------------------
-- update_fulfillment_project — same full-form-submit convention, minus
-- the now-nonexistent p_name parameter. Signature changed (7 params -> 6),
-- so the old overload must be dropped explicitly rather than relying on
-- CREATE OR REPLACE (which only replaces an identical parameter list —
-- the exact lesson this module already had to relearn once this session
-- for get_fulfillment_deliverables_by_client).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS update_fulfillment_project(UUID, UUID, UUID, TEXT, DATE, DATE, TEXT);

CREATE FUNCTION update_fulfillment_project(
  p_project_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.fulfillment_projects%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this fulfillment project';
  END IF;

  SELECT * INTO v_old FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date cannot be before start date';
  END IF;

  IF v_old.start_date IS DISTINCT FROM p_start_date THEN
    v_changes := v_changes || jsonb_build_object('start_date', jsonb_build_object('old', v_old.start_date, 'new', p_start_date));
  END IF;
  IF v_old.end_date IS DISTINCT FROM p_end_date THEN
    v_changes := v_changes || jsonb_build_object('end_date', jsonb_build_object('old', v_old.end_date, 'new', p_end_date));
  END IF;
  IF v_old.notes IS DISTINCT FROM NULLIF(p_notes, '') THEN
    v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('old', v_old.notes, 'new', NULLIF(p_notes, '')));
  END IF;

  UPDATE public.fulfillment_projects
  SET
    start_date = p_start_date,
    end_date = p_end_date,
    notes = NULLIF(p_notes, ''),
    updated_at = now()
  WHERE id = p_project_id;

  IF v_changes != '{}'::JSONB THEN
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'updated',
      'updated fulfillment project details', 'fulfillment_project', p_project_id
    );
    PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_project', p_project_id, v_changes);
  END IF;

  RETURN (SELECT to_jsonb(fp) FROM public.fulfillment_projects fp WHERE fp.id = p_project_id);
END;
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_project_by_invoice — RETURNS TABLE drops `name`
-- entirely; `status` becomes a computed CASE over this same query's own
-- tracker_count/tracker_completed_count aggregates (no extra subquery
-- needed — it's already grouping by fp.id).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_fulfillment_project_by_invoice(UUID, UUID);

CREATE FUNCTION get_fulfillment_project_by_invoice(
  p_workspace_id UUID,
  p_invoice_id UUID
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  client_id UUID,
  client_name TEXT,
  status TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  assigned_to UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tracker_count BIGINT,
  tracker_completed_count BIGINT,
  deliverable_count BIGINT,
  deliverable_posted_count BIGINT,
  next_deliverable_date DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view fulfillment projects';
  END IF;

  RETURN QUERY
  SELECT
    fp.id,
    fp.workspace_id,
    fp.invoice_id,
    i.invoice_number,
    fp.client_id,
    c.name,
    CASE
      WHEN COUNT(DISTINCT fi.id) = 0 THEN 'not_started'
      WHEN COUNT(DISTINCT fi.id) FILTER (WHERE fi.status = 'completed') = COUNT(DISTINCT fi.id) THEN 'completed'
      WHEN COUNT(DISTINCT fi.id) FILTER (WHERE fi.status IN ('in_progress', 'completed')) > 0 THEN 'in_progress'
      ELSE 'not_started'
    END AS status,
    fp.start_date,
    fp.end_date,
    fp.notes,
    fp.assigned_to,
    fp.created_at,
    fp.updated_at,
    COUNT(DISTINCT fi.id) AS tracker_count,
    COUNT(DISTINCT fi.id) FILTER (WHERE fi.status = 'completed') AS tracker_completed_count,
    COUNT(DISTINCT fd.id) AS deliverable_count,
    COUNT(DISTINCT fd.id) FILTER (WHERE fd.status = 'posted') AS deliverable_posted_count,
    MIN(fd.scheduled_date) FILTER (WHERE fd.status = 'scheduled' AND fd.scheduled_date >= CURRENT_DATE) AS next_deliverable_date
  FROM public.fulfillment_projects fp
  JOIN public.invoices i ON i.id = fp.invoice_id
  JOIN public.clients c ON c.id = fp.client_id
  LEFT JOIN public.fulfillment_items fi ON fi.project_id = fp.id AND fi.deleted_at IS NULL
  LEFT JOIN public.fulfillment_deliverables fd ON fd.project_id = fp.id AND fd.deleted_at IS NULL
  WHERE fp.workspace_id = p_workspace_id
    AND fp.invoice_id = p_invoice_id
    AND fp.deleted_at IS NULL
  GROUP BY fp.id, i.invoice_number, c.name;
END;
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_items — drops project_name (redundant with the
-- invoice_number this same row already carries); project_status becomes a
-- correlated-subquery version of the same derived CASE above (this query
-- is per-tracker, not grouped by project, so it can't reuse an in-SELECT
-- aggregate the way get_fulfillment_project_by_invoice does).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_fulfillment_items(uuid, text, uuid, uuid, uuid, uuid, integer, integer);

CREATE FUNCTION public.get_fulfillment_items(
  p_workspace_id uuid,
  p_status text DEFAULT NULL::text,
  p_client_id uuid DEFAULT NULL::uuid,
  p_fulfillment_item_id uuid DEFAULT NULL::uuid,
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, invoice_id uuid, invoice_number text, client_id uuid, client_name text,
  line_item_id uuid, description text, unit text, category text, status text,
  assigned_to uuid, notes text, created_at timestamp with time zone, updated_at timestamp with time zone,
  purchased numeric, delivered numeric, remaining numeric, progress_percent numeric,
  is_over_delivered boolean, is_package_item boolean,
  project_id uuid, project_status text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF public.get_user_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions to view fulfillment items';
  END IF;

  RETURN QUERY
  WITH delivered_sums AS (
    SELECT fe.fulfillment_item_id AS fi_id, SUM(fe.quantity_delivered) AS delivered
    FROM public.fulfillment_events fe
    WHERE fe.deleted_at IS NULL
    GROUP BY fe.fulfillment_item_id
  )
  SELECT
    fi.id,
    fi.invoice_id,
    i.invoice_number,
    fi.client_id,
    c.name,
    fi.line_item_id,
    CASE WHEN fi.package_item_index >= 0
      THEN li.description || ' — ' || fi.package_item_name
      ELSE li.description
    END AS description,
    CASE WHEN fi.package_item_index >= 0
      THEN COALESCE(fi.package_item_unit, li.unit)
      ELSE li.unit
    END AS unit,
    li.category,
    fi.status,
    fi.assigned_to,
    fi.notes,
    fi.created_at,
    fi.updated_at,
    (CASE WHEN fi.package_item_index >= 0 THEN fi.package_item_quantity ELSE li.quantity END) AS purchased,
    COALESCE(ds.delivered, 0) AS delivered,
    GREATEST(0, (CASE WHEN fi.package_item_index >= 0 THEN fi.package_item_quantity ELSE li.quantity END) - COALESCE(ds.delivered, 0)) AS remaining,
    LEAST(100, ROUND(COALESCE(ds.delivered, 0) / NULLIF((CASE WHEN fi.package_item_index >= 0 THEN fi.package_item_quantity ELSE li.quantity END), 0) * 100)) AS progress_percent,
    COALESCE(ds.delivered, 0) > (CASE WHEN fi.package_item_index >= 0 THEN fi.package_item_quantity ELSE li.quantity END) AS is_over_delivered,
    fi.package_item_index >= 0 AS is_package_item,
    fi.project_id,
    (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 'not_started'
        WHEN COUNT(*) FILTER (WHERE fi2.status = 'completed') = COUNT(*) THEN 'completed'
        WHEN COUNT(*) FILTER (WHERE fi2.status IN ('in_progress', 'completed')) > 0 THEN 'in_progress'
        ELSE 'not_started'
      END
      FROM public.fulfillment_items fi2
      WHERE fi2.project_id = fi.project_id AND fi2.deleted_at IS NULL
    ) AS project_status,
    COUNT(*) OVER() AS total_count
  FROM public.fulfillment_items fi
  JOIN public.line_items li ON li.id = fi.line_item_id
  JOIN public.invoices i ON i.id = fi.invoice_id
  JOIN public.clients c ON c.id = fi.client_id
  LEFT JOIN delivered_sums ds ON ds.fi_id = fi.id
  WHERE fi.workspace_id = p_workspace_id
    AND fi.deleted_at IS NULL
    AND (p_status IS NULL OR fi.status = p_status)
    AND (p_client_id IS NULL OR fi.client_id = p_client_id)
    AND (p_fulfillment_item_id IS NULL OR fi.id = p_fulfillment_item_id)
    AND (p_invoice_id IS NULL OR fi.invoice_id = p_invoice_id)
    AND (p_project_id IS NULL OR fi.project_id = p_project_id)
  ORDER BY fi.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_fulfillment_deliverables_by_client — project_name (fp.name) replaced
-- with invoice_number (the invoice this project belongs to), the natural
-- per-row identifier now that a project has no name of its own. Requires
-- joining invoices, which this function didn't previously need.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_fulfillment_deliverables_by_client(UUID, UUID);

CREATE FUNCTION get_fulfillment_deliverables_by_client(
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
  invoice_number TEXT,
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
    i.invoice_number,
    fd.fulfillment_item_id,
    CASE WHEN fd.fulfillment_item_id IS NOT NULL
      THEN (CASE WHEN fi.package_item_index >= 0 THEN li.description || ' — ' || fi.package_item_name ELSE li.description END)
      ELSE NULL
    END AS tracker_description
  FROM public.fulfillment_deliverables fd
  JOIN public.fulfillment_projects fp ON fp.id = fd.project_id AND fp.deleted_at IS NULL
  JOIN public.invoices i ON i.id = fp.invoice_id
  LEFT JOIN public.fulfillment_items fi ON fi.id = fd.fulfillment_item_id
  LEFT JOIN public.line_items li ON li.id = fi.line_item_id
  WHERE fd.workspace_id = p_workspace_id
    AND fp.client_id = p_client_id
    AND fd.deleted_at IS NULL
    AND fd.status IN ('scheduled', 'in_progress')
  ORDER BY fd.scheduled_date ASC NULLS LAST;
END;
$$;
