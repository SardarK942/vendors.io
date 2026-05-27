-- Fixes long-standing schema drift: src/app/api/vendor-profile/publish/route.ts
-- writes to is_active + onboarding_complete columns that didn't exist, causing
-- the publish flow to 500 in prod and 3 pre-existing test failures on every PR.
--
-- Adds the two boolean columns + backfills any vendor whose publish-gate
-- fields are all populated. Default-deny: new + incomplete profiles stay
-- is_active=false until they go through the publish flow successfully.

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

-- Backfill: mark complete profiles as active so existing dev/prod vendors
-- don't disappear when the marketplace filter is restored. Mirrors the
-- publishGateSchema validation in src/lib/onboarding/validation.ts.
UPDATE vendor_profiles
SET is_active = true,
    onboarding_complete = true
WHERE business_name IS NOT NULL
  AND business_name <> ''
  AND category IS NOT NULL
  AND bio IS NOT NULL
  AND length(bio) >= 50
  AND base_address_line_1 IS NOT NULL
  AND base_city IS NOT NULL
  AND base_state IS NOT NULL
  AND base_postal_code IS NOT NULL
  AND base_google_place_id IS NOT NULL
  AND instagram_handle IS NOT NULL
  AND payment_mode IS NOT NULL
  AND portfolio_images IS NOT NULL
  AND array_length(portfolio_images, 1) >= 1
  AND languages IS NOT NULL
  AND array_length(languages, 1) >= 1
  AND years_in_business IS NOT NULL
  AND response_sla_hours IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_profiles_is_active_idx
  ON vendor_profiles (is_active)
  WHERE is_active = true;
