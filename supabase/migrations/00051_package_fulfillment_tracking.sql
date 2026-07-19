-- Package fulfillment tracking: a package line item bundles several
-- sub-items sold at one fixed price (see 00050_catalog_packages.sql).
-- Fulfillment previously tracked the whole package as one opaque
-- deliverable (target quantity = the line item's own `quantity`, usually
-- 1 "package"). This migration makes fulfillment track each package
-- sub-item separately: one fulfillment_items row per sub-item instead of
-- one row for the whole line. Non-package line items are unaffected —
-- they keep exactly today's single-row-per-line-item behavior.
--
-- Sub-item name/quantity/unit/note are snapshotted onto the tracker at
-- creation time (not resolved live from the catalog like the invoice/PDF
-- breakdown is). Unlike a document's price breakdown, an operational
-- fulfillment target shouldn't retroactively shift mid-delivery just
-- because someone edits the package definition later.

ALTER TABLE fulfillment_items ADD COLUMN IF NOT EXISTS package_item_index INTEGER NOT NULL DEFAULT -1;
ALTER TABLE fulfillment_items ADD COLUMN IF NOT EXISTS package_item_name TEXT;
ALTER TABLE fulfillment_items ADD COLUMN IF NOT EXISTS package_item_quantity NUMERIC(15,3);
ALTER TABLE fulfillment_items ADD COLUMN IF NOT EXISTS package_item_unit TEXT;
ALTER TABLE fulfillment_items ADD COLUMN IF NOT EXISTS package_item_note TEXT;

ALTER TABLE fulfillment_items DROP CONSTRAINT IF EXISTS fulfillment_items_package_item_check;
ALTER TABLE fulfillment_items ADD CONSTRAINT fulfillment_items_package_item_check
  CHECK (
    (package_item_index = -1 AND package_item_name IS NULL AND package_item_quantity IS NULL)
    OR (package_item_index >= 0 AND package_item_name IS NOT NULL AND package_item_quantity IS NOT NULL)
  );

-- One tracker per (line item, sub-item) instead of one per line item —
-- package_item_index = -1 for non-package lines keeps the old 1:1 behavior.
DROP INDEX IF EXISTS idx_fulfillment_items_line_item;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_items_line_item_package
  ON fulfillment_items(line_item_id, package_item_index) WHERE deleted_at IS NULL;

-- sync_fulfillment_items: workspace-wide sweep for partial/paid invoices.
CREATE OR REPLACE FUNCTION public.sync_fulfillment_items(p_workspace_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row RECORD;
  v_pkg_item RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to sync fulfillment items';
  END IF;

  FOR v_row IN
    SELECT li.id AS line_item_id, li.quantity AS line_quantity, i.id AS invoice_id,
           i.invoice_number, i.client_id, ci.is_package, ci.package_items
    FROM public.line_items li
    JOIN public.invoices i ON i.id = li.entity_id AND li.entity_type = 'invoice'
    LEFT JOIN public.catalog_items ci ON ci.id = li.catalog_item_id
    WHERE li.workspace_id = p_workspace_id
      AND i.deleted_at IS NULL
      AND i.status IN ('partial', 'paid')
      AND NOT EXISTS (
        SELECT 1 FROM public.fulfillment_items fi
        WHERE fi.line_item_id = li.id AND fi.deleted_at IS NULL
      )
  LOOP
    IF COALESCE(v_row.is_package, false) AND jsonb_array_length(v_row.package_items) > 0 THEN
      FOR v_pkg_item IN
        SELECT value, (ordinality - 1)::int AS idx
        FROM jsonb_array_elements(v_row.package_items) WITH ORDINALITY AS t(value, ordinality)
      LOOP
        INSERT INTO public.fulfillment_items (
          workspace_id, invoice_id, client_id, line_item_id,
          package_item_index, package_item_name, package_item_quantity, package_item_unit, package_item_note
        )
        VALUES (
          p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id,
          v_pkg_item.idx, v_pkg_item.value->>'name',
          (v_pkg_item.value->>'quantity')::numeric * v_row.line_quantity,
          NULLIF(v_pkg_item.value->>'unit', ''), NULLIF(v_pkg_item.value->>'note', '')
        )
        ON CONFLICT (line_item_id, package_item_index) WHERE deleted_at IS NULL DO NOTHING
        RETURNING id INTO v_new_id;

        IF v_new_id IS NOT NULL THEN
          PERFORM public.log_activity(
            p_workspace_id, NULL, 'system', 'created',
            'started tracking fulfillment for invoice ' || v_row.invoice_number,
            'fulfillment_item', v_new_id, 'invoice', v_row.invoice_id
          );
          PERFORM public.log_audit_entry(p_workspace_id, NULL, 'system', 'create', 'fulfillment_item', v_new_id);
          v_count := v_count + 1;
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id)
      VALUES (p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id)
      ON CONFLICT (line_item_id, package_item_index) WHERE deleted_at IS NULL DO NOTHING
      RETURNING id INTO v_new_id;

      IF v_new_id IS NOT NULL THEN
        PERFORM public.log_activity(
          p_workspace_id, NULL, 'system', 'created',
          'started tracking fulfillment for invoice ' || v_row.invoice_number,
          'fulfillment_item', v_new_id, 'invoice', v_row.invoice_id
        );
        PERFORM public.log_audit_entry(p_workspace_id, NULL, 'system', 'create', 'fulfillment_item', v_new_id);
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- sync_fulfillment_items_for_invoice: called from record_payment right
-- after a payment lands, scoped to one invoice, broader eligible statuses.
CREATE OR REPLACE FUNCTION public.sync_fulfillment_items_for_invoice(p_workspace_id uuid, p_invoice_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row RECORD;
  v_pkg_item RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT li.id AS line_item_id, li.quantity AS line_quantity, i.id AS invoice_id,
           i.invoice_number, i.client_id, ci.is_package, ci.package_items
    FROM public.line_items li
    JOIN public.invoices i ON i.id = li.entity_id AND li.entity_type = 'invoice'
    LEFT JOIN public.catalog_items ci ON ci.id = li.catalog_item_id
    WHERE li.workspace_id = p_workspace_id
      AND i.id = p_invoice_id
      AND i.deleted_at IS NULL
      AND i.status IN ('sent', 'viewed', 'partial', 'paid', 'overdue')
      AND NOT EXISTS (
        SELECT 1 FROM public.fulfillment_items fi
        WHERE fi.line_item_id = li.id AND fi.deleted_at IS NULL
      )
  LOOP
    IF COALESCE(v_row.is_package, false) AND jsonb_array_length(v_row.package_items) > 0 THEN
      FOR v_pkg_item IN
        SELECT value, (ordinality - 1)::int AS idx
        FROM jsonb_array_elements(v_row.package_items) WITH ORDINALITY AS t(value, ordinality)
      LOOP
        INSERT INTO public.fulfillment_items (
          workspace_id, invoice_id, client_id, line_item_id,
          package_item_index, package_item_name, package_item_quantity, package_item_unit, package_item_note
        )
        VALUES (
          p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id,
          v_pkg_item.idx, v_pkg_item.value->>'name',
          (v_pkg_item.value->>'quantity')::numeric * v_row.line_quantity,
          NULLIF(v_pkg_item.value->>'unit', ''), NULLIF(v_pkg_item.value->>'note', '')
        )
        ON CONFLICT (line_item_id, package_item_index) WHERE deleted_at IS NULL DO NOTHING
        RETURNING id INTO v_new_id;

        IF v_new_id IS NOT NULL THEN
          PERFORM public.log_activity(
            p_workspace_id, NULL, 'system', 'created',
            'started tracking fulfillment for invoice ' || v_row.invoice_number || ' after first payment',
            'fulfillment_item', v_new_id, 'invoice', v_row.invoice_id
          );
          PERFORM public.log_audit_entry(p_workspace_id, NULL, 'system', 'create', 'fulfillment_item', v_new_id);
          v_count := v_count + 1;
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id)
      VALUES (p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id)
      ON CONFLICT (line_item_id, package_item_index) WHERE deleted_at IS NULL DO NOTHING
      RETURNING id INTO v_new_id;

      IF v_new_id IS NOT NULL THEN
        PERFORM public.log_activity(
          p_workspace_id, NULL, 'system', 'created',
          'started tracking fulfillment for invoice ' || v_row.invoice_number || ' after first payment',
          'fulfillment_item', v_new_id, 'invoice', v_row.invoice_id
        );
        PERFORM public.log_audit_entry(p_workspace_id, NULL, 'system', 'create', 'fulfillment_item', v_new_id);
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- create_fulfillment_item: manual "Track Fulfillment" button for one line item.
CREATE OR REPLACE FUNCTION public.create_fulfillment_item(p_line_item_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_line_item public.line_items%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_catalog_item public.catalog_items%ROWTYPE;
  v_pkg_item RECORD;
  v_new_id UUID;
  v_first_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to track fulfillment';
  END IF;

  SELECT * INTO v_line_item FROM public.line_items
  WHERE id = p_line_item_id AND workspace_id = p_workspace_id AND entity_type = 'invoice';

  IF v_line_item.id IS NULL THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = v_line_item.entity_id AND deleted_at IS NULL;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status NOT IN ('partial', 'paid') THEN
    RAISE EXCEPTION 'Invoice in status % is not eligible for fulfillment tracking', v_invoice.status;
  END IF;

  IF v_line_item.catalog_item_id IS NOT NULL THEN
    SELECT * INTO v_catalog_item FROM public.catalog_items WHERE id = v_line_item.catalog_item_id;
  END IF;

  IF v_catalog_item.id IS NOT NULL AND v_catalog_item.is_package
     AND jsonb_array_length(v_catalog_item.package_items) > 0 THEN
    FOR v_pkg_item IN
      SELECT value, (ordinality - 1)::int AS idx
      FROM jsonb_array_elements(v_catalog_item.package_items) WITH ORDINALITY AS t(value, ordinality)
    LOOP
      INSERT INTO public.fulfillment_items (
        workspace_id, invoice_id, client_id, line_item_id, created_by,
        package_item_index, package_item_name, package_item_quantity, package_item_unit, package_item_note
      )
      VALUES (
        p_workspace_id, v_invoice.id, v_invoice.client_id, p_line_item_id, p_actor_id,
        v_pkg_item.idx, v_pkg_item.value->>'name',
        (v_pkg_item.value->>'quantity')::numeric * v_line_item.quantity,
        NULLIF(v_pkg_item.value->>'unit', ''), NULLIF(v_pkg_item.value->>'note', '')
      )
      ON CONFLICT (line_item_id, package_item_index) WHERE deleted_at IS NULL DO NOTHING
      RETURNING id INTO v_new_id;

      IF v_new_id IS NOT NULL THEN
        v_count := v_count + 1;
        IF v_first_id IS NULL THEN
          v_first_id := v_new_id;
        END IF;
      END IF;
    END LOOP;
  ELSE
    INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id, created_by)
    VALUES (p_workspace_id, v_invoice.id, v_invoice.client_id, p_line_item_id, p_actor_id)
    ON CONFLICT (line_item_id, package_item_index) WHERE deleted_at IS NULL DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NOT NULL THEN
      v_count := 1;
      v_first_id := v_new_id;
    END IF;
  END IF;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'This line item is already being tracked';
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'started tracking fulfillment for invoice ' || v_invoice.invoice_number,
    'fulfillment_item', v_first_id, 'invoice', v_invoice.id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'fulfillment_item', v_first_id);

  RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = v_first_id);
END;
$function$;

-- record_fulfillment_event: purchased target comes from the snapshotted
-- package-item quantity for a sub-item tracker, or the line item's own
-- quantity otherwise (unchanged behavior for non-package lines).
CREATE OR REPLACE FUNCTION public.record_fulfillment_event(p_fulfillment_item_id uuid, p_workspace_id uuid, p_actor_id uuid, p_quantity_delivered numeric, p_event_date date, p_notes text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_item public.fulfillment_items%ROWTYPE;
  v_purchased NUMERIC;
  v_delivered NUMERIC;
  v_new_status TEXT;
  v_event_id UUID;
  v_existing_event public.fulfillment_events%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to record a fulfillment event';
  END IF;

  IF p_quantity_delivered <= 0 THEN
    RAISE EXCEPTION 'Quantity delivered must be greater than 0';
  END IF;

  IF p_quantity_delivered != TRUNC(p_quantity_delivered) THEN
    RAISE EXCEPTION 'Quantity delivered must be a whole number';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_event FROM public.fulfillment_events
    WHERE idempotency_key = p_idempotency_key AND deleted_at IS NULL;

    IF v_existing_event.id IS NOT NULL THEN
      RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = v_existing_event.fulfillment_item_id);
    END IF;
  END IF;

  SELECT * INTO v_item FROM public.fulfillment_items
  WHERE id = p_fulfillment_item_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment item not found';
  END IF;

  IF v_item.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Fulfillment item in status % cannot accept new events', v_item.status;
  END IF;

  INSERT INTO public.fulfillment_events (
    workspace_id, fulfillment_item_id, quantity_delivered, event_date, notes, idempotency_key, recorded_by
  )
  VALUES (
    p_workspace_id, p_fulfillment_item_id, p_quantity_delivered, COALESCE(p_event_date, CURRENT_DATE),
    NULLIF(p_notes, ''), p_idempotency_key, p_actor_id
  )
  RETURNING id INTO v_event_id;

  IF v_item.package_item_index >= 0 THEN
    v_purchased := v_item.package_item_quantity;
  ELSE
    SELECT li.quantity INTO v_purchased FROM public.line_items li WHERE li.id = v_item.line_item_id;
  END IF;

  SELECT COALESCE(SUM(quantity_delivered), 0) INTO v_delivered
  FROM public.fulfillment_events
  WHERE fulfillment_item_id = p_fulfillment_item_id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_delivered >= v_purchased THEN 'completed'
    WHEN v_delivered > 0 THEN 'in_progress'
    ELSE v_item.status
  END;

  UPDATE public.fulfillment_items
  SET status = v_new_status, updated_at = now()
  WHERE id = p_fulfillment_item_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'fulfillment_recorded',
    'recorded delivery of ' || p_quantity_delivered || ' unit(s)',
    'fulfillment_item', p_fulfillment_item_id, 'invoice', v_item.invoice_id,
    jsonb_build_object('event_id', v_event_id, 'quantity_delivered', p_quantity_delivered)
  );
  IF v_new_status IS DISTINCT FROM v_item.status THEN
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_item', p_fulfillment_item_id,
      jsonb_build_object('status', jsonb_build_object('old', v_item.status, 'new', v_new_status))
    );
  END IF;

  RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = p_fulfillment_item_id);
END;
$function$;

-- get_fulfillment_items: description/unit/purchased sourced from the
-- snapshotted package-item columns for a sub-item tracker (description
-- prefixed with the parent line's own description, e.g.
-- "Paket Bisnis — Single Post Foto"), falling back to the line item's own
-- description/unit/quantity for non-package trackers exactly as before.
DROP FUNCTION IF EXISTS public.get_fulfillment_items(uuid, text, uuid, uuid, uuid, integer, integer);
CREATE FUNCTION public.get_fulfillment_items(p_workspace_id uuid, p_status text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_fulfillment_item_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, invoice_id uuid, invoice_number text, client_id uuid, client_name text, line_item_id uuid, description text, unit text, category text, status text, assigned_to uuid, notes text, created_at timestamp with time zone, updated_at timestamp with time zone, purchased numeric, delivered numeric, remaining numeric, progress_percent numeric, is_over_delivered boolean, is_package_item boolean, total_count bigint)
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
  ORDER BY fi.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;
