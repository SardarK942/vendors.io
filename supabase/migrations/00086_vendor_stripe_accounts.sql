-- supabase/migrations/00086_vendor_stripe_accounts.sql
-- Stripe Connect Standard onboarding for local bridal-wear vendors (Shop SP1).
-- Rebuilds the connected-account record dropped in 00058 (fresh name to avoid
-- the stale scripts that referenced the old `stripe_accounts`). Stores the
-- account id + Stripe readiness flags. No funds/ledger here — see SP2.
CREATE TABLE vendor_stripe_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL UNIQUE REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled   boolean NOT NULL DEFAULT false,
  payouts_enabled   boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_stripe_accounts_vendor_idx ON vendor_stripe_accounts(vendor_profile_id);

ALTER TABLE vendor_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Vendor may read their own row (status display).
CREATE POLICY "Vendors view own stripe account" ON vendor_stripe_accounts
  FOR SELECT TO authenticated
  USING (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

-- Server owns writes (onboarding route + webhook use the service-role client,
-- which bypasses RLS; this permissive policy mirrors the historical 00004 shape).
CREATE POLICY "Service role manages stripe accounts" ON vendor_stripe_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
