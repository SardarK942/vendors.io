-- Adds 'tiktok' to the scraped_vendors source CHECK constraint.
-- Mirrors migration 00045's pattern for category constraint updates.

ALTER TABLE scraped_vendors DROP CONSTRAINT IF EXISTS scraped_vendors_source_check;
ALTER TABLE scraped_vendors ADD CONSTRAINT scraped_vendors_source_check
  CHECK (source IN (
    'google_maps', 'instagram', 'il_desi_arab_catering',
    'hand_curated', 'searchgraph', 'tiktok'
  ));
