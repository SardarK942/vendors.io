-- 00073: multi-service vendors + gifts category.
-- 1) services text[] : the full set of services a vendor offers (always includes
--    the primary `category`). Browse membership filters on this; `category`
--    stays the single primary for card label + count attribution.
-- 2) gifts : new top-level category (standalone gift/favor vendors).
-- content_creation was already added to the CHECK in 00045 — kept here.

ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS services text[];

-- Backfill: existing single-category rows become a one-element service set.
UPDATE vendor_profiles
SET services = ARRAY[category]::text[]
WHERE services IS NULL;

CREATE INDEX IF NOT EXISTS vendor_profiles_services_gin
  ON vendor_profiles USING gin (services);

-- Recreate the category CHECK with `gifts` added (15 values).
ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_category_check;
ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_category_check
  CHECK (category IN (
    'photography','videography','content_creation','mehndi','hair_makeup',
    'dj','photobooth','catering','venue','decor','invitations',
    'bridal_wear','live_music','carts','gifts'
  ));
