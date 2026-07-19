-- Threads Fulfilment Project auto-creation into the existing trigger point
-- (record_payment reaching 'partial' or 'paid') and the read paths that
-- also create trackers (the two sync functions, the manual "Track
-- Fulfillment" button), then backfills a project for every invoice that
-- already has fulfillment_items today.
--
-- get_or_create_fulfillment_project_for_invoice is the single place "when
-- does a project get created" is encoded — every call site below just
-- calls it and threads the returned id onto its INSERTs. Nothing else
-- about tracker creation/eligibility changes; every existing INSERT
-- statement is carried forward with only a project_id column/value added.

ALTER TABLE fulfillment_items ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES fulfillment_projects(id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_project
  ON fulfillment_items(project_id) WHERE project_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- get_or_create_fulfillment_project_for_invoice — the single source of
-- truth for project creation. Returns NULL (no project) if the invoice
-- hasn't reached partial/paid yet. Race-safe via ON CONFLICT on the
-- invoice_id unique index; re-selects the winner's row if this call lost
-- the race. On actual creation, links any of this invoice's trackers that
-- predate it (e.g. a tracker created by an earlier manual "Track
-- Fulfillment" click while the invoice was still 'sent').
-- ---------------------------------------------------------------------
CREATE FUNCTION get_or_create_fulfillment_project_for_invoice(
  p_workspace_id UUID,
  p_invoice_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_project_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to manage fulfillment projects';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_invoice.id IS NULL OR v_invoice.status NOT IN ('partial', 'paid') THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_project_id FROM public.fulfillment_projects
  WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  IF v_project_id IS NOT NULL THEN
    RETURN v_project_id;
  END IF;

  INSERT INTO public.fulfillment_projects (workspace_id, invoice_id, client_id, created_by)
  VALUES (p_workspace_id, p_invoice_id, v_invoice.client_id, p_actor_id)
  ON CONFLICT (invoice_id) WHERE deleted_at IS NULL DO NOTHING
  RETURNING id INTO v_project_id;

  IF v_project_id IS NULL THEN
    -- Lost a concurrent race (another payment / a lazy sync creating the
    -- same invoice's project at the same time) — re-select the winner.
    SELECT id INTO v_project_id FROM public.fulfillment_projects
    WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;
  ELSE
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, CASE WHEN p_actor_id IS NULL THEN 'system' ELSE 'user' END,
      'created', 'created fulfillment project for invoice ' || v_invoice.invoice_number,
      'fulfillment_project', v_project_id, 'invoice', p_invoice_id
    );
    PERFORM public.log_audit_entry(p_workspace_id, p_actor_id,
      CASE WHEN p_actor_id IS NULL THEN 'system' ELSE 'user' END,
      'create', 'fulfillment_project', v_project_id);

    UPDATE public.fulfillment_items SET project_id = v_project_id
    WHERE invoice_id = p_invoice_id AND project_id IS NULL AND deleted_at IS NULL;
  END IF;

  RETURN v_project_id;
END;
$$;

-- ---------------------------------------------------------------------
-- record_payment — unchanged except for one line calling
-- get_or_create_fulfillment_project_for_invoice right next to the existing
-- sync_fulfillment_items_for_invoice call. Fires unconditionally whenever
-- the status transition lands on partial/paid, independent of whether any
-- new tracker rows get created this call (covers the invoice-was-already-
-- fully-manually-tracked-before-payment edge case).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_payment(
  p_invoice_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_reference TEXT,
  p_notes TEXT,
  p_bank_name TEXT,
  p_receiver_account_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment_id UUID;
  v_payment_number TEXT;
  v_ordinal INTEGER;
  v_amount_paid NUMERIC(15,2);
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to record a payment';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0';
  END IF;

  v_old_status := v_invoice.status;

  v_payment_number := public.next_document_number(p_workspace_id, 'payment', 'PAY', p_payment_date);

  SELECT COUNT(*) + 1 INTO v_ordinal
  FROM public.payments
  WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  INSERT INTO public.payments (
    workspace_id, invoice_id, payment_number, amount, currency, payment_method,
    bank_name, receiver_account_name, payment_date, reference, notes, recorded_by
  )
  VALUES (
    p_workspace_id, p_invoice_id, v_payment_number, p_amount, COALESCE(p_currency, v_invoice.currency), p_payment_method,
    CASE WHEN p_payment_method = 'bank_transfer' THEN NULLIF(p_bank_name, '') ELSE NULL END,
    CASE WHEN p_payment_method = 'bank_transfer' THEN NULLIF(p_receiver_account_name, '') ELSE NULL END,
    p_payment_date, NULLIF(p_reference, ''), NULLIF(p_notes, ''), p_actor_id
  )
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
  FROM public.payments WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_amount_paid >= v_invoice.total THEN 'paid'
    WHEN v_amount_paid > 0 THEN 'partial'
    ELSE v_invoice.status
  END;

  UPDATE public.invoices SET
    amount_paid = v_amount_paid,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'payment_recorded',
    'recorded Payment #' || v_ordinal || ' (' || v_payment_number || ') — ' ||
      p_amount || ' via ' || p_payment_method,
    'invoice', p_invoice_id, 'payment', v_payment_id,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_number', v_payment_number,
      'amount', p_amount,
      'currency', COALESCE(p_currency, v_invoice.currency),
      'payment_method', p_payment_method,
      'ordinal', v_ordinal
    )
  );

  IF v_new_status = 'paid' THEN
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'invoice ' || v_invoice.invoice_number || ' fully paid', 'invoice', p_invoice_id
    );
  END IF;

  IF v_new_status IN ('partial', 'paid') THEN
    PERFORM public.sync_fulfillment_items_for_invoice(p_workspace_id, p_invoice_id);
    PERFORM public.get_or_create_fulfillment_project_for_invoice(p_workspace_id, p_invoice_id, p_actor_id);
  END IF;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'payment', v_payment_id);
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id,
      jsonb_build_object('status', jsonb_build_object('old', v_old_status, 'new', v_new_status))
    );
  END IF;

  RETURN jsonb_build_object(
    'invoice', (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id),
    'payment', (SELECT to_jsonb(p) FROM public.payments p WHERE p.id = v_payment_id)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- sync_fulfillment_items_for_invoice — unchanged eligibility/tracker logic,
-- now resolves this invoice's project once up front (NULL if the invoice
-- hasn't reached partial/paid — e.g. still 'sent'/'viewed'/'overdue', which
-- this function's broader eligibility window still allows for manual
-- pre-payment tracking) and threads it onto every inserted tracker.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_fulfillment_items_for_invoice(
  p_workspace_id UUID,
  p_invoice_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
  v_pkg_item RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
  v_project_id UUID;
BEGIN
  v_project_id := public.get_or_create_fulfillment_project_for_invoice(p_workspace_id, p_invoice_id, NULL);

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
          workspace_id, invoice_id, client_id, line_item_id, project_id,
          package_item_index, package_item_name, package_item_quantity, package_item_unit, package_item_note
        )
        VALUES (
          p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id, v_project_id,
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
      INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id, project_id)
      VALUES (p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id, v_project_id)
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
$$;

-- ---------------------------------------------------------------------
-- sync_fulfillment_items — workspace-wide lazy sweep, reached by the 3
-- lazy read paths (invoice detail, dashboard, fulfillment ledger). Calls
-- get_or_create per iteration (cheap unique-indexed lookup) so this is
-- what makes those 3 paths backfill-consistent with no new TS call site.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_fulfillment_items(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
  v_pkg_item RECORD;
  v_backfill_row RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
  v_project_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to sync fulfillment items';
  END IF;

  -- Catch-up pass: an invoice can already have trackers with no project
  -- (data from before this migration existed) even when every one of its
  -- line items is already tracked, so the main loop below never visits it.
  -- Resolve/create that invoice's project here first — a no-op for any
  -- invoice whose project already exists.
  FOR v_backfill_row IN
    SELECT DISTINCT i.id AS invoice_id
    FROM public.invoices i
    JOIN public.fulfillment_items fi ON fi.invoice_id = i.id AND fi.deleted_at IS NULL AND fi.project_id IS NULL
    WHERE i.workspace_id = p_workspace_id
      AND i.deleted_at IS NULL
      AND i.status IN ('partial', 'paid')
  LOOP
    PERFORM public.get_or_create_fulfillment_project_for_invoice(p_workspace_id, v_backfill_row.invoice_id, NULL);
  END LOOP;

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
    v_project_id := public.get_or_create_fulfillment_project_for_invoice(p_workspace_id, v_row.invoice_id, NULL);

    IF COALESCE(v_row.is_package, false) AND jsonb_array_length(v_row.package_items) > 0 THEN
      FOR v_pkg_item IN
        SELECT value, (ordinality - 1)::int AS idx
        FROM jsonb_array_elements(v_row.package_items) WITH ORDINALITY AS t(value, ordinality)
      LOOP
        INSERT INTO public.fulfillment_items (
          workspace_id, invoice_id, client_id, line_item_id, project_id,
          package_item_index, package_item_name, package_item_quantity, package_item_unit, package_item_note
        )
        VALUES (
          p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id, v_project_id,
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
      INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id, project_id)
      VALUES (p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id, v_project_id)
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
$$;

-- ---------------------------------------------------------------------
-- create_fulfillment_item — manual "Track Fulfillment" button. Resolves/
-- creates the project after confirming eligibility (status already
-- checked a few lines below), so a project is never created for an
-- ineligible invoice via this path either.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fulfillment_item(p_line_item_id UUID, p_workspace_id UUID, p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line_item public.line_items%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_catalog_item public.catalog_items%ROWTYPE;
  v_pkg_item RECORD;
  v_new_id UUID;
  v_first_id UUID;
  v_count INTEGER := 0;
  v_project_id UUID;
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

  v_project_id := public.get_or_create_fulfillment_project_for_invoice(p_workspace_id, v_invoice.id, p_actor_id);

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
        workspace_id, invoice_id, client_id, line_item_id, created_by, project_id,
        package_item_index, package_item_name, package_item_quantity, package_item_unit, package_item_note
      )
      VALUES (
        p_workspace_id, v_invoice.id, v_invoice.client_id, p_line_item_id, p_actor_id, v_project_id,
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
    INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id, created_by, project_id)
    VALUES (p_workspace_id, v_invoice.id, v_invoice.client_id, p_line_item_id, p_actor_id, v_project_id)
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
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_items — additive: project_id/project_name/project_status
-- (nullable, LEFT JOIN) and a new p_project_id filter param, so the
-- single-workspace UI can fetch "this project's trackers" through this
-- existing, otherwise-untouched progress RPC. Every existing column/
-- expression (including all package-aware CASE logic) carried forward
-- byte-for-byte.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_fulfillment_items(uuid, text, uuid, uuid, uuid, integer, integer);
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
  project_id uuid, project_name text, project_status text,
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
    fp.name AS project_name,
    fp.status AS project_status,
    COUNT(*) OVER() AS total_count
  FROM public.fulfillment_items fi
  JOIN public.line_items li ON li.id = fi.line_item_id
  JOIN public.invoices i ON i.id = fi.invoice_id
  JOIN public.clients c ON c.id = fi.client_id
  LEFT JOIN delivered_sums ds ON ds.fi_id = fi.id
  LEFT JOIN public.fulfillment_projects fp ON fp.id = fi.project_id AND fp.deleted_at IS NULL
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
-- Backfill — every invoice that already has fulfillment_items today gets
-- a project (status 'in_progress' if it already has recorded deliveries,
-- else 'not_started'), and every existing tracker for that invoice is
-- linked. Plain SQL, not the RPC above: a migration has no auth.uid()/
-- actor context, and this is a one-time structural fix, not a user
-- action, so (matching 00040's own "no backfill activity log" precedent
-- for structural changes) it writes no activity/audit entries.
-- ---------------------------------------------------------------------
INSERT INTO fulfillment_projects (workspace_id, invoice_id, client_id, status, created_at, updated_at)
SELECT DISTINCT
  fi.workspace_id, fi.invoice_id, fi.client_id,
  CASE WHEN EXISTS (
    SELECT 1 FROM fulfillment_events fe
    JOIN fulfillment_items fi2 ON fi2.id = fe.fulfillment_item_id
    WHERE fi2.invoice_id = fi.invoice_id AND fe.deleted_at IS NULL
  ) THEN 'in_progress' ELSE 'not_started' END,
  now(), now()
FROM fulfillment_items fi
WHERE fi.deleted_at IS NULL
ON CONFLICT (invoice_id) WHERE deleted_at IS NULL DO NOTHING;

UPDATE fulfillment_items fi
SET project_id = fp.id
FROM fulfillment_projects fp
WHERE fp.invoice_id = fi.invoice_id
  AND fp.deleted_at IS NULL
  AND fi.project_id IS NULL
  AND fi.deleted_at IS NULL;
