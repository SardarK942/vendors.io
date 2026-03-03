-- Stripe Connect accounts for vendors
CREATE TABLE public.stripe_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE NOT NULL,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  payouts_enabled BOOLEAN DEFAULT FALSE,
  charges_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_stripe_accounts_vendor ON stripe_accounts(vendor_profile_id);
CREATE INDEX idx_stripe_accounts_stripe_id ON stripe_accounts(stripe_account_id);

-- RLS Policies
ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Vendors can view their own Stripe account
CREATE POLICY "Vendors can view own stripe account"
  ON public.stripe_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_profiles
      WHERE id = vendor_profile_id AND user_id = auth.uid()
    )
  );

-- Service role handles inserts/updates (via API routes)
CREATE POLICY "Service role can manage stripe accounts"
  ON public.stripe_accounts FOR ALL
  USING (true)
  WITH CHECK (true);
