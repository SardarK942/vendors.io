-- 00065_vendor_profiles_subcategories.sql
-- Add a generic subcategories array to vendor_profiles. First consumer is
-- carts (dessert / beverage / appetizer / favor_gift). Future categories can
-- extend SUBCATEGORIES_BY_CATEGORY in src/lib/vendor-subcategories.ts without
-- a new migration. Validation is app-layer, matching the existing category
-- pattern.

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS subcategories text[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS vendor_profiles_subcategories_gin
  ON vendor_profiles USING gin (subcategories);
