-- Construction BOS: restore project-scoped document numbering.
--
-- 00078 set the approved standard as the built-in default:
--
--   <PREFIX>/AWP-<PROJECT_CODE>/<DDMMYYYY>-<SEQ:3>
--
-- with the counter scoped per (workspace, document_type, project) and
-- never reset. generate_document_number still implements exactly that,
-- and every create_* RPC still passes the project code — that half never
-- broke.
--
-- What broke is that the Settings > Numbering panel shipped a *different*
-- default in the UI ('{PREFIX}-{YYYY}{MM}{DD}-{SEQ:3}', daily, workspace
-- scope). It prefilled every row with that string, so opening the panel
-- and saving any row wrote a workspace template that overrode the DB
-- default — silently dropping the project code from every subsequent
-- number. That is how INV/AWP-<CODE>/... became INV-20260727-011.
--
-- This migration retires those rows. It only touches templates that are
-- character-for-character the panel's old default: a genuinely
-- customized template is somebody's deliberate choice and is left alone.
-- Deleting rather than rewriting is deliberate too — with no active row,
-- generate_document_number falls through to the built-in standard, which
-- is the single place that standard should be defined.

DELETE FROM public.document_number_templates
WHERE template = '{PREFIX}-{YYYY}{MM}{DD}-{SEQ:3}';

-- Numbers already issued keep the format they were issued under: they
-- are printed on documents that have left the building, and rewriting
-- them would break every reference to them. Only new documents pick up
-- the restored format.

NOTIFY pgrst, 'reload schema';
