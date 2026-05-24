-- 00036_vendor_profile_filter_fields.sql
-- Adds 2 vendor-profile fields for the Day-1 filter chip system.
-- (response_sla_hours + profile_backfill_dismissed_at already exist)
--
-- All vendor fields are NULL-able. NULL means "not provided yet" and is excluded
-- from filter matches (e.g. ?lang=hindi will not match a vendor with NULL languages).
-- Existing vendors keep NULL until they complete the backfill flow.

ALTER TABLE vendor_profiles
  ADD COLUMN languages text[] DEFAULT NULL,
  ADD COLUMN years_in_business int CHECK (years_in_business >= 0 AND years_in_business <= 99);

-- GIN index for efficient "?lang=hindi,urdu" filters (array-overlap queries).
CREATE INDEX idx_vendor_profiles_languages
  ON vendor_profiles USING GIN (languages);

-- B-tree for "?years=5" filters (years_in_business >= 5).
CREATE INDEX idx_vendor_profiles_years_in_business
  ON vendor_profiles (years_in_business);
