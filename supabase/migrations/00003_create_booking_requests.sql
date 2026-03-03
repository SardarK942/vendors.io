-- Booking requests table with state machine
CREATE TABLE public.booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,

  -- Booking details
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'engagement', 'mehndi', 'sangeet', 'wedding', 'reception', 'multiple'
  )),
  guest_count INTEGER,
  budget_min INTEGER,              -- in cents
  budget_max INTEGER,              -- in cents
  special_requests TEXT,

  -- State machine fields
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'quoted', 'deposit_paid', 'confirmed',
    'expired', 'declined', 'cancelled'
  )),

  -- Quote fields
  vendor_quote_amount INTEGER,     -- in cents
  vendor_quote_notes TEXT,
  vendor_responded_at TIMESTAMPTZ,

  -- Deposit fields
  deposit_amount INTEGER,          -- in cents
  deposit_paid_at TIMESTAMPTZ,
  stripe_payment_intent_id TEXT UNIQUE,

  -- Contact reveal fields (anti-backdooring)
  couple_contact_revealed BOOLEAN DEFAULT FALSE,
  couple_phone TEXT,
  couple_email TEXT,

  -- Timestamps
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_booking_requests_couple ON booking_requests(couple_user_id);
CREATE INDEX idx_booking_requests_vendor ON booking_requests(vendor_profile_id);
CREATE INDEX idx_booking_requests_status ON booking_requests(status);
CREATE INDEX idx_booking_requests_expires ON booking_requests(expires_at) WHERE status = 'pending';

-- RLS Policies
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Couples can view their own booking requests
CREATE POLICY "Couples can view own requests"
  ON public.booking_requests FOR SELECT
  USING (auth.uid() = couple_user_id);

-- Vendors can view requests for their profiles
CREATE POLICY "Vendors can view requests for their profiles"
  ON public.booking_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_profiles
      WHERE id = vendor_profile_id AND user_id = auth.uid()
    )
  );

-- Couples can create booking requests
CREATE POLICY "Couples can create requests"
  ON public.booking_requests FOR INSERT
  WITH CHECK (
    auth.uid() = couple_user_id
    AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'couple'
    )
  );

-- Vendors can update requests for their profiles (submit quote, confirm)
CREATE POLICY "Vendors can update requests for their profiles"
  ON public.booking_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_profiles
      WHERE id = vendor_profile_id AND user_id = auth.uid()
    )
  );

-- Couples can update their own requests (cancel)
CREATE POLICY "Couples can update own requests"
  ON public.booking_requests FOR UPDATE
  USING (auth.uid() = couple_user_id);

-- Admins can do anything
CREATE POLICY "Admins can manage all booking requests"
  ON public.booking_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );
