-- Payment transactions log
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id UUID NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT NOT NULL,
  amount INTEGER NOT NULL,            -- total amount in cents
  platform_fee INTEGER NOT NULL,      -- platform fee in cents
  vendor_payout INTEGER NOT NULL,     -- vendor receives in cents
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'authorized', 'captured', 'refunded', 'failed'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_booking ON transactions(booking_request_id);
CREATE INDEX idx_transactions_stripe_pi ON transactions(stripe_payment_intent_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- RLS Policies
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Users can view transactions for their bookings
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.booking_requests br
      WHERE br.id = booking_request_id
        AND (br.couple_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.vendor_profiles vp
            WHERE vp.id = br.vendor_profile_id AND vp.user_id = auth.uid()
          ))
    )
  );

-- Service role handles inserts/updates (via webhook)
CREATE POLICY "Service role can manage transactions"
  ON public.transactions FOR ALL
  USING (true)
  WITH CHECK (true);
