-- Rupiah-only.
--
-- The business trades exclusively in IDR, and the imported historical data
-- was IDR throughout (00095: "currency is IDR throughout -- the source
-- data's only currency"). The 'USD' defaults scattered across these tables
-- were never a deliberate choice — they came from the original scaffolding
-- and then quietly became the value stamped on anything created without an
-- explicit currency, which is how rupiah amounts ended up labelled USD.
--
-- Two changes here:
--   1. Every currency column now defaults to 'IDR'.
--   2. Existing non-IDR rows are relabelled to 'IDR'.
--
-- The relabelling is safe precisely because no conversion is involved and
-- none is wanted: the figures were always entered and read as rupiah, only
-- the currency tag was wrong. There is no FX rate anywhere in the app and
-- never was, so nothing was ever converted on the way in. Multiplying or
-- dividing the amounts here would be the bug, not the fix.

-- 1. Defaults -------------------------------------------------------------

ALTER TABLE public.workspaces    ALTER COLUMN default_currency    SET DEFAULT 'IDR';
ALTER TABLE public.leads         ALTER COLUMN expected_currency   SET DEFAULT 'IDR';
ALTER TABLE public.quotations    ALTER COLUMN currency            SET DEFAULT 'IDR';
ALTER TABLE public.invoices      ALTER COLUMN currency            SET DEFAULT 'IDR';
ALTER TABLE public.payments      ALTER COLUMN currency            SET DEFAULT 'IDR';
ALTER TABLE public.catalog_items ALTER COLUMN currency            SET DEFAULT 'IDR';
ALTER TABLE public.projects      ALTER COLUMN currency            SET DEFAULT 'IDR';
ALTER TABLE public.purchase_orders   ALTER COLUMN currency        SET DEFAULT 'IDR';
ALTER TABLE public.proforma_invoices ALTER COLUMN currency        SET DEFAULT 'IDR';

-- clients.preferred_currency deliberately has no default (00037): NULL
-- there means "use the workspace default", which is now always IDR.

-- 2. Backfill -------------------------------------------------------------

UPDATE public.workspaces    SET default_currency  = 'IDR' WHERE default_currency  IS DISTINCT FROM 'IDR';
UPDATE public.leads         SET expected_currency = 'IDR' WHERE expected_currency IS NOT NULL AND expected_currency <> 'IDR';
UPDATE public.clients       SET preferred_currency = 'IDR' WHERE preferred_currency IS NOT NULL AND preferred_currency <> 'IDR';
UPDATE public.suppliers     SET preferred_currency = 'IDR' WHERE preferred_currency IS NOT NULL AND preferred_currency <> 'IDR';
UPDATE public.quotations    SET currency = 'IDR' WHERE currency <> 'IDR';
UPDATE public.invoices      SET currency = 'IDR' WHERE currency <> 'IDR';
UPDATE public.payments      SET currency = 'IDR' WHERE currency <> 'IDR';
UPDATE public.catalog_items SET currency = 'IDR' WHERE currency <> 'IDR';
UPDATE public.projects      SET currency = 'IDR' WHERE currency <> 'IDR';
UPDATE public.purchase_orders   SET currency = 'IDR' WHERE currency <> 'IDR';
UPDATE public.proforma_invoices SET currency = 'IDR' WHERE currency <> 'IDR';

-- 3. The one remaining hardcoded 'USD' in a function signature ------------

-- create_project (00069) declares p_currency TEXT DEFAULT 'USD'. Only that
-- default changes; the body below is a verbatim copy of 00069's. CREATE OR
-- REPLACE is enough to change a parameter default in place, since the
-- argument names and types are untouched — no DROP, so existing GRANTs and
-- the function's OID survive.
CREATE OR REPLACE FUNCTION create_project(
  p_workspace_id UUID, p_actor_id UUID, p_code TEXT, p_name TEXT, p_client_id UUID,
  p_status TEXT DEFAULT 'planning', p_site_address JSONB DEFAULT NULL,
  p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL,
  p_budget NUMERIC DEFAULT NULL, p_currency TEXT DEFAULT 'IDR',
  p_assigned_to UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;
