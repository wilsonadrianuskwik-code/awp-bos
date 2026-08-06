-- Raises the `branding` bucket's file size limit from 2 MB to 8 MB.
--
-- 00083 sized it for a logo and a signature graphic, both small. The
-- bucket now also holds the sign-in wallpaper, and a photograph off a
-- phone or a camera lands well over 2 MB — the upload was rejected before
-- the user had any way to know why.
--
-- 8 MB is a ceiling, not a target: the upload UI still asks for something
-- around 2000px wide, because the wallpaper is the first thing loaded on
-- the one page nobody is signed in for yet. The limit exists to stop an
-- accident, not to encourage one.
--
-- Nothing else about the bucket changes: still public, same mime types.

UPDATE storage.buckets
SET file_size_limit = 8388608
WHERE id = 'branding';
