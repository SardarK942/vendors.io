-- Adds a unique slug to scraped_vendors so /vendors/[slug] can route to
-- unclaimed listings. Slug = lowercased+dashed business_name suffixed with
-- the first 6 hex chars of the UUID to guarantee uniqueness even when two
-- vendors share a business name in different cities.

ALTER TABLE scraped_vendors
  ADD COLUMN slug text;

UPDATE scraped_vendors
SET slug = regexp_replace(
             lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g')),
             '(^-+|-+$)', '', 'g'
           )
           || '-' || substring(replace(id::text, '-', '') from 1 for 6)
WHERE slug IS NULL;

ALTER TABLE scraped_vendors
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX scraped_vendors_slug_key ON scraped_vendors (slug);
