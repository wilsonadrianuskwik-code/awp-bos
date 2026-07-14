-- Phase 12: Service Delivery / Fulfillment tracking.
--
-- Two tables (header + event log, "derive delivered from source rows,
-- never cache a total that can drift" — same discipline as
-- recompute_invoice_totals/recompute_quotation_totals):
--   fulfillment_items  — one row per tracked invoice line item.
--   fulfillment_events — one row per delivery event; delivered quantity is
--                        always SUM()'d from here, never stored.
--
-- Fulfillment reads invoices/line_items/clients but never writes to them —
-- zero schema change, zero RPC change, zero new call site in the Invoice or
-- Quotation features. Tracker creation is automatic via an idempotent
-- sync_fulfillment_items() call from fulfillment's own read paths (ledger,
-- invoice-detail section, dashboard widget) — never hooked into any invoice
-- status-transition code.
--
-- All mutations go through the RPCs below (SECURITY DEFINER, staff+ checked
-- inside every function as defense in depth). The RLS INSERT/UPDATE
-- policies exist purely as a second layer — src/features/fulfillment/
-- actions.ts calls these RPCs exclusively and never issues a raw
-- .insert()/.update() against these tables, matching how
-- quotations/invoices/payments already work.

CREATE TABLE IF NOT EXISTS fulfillment_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  invoice_id   UUID NOT NULL REFERENCES invoices(id),
  client_id    UUID NOT NULL REFERENCES clients(id),
  -- ON DELETE RESTRICT: a line item with fulfillment history must never be
  -- deletable out from under it. In practice this never fires since
  -- invoices are immutable once non-draft, but it's the correct guard.
  line_item_id UUID NOT NULL REFERENCES line_items(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  -- Nullable: unused until the future staff-assignment extension, zero cost
  -- to add now vs. a second migration later.
  assigned_to  UUID REFERENCES auth.users(id),
  notes        TEXT,
  -- Nullable: auto-synced trackers have no specific human creator (logged
  -- as a 'system' activity, mirroring check_overdue_invoices); manually
  -- created trackers (via create_fulfillment_item) always set this.
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- One live tracker per line item — a soft-deleted tracker frees the line
-- item up for a fresh one (same pattern as the Phase 7 pending-invite /
-- Phase 8 SKU partial-unique indexes). Also the ON CONFLICT target
-- sync_fulfillment_items/create_fulfillment_item use to stay race-safe
-- under concurrent calls.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_items_line_item
  ON fulfillment_items(line_item_id) WHERE deleted_at IS NULL;
-- Composite, not just (workspace_id): the ledger's default view filters
-- both together ("show this workspace's open trackers").
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_workspace_status
  ON fulfillment_items(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_client ON fulfillment_items(client_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_invoice ON fulfillment_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_assigned
  ON fulfillment_items(assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE fulfillment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view fulfillment items" ON fulfillment_items;
CREATE POLICY "Members can view fulfillment items"
  ON fulfillment_items FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create fulfillment items" ON fulfillment_items;
CREATE POLICY "Staff can create fulfillment items"
  ON fulfillment_items FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can update fulfillment items" ON fulfillment_items;
CREATE POLICY "Staff can update fulfillment items"
  ON fulfillment_items FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

CREATE TABLE IF NOT EXISTS fulfillment_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),
  -- ON DELETE RESTRICT: delivery history must never be deletable out from
  -- under its tracker.
  fulfillment_item_id UUID NOT NULL REFERENCES fulfillment_items(id) ON DELETE RESTRICT,
  quantity_delivered  NUMERIC(10,3) NOT NULL CHECK (quantity_delivered > 0),
  event_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  notes               TEXT,
  -- Nullable, optional: lets an offline-capable client (mobile app) retry a
  -- submission after an uncertain network response without double-recording
  -- the same delivery. Unused by the web UI today, cheap to add now.
  idempotency_key     TEXT,
  recorded_by         UUID NOT NULL REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A wrong entry is corrected by soft-delete + a fresh record, the same
  -- correction model payments/delete_payment already uses. Deleting an
  -- event never auto-reverts the tracker's status (see
  -- delete_fulfillment_event) — a terminal status only changes via the
  -- explicit update_fulfillment_status "Reopen" path.
  deleted_at          TIMESTAMPTZ
);

-- Composite, not just (fulfillment_item_id): both the delivered-quantity
-- SUM and a future "no activity in N days" query want event_date indexed
-- alongside the tracker id.
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_item_date
  ON fulfillment_events(fulfillment_item_id, event_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_workspace
  ON fulfillment_events(workspace_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_events_idempotency
  ON fulfillment_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE fulfillment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view fulfillment events" ON fulfillment_events;
CREATE POLICY "Members can view fulfillment events"
  ON fulfillment_events FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff can create fulfillment events" ON fulfillment_events;
CREATE POLICY "Staff can create fulfillment events"
  ON fulfillment_events FOR INSERT
  WITH CHECK (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

DROP POLICY IF EXISTS "Staff can update fulfillment events" ON fulfillment_events;
CREATE POLICY "Staff can update fulfillment events"
  ON fulfillment_events FOR UPDATE
  USING (get_user_role(workspace_id) IN ('staff', 'admin', 'owner'));

-- ---------------------------------------------------------------------
-- sync_fulfillment_items — idempotent, set-oriented tracker creation.
-- Called from fulfillment's own read paths (never from invoice code) on
-- every ledger/invoice-detail/dashboard load. An invoice line item is
-- eligible once its invoice is in one of the "actually billed" statuses
-- the Catalog Revenue Report (Phase 10) already established, with
-- quantity > 1 (quantity-1 items stay manually trackable via
-- create_fulfillment_item). ON CONFLICT DO NOTHING on the partial unique
-- index makes this safe under concurrent calls (two page loads racing to
-- sync the same workspace at once).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_fulfillment_items(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to sync fulfillment items';
  END IF;

  FOR v_row IN
    SELECT li.id AS line_item_id, i.id AS invoice_id, i.invoice_number, i.client_id
    FROM public.line_items li
    JOIN public.invoices i ON i.id = li.entity_id AND li.entity_type = 'invoice'
    WHERE li.workspace_id = p_workspace_id
      AND i.deleted_at IS NULL
      AND i.status IN ('sent', 'viewed', 'partial', 'paid', 'overdue')
      AND li.quantity > 1
      AND NOT EXISTS (
        SELECT 1 FROM public.fulfillment_items fi
        WHERE fi.line_item_id = li.id AND fi.deleted_at IS NULL
      )
  LOOP
    INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id)
    VALUES (p_workspace_id, v_row.invoice_id, v_row.client_id, v_row.line_item_id)
    ON CONFLICT (line_item_id) WHERE deleted_at IS NULL DO NOTHING
    RETURNING id INTO v_new_id;

    -- A concurrent sync call already created this tracker between the
    -- NOT EXISTS check above and this INSERT — ON CONFLICT DO NOTHING
    -- means v_new_id is NULL; skip logging a row this call didn't create.
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

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- create_fulfillment_item — manual "Track Fulfillment" path, for eligible
-- line items sync doesn't auto-create a tracker for (quantity = 1, or any
-- untracked eligible line item a staff member wants tracked deliberately).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fulfillment_item(
  p_line_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line_item public.line_items%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_new_id UUID;
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

  IF v_invoice.status NOT IN ('sent', 'viewed', 'partial', 'paid', 'overdue') THEN
    RAISE EXCEPTION 'Invoice in status % is not eligible for fulfillment tracking', v_invoice.status;
  END IF;

  INSERT INTO public.fulfillment_items (workspace_id, invoice_id, client_id, line_item_id, created_by)
  VALUES (p_workspace_id, v_invoice.id, v_invoice.client_id, p_line_item_id, p_actor_id)
  ON CONFLICT (line_item_id) WHERE deleted_at IS NULL DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'This line item is already being tracked';
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'started tracking fulfillment for invoice ' || v_invoice.invoice_number,
    'fulfillment_item', v_new_id, 'invoice', v_invoice.id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'fulfillment_item', v_new_id);

  RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = v_new_id);
END;
$$;

-- ---------------------------------------------------------------------
-- record_fulfillment_event — the core delivery-recording transaction.
-- Locks the tracker row FIRST (FOR UPDATE) so two concurrent recordings
-- against the same tracker serialize here instead of each computing status
-- from a stale pre-insert sum (a lost-update race under READ COMMITTED
-- otherwise). Over-delivery is allowed, never blocked — the read layer
-- (get_fulfillment_items) surfaces is_over_delivered as a warning.
-- Optional idempotency_key: a retried call with the same key returns the
-- original event's tracker instead of double-recording (offline/mobile
-- retry safety) or erroring.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_fulfillment_event(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_quantity_delivered NUMERIC,
  p_event_date DATE,
  p_notes TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  SELECT li.quantity INTO v_purchased FROM public.line_items li WHERE li.id = v_item.line_item_id;

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
$$;

-- ---------------------------------------------------------------------
-- delete_fulfillment_event — soft-delete correction, mirrors delete_payment.
-- Deliberately does NOT recompute/revert the tracker's status: a terminal
-- status (completed/cancelled) only changes via the explicit "Reopen"
-- transition in update_fulfillment_status, never as a side effect of
-- editing history. Avoids a mistaken auto-regression surprising staff.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_fulfillment_event(
  p_event_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.fulfillment_events%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this fulfillment event';
  END IF;

  SELECT * INTO v_event FROM public.fulfillment_events
  WHERE id = p_event_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment event not found';
  END IF;

  UPDATE public.fulfillment_events SET deleted_at = now() WHERE id = p_event_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'fulfillment_event', p_event_id);

  RETURN jsonb_build_object('success', true, 'id', p_event_id);
END;
$$;

-- ---------------------------------------------------------------------
-- update_fulfillment_status — manual lifecycle transitions:
--   pending/in_progress -> completed (early accept) or cancelled, staff+.
--   completed/cancelled -> in_progress ("Reopen", a correction escape
--     hatch for a mistaken terminal state) — gated admin+, stricter than
--     every other fulfillment mutation since undoing a terminal state is
--     more consequential than recording ordinary progress.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_fulfillment_status(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.fulfillment_items%ROWTYPE;
  v_valid_next TEXT[];
BEGIN
  SELECT * INTO v_item FROM public.fulfillment_items
  WHERE id = p_fulfillment_item_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment item not found';
  END IF;

  v_valid_next := CASE v_item.status
    WHEN 'pending' THEN ARRAY['completed', 'cancelled']
    WHEN 'in_progress' THEN ARRAY['completed', 'cancelled']
    WHEN 'completed' THEN ARRAY['in_progress']
    WHEN 'cancelled' THEN ARRAY['in_progress']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Cannot transition fulfillment item from % to %', v_item.status, p_new_status;
  END IF;

  IF v_item.status IN ('completed', 'cancelled') THEN
    IF public.get_user_role(p_workspace_id) NOT IN ('admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to reopen this fulfillment item';
    END IF;
  ELSE
    IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to change this fulfillment item''s status';
    END IF;
  END IF;

  UPDATE public.fulfillment_items
  SET status = p_new_status, updated_at = now()
  WHERE id = p_fulfillment_item_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    'changed fulfillment status to ' || p_new_status,
    'fulfillment_item', p_fulfillment_item_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_item', p_fulfillment_item_id,
    jsonb_build_object('status', jsonb_build_object('old', v_item.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(fi) FROM public.fulfillment_items fi WHERE fi.id = p_fulfillment_item_id);
END;
$$;

-- ---------------------------------------------------------------------
-- get_fulfillment_items — the paginated list+progress read, also used for
-- a single-item detail read (pass p_fulfillment_item_id, ignore p_limit/
-- p_offset paging beyond the one row). Delivered is computed from a
-- pre-aggregated GROUP BY subquery (not a per-row correlated subquery) so
-- this scales as a single set-based query. total_count (a window
-- function) lets callers paginate without a second COUNT(*) query.
-- Read access follows the same viewer-inclusive fix already applied to
-- get_revenue_by_period/get_ar_aging (00024): only non-members are
-- rejected, not viewers.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_fulfillment_items(
  p_workspace_id UUID,
  p_status TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_fulfillment_item_id UUID DEFAULT NULL,
  p_invoice_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  client_id UUID,
  client_name TEXT,
  line_item_id UUID,
  description TEXT,
  unit TEXT,
  category TEXT,
  status TEXT,
  assigned_to UUID,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  purchased NUMERIC,
  delivered NUMERIC,
  remaining NUMERIC,
  progress_percent NUMERIC,
  is_over_delivered BOOLEAN,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
    li.description,
    li.unit,
    li.category,
    fi.status,
    fi.assigned_to,
    fi.notes,
    fi.created_at,
    fi.updated_at,
    li.quantity AS purchased,
    COALESCE(ds.delivered, 0) AS delivered,
    GREATEST(0, li.quantity - COALESCE(ds.delivered, 0)) AS remaining,
    LEAST(100, ROUND(COALESCE(ds.delivered, 0) / NULLIF(li.quantity, 0) * 100)) AS progress_percent,
    COALESCE(ds.delivered, 0) > li.quantity AS is_over_delivered,
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
$$;
