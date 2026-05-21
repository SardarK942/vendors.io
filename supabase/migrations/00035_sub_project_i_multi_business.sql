-- 00035_sub_project_i_multi_business.sql
-- Sub-project I — multi-business per vendor account
-- See docs/superpowers/specs/2026-05-21-sub-project-i-multi-business-design.md §4
--
-- Two additive-then-cleanup changes:
--   1. Flip the Stripe FK: stripe_accounts.vendor_profile_id → vendor_profiles.stripe_account_id
--   2. Add users.active_vendor_profile_id (nullable; NULL = single-business fallback)
--
-- Idempotent throughout. Safe to re-run after a partial-apply failure.

------------------------------------------------------------------------
-- Change 1: Flip the Stripe FK
------------------------------------------------------------------------

-- Step 1.1: Add the new column on vendor_profiles (nullable).
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id uuid REFERENCES stripe_accounts(id);

-- Step 1.2: Backfill. Each vendor_profile that has a corresponding stripe_account
-- (current direction) gets its new FK populated.
UPDATE vendor_profiles vp
  SET stripe_account_id = sa.id
  FROM stripe_accounts sa
  WHERE sa.vendor_profile_id = vp.id
    AND vp.stripe_account_id IS NULL;

-- Step 1.3: Index for joins.
CREATE INDEX IF NOT EXISTS vendor_profiles_stripe_account_idx
  ON vendor_profiles(stripe_account_id);

-- Step 1.4: Rewrite the stripe_accounts RLS SELECT policy.
-- Existing policy is named "Vendors can view own stripe account" (verified via
-- pg_policy on dev 2026-05-21). Drop both old + new names defensively.
DROP POLICY IF EXISTS "Vendors can view own stripe account" ON stripe_accounts;
DROP POLICY IF EXISTS "Vendors read own stripe_accounts" ON stripe_accounts;

CREATE POLICY "Vendors read own stripe_accounts"
  ON stripe_accounts FOR SELECT
  USING (
    id IN (
      SELECT stripe_account_id FROM vendor_profiles
      WHERE user_id = auth.uid() AND stripe_account_id IS NOT NULL
    )
  );

-- Step 1.5: Drop the old FK column.
ALTER TABLE stripe_accounts
  DROP COLUMN IF EXISTS vendor_profile_id;

------------------------------------------------------------------------
-- Change 2: Active vendor profile pointer on users
------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_vendor_profile_id uuid
    REFERENCES vendor_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_vendor_profile_idx
  ON users(active_vendor_profile_id);
