-- Data fix: the default invoice/quotation title block was seeded with
-- show_status_badge: true (00033_create_document_design_system.sql via
-- seed.ts / presets.ts). That default has since been changed to false,
-- but existing document_templates rows already own their own copy of
-- that config (blocks is copied at insert time, never re-derived from
-- presets.ts) — so workspaces created before the change still render the
-- status pill next to the big title. This migration retroactively
-- corrects already-saved designs to match the corrected default.
--
-- The title block is identified structurally by config.title_size_pt
-- (a key unique to the title document_meta block in this layout — the
-- other document_meta block, the metadata column, never carries it), so
-- this only touches the title block and leaves every other block's
-- config untouched.

CREATE OR REPLACE FUNCTION _fix_title_status_badge(p_blocks JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result JSONB := '[]'::jsonb;
  blk JSONB;
  new_blk JSONB;
  new_children JSONB;
  col JSONB;
BEGIN
  FOR blk IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    new_blk := blk;

    IF blk->>'type' = 'document_meta' AND (blk->'config') ? 'title_size_pt' THEN
      new_blk := jsonb_set(new_blk, '{config,show_status_badge}', 'false'::jsonb, true);
    END IF;

    IF blk ? 'children' THEN
      new_children := '[]'::jsonb;
      FOR col IN SELECT * FROM jsonb_array_elements(blk->'children') LOOP
        new_children := new_children || jsonb_build_array(_fix_title_status_badge(col));
      END LOOP;
      new_blk := jsonb_set(new_blk, '{children}', new_children, true);
    END IF;

    result := result || jsonb_build_array(new_blk);
  END LOOP;

  RETURN result;
END;
$$;

UPDATE document_templates
SET blocks = _fix_title_status_badge(blocks),
    updated_at = now()
WHERE deleted_at IS NULL;

DROP FUNCTION _fix_title_status_badge(JSONB);
