-- Enables fuzzy business-name matching for signup-time dedup + scraper merge.
-- pg_trgm is bundled with Postgres; CREATE EXTENSION is idempotent.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS scraped_vendors_business_name_trgm_idx
  ON scraped_vendors USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vendor_profiles_business_name_trgm_idx
  ON vendor_profiles USING gin (business_name gin_trgm_ops);
