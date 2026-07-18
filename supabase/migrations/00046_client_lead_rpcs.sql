-- Clients and Leads are the only two entities in the app whose mutations
-- still go straight through `supabase.from(...).update(...)` in actions.ts
-- rather than a SECURITY DEFINER Postgres function — every other entity
-- (invoices, quotations, payments, fulfillment_items) mutates through an
-- RPC that takes a `SELECT ... FOR UPDATE` row lock before reading/writing,
-- closing the classic "read, compute a diff in the app, write" race: two
-- staff editing the same client/lead concurrently currently just
-- last-write-wins with no lock and no conflict detection, silently
-- dropping one of the two updates.
--
-- Scope matches what updateClientSchema/updateLeadSchema (the only forms
-- that ever call the update path) actually submit today — not every
-- column on the row (e.g. tags/custom_fields/address on clients,
-- conversion_probability/notes_text beyond what's listed aren't part of
-- the edit form and are left untouched by these RPCs, same as before).
-- Unlike invoices/quotations' diff-based update_invoice, these treat the
-- listed columns as a full replace (same simpler convention already used
-- for e.g. update_invoice_status) and compute the audit diff in SQL
-- instead of the JS diff loop actions.ts used to do inline.

CREATE FUNCTION create_client(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_company TEXT,
  p_website TEXT,
  p_billing_email TEXT,
  p_tax_id TEXT,
  p_payment_terms INTEGER,
  p_preferred_currency TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;

CREATE FUNCTION update_client(
  p_client_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_company TEXT,
  p_website TEXT,
  p_billing_email TEXT,
  p_tax_id TEXT,
  p_payment_terms INTEGER,
  p_preferred_currency TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.clients%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;

CREATE FUNCTION delete_client(
  p_client_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;

CREATE FUNCTION create_lead(
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_company TEXT,
  p_source TEXT,
  p_status TEXT,
  p_conversion_probability NUMERIC,
  p_expected_value NUMERIC,
  p_notes_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead_id UUID;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;

CREATE FUNCTION update_lead(
  p_lead_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_company TEXT,
  p_source TEXT,
  p_status TEXT,
  p_conversion_probability NUMERIC,
  p_expected_value NUMERIC,
  p_notes_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.leads%ROWTYPE;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;

CREATE FUNCTION delete_lead(
  p_lead_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;
