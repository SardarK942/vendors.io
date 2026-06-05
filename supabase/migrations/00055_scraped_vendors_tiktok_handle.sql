-- Adds tiktok_handle to scraped_vendors so the TikTok ingestion source can
-- store creator handles alongside IG handles. Mirrors the instagram_handle
-- column shape: nullable text + case-insensitive partial index for dedup.

ALTER TABLE scraped_vendors
  ADD COLUMN tiktok_handle text;

CREATE INDEX scraped_vendors_tiktok_idx
  ON scraped_vendors (lower(tiktok_handle))
  WHERE tiktok_handle IS NOT NULL;
