-- Prevent duplicate in-progress vendor_profiles per user.
--
-- Root cause: the setup wizard's layout AND its page both call
-- `getOrCreateWizardProfile('first')`. In Next.js RSC these run concurrently
-- on the first visit; both SELECTs see zero rows, both INSERTs succeed, and
-- the user ends up with two vendor_profiles rows — one that receives every
-- subsequent PATCH, and one blank ghost. Sub-project I's multi-business
-- resolution then sees 2 rows and any code path still using .single()
-- (e.g. /api/packages before PR #90) returns "No vendor profile found".
--
-- Fix: a partial unique index that allows at most one in-progress
-- (onboarding_complete = false) profile per user. Completed profiles are
-- unconstrained — the multi-business feature keeps working.

-- Cleanup: collapse existing duplicate partials to a single row per user.
-- Preference order for the survivor:
--   1. Non-empty business_name (row that received wizard input)
--   2. Non-null slug (row that got past the basics step)
--   3. Oldest created_at (deterministic tie-breaker)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        (CASE WHEN business_name IS NOT NULL AND business_name <> '' THEN 0 ELSE 1 END) ASC,
        (CASE WHEN slug IS NOT NULL THEN 0 ELSE 1 END) ASC,
        created_at ASC
    ) AS rn
  FROM vendor_profiles
  WHERE onboarding_complete = false
)
DELETE FROM vendor_profiles
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Constraint: at most one in-progress profile per user_id.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_profiles_one_partial_per_user
  ON vendor_profiles (user_id)
  WHERE onboarding_complete = false;
