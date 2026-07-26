-- Construction BOS: make the *printed* document match the builder.
--
-- Printing goes through two different paths: DocumentRenderView renders
-- the workspace's configured template when one exists, and only falls
-- back to the hand-written print view when it doesn't. Migrations
-- 00082-00084 changed the builder and the fallback, but not the template
-- pipeline — so any workspace with a seeded template (which is all of
-- them) kept printing the old "Subtotal / Discount / Tax / Total" rows
-- and no signature, while the builder showed the Indonesian breakdown.
--
-- The renderer now understands the new rows and the signature block
-- reads the configured signatory; this migration brings templates that
-- already exist in the database in line with the updated presets, since
-- their block config is stored data, not code.

-- Invoice templates: swap the legacy totals rows for the Indonesian
-- breakdown. Matched on the block's own rows array rather than blindly
-- overwriting every totals block, so a workspace that has deliberately
-- customized its rows is left alone.
UPDATE document_templates dt
SET blocks = (
  SELECT jsonb_agg(
    CASE
      WHEN block->>'type' = 'totals'
       AND block->'config'->'rows' @> '["subtotal"]'::jsonb
      THEN jsonb_set(
        block,
        '{config,rows}',
        '["harga_jual","dpp","ppn","pph","retensi","total","amount_paid","balance_due"]'::jsonb
      )
      ELSE block
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(dt.blocks) WITH ORDINALITY AS t(block, ord)
),
updated_at = now()
WHERE dt.document_type = 'invoice'
  AND dt.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(dt.blocks) b
    WHERE b->>'type' = 'totals' AND b->'config'->'rows' @> '["subtotal"]'::jsonb
  );

-- Enable the signature block wherever it exists but was left off (it
-- shipped disabled by default). It renders the workspace's configured
-- signatory, and falls back to the blank ruled lines it always drew when
-- no signatory is set up — so enabling it can't produce a stray empty
-- signature area for workspaces that haven't configured one.
UPDATE document_templates dt
SET blocks = (
  SELECT jsonb_agg(
    CASE
      WHEN block->>'type' = 'signature' AND block->>'enabled' = 'false'
      THEN jsonb_set(block, '{enabled}', 'true'::jsonb)
      ELSE block
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(dt.blocks) WITH ORDINALITY AS t(block, ord)
),
updated_at = now()
WHERE dt.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(dt.blocks) b
    WHERE b->>'type' = 'signature' AND b->>'enabled' = 'false'
  );
