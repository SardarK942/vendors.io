-- Allow null + use a partial unique index so empty placeholders don't collide.
ALTER TABLE vendor_profiles ALTER COLUMN slug DROP NOT NULL;
ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_slug_key;
DROP INDEX IF EXISTS vendor_profiles_slug_key;
CREATE UNIQUE INDEX vendor_profiles_slug_key ON vendor_profiles (slug) WHERE slug IS NOT NULL;
