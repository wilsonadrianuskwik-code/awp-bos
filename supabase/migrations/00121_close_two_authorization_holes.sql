-- Two authorization holes found in a pre-go-live audit of every
-- SECURITY DEFINER function. Both are cross-workspace: a SECURITY DEFINER
-- function runs as its owner and so bypasses RLS entirely, which is why
-- each one has to check membership for itself.
--
-- Neither changes a workflow. Both add the same guard their siblings
-- already carry, and both are reached in normal use only by someone who
-- has already passed that guard.

-- ---------------------------------------------------------------------
-- 1. mark_next_scheduled_deliverables_posted — the five-argument overload
-- ---------------------------------------------------------------------
--
-- 00112 added a role check to this function, but only to the four-argument
-- version. 00058 had already created a *second* one taking an extra
-- p_exclude_deliverable_id: a different signature is a new function, not a
-- replacement, so the older one kept running unguarded and the fix looked
-- complete while missing half of it.
--
-- Unguarded, any authenticated user could post another workspace's
-- scheduled deliverables by calling this overload directly through
-- PostgREST with that workspace's id.
--
-- In normal use it is called by record_fulfillment_event, which checks the
-- caller's role first — so the same person passes this check immediately
-- afterwards and nothing about the delivery flow changes.
CREATE OR REPLACE FUNCTION mark_next_scheduled_deliverables_posted(
  p_fulfillment_item_id UUID,
  p_workspace_id UUID,
  p_actor_id UUID,
  p_count INTEGER,
  p_exclude_deliverable_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deliverable RECORD;
  v_marked INTEGER := 0;
BEGIN
  IF public.get_user_role(p_workspace_id) NOT IN ('staff', 'admin', 'owner') THEN
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
$$;

-- ---------------------------------------------------------------------
-- 2. get_document_relationships
-- ---------------------------------------------------------------------
--
-- Takes a workspace id and returns that workspace's document graph, with
-- no check that the caller belongs to it. It is the only function the app
-- calls that had no guard at all.
--
-- What leaked is structure rather than content — document types, ids and
-- how they connect — but those ids are the input other endpoints take,
-- so it is the first step of a longer walk rather than a curiosity.
--
-- Returning empty rather than raising: this feeds a "Linked documents"
-- panel, and a workspace you are not in genuinely has no links you can
-- see. Members are unaffected.
CREATE OR REPLACE FUNCTION get_document_relationships(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_document_id UUID
)
RETURNS TABLE(direction TEXT, related_type TEXT, related_id UUID, relationship TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'generated_to' AS direction, to_type AS related_type, to_id AS related_id, relationship
  FROM public.document_relationships
  WHERE workspace_id = p_workspace_id AND from_type = p_document_type AND from_id = p_document_id
    AND public.get_user_role(p_workspace_id) IS NOT NULL
  UNION ALL
  SELECT 'generated_from' AS direction, from_type AS related_type, from_id AS related_id, relationship
  FROM public.document_relationships
  WHERE workspace_id = p_workspace_id AND to_type = p_document_type AND to_id = p_document_id
    AND public.get_user_role(p_workspace_id) IS NOT NULL;
$$;

NOTIFY pgrst, 'reload schema';
