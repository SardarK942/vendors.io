-- Staging table for K's multi-source scraper pipeline.
-- Rows are promoted to vendor_profiles on claim (either via token or organic
-- signup-time fuzzy match). See spec 2026-05-27-sub-project-k-vendor-scraper-design.

CREATE TABLE scraped_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN (
    'google_maps', 'instagram', 'il_desi_arab_catering',
    'hand_curated', 'searchgraph'
  )),
  source_external_id text,
  business_name text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  city text,
  state text NOT NULL DEFAULT 'IL',
  postal_code text,
  lat numeric,
  lng numeric,
  phone text,
  email text,
  website text,
  instagram_handle text,
  facebook_url text,
  bio text,
  photos text[] NOT NULL DEFAULT '{}',
  raw jsonb NOT NULL,
  enriched jsonb,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_vendor_profile_id uuid REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  disputed_at timestamptz,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'duplicate'))
);

CREATE UNIQUE INDEX scraped_vendors_source_external_idx
  ON scraped_vendors (source, source_external_id)
  WHERE source_external_id IS NOT NULL;
CREATE INDEX scraped_vendors_instagram_idx
  ON scraped_vendors (lower(instagram_handle))
  WHERE instagram_handle IS NOT NULL;
CREATE INDEX scraped_vendors_phone_idx
  ON scraped_vendors (phone) WHERE phone IS NOT NULL;
CREATE INDEX scraped_vendors_category_city_idx ON scraped_vendors (category, city);
CREATE INDEX scraped_vendors_unclaimed_idx ON scraped_vendors (claimed_at) WHERE claimed_at IS NULL;

ALTER TABLE scraped_vendors ENABLE ROW LEVEL SECURITY;
-- Default-deny: no SELECT/INSERT/UPDATE/DELETE policy → service-role only.
