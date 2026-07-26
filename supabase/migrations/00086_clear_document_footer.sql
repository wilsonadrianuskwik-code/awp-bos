-- Construction BOS: drop the boilerplate footer from printed documents.
--
-- Templates shipped with a footer reading "Thank you for your business!"
-- plus a "Page 1 of 1" line. Neither belongs on these documents: the
-- thank-you is agency-era filler, and the page counter is misleading
-- because the renderer has no real pagination — it always printed
-- literally "Page 1 of 1" regardless of how many pages the browser
-- actually produced.
--
-- The presets no longer include either for new templates; this clears
-- them from templates already stored in the database, whose block config
-- is data rather than code. The footer block itself is left in place
-- (just emptied) so a workspace can still put its own text there — the
-- renderer now omits the block entirely when it has nothing to show,
-- rather than drawing a bare top border across the foot of the page.
UPDATE document_templates dt
SET blocks = (
  SELECT jsonb_agg(
    CASE
      WHEN block->>'type' = 'footer'
      THEN jsonb_set(
             jsonb_set(block, '{config,content}', '""'::jsonb),
             '{config,show_page_numbers}', 'false'::jsonb
           )
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
    WHERE b->>'type' = 'footer'
      AND (
        b->'config'->>'content' = 'Thank you for your business!'
        OR (b->'config'->>'show_page_numbers')::boolean IS TRUE
      )
  );
