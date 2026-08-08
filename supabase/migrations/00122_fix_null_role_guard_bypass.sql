-- CRITICAL: every role guard in the database passed for non-members.
--
-- The guard is written the same way in 83 functions:
--
--   IF public.get_user_role(p_workspace_id) NOT IN ('staff','admin','owner') THEN
--     RAISE EXCEPTION 'Insufficient permissions';
--   END IF;
--
-- get_user_role returns NULL for somebody who is not a member of the
-- workspace. In SQL, NULL NOT IN (...) is NULL, not true — so the IF did
-- not fire, no exception was raised, and execution carried on into the
-- body. Every one of these functions is SECURITY DEFINER, which bypasses
-- RLS, so the guard was the only thing standing there.
--
-- Verified as an exploit rather than assumed: a user belonging to no
-- workspace at all called create_invoice against another workspace's id
-- and it returned INV/AWP/08082026-002. Reading, writing and deleting
-- another company's documents needed nothing but a valid login and an id.
--
-- THE FIX: COALESCE the role to a value that is not a role before
-- comparing, so a non-member takes the NOT IN branch and is refused.
--
--   IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN (...)
--
-- WHY NOT FIX get_user_role INSTEAD. Returning 'none' from the helper
-- would have fixed all 83 at a stroke, but 26 other guards are written
-- 'IF get_user_role(...) IS NULL THEN refuse' — a non-NULL sentinel makes
-- those stop firing, turning one hole into another. The 68 RLS policies
-- using 'get_user_role(...) IN (...)' are already correct, since NULL IN
-- (...) is also NULL and a policy that does not evaluate true denies.
-- Only the NOT IN form is wrong, so only that form is touched.
--
-- The bodies below are the live definitions with that one substitution
-- applied and nothing else changed. They were generated from the database
-- itself after all 121 migrations, not retyped, so no logic drifts.

CREATE OR REPLACE FUNCTION public.assign_fulfillment_deliverable(p_deliverable_id uuid, p_workspace_id uuid, p_actor_id uuid, p_assigned_to uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deliverable public.fulfillment_deliverables%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to assign this deliverable';
  END IF;

  SELECT * INTO v_deliverable FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_deliverable.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = p_assigned_to AND wm.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee is not a member of this workspace';
  END IF;

  UPDATE public.fulfillment_deliverables
  SET assigned_to = p_assigned_to, updated_at = now()
  WHERE id = p_deliverable_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user',
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned' ELSE 'assigned' END,
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned deliverable "' || v_deliverable.title || '"'
         ELSE 'assigned deliverable "' || v_deliverable.title || '"' END,
    'fulfillment_deliverable', p_deliverable_id, 'fulfillment_project', v_deliverable.project_id
  );

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = p_deliverable_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_fulfillment_project(p_project_id uuid, p_workspace_id uuid, p_actor_id uuid, p_assigned_to uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to assign this fulfillment project';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = p_assigned_to AND wm.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee is not a member of this workspace';
  END IF;

  UPDATE public.fulfillment_projects
  SET assigned_to = p_assigned_to, updated_at = now()
  WHERE id = p_project_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user',
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned' ELSE 'assigned' END,
    CASE WHEN p_assigned_to IS NULL THEN 'unassigned this fulfillment project' ELSE 'assigned this fulfillment project' END,
    'fulfillment_project', p_project_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_project', p_project_id,
    jsonb_build_object('assigned_to', jsonb_build_object('old', v_project.assigned_to, 'new', p_assigned_to))
  );

  RETURN (SELECT to_jsonb(fp) FROM public.fulfillment_projects fp WHERE fp.id = p_project_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_create_fulfillment_deliverables(p_project_id uuid, p_workspace_id uuid, p_actor_id uuid, p_items jsonb)
 RETURNS SETOF fulfillment_deliverables
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
  v_count INT;
  v_bad_item_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to generate deliverables';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'Items must be a JSON array';
  END IF;

  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 200 THEN
    RAISE EXCEPTION 'Count must be between 1 and 200';
  END IF;

  SELECT (item->>'fulfillment_item_id')::UUID INTO v_bad_item_id
  FROM jsonb_array_elements(p_items) AS item
  WHERE item->>'fulfillment_item_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.fulfillment_items fi
      WHERE fi.id = (item->>'fulfillment_item_id')::UUID
        AND fi.project_id = p_project_id AND fi.deleted_at IS NULL
    )
  LIMIT 1;

  IF v_bad_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'One or more linked trackers do not belong to this project';
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'generated ' || v_count || ' deliverable(s)',
    'fulfillment_project', p_project_id
  );

  RETURN QUERY
  INSERT INTO public.fulfillment_deliverables (
    workspace_id, project_id, fulfillment_item_id, title, description,
    scheduled_date, assigned_to, created_by
  )
  SELECT
    p_workspace_id, p_project_id,
    NULLIF(item->>'fulfillment_item_id', '')::UUID,
    item->>'title',
    NULLIF(item->>'description', ''),
    (item->>'scheduled_date')::DATE,
    NULLIF(item->>'assigned_to', '')::UUID,
    p_actor_id
  FROM jsonb_array_elements(p_items) AS item
  RETURNING *;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_delete_catalog_items(p_workspace_id uuid, p_actor_id uuid, p_catalog_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_deleted_ids UUID[] := '{}';
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete catalog items';
  END IF;

  FOREACH v_id IN ARRAY p_catalog_item_ids LOOP
    UPDATE public.catalog_items SET deleted_at = now()
    WHERE id = v_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

    IF FOUND THEN
      PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'catalog_item', v_id);
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
    'deleted_ids', to_jsonb(v_deleted_ids)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_delete_invoices(p_workspace_id uuid, p_actor_id uuid, p_invoice_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_deleted_ids UUID[] := '{}';
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete invoices';
  END IF;

  FOREACH v_id IN ARRAY p_invoice_ids LOOP
    UPDATE public.invoices SET deleted_at = now()
    WHERE id = v_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

    IF FOUND THEN
      PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'invoice', v_id);
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
    'deleted_ids', to_jsonb(v_deleted_ids)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_delete_quotations(p_workspace_id uuid, p_actor_id uuid, p_quotation_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_deleted_ids UUID[] := '{}';
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete quotations';
  END IF;

  FOREACH v_id IN ARRAY p_quotation_ids LOOP
    UPDATE public.quotations SET deleted_at = now()
    WHERE id = v_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

    IF FOUND THEN
      PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'quotation', v_id);
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
    'deleted_ids', to_jsonb(v_deleted_ids)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_generate_fulfillment_deliverables(p_project_id uuid, p_workspace_id uuid, p_actor_id uuid, p_start_date date, p_frequency_days integer, p_count integer, p_title_template text DEFAULT NULL::text, p_fulfillment_item_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid)
 RETURNS SETOF fulfillment_deliverables
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to generate deliverables';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Start date is required';
  END IF;

  IF p_count IS NULL OR p_count < 1 OR p_count > 200 THEN
    RAISE EXCEPTION 'Count must be between 1 and 200';
  END IF;

  IF p_frequency_days IS NULL OR p_frequency_days < 1 THEN
    RAISE EXCEPTION 'Frequency must be at least 1 day';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_fulfillment_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fulfillment_items fi
    WHERE fi.id = p_fulfillment_item_id AND fi.project_id = p_project_id AND fi.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'That tracker does not belong to this project';
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'generated ' || p_count || ' deliverable(s) starting ' || p_start_date,
    'fulfillment_project', p_project_id
  );

  RETURN QUERY
  INSERT INTO public.fulfillment_deliverables (
    workspace_id, project_id, fulfillment_item_id, title, scheduled_date, assigned_to, created_by
  )
  SELECT
    p_workspace_id, p_project_id, p_fulfillment_item_id,
    COALESCE(NULLIF(p_title_template, ''), 'Post') || ' #' || (n + 1),
    p_start_date + (n * p_frequency_days),
    p_assigned_to, p_actor_id
  FROM generate_series(0, p_count - 1) AS n
  RETURNING *;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_overdue_invoices(p_workspace_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invoice RECORD;
  v_count INTEGER := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to check overdue invoices';
  END IF;

  FOR v_invoice IN
    SELECT * FROM public.invoices
    WHERE workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND status IN ('sent', 'viewed', 'partial')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE public.invoices SET status = 'overdue', updated_at = now() WHERE id = v_invoice.id;

    PERFORM public.log_activity(
      p_workspace_id, NULL, 'system', 'status_change',
      'invoice ' || v_invoice.invoice_number || ' became overdue', 'invoice', v_invoice.id
    );
    PERFORM public.log_audit_entry(
      p_workspace_id, NULL, 'system', 'update', 'invoice', v_invoice.id,
      jsonb_build_object('status', jsonb_build_object('old', v_invoice.status, 'new', 'overdue'))
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_client(p_workspace_id uuid, p_actor_id uuid, p_name text, p_email text, p_phone text, p_company text, p_website text, p_billing_email text, p_tax_id text, p_payment_terms integer, p_preferred_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_client_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a client';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  INSERT INTO public.clients (
    workspace_id, name, email, phone, company, website, billing_email,
    tax_id, payment_terms, preferred_currency, created_by
  )
  VALUES (
    p_workspace_id, p_name, NULLIF(p_email, ''), NULLIF(p_phone, ''),
    NULLIF(p_company, ''), NULLIF(p_website, ''), NULLIF(p_billing_email, ''),
    NULLIF(p_tax_id, ''), COALESCE(p_payment_terms, 30), p_preferred_currency, p_actor_id
  )
  RETURNING id INTO v_client_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created client "' || p_name || '"', 'client', v_client_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'client', v_client_id);

  RETURN (SELECT to_jsonb(c) FROM public.clients c WHERE c.id = v_client_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_delivery_order(p_workspace_id uuid, p_actor_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_do public.delivery_orders%ROWTYPE;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = (p_input->>'invoice_id')::UUID AND workspace_id = p_workspace_id;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  v_project_id := COALESCE((p_input->>'project_id')::UUID, v_invoice.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'delivery_order', CURRENT_DATE,
    v_project_code, v_project_id, 'DO'
  );

  INSERT INTO public.delivery_orders (workspace_id, do_number, invoice_id, project_id, client_id, delivery_date, delivery_address, notes, created_by)
  VALUES (p_workspace_id, v_number, v_invoice.id, v_project_id,
    v_invoice.client_id, (p_input->>'delivery_date')::DATE, p_input->'delivery_address', p_input->>'notes', p_actor_id)
  RETURNING * INTO v_do;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'line_items', '[]'::jsonb))
  LOOP
    INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, source_line_item_id)
    VALUES (p_workspace_id, 'delivery_order', v_do.id, 'per_unit', v_sort,
      v_item->>'description', (v_item->>'quantity')::NUMERIC, 0, v_item->>'unit',
      NULLIF(v_item->>'source_line_item_id', '')::UUID);
    v_sort := v_sort + 1;
  END LOOP;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created delivery order ' || v_do.do_number, 'delivery_order', v_do.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'delivery_order', v_do.id, to_jsonb(v_do));

  RETURN to_jsonb(v_do);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_fulfillment_deliverable(p_project_id uuid, p_workspace_id uuid, p_actor_id uuid, p_title text, p_scheduled_date date, p_description text DEFAULT NULL::text, p_fulfillment_item_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_project public.fulfillment_projects%ROWTYPE;
  v_new_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to add a deliverable';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF p_scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Scheduled date is required';
  END IF;

  SELECT * INTO v_project FROM public.fulfillment_projects
  WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment project not found';
  END IF;

  IF p_fulfillment_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fulfillment_items fi
    WHERE fi.id = p_fulfillment_item_id AND fi.project_id = p_project_id AND fi.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'That tracker does not belong to this project';
  END IF;

  INSERT INTO public.fulfillment_deliverables (
    workspace_id, project_id, fulfillment_item_id, title, description,
    scheduled_date, assigned_to, notes, created_by
  )
  VALUES (
    p_workspace_id, p_project_id, p_fulfillment_item_id, p_title, NULLIF(p_description, ''),
    p_scheduled_date, p_assigned_to, NULLIF(p_notes, ''), p_actor_id
  )
  RETURNING id INTO v_new_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'added deliverable "' || p_title || '"', 'fulfillment_deliverable', v_new_id,
    'fulfillment_project', p_project_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'fulfillment_deliverable', v_new_id);

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = v_new_id);
END;
$function$
;

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
  v_project_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_invoice(p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_due_date date, p_payment_terms text, p_notes text, p_line_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invoice_number TEXT;
  v_internal_id TEXT;
  v_invoice_id UUID;
  v_currency TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create an invoice';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_invoice_number := public.generate_invoice_number(p_workspace_id, p_issue_date);
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, internal_id, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by
  )
  VALUES (
    p_workspace_id, p_client_id, v_invoice_number, v_internal_id, 'draft', v_currency,
    p_issue_date, p_due_date, NULLIF(p_title, ''), NULLIF(p_summary, ''),
    NULLIF(p_payment_terms, ''), NULLIF(p_notes, ''), p_actor_id
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'invoice', v_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_invoice_totals(v_invoice_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created invoice ' || v_invoice_number, 'invoice', v_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_invoice_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_invoice_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_invoice(p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_due_date date, p_payment_terms text, p_notes text, p_line_items jsonb, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invoice_number TEXT;
  v_internal_id TEXT;
  v_invoice_id UUID;
  v_currency TEXT;
  v_project_code TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create an invoice';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = p_project_id AND workspace_id = p_workspace_id;
  IF v_project_code IS NULL THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_invoice_number := public.generate_document_number(p_workspace_id, 'invoice', p_issue_date, v_project_code, p_project_id, 'INV');
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.invoices (
    workspace_id, client_id, invoice_number, internal_id, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by, project_id
  )
  VALUES (
    p_workspace_id, p_client_id, v_invoice_number, v_internal_id, 'draft', v_currency,
    p_issue_date, p_due_date, NULLIF(p_title, ''), NULLIF(p_summary, ''),
    NULLIF(p_payment_terms, ''), NULLIF(p_notes, ''), p_actor_id, p_project_id
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'invoice', v_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_invoice_totals(v_invoice_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created invoice ' || v_invoice_number, 'invoice', v_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_invoice_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_invoice_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_lead(p_workspace_id uuid, p_actor_id uuid, p_name text, p_email text, p_phone text, p_company text, p_source text, p_status text, p_conversion_probability numeric, p_expected_value numeric, p_notes_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lead_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a lead';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  INSERT INTO public.leads (
    workspace_id, name, email, phone, company, source, status,
    conversion_probability, expected_value, notes_text, created_by
  )
  VALUES (
    p_workspace_id, p_name, NULLIF(p_email, ''), NULLIF(p_phone, ''),
    NULLIF(p_company, ''), NULLIF(p_source, ''), COALESCE(p_status, 'new'),
    p_conversion_probability, p_expected_value, NULLIF(p_notes_text, ''), p_actor_id
  )
  RETURNING id INTO v_lead_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created lead "' || p_name || '"', 'lead', v_lead_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'lead', v_lead_id);

  RETURN (SELECT to_jsonb(l) FROM public.leads l WHERE l.id = v_lead_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_proforma_invoice(p_workspace_id uuid, p_actor_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pi public.proforma_invoices%ROWTYPE;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_project_id := (p_input->>'project_id')::UUID;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_project_id AND workspace_id = p_workspace_id;
  IF v_project_code IS NULL THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_number := public.generate_document_number(
    p_workspace_id, 'proforma_invoice', COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    v_project_code, v_project_id, 'PI'
  );

  INSERT INTO public.proforma_invoices (
    workspace_id, pi_number, client_id, project_id, currency, issue_date, expiry_date, title, notes, terms_and_conditions, created_by
  ) VALUES (
    p_workspace_id, v_number, (p_input->>'client_id')::UUID, v_project_id,
    COALESCE(p_input->>'currency', 'USD'), COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'expiry_date')::DATE, p_input->>'title', p_input->>'notes', p_input->>'terms_and_conditions', p_actor_id
  ) RETURNING * INTO v_pi;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'line_items', '[]'::jsonb))
  LOOP
    INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
    VALUES (p_workspace_id, 'proforma_invoice', v_pi.id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
      v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
      (v_item->>'catalog_item_id')::UUID);
    v_sort := v_sort + 1;
  END LOOP;

  PERFORM public.recompute_proforma_invoice_totals(v_pi.id);
  SELECT * INTO v_pi FROM public.proforma_invoices WHERE id = v_pi.id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created proforma invoice ' || v_pi.pi_number, 'proforma_invoice', v_pi.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'proforma_invoice', v_pi.id, to_jsonb(v_pi));

  RETURN to_jsonb(v_pi);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_project(p_workspace_id uuid, p_actor_id uuid, p_code text, p_name text, p_client_id uuid, p_status text DEFAULT 'planning'::text, p_site_address jsonb DEFAULT NULL::jsonb, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_budget numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'IDR'::text, p_assigned_to uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO public.projects (workspace_id, code, name, client_id, status, site_address, start_date, end_date, budget, currency, assigned_to, notes, created_by)
  VALUES (p_workspace_id, p_code, p_name, p_client_id, p_status, p_site_address, p_start_date, p_end_date, p_budget, p_currency, p_assigned_to, p_notes, p_actor_id)
  RETURNING * INTO v_project;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created project ' || v_project.code, 'project', v_project.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'project', v_project.id, to_jsonb(v_project));

  RETURN to_jsonb(v_project);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_purchase_order(p_workspace_id uuid, p_actor_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_supplier_id UUID;
  v_project_id UUID;
  v_project_code TEXT;
  v_number TEXT;
  v_item JSONB;
  v_sort INT := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_supplier_id := (p_input->>'supplier_id')::UUID;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Supplier is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier_id AND workspace_id = p_workspace_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Invalid supplier';
  END IF;

  v_project_id := (p_input->>'project_id')::UUID;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_project_id AND workspace_id = p_workspace_id;
  IF v_project_code IS NULL THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_number := public.generate_document_number(
    p_workspace_id, 'purchase_order', COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    v_project_code, v_project_id, 'PO'
  );

  INSERT INTO public.purchase_orders (
    workspace_id, po_number, supplier_id, project_id, currency, issue_date, expected_date,
    reference, title, terms_and_conditions, notes, internal_notes, created_by
  ) VALUES (
    p_workspace_id, v_number, v_supplier_id, v_project_id,
    COALESCE(p_input->>'currency', 'IDR'), COALESCE((p_input->>'issue_date')::DATE, CURRENT_DATE),
    (p_input->>'expected_date')::DATE, NULLIF(TRIM(COALESCE(p_input->>'reference', '')), ''),
    p_input->>'title', p_input->>'terms_and_conditions',
    p_input->>'notes', p_input->>'internal_notes', p_actor_id
  ) RETURNING * INTO v_po;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'line_items', '[]'::jsonb))
  LOOP
    INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
    VALUES (p_workspace_id, 'purchase_order', v_po.id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
      v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
      (v_item->>'catalog_item_id')::UUID);
    v_sort := v_sort + 1;
  END LOOP;

  PERFORM public.recompute_purchase_order_totals(v_po.id);
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po.id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created purchase order ' || v_po.po_number, 'purchase_order', v_po.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'purchase_order', v_po.id, to_jsonb(v_po));

  RETURN to_jsonb(v_po);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_quotation(p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_expiry_date date, p_terms_and_conditions text, p_notes text, p_internal_notes text, p_line_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_quotation_number TEXT;
  v_internal_id TEXT;
  v_quotation_id UUID;
  v_currency TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a quotation';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_quotation_number := public.next_document_number(p_workspace_id, 'quotation', 'QUO', p_issue_date);
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, created_by
  )
  VALUES (
    p_workspace_id, p_client_id, v_quotation_number, v_internal_id, 'draft', v_currency,
    p_issue_date, p_expiry_date, NULLIF(p_title, ''), NULLIF(p_summary, ''), NULLIF(p_terms_and_conditions, ''),
    NULLIF(p_notes, ''), NULLIF(p_internal_notes, ''), p_actor_id
  )
  RETURNING id INTO v_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'quotation', v_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(v_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created quotation ' || v_quotation_number, 'quotation', v_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_quotation_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_quotation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_quotation(p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_expiry_date date, p_terms_and_conditions text, p_notes text, p_internal_notes text, p_line_items jsonb, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_quotation_number TEXT;
  v_internal_id TEXT;
  v_quotation_id UUID;
  v_currency TEXT;
  v_project_code TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a quotation';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = p_project_id AND workspace_id = p_workspace_id;
  IF v_project_code IS NULL THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));
  v_quotation_number := public.generate_document_number(p_workspace_id, 'quotation', p_issue_date, v_project_code, p_project_id, 'QT');
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM p_issue_date)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions, notes, internal_notes,
    created_by, project_id
  )
  VALUES (
    p_workspace_id, p_client_id, v_quotation_number, v_internal_id, 'draft', v_currency,
    p_issue_date, p_expiry_date, NULLIF(p_title, ''), NULLIF(p_summary, ''),
    NULLIF(p_terms_and_conditions, ''), NULLIF(p_notes, ''), NULLIF(p_internal_notes, ''), p_actor_id,
    p_project_id
  )
  RETURNING id INTO v_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'quotation', v_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(v_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created quotation ' || v_quotation_number, 'quotation', v_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_quotation_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_quotation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_quotation_template(p_workspace_id uuid, p_actor_id uuid, p_name text, p_description text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_template_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to create a template';
  END IF;

  IF jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  INSERT INTO public.quotation_templates (workspace_id, name, description, created_by)
  VALUES (p_workspace_id, p_name, NULLIF(p_description, ''), p_actor_id)
  RETURNING id INTO v_template_id;

  INSERT INTO public.quotation_template_items (
    template_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    v_template_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'created quotation template "' || p_name || '"', 'quotation_template', v_template_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation_template', v_template_id);

  RETURN (SELECT to_jsonb(t) FROM public.quotation_templates t WHERE t.id = v_template_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_quotation_version(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_source public.quotations%ROWTYPE;
  v_root_id UUID;
  v_next_version INTEGER;
  v_new_id UUID;
  v_new_number TEXT;
  v_internal_id TEXT;
  v_project_code TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to version this quotation';
  END IF;

  SELECT * INTO v_source FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  v_root_id := COALESCE(v_source.parent_quotation_id, v_source.id);

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.quotations
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
    AND (id = v_root_id OR parent_quotation_id = v_root_id);

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_new_number := public.generate_document_number(
    p_workspace_id, 'quotation', CURRENT_DATE, v_project_code, v_source.project_id, 'QT'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, project_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, parent_quotation_id, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_new_number, v_internal_id, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, v_next_version, v_root_id, p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent, v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'quotation', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_quotation_totals(v_new_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'versioned',
    'created version ' || v_next_version || ' (' || v_new_number || ') of quotation ' || v_source.quotation_number,
    'quotation', v_new_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_new_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_new_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_supplier(p_workspace_id uuid, p_actor_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_supplier public.suppliers%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO public.suppliers (
    workspace_id, name, email, phone, company, website, address, billing_email, tax_id,
    payment_terms, preferred_currency, tags, custom_fields, notes, assigned_to, created_by
  ) VALUES (
    p_workspace_id, p_input->>'name', p_input->>'email', p_input->>'phone', p_input->>'company',
    p_input->>'website', p_input->'address', p_input->>'billing_email', p_input->>'tax_id',
    COALESCE((p_input->>'payment_terms')::INTEGER, 30), p_input->>'preferred_currency',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_input->'tags', '[]'::jsonb)) x), '{}'),
    COALESCE(p_input->'custom_fields', '{}'::jsonb), p_input->>'notes',
    (p_input->>'assigned_to')::UUID, p_actor_id
  ) RETURNING * INTO v_supplier;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Created supplier ' || v_supplier.name, 'supplier', v_supplier.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'create', 'supplier', v_supplier.id, to_jsonb(v_supplier));

  RETURN to_jsonb(v_supplier);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace_invite(p_workspace_id uuid, p_actor_id uuid, p_email text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_existing_user_id UUID;
  v_invite_id UUID;
  v_replaced_count INTEGER;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to invite members';
  END IF;

  IF p_role NOT IN ('admin', 'staff', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT id INTO v_existing_user_id FROM auth.users WHERE lower(email) = v_email;

  IF v_existing_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = v_existing_user_id
  ) THEN
    RAISE EXCEPTION 'This person is already a member of this workspace';
  END IF;

  UPDATE public.workspace_invites
  SET status = 'revoked'
  WHERE workspace_id = p_workspace_id AND email = v_email AND status = 'pending';
  GET DIAGNOSTICS v_replaced_count = ROW_COUNT;

  INSERT INTO public.workspace_invites (workspace_id, email, role, invited_by)
  VALUES (p_workspace_id, v_email, p_role, p_actor_id)
  RETURNING id INTO v_invite_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'invited',
    'invited ' || v_email || ' as ' || p_role ||
      CASE WHEN v_replaced_count > 0 THEN ' (replacing a previous pending invite)' ELSE '' END,
    'workspace_invite', v_invite_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'workspace_invite', v_invite_id);

  RETURN (SELECT to_jsonb(wi) FROM public.workspace_invites wi WHERE wi.id = v_invite_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_client(p_client_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_client public.clients%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this client';
  END IF;

  SELECT * INTO v_client FROM public.clients
  WHERE id = p_client_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  UPDATE public.clients SET deleted_at = now(), updated_at = now() WHERE id = p_client_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'client', p_client_id);

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_delivery_order(p_workspace_id uuid, p_actor_id uuid, p_do_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_do public.delivery_orders%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  PERFORM public.revert_fulfillment_from_delivery_order(p_do_id, p_workspace_id);

  UPDATE public.delivery_orders SET deleted_at = now()
  WHERE id = p_do_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_do;
  IF v_do.id IS NULL THEN RAISE EXCEPTION 'Delivery order not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted delivery order ' || v_do.do_number, 'delivery_order', v_do.id);

  RETURN to_jsonb(v_do);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_fulfillment_deliverable(p_deliverable_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deliverable public.fulfillment_deliverables%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this deliverable';
  END IF;

  SELECT * INTO v_deliverable FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_deliverable.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  IF v_deliverable.status = 'posted' THEN
    UPDATE public.fulfillment_events
    SET deleted_at = now()
    WHERE idempotency_key = 'deliverable:' || p_deliverable_id AND deleted_at IS NULL;
  END IF;

  UPDATE public.fulfillment_deliverables SET deleted_at = now(), updated_at = now() WHERE id = p_deliverable_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'fulfillment_deliverable', p_deliverable_id);

  RETURN jsonb_build_object('success', true, 'id', p_deliverable_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_fulfillment_event(p_event_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_event public.fulfillment_events%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_invoice(p_invoice_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.invoices%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  UPDATE public.invoices SET deleted_at = now() WHERE id = p_invoice_id;

  -- Free the strings so the number can be issued again. Both UNIQUE
  -- indexes on invoices reach across soft-deleted rows, so the row has to
  -- stop occupying them. The row id is part of the marker because a plain
  -- 'VOID/' prefix is not unique: reissue a number, delete it again, and
  -- the second void collides with the first on that same index.
  UPDATE public.invoices
     SET invoice_number = 'VOID/' || LEFT(id::TEXT, 8) || '/' || invoice_number,
         internal_id    = CASE
           WHEN internal_id IS NULL THEN NULL
           ELSE 'VOID/' || LEFT(id::TEXT, 8) || '/' || internal_id
         END
   WHERE id = p_invoice_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'invoice', p_invoice_id);

  RETURN jsonb_build_object('success', true, 'id', p_invoice_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_lead(p_lead_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this lead';
  END IF;

  SELECT * INTO v_lead FROM public.leads
  WHERE id = p_lead_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  UPDATE public.leads SET deleted_at = now(), updated_at = now() WHERE id = p_lead_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'lead', p_lead_id);

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_payment(p_payment_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_amount_paid NUMERIC(15,2);
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this payment';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE id = p_payment_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = v_payment.invoice_id
  FOR UPDATE;

  v_old_status := v_invoice.status;

  UPDATE public.payments SET deleted_at = now() WHERE id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
  FROM public.payments WHERE invoice_id = v_invoice.id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_amount_paid >= v_invoice.total THEN 'paid'
    WHEN v_amount_paid > 0 THEN 'partial'
    WHEN v_invoice.status IN ('partial', 'paid') THEN 'sent'
    ELSE v_invoice.status
  END;

  UPDATE public.invoices SET
    amount_paid = v_amount_paid,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = v_invoice.id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'payment', p_payment_id);
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'invoice', v_invoice.id,
      jsonb_build_object('status', jsonb_build_object('old', v_old_status, 'new', v_new_status))
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_payment_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_proforma_invoice(p_workspace_id uuid, p_actor_id uuid, p_pi_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_pi public.proforma_invoices%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.proforma_invoices SET deleted_at = now() WHERE id = p_pi_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_pi;
  IF v_pi.id IS NULL THEN RAISE EXCEPTION 'Proforma invoice not found'; END IF;
  RETURN to_jsonb(v_pi);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_project(p_workspace_id uuid, p_actor_id uuid, p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.projects SET deleted_at = now() WHERE id = p_project_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_project;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted project ' || v_project.code, 'project', v_project.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'project', v_project.id, to_jsonb(v_project));

  RETURN to_jsonb(v_project);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_purchase_order(p_workspace_id uuid, p_actor_id uuid, p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.purchase_orders SET deleted_at = now() WHERE id = p_po_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_po;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted purchase order ' || v_po.po_number, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_quotation(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.quotations%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this quotation';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  UPDATE public.quotations SET deleted_at = now() WHERE id = p_quotation_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'quotation', p_quotation_id);

  RETURN jsonb_build_object('success', true, 'id', p_quotation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_quotation_template(p_template_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.quotation_templates%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this template';
  END IF;

  SELECT * INTO v_old FROM public.quotation_templates
  WHERE id = p_template_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  UPDATE public.quotation_templates SET deleted_at = now() WHERE id = p_template_id;

  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'delete', 'quotation_template', p_template_id);

  RETURN jsonb_build_object('success', true, 'id', p_template_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_supplier(p_workspace_id uuid, p_actor_id uuid, p_supplier_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_supplier public.suppliers%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.suppliers SET deleted_at = now() WHERE id = p_supplier_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_supplier;
  IF v_supplier.id IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'Deleted supplier ' || v_supplier.name, 'supplier', v_supplier.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'delete', 'supplier', v_supplier.id, to_jsonb(v_supplier));

  RETURN to_jsonb(v_supplier);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicate_invoice(p_invoice_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_source public.invoices%ROWTYPE;
  v_new_id UUID;
  v_number TEXT;
  v_internal_id TEXT;
  v_project_code TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this invoice';
  END IF;

  SELECT * INTO v_source FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'invoice', CURRENT_DATE, v_project_code, v_source.project_id, 'INV'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  INSERT INTO public.invoices (
    workspace_id, client_id, project_id, invoice_number, internal_id, status, currency,
    issue_date, due_date, title, summary, payment_terms, notes, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_number, v_internal_id, 'draft', v_source.currency,
    CURRENT_DATE, v_source.due_date, v_source.title, v_source.summary,
    v_source.payment_terms, v_source.notes, p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent, v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'invoice', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  PERFORM public.recompute_invoice_totals(v_new_id);

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'invoice', v_new_id, 'invoice', p_invoice_id, 'duplicated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated invoice ' || v_source.invoice_number || ' to create ' || v_number,
    'invoice', p_invoice_id, 'invoice', v_new_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated from invoice ' || v_source.invoice_number,
    'invoice', v_new_id, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_new_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_new_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicate_purchase_order(p_po_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_source       public.purchase_orders%ROWTYPE;
  v_new_id       UUID;
  v_number       TEXT;
  v_project_code TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this purchase order';
  END IF;

  SELECT * INTO v_source FROM public.purchase_orders
  WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'purchase_order', CURRENT_DATE, v_project_code, v_source.project_id, 'PO'
  );

  INSERT INTO public.purchase_orders (
    workspace_id, po_number, supplier_id, project_id, currency, issue_date, expected_date,
    reference, title, terms_and_conditions, notes, internal_notes, status, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_number, v_source.supplier_id, v_source.project_id, v_source.currency,
    CURRENT_DATE, v_source.expected_date,
    v_source.reference, v_source.title, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, 'draft', p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent,
    v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'purchase_order', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'purchase_order' AND entity_id = p_po_id;

  PERFORM public.recompute_purchase_order_totals(v_new_id);

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'purchase_order', v_new_id, 'purchase_order', p_po_id, 'duplicated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create',
          'Duplicated purchase order ' || v_source.po_number || ' to create ' || v_number,
          'purchase_order', v_new_id);

  RETURN (SELECT to_jsonb(p) FROM public.purchase_orders p WHERE p.id = v_new_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicate_quotation(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_source public.quotations%ROWTYPE;
  v_new_id UUID;
  v_number TEXT;
  v_internal_id TEXT;
  v_project_code TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to duplicate this quotation';
  END IF;

  SELECT * INTO v_source FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_source.project_id;

  v_number := public.generate_document_number(
    p_workspace_id, 'quotation', CURRENT_DATE, v_project_code, v_source.project_id, 'QT'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'quotation_internal', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  INSERT INTO public.quotations (
    workspace_id, client_id, project_id, quotation_number, internal_id, status, currency,
    issue_date, expiry_date, title, summary, terms_and_conditions,
    notes, internal_notes, version, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_source.client_id, v_source.project_id, v_number, v_internal_id, 'draft', v_source.currency,
    CURRENT_DATE, v_source.expiry_date, v_source.title, v_source.summary, v_source.terms_and_conditions,
    v_source.notes, v_source.internal_notes, 1, p_actor_id,
    v_source.dpp_numerator, v_source.dpp_denominator, v_source.ppn_percent, v_source.pph_percent, v_source.retensi_percent, v_source.show_dpp)
  RETURNING id INTO v_new_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'quotation', v_new_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_quotation_totals(v_new_id);

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'quotation', v_new_id, 'quotation', p_quotation_id, 'duplicated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated quotation ' || v_source.quotation_number || ' to create ' || v_number,
    'quotation', p_quotation_id, 'quotation', v_new_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'duplicated',
    'duplicated from quotation ' || v_source.quotation_number,
    'quotation', v_new_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'quotation', v_new_id);

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = v_new_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_document(p_workspace_id uuid, p_actor_id uuid, p_from_type text, p_from_id uuid, p_to_type text, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rule public.document_generation_rules%ROWTYPE;
  v_from_type public.document_type_registry%ROWTYPE;
  v_to_type public.document_type_registry%ROWTYPE;
  v_source JSONB;
  v_input JSONB := '{}'::jsonb;
  v_key TEXT; v_src_col TEXT;
  v_new_id UUID;
  v_result JSONB;
  v_create_fn TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_from_type FROM public.document_type_registry WHERE key = p_from_type AND is_active;
  SELECT * INTO v_to_type FROM public.document_type_registry WHERE key = p_to_type AND is_active;
  IF v_from_type.key IS NULL OR v_to_type.key IS NULL THEN
    RAISE EXCEPTION 'Unknown document type';
  END IF;

  SELECT * INTO v_rule FROM public.document_generation_rules WHERE from_type = p_from_type AND to_type = p_to_type AND is_active;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'No generation rule from % to %', p_from_type, p_to_type;
  END IF;

  -- Scoped to the caller's own workspace and to live rows. Without both
  -- predicates this reads any row in the table by id -- and from_type /
  -- from_id come straight from the browser, so another workspace's title,
  -- notes and every line item could be copied across.
  EXECUTE format(
    'SELECT to_jsonb(t.*) FROM public.%I t
      WHERE t.id = $1 AND t.workspace_id = $2 AND t.deleted_at IS NULL',
    v_from_type.table_name)
    INTO v_source USING p_from_id, p_workspace_id;
  IF v_source IS NULL THEN RAISE EXCEPTION 'Source document not found'; END IF;

  FOR v_key, v_src_col IN SELECT * FROM jsonb_each_text(v_rule.field_mapping)
  LOOP
    v_input := v_input || jsonb_build_object(v_key, (v_source->>v_src_col));
  END LOOP;
  v_input := v_input || p_overrides;

  IF v_rule.copy_line_items AND v_from_type.items_entity_type IS NOT NULL AND v_to_type.items_entity_type IS NOT NULL THEN
    v_input := v_input || jsonb_build_object('line_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category', li.category, 'description', li.description, 'quantity', li.quantity,
        'unit_price', li.unit_price, 'unit', li.unit, 'discount_percent', li.discount_percent,
        'tax_percent', li.tax_percent, 'catalog_item_id', li.catalog_item_id,
        'source_line_item_id', li.id
      ) ORDER BY li.sort_order), '[]'::jsonb)
      FROM public.line_items li WHERE li.entity_type = v_from_type.items_entity_type AND li.entity_id = p_from_id
    ));
  END IF;

  v_create_fn := 'create_' || p_to_type;
  EXECUTE format('SELECT public.%I($1, $2, $3)', v_create_fn)
    INTO v_result USING p_workspace_id, p_actor_id, v_input;

  v_new_id := (v_result->>'id')::UUID;

  -- Carry the tax configuration across. create_* takes no tax settings,
  -- so without this the new document is born on the column defaults --
  -- which since 00088 means ppn_percent NULL, i.e. no PPN at all.
  -- Guarded on the source actually carrying tax: a Delivery Order has no
  -- money on it and its table has no such columns.
  IF v_source ? 'ppn_percent' AND v_to_type.items_entity_type IS NOT NULL THEN
    BEGIN
      EXECUTE format(
        'UPDATE public.%I
            SET dpp_numerator   = COALESCE($1, dpp_numerator),
                dpp_denominator = COALESCE($2, dpp_denominator),
                ppn_percent     = $3,
                pph_percent     = $4,
                retensi_percent = $5,
                show_dpp        = COALESCE($6, show_dpp),
                updated_at      = now()
          WHERE id = $7 AND workspace_id = $8', v_to_type.table_name)
        USING (v_source->>'dpp_numerator')::INTEGER,
              (v_source->>'dpp_denominator')::INTEGER,
              (v_source->>'ppn_percent')::NUMERIC,
              (v_source->>'pph_percent')::NUMERIC,
              (v_source->>'retensi_percent')::NUMERIC,
              (v_source->>'show_dpp')::BOOLEAN,
              v_new_id, p_workspace_id;

      EXECUTE format('SELECT public.recompute_%s_totals($1)',
                     CASE p_to_type WHEN 'proforma_invoice' THEN 'proforma_invoice'
                                    ELSE p_to_type END)
        USING v_new_id;
    EXCEPTION WHEN undefined_column OR undefined_function THEN
      -- Target type carries no tax columns; nothing to copy.
      NULL;
    END;
  END IF;

  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, p_to_type, v_new_id, p_from_type, p_from_id, 'generated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id, secondary_entity_type, secondary_entity_id)
  VALUES (p_workspace_id, p_actor_id, 'create', 'Generated ' || v_to_type.label || ' from ' || v_from_type.label, p_to_type, v_new_id, p_from_type, p_from_id);

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invoice_from_quotation(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid, p_invoice_date date, p_due_date date, p_copy_notes boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_quotation public.quotations%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_internal_id TEXT;
  v_due_date DATE;
  v_project_code TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to generate an invoice';
  END IF;

  SELECT * INTO v_quotation FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_quotation.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_quotation.status != 'approved' THEN
    RAISE EXCEPTION 'Only approved quotations can generate an invoice';
  END IF;

  IF v_quotation.generated_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'An invoice has already been generated for this quotation';
  END IF;

  -- Inherited from the source quotation (required there since 00078).
  -- Quotations created before 00078 may still carry NULL — surface that
  -- as a clear, actionable message instead of silently producing a
  -- project-less invoice.
  IF v_quotation.project_id IS NULL THEN
    RAISE EXCEPTION 'This quotation has no project. Assign a project to the quotation before generating an invoice.';
  END IF;

  SELECT code INTO v_project_code FROM public.projects WHERE id = v_quotation.project_id;

  SELECT * INTO v_client FROM public.clients WHERE id = v_quotation.client_id;

  v_invoice_number := public.generate_document_number(
    p_workspace_id, 'invoice', p_invoice_date, v_project_code, v_quotation.project_id, 'INV'
  );
  v_internal_id := public.next_internal_id(p_workspace_id, 'invoice_internal', EXTRACT(YEAR FROM p_invoice_date)::INTEGER);
  v_due_date := COALESCE(p_due_date, p_invoice_date + (COALESCE(v_client.payment_terms, 30) || ' days')::INTERVAL);

  INSERT INTO public.invoices (
    workspace_id, client_id, project_id, invoice_number, internal_id, source_quotation_id, status,
    currency, issue_date, due_date, title, summary, notes, created_by,
    dpp_numerator, dpp_denominator, ppn_percent, pph_percent, retensi_percent, show_dpp)
  VALUES (
    p_workspace_id, v_quotation.client_id, v_quotation.project_id, v_invoice_number, v_internal_id, p_quotation_id, 'draft',
    v_quotation.currency, p_invoice_date, v_due_date, v_quotation.title, v_quotation.summary,
    CASE WHEN p_copy_notes THEN v_quotation.notes ELSE NULL END, p_actor_id,
    v_quotation.dpp_numerator, v_quotation.dpp_denominator, v_quotation.ppn_percent, v_quotation.pph_percent, v_quotation.retensi_percent, v_quotation.show_dpp)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT workspace_id, 'invoice', v_invoice_id, category, sort_order,
         description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  FROM public.line_items
  WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  PERFORM public.recompute_invoice_totals(v_invoice_id);

  UPDATE public.quotations SET generated_invoice_id = v_invoice_id, updated_at = now() WHERE id = p_quotation_id;

  -- Also record the edge in the generic traceability graph so this path
  -- shows up in get_document_relationships() alongside documents made
  -- through generate_document(), instead of only via the legacy
  -- source_quotation_id FK.
  INSERT INTO public.document_relationships (workspace_id, from_type, from_id, to_type, to_id, relationship, created_by)
  VALUES (p_workspace_id, 'invoice', v_invoice_id, 'quotation', p_quotation_id, 'generated_from', p_actor_id)
  ON CONFLICT DO NOTHING;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'invoice_generated',
    'generated invoice ' || v_invoice_number || ' from quotation ' || v_quotation.quotation_number,
    'quotation', p_quotation_id, 'invoice', v_invoice_id
  );
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'created',
    'invoice ' || v_invoice_number || ' generated from quotation ' || v_quotation.quotation_number,
    'invoice', v_invoice_id, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id,
    jsonb_build_object('generated_invoice_id', jsonb_build_object('old', NULL, 'new', v_invoice_id))
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'create', 'invoice', v_invoice_id);

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = v_invoice_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_fulfillment_project_for_invoice(p_workspace_id uuid, p_invoice_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_project_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_revenue_by_catalog_item(p_workspace_id uuid, p_currency text, p_from_date date, p_to_date date)
 RETURNS TABLE(catalog_item_id uuid, catalog_item_name text, quantity numeric, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to view reports';
  END IF;

  RETURN QUERY
  SELECT
    ci.id AS catalog_item_id,
    ci.name AS catalog_item_name,
    SUM(li.quantity) AS quantity,
    SUM(li.line_total) AS total
  FROM public.line_items li
  JOIN public.invoices i ON i.id = li.entity_id AND li.entity_type = 'invoice'
  JOIN public.catalog_items ci ON ci.id = li.catalog_item_id
  WHERE li.workspace_id = p_workspace_id
    AND li.catalog_item_id IS NOT NULL
    AND i.currency = p_currency
    AND i.deleted_at IS NULL
    AND i.status IN ('sent', 'viewed', 'partial', 'paid', 'overdue')
    AND i.issue_date BETWEEN p_from_date AND p_to_date
  GROUP BY ci.id, ci.name
  ORDER BY total DESC
  LIMIT 10;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_next_scheduled_deliverables_posted(p_fulfillment_item_id uuid, p_workspace_id uuid, p_actor_id uuid, p_count integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deliverable RECORD;
  v_marked INTEGER := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_count IS NULL OR p_count < 1 THEN
    RETURN 0;
  END IF;

  FOR v_deliverable IN
    SELECT id, title, project_id
    FROM public.fulfillment_deliverables
    WHERE fulfillment_item_id = p_fulfillment_item_id
      AND workspace_id = p_workspace_id
      AND status IN ('scheduled', 'in_progress')
      AND deleted_at IS NULL
    ORDER BY scheduled_date ASC NULLS LAST
    LIMIT p_count
  LOOP
    UPDATE public.fulfillment_deliverables
    SET status = 'posted', posted_at = now(), updated_at = now()
    WHERE id = v_deliverable.id;

    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'changed deliverable "' || v_deliverable.title || '" status to posted (from a manual delivery record)',
      'fulfillment_deliverable', v_deliverable.id, 'fulfillment_project', v_deliverable.project_id
    );
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', v_deliverable.id,
      jsonb_build_object('status', jsonb_build_object('old', 'scheduled', 'new', 'posted'))
    );

    v_marked := v_marked + 1;
  END LOOP;

  RETURN v_marked;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_next_scheduled_deliverables_posted(p_fulfillment_item_id uuid, p_workspace_id uuid, p_actor_id uuid, p_count integer, p_exclude_deliverable_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deliverable RECORD;
  v_marked INTEGER := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_count IS NULL OR p_count < 1 THEN
    RETURN 0;
  END IF;

  FOR v_deliverable IN
    SELECT id, title, project_id
    FROM public.fulfillment_deliverables
    WHERE fulfillment_item_id = p_fulfillment_item_id
      AND status = 'scheduled'
      AND deleted_at IS NULL
      AND (p_exclude_deliverable_id IS NULL OR id != p_exclude_deliverable_id)
      -- Scoped to the workspace as well as the item: the item id alone
      -- was the only thing deciding which rows this touched.
      AND workspace_id = p_workspace_id
    ORDER BY scheduled_date ASC
    LIMIT p_count
  LOOP
    UPDATE public.fulfillment_deliverables
    SET status = 'posted', posted_at = now(), updated_at = now()
    WHERE id = v_deliverable.id;

    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'status_change',
      'changed deliverable "' || v_deliverable.title || '" status to posted',
      'fulfillment_deliverable', v_deliverable.id, 'fulfillment_project', v_deliverable.project_id
    );
    PERFORM public.log_audit_entry(
      p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', v_deliverable.id,
      jsonb_build_object('status', jsonb_build_object('old', 'scheduled', 'new', 'posted'))
    );

    v_marked := v_marked + 1;
  END LOOP;

  RETURN v_marked;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_fulfillment_event(p_fulfillment_item_id uuid, p_workspace_id uuid, p_actor_id uuid, p_quantity_delivered numeric, p_event_date date, p_notes text, p_source_deliverable_id uuid DEFAULT NULL::uuid)
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
  v_idempotency_key TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to record a fulfillment event';
  END IF;

  IF p_quantity_delivered <= 0 THEN
    RAISE EXCEPTION 'Quantity delivered must be greater than 0';
  END IF;

  IF p_quantity_delivered != TRUNC(p_quantity_delivered) THEN
    RAISE EXCEPTION 'Quantity delivered must be a whole number';
  END IF;

  v_idempotency_key := CASE
    WHEN p_source_deliverable_id IS NOT NULL THEN 'deliverable:' || p_source_deliverable_id
    ELSE NULL
  END;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_event FROM public.fulfillment_events
    WHERE idempotency_key = v_idempotency_key AND deleted_at IS NULL;

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
    NULLIF(p_notes, ''), v_idempotency_key, p_actor_id
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

  -- Reconciliation: runs on every call, not just unkeyed ones. When this
  -- call is itself triggered by one specific deliverable being posted, that
  -- deliverable's own status was already flipped by its caller BEFORE this
  -- function ran — meaning it's no longer in the 'scheduled' candidate set
  -- and reconciliation would otherwise spill the same unit onto the NEXT
  -- scheduled deliverable instead of recognizing it's already accounted
  -- for. Subtracting 1 for a deliverable-triggered call (always quantity 1
  -- at today's only call site) makes the reconciliation quantity net to
  -- zero for that path — one pipeline, one quantity adjustment, not a
  -- separate on/off branch.
  PERFORM public.mark_next_scheduled_deliverables_posted(
    p_fulfillment_item_id, p_workspace_id, p_actor_id,
    p_quantity_delivered::int - (CASE WHEN p_source_deliverable_id IS NOT NULL THEN 1 ELSE 0 END),
    p_source_deliverable_id
  );

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
$function$
;

CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_workspace_id uuid, p_actor_id uuid, p_amount numeric, p_currency text, p_payment_method text, p_payment_date date, p_reference text, p_notes text, p_bank_name text, p_receiver_account_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment_id UUID;
  v_payment_number TEXT;
  v_ordinal INTEGER;
  v_amount_paid NUMERIC(15,2);
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
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

  -- A cancelled or refunded invoice is a closed record, and a draft has
  -- never been issued to anyone -- money cannot arrive against either.
  -- Without this, paying a cancelled invoice silently drove it to 'paid'
  -- and put it back into revenue.
  IF v_invoice.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION
      'Invoice % is % and cannot take a payment.', v_invoice.invoice_number, v_invoice.status;
  END IF;

  IF v_invoice.status = 'draft' THEN
    RAISE EXCEPTION
      'Invoice % is still a draft. Send it before recording a payment.', v_invoice.invoice_number;
  END IF;

  -- Overpayment: amount_due is GENERATED as total - amount_paid with no
  -- CHECK, so an accidental second full payment silently drove it
  -- negative and understated every outstanding-balance report.
  IF p_amount > (v_invoice.total - COALESCE(v_invoice.amount_paid, 0)) THEN
    RAISE EXCEPTION
      'Payment of % exceeds the % still outstanding on invoice %. Record the exact amount, or raise a credit note.',
      p_amount,
      (v_invoice.total - COALESCE(v_invoice.amount_paid, 0)),
      v_invoice.invoice_number;
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
$function$
;

CREATE OR REPLACE FUNCTION public.regenerate_invoice_share_token(p_invoice_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.invoices%ROWTYPE;
  v_new_token UUID := gen_random_uuid();
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to regenerate this invoice''s share link';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  UPDATE public.invoices
  SET share_token = v_new_token, updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'regenerated the portal link for invoice ' || v_old.invoice_number, 'invoice', p_invoice_id
  );
  -- Do not persist actual token values in the audit trail, even though
  -- audit_logs is admin-only — just record that a rotation happened.
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id,
    jsonb_build_object('share_token_regenerated', jsonb_build_object('old', true, 'new', true))
  );

  RETURN jsonb_build_object('id', p_invoice_id, 'share_token', v_new_token);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.regenerate_quotation_share_token(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.quotations%ROWTYPE;
  v_new_token UUID := gen_random_uuid();
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to regenerate this quotation''s share link';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  UPDATE public.quotations
  SET share_token = v_new_token, updated_at = now()
  WHERE id = p_quotation_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'regenerated the portal link for quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  -- Do not persist actual token values in the audit trail, even though
  -- audit_logs is admin-only — just record that a rotation happened.
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id,
    jsonb_build_object('share_token_regenerated', jsonb_build_object('old', true, 'new', true))
  );

  RETURN jsonb_build_object('id', p_quotation_id, 'share_token', v_new_token);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reschedule_fulfillment_deliverable(p_deliverable_id uuid, p_workspace_id uuid, p_actor_id uuid, p_scheduled_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.fulfillment_deliverables%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to reschedule this deliverable';
  END IF;

  IF p_scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Scheduled date is required';
  END IF;

  SELECT * INTO v_old FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  UPDATE public.fulfillment_deliverables
  SET scheduled_date = p_scheduled_date, updated_at = now()
  WHERE id = p_deliverable_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'rescheduled deliverable "' || v_old.title || '"', 'fulfillment_deliverable', p_deliverable_id,
    'fulfillment_project', v_old.project_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', p_deliverable_id,
    jsonb_build_object('scheduled_date', jsonb_build_object('old', v_old.scheduled_date, 'new', p_scheduled_date))
  );

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = p_deliverable_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_workspace_invite(p_invite_id uuid, p_workspace_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invite public.workspace_invites%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to revoke invites';
  END IF;

  SELECT * INTO v_invite FROM public.workspace_invites
  WHERE id = p_invite_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status != 'pending' THEN
    RAISE EXCEPTION 'Only pending invites can be revoked';
  END IF;

  UPDATE public.workspace_invites SET status = 'revoked' WHERE id = p_invite_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'revoked',
    'revoked the invite for ' || v_invite.email, 'workspace_invite', p_invite_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace_invite', p_invite_id,
    jsonb_build_object('status', jsonb_build_object('old', 'pending', 'new', 'revoked'))
  );

  RETURN jsonb_build_object('success', true, 'id', p_invite_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_document_signature_visibility(p_workspace_id uuid, p_actor_id uuid, p_document_type text, p_document_id uuid, p_show boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_table  TEXT;
  v_result JSONB;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table := CASE p_document_type
    WHEN 'quotation'         THEN 'quotations'
    WHEN 'invoice'           THEN 'invoices'
    WHEN 'proforma_invoice'  THEN 'proforma_invoices'
    WHEN 'purchase_order'    THEN 'purchase_orders'
    WHEN 'delivery_order'    THEN 'delivery_orders'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown document type %', p_document_type;
  END IF;

  IF p_show IS NULL THEN
    RAISE EXCEPTION 'show_signature cannot be null';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET show_signature = $1, updated_at = now()
      WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL',
    v_table) USING p_show, p_document_id, p_workspace_id;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', v_table)
    INTO v_result USING p_document_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  INSERT INTO public.activities (
    workspace_id, actor_id, action, description, entity_type, entity_id
  )
  VALUES (
    p_workspace_id, p_actor_id, 'update',
    CASE WHEN p_show THEN 'Signature shown on document'
         ELSE 'Signature hidden on document' END,
    p_document_type, p_document_id
  );

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_document_tax_settings(p_workspace_id uuid, p_actor_id uuid, p_document_type text, p_document_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_table TEXT;
  v_result JSONB;
  v_amount_paid NUMERIC;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table := CASE p_document_type
    WHEN 'invoice' THEN 'invoices'
    WHEN 'proforma_invoice' THEN 'proforma_invoices'
    WHEN 'quotation' THEN 'quotations'
    WHEN 'purchase_order' THEN 'purchase_orders'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Tax settings do not apply to %', p_document_type;
  END IF;

  -- Same rule as update_invoice (00087): money having moved against the
  -- document is what freezes its figures.
  IF p_document_type = 'invoice' THEN
    SELECT COALESCE(amount_paid, 0) INTO v_amount_paid
    FROM public.invoices WHERE id = p_document_id AND workspace_id = p_workspace_id;
    IF COALESCE(v_amount_paid, 0) > 0 THEN
      RAISE EXCEPTION
        'This invoice has payments recorded against it; its tax settings cannot be changed.';
    END IF;
  END IF;

  IF COALESCE((p_input->>'dpp_denominator')::INTEGER, 12) <= 0 THEN
    RAISE EXCEPTION 'DPP denominator must be greater than 0';
  END IF;

  EXECUTE format($f$
    UPDATE public.%I SET
      dpp_numerator   = COALESCE(($2->>'dpp_numerator')::INTEGER, dpp_numerator),
      dpp_denominator = COALESCE(($2->>'dpp_denominator')::INTEGER, dpp_denominator),
      ppn_percent     = CASE WHEN $2 ? 'ppn_percent'     THEN ($2->>'ppn_percent')::NUMERIC     ELSE ppn_percent END,
      pph_percent     = CASE WHEN $2 ? 'pph_percent'     THEN ($2->>'pph_percent')::NUMERIC     ELSE pph_percent END,
      retensi_percent = CASE WHEN $2 ? 'retensi_percent' THEN ($2->>'retensi_percent')::NUMERIC ELSE retensi_percent END,
      show_dpp        = COALESCE(($2->>'show_dpp')::BOOLEAN, show_dpp),
      updated_at = now()
    WHERE id = $1 AND workspace_id = $3 AND deleted_at IS NULL
  $f$, v_table) USING p_document_id, p_input, p_workspace_id;

  CASE p_document_type
    WHEN 'invoice' THEN PERFORM public.recompute_invoice_totals(p_document_id);
    WHEN 'proforma_invoice' THEN PERFORM public.recompute_proforma_invoice_totals(p_document_id);
    WHEN 'quotation' THEN PERFORM public.recompute_quotation_totals(p_document_id);
    WHEN 'purchase_order' THEN PERFORM public.recompute_purchase_order_totals(p_document_id);
  END CASE;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', v_table)
    INTO v_result USING p_document_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated tax settings', p_document_type, p_document_id);

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_invoice_references(p_workspace_id uuid, p_actor_id uuid, p_invoice_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- No payment guard here, unlike update_invoice: a Faktur Pajak serial
  -- routinely arrives after the invoice has been paid, and refusing to
  -- record it then would make the register permanently incomplete.
  -- Neither column feeds a total, so there is nothing to recompute.
  UPDATE public.invoices SET
    customer_po_number = CASE WHEN p_input ? 'customer_po_number'
                              THEN NULLIF(TRIM(p_input->>'customer_po_number'), '')
                              ELSE customer_po_number END,
    tax_invoice_number = CASE WHEN p_input ? 'tax_invoice_number'
                              THEN NULLIF(TRIM(p_input->>'tax_invoice_number'), '')
                              ELSE tax_invoice_number END,
    updated_at = now()
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  SELECT to_jsonb(t.*) INTO v_result
  FROM public.invoices t WHERE t.id = p_invoice_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated invoice references', 'invoice', p_invoice_id);

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_module_permission(p_workspace_id uuid, p_actor_id uuid, p_role text, p_module text, p_can_view boolean, p_can_write boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_row public.role_module_permissions%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO public.role_module_permissions (workspace_id, role, module, can_view, can_write)
  VALUES (p_workspace_id, p_role, p_module, p_can_view, p_can_write)
  ON CONFLICT (workspace_id, role, module)
  DO UPDATE SET can_view = p_can_view, can_write = p_can_write, updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', format('Set %s permission for %s: view=%s write=%s', p_module, p_role, p_can_view, p_can_write), 'role_module_permission', v_row.id);

  RETURN to_jsonb(v_row);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_workspace_logo(p_workspace_id uuid, p_actor_id uuid, p_logo_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_workspace public.workspaces%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE public.workspaces
  SET logo_url = NULLIF(p_logo_url, ''), updated_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO v_workspace;

  IF v_workspace.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
    CASE WHEN NULLIF(p_logo_url, '') IS NULL THEN 'Removed company logo' ELSE 'Updated company logo' END,
    'workspace', p_workspace_id);

  RETURN to_jsonb(v_workspace);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_document_template(p_workspace_id uuid, p_actor_id uuid, p_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tpl public.document_templates%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete a design';
  END IF;

  SELECT * INTO v_tpl
  FROM public.document_templates
  WHERE id = p_template_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Design not found';
  END IF;

  IF v_tpl.is_default THEN
    RAISE EXCEPTION 'Cannot delete the default design. Set another design as default first.';
  END IF;

  UPDATE public.document_templates
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_template_id AND workspace_id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'deleted',
    'deleted document design "' || v_tpl.name || '"', 'document_template', p_template_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'delete', 'document_template', p_template_id, NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_template_theme(p_workspace_id uuid, p_actor_id uuid, p_theme_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_theme public.template_themes%ROWTYPE;
  v_in_use INTEGER;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete a theme';
  END IF;

  SELECT * INTO v_theme
  FROM public.template_themes
  WHERE id = p_theme_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_theme.id IS NULL THEN
    RAISE EXCEPTION 'Theme not found';
  END IF;

  IF v_theme.is_preset THEN
    RAISE EXCEPTION 'Built-in themes can''t be deleted.';
  END IF;

  SELECT count(*) INTO v_in_use
  FROM public.document_templates
  WHERE theme_id = p_theme_id AND deleted_at IS NULL;

  IF v_in_use > 0 THEN
    RAISE EXCEPTION 'This theme is used by one or more designs. Remove it from those designs first.';
  END IF;

  UPDATE public.template_themes
  SET deleted_at = now()
  WHERE id = p_theme_id AND workspace_id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'deleted',
    'deleted theme "' || v_theme.name || '"', 'template_theme', p_theme_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'delete', 'template_theme', p_theme_id, NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_fulfillment_items(p_workspace_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row RECORD;
  v_pkg_item RECORD;
  v_backfill_row RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
  v_project_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_client(p_client_id uuid, p_workspace_id uuid, p_actor_id uuid, p_name text, p_email text, p_phone text, p_company text, p_website text, p_billing_email text, p_tax_id text, p_payment_terms integer, p_preferred_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.clients%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this client';
  END IF;

  SELECT * INTO v_old FROM public.clients
  WHERE id = p_client_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF v_old.name IS DISTINCT FROM p_name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', v_old.name, 'new', p_name));
  END IF;
  IF v_old.email IS DISTINCT FROM NULLIF(p_email, '') THEN
    v_changes := v_changes || jsonb_build_object('email', jsonb_build_object('old', v_old.email, 'new', NULLIF(p_email, '')));
  END IF;
  IF v_old.phone IS DISTINCT FROM NULLIF(p_phone, '') THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_object('old', v_old.phone, 'new', NULLIF(p_phone, '')));
  END IF;
  IF v_old.company IS DISTINCT FROM NULLIF(p_company, '') THEN
    v_changes := v_changes || jsonb_build_object('company', jsonb_build_object('old', v_old.company, 'new', NULLIF(p_company, '')));
  END IF;
  IF v_old.website IS DISTINCT FROM NULLIF(p_website, '') THEN
    v_changes := v_changes || jsonb_build_object('website', jsonb_build_object('old', v_old.website, 'new', NULLIF(p_website, '')));
  END IF;
  IF v_old.billing_email IS DISTINCT FROM NULLIF(p_billing_email, '') THEN
    v_changes := v_changes || jsonb_build_object('billing_email', jsonb_build_object('old', v_old.billing_email, 'new', NULLIF(p_billing_email, '')));
  END IF;
  IF v_old.tax_id IS DISTINCT FROM NULLIF(p_tax_id, '') THEN
    v_changes := v_changes || jsonb_build_object('tax_id', jsonb_build_object('old', v_old.tax_id, 'new', NULLIF(p_tax_id, '')));
  END IF;
  IF v_old.payment_terms IS DISTINCT FROM COALESCE(p_payment_terms, v_old.payment_terms) THEN
    v_changes := v_changes || jsonb_build_object('payment_terms', jsonb_build_object('old', v_old.payment_terms, 'new', COALESCE(p_payment_terms, v_old.payment_terms)));
  END IF;
  IF v_old.preferred_currency IS DISTINCT FROM p_preferred_currency THEN
    v_changes := v_changes || jsonb_build_object('preferred_currency', jsonb_build_object('old', v_old.preferred_currency, 'new', p_preferred_currency));
  END IF;

  UPDATE public.clients
  SET
    name = p_name,
    email = NULLIF(p_email, ''),
    phone = NULLIF(p_phone, ''),
    company = NULLIF(p_company, ''),
    website = NULLIF(p_website, ''),
    billing_email = NULLIF(p_billing_email, ''),
    tax_id = NULLIF(p_tax_id, ''),
    payment_terms = COALESCE(p_payment_terms, v_old.payment_terms),
    preferred_currency = p_preferred_currency,
    updated_at = now()
  WHERE id = p_client_id;

  IF v_changes != '{}'::JSONB THEN
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'updated',
      'updated client "' || p_name || '"', 'client', p_client_id
    );
    PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'client', p_client_id, v_changes);
  END IF;

  RETURN (SELECT to_jsonb(c) FROM public.clients c WHERE c.id = p_client_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_company_profile(p_workspace_id uuid, p_actor_id uuid, p_company_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.workspaces%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update company profile';
  END IF;

  SELECT * INTO v_old FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  UPDATE public.workspaces
  SET settings = jsonb_set(settings, '{company_profile}', p_company_profile, true),
      updated_at = now()
  WHERE id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated company profile', 'workspace', p_workspace_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace', p_workspace_id,
    jsonb_build_object('company_profile', jsonb_build_object('old', v_old.settings->'company_profile', 'new', p_company_profile))
  );

  RETURN (SELECT to_jsonb(w) FROM public.workspaces w WHERE w.id = p_workspace_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_delivery_order(p_workspace_id uuid, p_actor_id uuid, p_do_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_do public.delivery_orders%ROWTYPE;
  v_result JSONB;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_do FROM public.delivery_orders
  WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_do.id IS NULL THEN
    RAISE EXCEPTION 'Delivery order not found';
  END IF;

  -- A cancelled DO is a closed record. A delivered one stays editable on
  -- purpose: correcting the address or the received-by name after the
  -- fact is ordinary bookkeeping, and neither field feeds the
  -- fulfillment sync (00081) — that keys off line items, which this
  -- function deliberately does not touch.
  IF v_do.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled delivery order cannot be edited';
  END IF;

  UPDATE public.delivery_orders SET
    delivery_date    = CASE WHEN p_input ? 'delivery_date'
                            THEN (p_input->>'delivery_date')::DATE
                            ELSE delivery_date END,
    -- An explicit null clears the override, which makes the document
    -- fall back to the client's own address when printed.
    delivery_address = CASE WHEN p_input ? 'delivery_address'
                            THEN p_input->'delivery_address'
                            ELSE delivery_address END,
    received_by      = CASE WHEN p_input ? 'received_by'
                            THEN p_input->>'received_by'
                            ELSE received_by END,
    notes            = CASE WHEN p_input ? 'notes'
                            THEN p_input->>'notes'
                            ELSE notes END,
    updated_at = now()
  WHERE id = p_do_id AND workspace_id = p_workspace_id;

  SELECT to_jsonb(t.*) INTO v_result
  FROM public.delivery_orders t WHERE t.id = p_do_id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
          'Updated delivery order ' || v_do.do_number, 'delivery_order', p_do_id);

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_delivery_order_status(p_workspace_id uuid, p_actor_id uuid, p_do_id uuid, p_status text, p_received_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_do       public.delivery_orders%ROWTYPE;
  v_previous TEXT;
  v_valid    TEXT[];
  v_synced   INTEGER := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_do FROM public.delivery_orders
   WHERE id = p_do_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_do.id IS NULL THEN RAISE EXCEPTION 'Delivery order not found'; END IF;

  v_previous := v_do.status;

  IF v_previous = p_status THEN
    RETURN to_jsonb(v_do);
  END IF;

  v_valid := CASE v_previous
    WHEN 'draft'      THEN ARRAY['prepared', 'cancelled']
    WHEN 'prepared'   THEN ARRAY['dispatched', 'cancelled']
    WHEN 'dispatched' THEN ARRAY['delivered', 'cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_status = ANY(v_valid)) THEN
    RAISE EXCEPTION 'Cannot transition delivery order from % to %', v_previous, p_status;
  END IF;

  UPDATE public.delivery_orders SET
    status = p_status,
    received_by = COALESCE(p_received_by, received_by),
    delivery_date = CASE WHEN p_status = 'delivered' THEN COALESCE(delivery_date, CURRENT_DATE) ELSE delivery_date END,
    updated_at = now()
  WHERE id = p_do_id
  RETURNING * INTO v_do;

  IF p_status = 'delivered' THEN
    v_synced := public.sync_fulfillment_from_delivery_order(p_do_id, p_workspace_id, p_actor_id);
  END IF;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
    'Delivery order ' || v_do.do_number || ' marked ' || p_status
      || CASE WHEN v_synced > 0 THEN ' (' || v_synced || ' fulfillment line(s) updated)' ELSE '' END,
    'delivery_order', v_do.id);

  RETURN to_jsonb(v_do);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_fulfillment_deliverable_status(p_deliverable_id uuid, p_workspace_id uuid, p_actor_id uuid, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deliverable public.fulfillment_deliverables%ROWTYPE;
BEGIN
  SELECT * INTO v_deliverable FROM public.fulfillment_deliverables
  WHERE id = p_deliverable_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_deliverable.id IS NULL THEN
    RAISE EXCEPTION 'Deliverable not found';
  END IF;

  IF p_new_status NOT IN ('scheduled', 'in_progress', 'posted', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status %', p_new_status;
  END IF;

  IF p_new_status = v_deliverable.status THEN
    RAISE EXCEPTION 'Deliverable is already %', p_new_status;
  END IF;

  IF v_deliverable.status IN ('posted', 'cancelled') THEN
    IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to reopen this deliverable';
    END IF;
  ELSE
    IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to change this deliverable''s status';
    END IF;
  END IF;

  UPDATE public.fulfillment_deliverables
  SET
    status = p_new_status,
    posted_at = CASE WHEN p_new_status = 'posted' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_deliverable_id;

  -- Forward cascade: posting a linked deliverable (from any prior status)
  -- records exactly one unit of delivery against its tracker. Passes the
  -- deliverable's own id as p_source_deliverable_id (UUID) — matching
  -- 00058's signature — instead of a hand-built 'deliverable:<id>' string.
  IF p_new_status = 'posted' AND v_deliverable.fulfillment_item_id IS NOT NULL THEN
    PERFORM public.record_fulfillment_event(
      v_deliverable.fulfillment_item_id, p_workspace_id, p_actor_id, 1, CURRENT_DATE,
      'Auto-recorded from deliverable "' || v_deliverable.title || '"',
      p_deliverable_id
    );
  END IF;

  -- Reverse cascade: leaving 'posted' for anything else soft-deletes the
  -- auto-recorded event so a later re-post creates a fresh one rather than
  -- double-counting. Deliberately does NOT touch fulfillment_items.status.
  IF v_deliverable.status = 'posted' AND p_new_status != 'posted' THEN
    UPDATE public.fulfillment_events
    SET deleted_at = now()
    WHERE idempotency_key = 'deliverable:' || p_deliverable_id AND deleted_at IS NULL;
  END IF;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    'changed deliverable "' || v_deliverable.title || '" status to ' || p_new_status,
    'fulfillment_deliverable', p_deliverable_id, 'fulfillment_project', v_deliverable.project_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'fulfillment_deliverable', p_deliverable_id,
    jsonb_build_object('status', jsonb_build_object('old', v_deliverable.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(fd) FROM public.fulfillment_deliverables fd WHERE fd.id = p_deliverable_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_fulfillment_project(p_project_id uuid, p_workspace_id uuid, p_actor_id uuid, p_start_date date, p_end_date date, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.fulfillment_projects%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_fulfillment_status(p_fulfillment_item_id uuid, p_workspace_id uuid, p_actor_id uuid, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
      RAISE EXCEPTION 'Insufficient permissions to reopen this fulfillment item';
    END IF;
  ELSE
    IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_due_date date, p_payment_terms text, p_notes text, p_line_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.invoices%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
  v_currency TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_old.status != 'draft' THEN
    RAISE EXCEPTION 'Invoice in status % cannot be edited', v_old.status;
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM v_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', v_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.due_date IS DISTINCT FROM p_due_date THEN
    v_changes := v_changes || jsonb_build_object('due_date', jsonb_build_object('old', v_old.due_date, 'new', p_due_date));
  END IF;

  UPDATE public.invoices
  SET client_id = p_client_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = v_currency,
      issue_date = p_issue_date,
      due_date = p_due_date,
      payment_terms = NULLIF(p_payment_terms, ''),
      notes = NULLIF(p_notes, ''),
      updated_at = now()
  WHERE id = p_invoice_id;

  DELETE FROM public.line_items WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'invoice', p_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_invoice_totals(p_invoice_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated invoice ' || v_old.invoice_number, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_due_date date, p_payment_terms text, p_notes text, p_line_items jsonb, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.invoices%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
  v_currency TEXT;
  v_project_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this invoice';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_old.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Invoice in status % cannot be edited', v_old.status;
  END IF;

  IF COALESCE(v_old.amount_paid, 0) > 0 THEN
    RAISE EXCEPTION
      'This invoice has payments recorded against it and cannot be edited. Void the payment first, or issue a credit note.';
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  -- See header: block outright on real delivery history rather than let
  -- the DELETE below crash on it.
  IF EXISTS (
    SELECT 1
    FROM public.fulfillment_items fi
    JOIN public.line_items li ON li.id = fi.line_item_id
    WHERE li.entity_type = 'invoice' AND li.entity_id = p_invoice_id
      AND EXISTS (
        SELECT 1 FROM public.fulfillment_events fe
        WHERE fe.fulfillment_item_id = fi.id
      )
  ) THEN
    RAISE EXCEPTION
      'This invoice has delivery history recorded against it and cannot have its items changed. Void the delivery record first, or issue the revision as a new invoice.';
  END IF;

  v_project_id := COALESCE(p_project_id, v_old.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM v_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', v_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.due_date IS DISTINCT FROM p_due_date THEN
    v_changes := v_changes || jsonb_build_object('due_date', jsonb_build_object('old', v_old.due_date, 'new', p_due_date));
  END IF;

  UPDATE public.invoices
  SET client_id = p_client_id,
      project_id = v_project_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = v_currency,
      issue_date = p_issue_date,
      due_date = p_due_date,
      payment_terms = NULLIF(p_payment_terms, ''),
      notes = NULLIF(p_notes, ''),
      updated_at = now()
  WHERE id = p_invoice_id;

  -- Clear the way for the line-item replacement below: an empty
  -- auto-synced tracker holds nothing worth preserving (no event ever
  -- reached it -- guaranteed by the guard above), so it is discarded
  -- rather than left to RESTRICT the delete. sync_fulfillment_items
  -- recreates it, identically, next time the invoice is viewed.
  DELETE FROM public.fulfillment_items fi
  USING public.line_items li
  WHERE li.id = fi.line_item_id
    AND li.entity_type = 'invoice' AND li.entity_id = p_invoice_id;

  DELETE FROM public.line_items WHERE entity_type = 'invoice' AND entity_id = p_invoice_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'invoice', p_invoice_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_invoice_totals(p_invoice_id);

  -- Revising an issued invoice is a materially different event from
  -- tweaking a draft, and the client is holding the earlier version — so
  -- it gets its own activity wording rather than a generic "updated".
  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    CASE
      WHEN v_old.status = 'draft'
        THEN 'updated invoice ' || v_old.invoice_number
      ELSE 'revised issued invoice ' || v_old.invoice_number
           || ' (status ' || v_old.status || ')'
    END,
    'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice_status(p_invoice_id uuid, p_workspace_id uuid, p_actor_id uuid, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.invoices%ROWTYPE;
  v_valid_next TEXT[];
  v_action_label TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to change this invoice''s status';
  END IF;

  SELECT * INTO v_old FROM public.invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_valid_next := CASE v_old.status
    WHEN 'draft' THEN ARRAY['sent', 'cancelled']
    WHEN 'sent' THEN ARRAY['viewed', 'cancelled']
    WHEN 'viewed' THEN ARRAY['cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Cannot transition invoice from % to %', v_old.status, p_new_status;
  END IF;

  v_action_label := CASE p_new_status
    WHEN 'sent' THEN 'sent'
    WHEN 'viewed' THEN 'marked viewed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE p_new_status
  END;

  UPDATE public.invoices
  SET status = p_new_status, updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    v_action_label || ' invoice ' || v_old.invoice_number, 'invoice', p_invoice_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'invoice', p_invoice_id,
    jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(i) FROM public.invoices i WHERE i.id = p_invoice_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_lead(p_lead_id uuid, p_workspace_id uuid, p_actor_id uuid, p_name text, p_email text, p_phone text, p_company text, p_source text, p_status text, p_conversion_probability numeric, p_expected_value numeric, p_notes_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.leads%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this lead';
  END IF;

  SELECT * INTO v_old FROM public.leads
  WHERE id = p_lead_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF v_old.name IS DISTINCT FROM p_name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', v_old.name, 'new', p_name));
  END IF;
  IF v_old.email IS DISTINCT FROM NULLIF(p_email, '') THEN
    v_changes := v_changes || jsonb_build_object('email', jsonb_build_object('old', v_old.email, 'new', NULLIF(p_email, '')));
  END IF;
  IF v_old.phone IS DISTINCT FROM NULLIF(p_phone, '') THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_object('old', v_old.phone, 'new', NULLIF(p_phone, '')));
  END IF;
  IF v_old.company IS DISTINCT FROM NULLIF(p_company, '') THEN
    v_changes := v_changes || jsonb_build_object('company', jsonb_build_object('old', v_old.company, 'new', NULLIF(p_company, '')));
  END IF;
  IF v_old.source IS DISTINCT FROM NULLIF(p_source, '') THEN
    v_changes := v_changes || jsonb_build_object('source', jsonb_build_object('old', v_old.source, 'new', NULLIF(p_source, '')));
  END IF;
  IF v_old.status IS DISTINCT FROM COALESCE(p_status, v_old.status) THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', COALESCE(p_status, v_old.status)));
  END IF;
  IF v_old.conversion_probability IS DISTINCT FROM p_conversion_probability THEN
    v_changes := v_changes || jsonb_build_object('conversion_probability', jsonb_build_object('old', v_old.conversion_probability, 'new', p_conversion_probability));
  END IF;
  IF v_old.expected_value IS DISTINCT FROM p_expected_value THEN
    v_changes := v_changes || jsonb_build_object('expected_value', jsonb_build_object('old', v_old.expected_value, 'new', p_expected_value));
  END IF;
  IF v_old.notes_text IS DISTINCT FROM NULLIF(p_notes_text, '') THEN
    v_changes := v_changes || jsonb_build_object('notes_text', jsonb_build_object('old', v_old.notes_text, 'new', NULLIF(p_notes_text, '')));
  END IF;

  UPDATE public.leads
  SET
    name = p_name,
    email = NULLIF(p_email, ''),
    phone = NULLIF(p_phone, ''),
    company = NULLIF(p_company, ''),
    source = NULLIF(p_source, ''),
    status = COALESCE(p_status, v_old.status),
    conversion_probability = p_conversion_probability,
    expected_value = p_expected_value,
    notes_text = NULLIF(p_notes_text, ''),
    updated_at = now()
  WHERE id = p_lead_id;

  IF v_changes != '{}'::JSONB THEN
    PERFORM public.log_activity(
      p_workspace_id, p_actor_id, 'user', 'updated',
      'updated lead "' || p_name || '"', 'lead', p_lead_id
    );
    PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'lead', p_lead_id, v_changes);
  END IF;

  RETURN (SELECT to_jsonb(l) FROM public.leads l WHERE l.id = p_lead_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_proforma_invoice(p_workspace_id uuid, p_actor_id uuid, p_pi_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_pi public.proforma_invoices%ROWTYPE; v_item JSONB; v_sort INT := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO v_pi FROM public.proforma_invoices WHERE id = p_pi_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_pi.id IS NULL THEN RAISE EXCEPTION 'Proforma invoice not found'; END IF;
  IF v_pi.status IN ('cancelled', 'expired', 'converted') THEN
    RAISE EXCEPTION 'Proforma invoice in status % cannot be edited', v_pi.status;
  END IF;

  UPDATE public.proforma_invoices SET
    client_id = COALESCE((p_input->>'client_id')::UUID, client_id),
    project_id = COALESCE((p_input->>'project_id')::UUID, project_id),
    currency = COALESCE(p_input->>'currency', currency),
    issue_date = COALESCE((p_input->>'issue_date')::DATE, issue_date),
    expiry_date = COALESCE((p_input->>'expiry_date')::DATE, expiry_date),
    title = COALESCE(p_input->>'title', title),
    notes = COALESCE(p_input->>'notes', notes),
    terms_and_conditions = COALESCE(p_input->>'terms_and_conditions', terms_and_conditions),
    updated_at = now()
  WHERE id = p_pi_id;

  IF p_input ? 'line_items' THEN
    DELETE FROM public.line_items WHERE entity_type = 'proforma_invoice' AND entity_id = p_pi_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'line_items')
    LOOP
      INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
      VALUES (p_workspace_id, 'proforma_invoice', p_pi_id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
        v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
        COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
        (v_item->>'catalog_item_id')::UUID);
      v_sort := v_sort + 1;
    END LOOP;
    PERFORM public.recompute_proforma_invoice_totals(p_pi_id);
  END IF;

  SELECT * INTO v_pi FROM public.proforma_invoices WHERE id = p_pi_id;
  RETURN to_jsonb(v_pi);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_proforma_invoice_status(p_workspace_id uuid, p_actor_id uuid, p_pi_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pi    public.proforma_invoices%ROWTYPE;
  v_valid TEXT[];
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_pi FROM public.proforma_invoices
   WHERE id = p_pi_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_pi.id IS NULL THEN RAISE EXCEPTION 'Proforma invoice not found'; END IF;

  IF v_pi.status = p_status THEN
    RETURN to_jsonb(v_pi);
  END IF;

  -- 'converted' is set by the generation path below, not by hand, and is
  -- terminal along with cancelled/expired.
  v_valid := CASE v_pi.status
    WHEN 'draft'    THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'     THEN ARRAY['viewed', 'accepted', 'cancelled', 'expired']
    WHEN 'viewed'   THEN ARRAY['accepted', 'cancelled', 'expired']
    WHEN 'accepted' THEN ARRAY['cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_status = ANY(v_valid)) THEN
    RAISE EXCEPTION 'Cannot transition proforma invoice from % to %', v_pi.status, p_status;
  END IF;

  UPDATE public.proforma_invoices SET status = p_status, updated_at = now()
   WHERE id = p_pi_id
   RETURNING * INTO v_pi;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
          'Proforma invoice ' || v_pi.pi_number || ' marked ' || p_status, 'proforma_invoice', v_pi.id);

  RETURN to_jsonb(v_pi);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_project(p_workspace_id uuid, p_actor_id uuid, p_project_id uuid, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_before public.projects%ROWTYPE; v_after public.projects%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_before FROM public.projects WHERE id = p_project_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;

  UPDATE public.projects SET
    code = COALESCE(p_updates->>'code', code),
    name = COALESCE(p_updates->>'name', name),
    client_id = COALESCE((p_updates->>'client_id')::UUID, client_id),
    status = COALESCE(p_updates->>'status', status),
    site_address = COALESCE(p_updates->'site_address', site_address),
    start_date = COALESCE((p_updates->>'start_date')::DATE, start_date),
    end_date = COALESCE((p_updates->>'end_date')::DATE, end_date),
    budget = COALESCE((p_updates->>'budget')::NUMERIC, budget),
    assigned_to = COALESCE((p_updates->>'assigned_to')::UUID, assigned_to),
    notes = COALESCE(p_updates->>'notes', notes),
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_after;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated project ' || v_after.code, 'project', v_after.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'update', 'project', v_after.id, jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after)));

  RETURN to_jsonb(v_after);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_purchase_order(p_workspace_id uuid, p_actor_id uuid, p_po_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_po public.purchase_orders%ROWTYPE; v_item JSONB; v_sort INT := 0;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status IN ('cancelled', 'partially_received', 'received') THEN
    RAISE EXCEPTION 'Purchase order in status % cannot be edited', v_po.status;
  END IF;

  UPDATE public.purchase_orders SET
    supplier_id = COALESCE((p_input->>'supplier_id')::UUID, supplier_id),
    project_id = COALESCE((p_input->>'project_id')::UUID, project_id),
    currency = COALESCE(p_input->>'currency', currency),
    issue_date = COALESCE((p_input->>'issue_date')::DATE, issue_date),
    expected_date = COALESCE((p_input->>'expected_date')::DATE, expected_date),
    reference = CASE WHEN p_input ? 'reference'
                     THEN NULLIF(TRIM(COALESCE(p_input->>'reference', '')), '')
                     ELSE reference END,
    title = COALESCE(p_input->>'title', title),
    terms_and_conditions = COALESCE(p_input->>'terms_and_conditions', terms_and_conditions),
    notes = COALESCE(p_input->>'notes', notes),
    internal_notes = COALESCE(p_input->>'internal_notes', internal_notes),
    updated_at = now()
  WHERE id = p_po_id;

  IF p_input ? 'line_items' THEN
    DELETE FROM public.line_items WHERE entity_type = 'purchase_order' AND entity_id = p_po_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'line_items')
    LOOP
      INSERT INTO public.line_items (workspace_id, entity_type, entity_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id)
      VALUES (p_workspace_id, 'purchase_order', p_po_id, COALESCE(v_item->>'category', 'per_unit'), v_sort,
        v_item->>'description', (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC, v_item->>'unit',
        COALESCE((v_item->>'discount_percent')::NUMERIC, 0), COALESCE((v_item->>'tax_percent')::NUMERIC, 0),
        (v_item->>'catalog_item_id')::UUID);
      v_sort := v_sort + 1;
    END LOOP;
    PERFORM public.recompute_purchase_order_totals(p_po_id);
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated purchase order ' || v_po.po_number, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_purchase_order_status(p_workspace_id uuid, p_actor_id uuid, p_po_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_po    public.purchase_orders%ROWTYPE;
  v_valid TEXT[];
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders
   WHERE id = p_po_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  IF v_po.status = p_status THEN
    RETURN to_jsonb(v_po);
  END IF;

  -- Goods arriving is the point of no return: 'received' and 'cancelled'
  -- are terminal, so a PO cannot be re-opened and rewritten to
  -- contradict what was actually delivered. partially_received can still
  -- complete or be cancelled.
  v_valid := CASE v_po.status
    WHEN 'draft'              THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'               THEN ARRAY['acknowledged', 'partially_received', 'received', 'cancelled']
    WHEN 'acknowledged'       THEN ARRAY['partially_received', 'received', 'cancelled']
    WHEN 'partially_received' THEN ARRAY['received', 'cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_status = ANY(v_valid)) THEN
    RAISE EXCEPTION 'Cannot transition purchase order from % to %', v_po.status, p_status;
  END IF;

  UPDATE public.purchase_orders SET status = p_status, updated_at = now()
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update',
          'Purchase order ' || v_po.po_number || ' marked ' || p_status, 'purchase_order', v_po.id);

  RETURN to_jsonb(v_po);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_quotation(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_expiry_date date, p_terms_and_conditions text, p_notes text, p_internal_notes text, p_line_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.quotations%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
  v_currency TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this quotation';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_old.status NOT IN ('draft', 'revision_requested') THEN
    RAISE EXCEPTION 'Quotation in status % cannot be edited', v_old.status;
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM v_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', v_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.expiry_date IS DISTINCT FROM p_expiry_date THEN
    v_changes := v_changes || jsonb_build_object('expiry_date', jsonb_build_object('old', v_old.expiry_date, 'new', p_expiry_date));
  END IF;

  UPDATE public.quotations
  SET client_id = p_client_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = v_currency,
      issue_date = p_issue_date,
      expiry_date = p_expiry_date,
      terms_and_conditions = NULLIF(p_terms_and_conditions, ''),
      notes = NULLIF(p_notes, ''),
      internal_notes = NULLIF(p_internal_notes, ''),
      updated_at = now()
  WHERE id = p_quotation_id;

  DELETE FROM public.line_items WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'quotation', p_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(p_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = p_quotation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_quotation(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid, p_client_id uuid, p_title text, p_summary text, p_currency text, p_issue_date date, p_expiry_date date, p_terms_and_conditions text, p_notes text, p_internal_notes text, p_line_items jsonb, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.quotations%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
  v_currency TEXT;
  v_project_id UUID;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this quotation';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_old.status IN ('rejected', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Quotation in status % cannot be edited', v_old.status;
  END IF;

  IF jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_project_id := COALESCE(p_project_id, v_old.project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Invalid project';
  END IF;

  v_currency := COALESCE(p_currency, (SELECT default_currency FROM public.workspaces WHERE id = p_workspace_id));

  IF v_old.client_id IS DISTINCT FROM p_client_id THEN
    v_changes := v_changes || jsonb_build_object('client_id', jsonb_build_object('old', v_old.client_id, 'new', p_client_id));
  END IF;
  IF v_old.project_id IS DISTINCT FROM v_project_id THEN
    v_changes := v_changes || jsonb_build_object('project_id', jsonb_build_object('old', v_old.project_id, 'new', v_project_id));
  END IF;
  IF v_old.title IS DISTINCT FROM NULLIF(p_title, '') THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_old.title, 'new', NULLIF(p_title, '')));
  END IF;
  IF v_old.currency IS DISTINCT FROM v_currency THEN
    v_changes := v_changes || jsonb_build_object('currency', jsonb_build_object('old', v_old.currency, 'new', v_currency));
  END IF;
  IF v_old.issue_date IS DISTINCT FROM p_issue_date THEN
    v_changes := v_changes || jsonb_build_object('issue_date', jsonb_build_object('old', v_old.issue_date, 'new', p_issue_date));
  END IF;
  IF v_old.expiry_date IS DISTINCT FROM p_expiry_date THEN
    v_changes := v_changes || jsonb_build_object('expiry_date', jsonb_build_object('old', v_old.expiry_date, 'new', p_expiry_date));
  END IF;

  UPDATE public.quotations
  SET client_id = p_client_id,
      project_id = v_project_id,
      title = NULLIF(p_title, ''),
      summary = NULLIF(p_summary, ''),
      currency = v_currency,
      issue_date = p_issue_date,
      expiry_date = p_expiry_date,
      terms_and_conditions = NULLIF(p_terms_and_conditions, ''),
      notes = NULLIF(p_notes, ''),
      internal_notes = NULLIF(p_internal_notes, ''),
      updated_at = now()
  WHERE id = p_quotation_id;

  DELETE FROM public.line_items WHERE entity_type = 'quotation' AND entity_id = p_quotation_id;

  INSERT INTO public.line_items (
    workspace_id, entity_type, entity_id, category, sort_order,
    description, quantity, unit_price, unit, discount_percent, tax_percent, catalog_item_id
  )
  SELECT
    p_workspace_id, 'quotation', p_quotation_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0),
    NULLIF(elem->>'catalog_item_id', '')::UUID
  FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.recompute_quotation_totals(p_quotation_id);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id, NULLIF(v_changes, '{}'::JSONB));

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = p_quotation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_quotation_status(p_quotation_id uuid, p_workspace_id uuid, p_actor_id uuid, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.quotations%ROWTYPE;
  v_valid_next TEXT[];
  v_action_label TEXT;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to change this quotation''s status';
  END IF;

  SELECT * INTO v_old FROM public.quotations
  WHERE id = p_quotation_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  v_valid_next := CASE v_old.status
    WHEN 'draft' THEN ARRAY['sent', 'cancelled']
    WHEN 'sent' THEN ARRAY['viewed', 'expired', 'cancelled']
    WHEN 'viewed' THEN ARRAY['approved', 'rejected', 'revision_requested', 'expired', 'cancelled']
    WHEN 'revision_requested' THEN ARRAY['draft', 'sent', 'cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Cannot transition quotation from % to %', v_old.status, p_new_status;
  END IF;

  v_action_label := CASE p_new_status
    WHEN 'sent' THEN 'sent'
    WHEN 'viewed' THEN 'viewed'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'expired' THEN 'expired'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'revision_requested' THEN 'requested revision on'
    WHEN 'draft' THEN 'reopened'
    ELSE p_new_status
  END;

  UPDATE public.quotations
  SET status = p_new_status,
      approved_at = CASE WHEN p_new_status = 'approved' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN p_new_status = 'approved' THEN p_actor_id ELSE approved_by END,
      updated_at = now()
  WHERE id = p_quotation_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'status_change',
    v_action_label || ' quotation ' || v_old.quotation_number, 'quotation', p_quotation_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'quotation', p_quotation_id,
    jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_new_status))
  );

  RETURN (SELECT to_jsonb(q) FROM public.quotations q WHERE q.id = p_quotation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_quotation_template(p_template_id uuid, p_workspace_id uuid, p_actor_id uuid, p_name text, p_description text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.quotation_templates%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this template';
  END IF;

  SELECT * INTO v_old FROM public.quotation_templates
  WHERE id = p_template_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  IF jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  UPDATE public.quotation_templates
  SET name = p_name, description = NULLIF(p_description, ''), updated_at = now()
  WHERE id = p_template_id;

  DELETE FROM public.quotation_template_items WHERE template_id = p_template_id;

  INSERT INTO public.quotation_template_items (
    template_id, category, sort_order, description, quantity, unit_price, unit, discount_percent, tax_percent
  )
  SELECT
    p_template_id, (elem->>'category')::TEXT, (ord - 1)::INTEGER,
    elem->>'description', (elem->>'quantity')::NUMERIC, (elem->>'unit_price')::NUMERIC,
    NULLIF(elem->>'unit', ''), COALESCE((elem->>'discount_percent')::NUMERIC, 0), COALESCE((elem->>'tax_percent')::NUMERIC, 0)
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord);

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated quotation template "' || p_name || '"', 'quotation_template', p_template_id
  );
  PERFORM public.log_audit_entry(p_workspace_id, p_actor_id, 'user', 'update', 'quotation_template', p_template_id);

  RETURN (SELECT to_jsonb(t) FROM public.quotation_templates t WHERE t.id = p_template_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_supplier(p_workspace_id uuid, p_actor_id uuid, p_supplier_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_before public.suppliers%ROWTYPE; v_after public.suppliers%ROWTYPE;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('staff', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO v_before FROM public.suppliers WHERE id = p_supplier_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;

  UPDATE public.suppliers SET
    name = COALESCE(p_input->>'name', name),
    email = COALESCE(p_input->>'email', email),
    phone = COALESCE(p_input->>'phone', phone),
    company = COALESCE(p_input->>'company', company),
    website = COALESCE(p_input->>'website', website),
    address = COALESCE(p_input->'address', address),
    billing_email = COALESCE(p_input->>'billing_email', billing_email),
    tax_id = COALESCE(p_input->>'tax_id', tax_id),
    payment_terms = COALESCE((p_input->>'payment_terms')::INTEGER, payment_terms),
    preferred_currency = COALESCE(p_input->>'preferred_currency', preferred_currency),
    tags = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_input->'tags') x), tags),
    custom_fields = COALESCE(p_input->'custom_fields', custom_fields),
    notes = COALESCE(p_input->>'notes', notes),
    assigned_to = COALESCE((p_input->>'assigned_to')::UUID, assigned_to),
    updated_at = now()
  WHERE id = p_supplier_id
  RETURNING * INTO v_after;

  INSERT INTO public.activities (workspace_id, actor_id, action, description, entity_type, entity_id)
  VALUES (p_workspace_id, p_actor_id, 'update', 'Updated supplier ' || v_after.name, 'supplier', v_after.id);
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
  VALUES (p_workspace_id, p_actor_id, 'update', 'supplier', v_after.id, jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after)));

  RETURN to_jsonb(v_after);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_workspace(p_workspace_id uuid, p_actor_id uuid, p_name text, p_default_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.workspaces%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update workspace settings';
  END IF;

  SELECT * INTO v_old FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  IF v_old.name IS DISTINCT FROM p_name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', v_old.name, 'new', p_name));
  END IF;
  IF v_old.default_currency IS DISTINCT FROM p_default_currency THEN
    v_changes := v_changes || jsonb_build_object('default_currency', jsonb_build_object('old', v_old.default_currency, 'new', p_default_currency));
  END IF;

  UPDATE public.workspaces
  SET name = p_name, default_currency = p_default_currency, updated_at = now()
  WHERE id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated workspace settings', 'workspace', p_workspace_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace', p_workspace_id, NULLIF(v_changes, '{}'::JSONB)
  );

  RETURN (SELECT to_jsonb(w) FROM public.workspaces w WHERE w.id = p_workspace_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_workspace_settings(p_workspace_id uuid, p_actor_id uuid, p_section_key text, p_section_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public.workspaces%ROWTYPE;
  v_allowed_keys TEXT[] := ARRAY['company_profile', 'payment_details', 'default_terms', 'branding'];
BEGIN
  IF NOT (p_section_key = ANY(v_allowed_keys)) THEN
    RAISE EXCEPTION 'Invalid settings section: %', p_section_key;
  END IF;

  IF COALESCE(public.get_user_role(p_workspace_id), 'none') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Insufficient permissions to update workspace settings';
  END IF;

  SELECT * INTO v_old FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  UPDATE public.workspaces
  SET settings = jsonb_set(settings, ARRAY[p_section_key], p_section_value, true),
      updated_at = now()
  WHERE id = p_workspace_id;

  PERFORM public.log_activity(
    p_workspace_id, p_actor_id, 'user', 'updated',
    'updated ' || replace(p_section_key, '_', ' '), 'workspace', p_workspace_id
  );
  PERFORM public.log_audit_entry(
    p_workspace_id, p_actor_id, 'user', 'update', 'workspace', p_workspace_id,
    jsonb_build_object(p_section_key, jsonb_build_object(
      'old', v_old.settings->p_section_key,
      'new', p_section_value
    ))
  );

  RETURN (SELECT to_jsonb(w) FROM public.workspaces w WHERE w.id = p_workspace_id);
END;
$function$
;

NOTIFY pgrst, 'reload schema';
