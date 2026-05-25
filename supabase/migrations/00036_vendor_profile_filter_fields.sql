-- 00036_vendor_profile_filter_fields.sql
-- Adds vendor-profile fields for the Day-1 filter chip system + the existing-vendor
-- backfill dismissal flag.
--
-- Idempotent — uses ADD COLUMN IF NOT EXISTS for prod-safety. `response_sla_hours`
-- has existed on vendor_profiles since 00002; `profile_backfill_dismissed_at` may
-- already exist on users on some envs. The IF NOT EXISTS clauses make this safe to
-- apply against any environment.
--
-- All vendor fields are NULL-able. NULL means "not provided yet" and is excluded
-- from filter matches (e.g. ?lang=hindi will not match a vendor with NULL languages).
-- Existing vendors keep NULL until they complete the backfill flow.

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS languages text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS years_in_business int CHECK (years_in_business >= 0 AND years_in_business <= 99);

-- GIN index for efficient "?lang=hindi,urdu" filters (array-overlap queries).
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_languages
  ON vendor_profiles USING GIN (languages);

-- B-tree for "?years=5" filters (years_in_business >= 5).
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_years_in_business
  ON vendor_profiles (years_in_business);

-- One-time dismissal marker for the backfill banner shown to existing vendors.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_backfill_dismissed_at timestamptz DEFAULT NULL;
