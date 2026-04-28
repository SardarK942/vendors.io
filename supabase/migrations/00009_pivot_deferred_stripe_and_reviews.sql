-- Pivot to deferred Stripe onboarding + hybrid 30/70 split + reviews + 48h auto-complete.
-- Design doc: memory/stripe_deferred_onboarding_pivot.md
-- Existing test data (Noah's deposit_paid booking + authorized transaction) stays valid;
-- no data remap needed because we only *add* status values and *retire* unused ones.

-- ============================================================================
-- 1. booking_requests: new status values + completion/cancellation metadata
-- ============================================================================
-- Retired: 'confirmed' (deposit_paid is the confirmed state), 'cancelled' and 'declined'
-- (split into couple_cancelled / vendor_cancelled / cancelled_mutual / rejected).

ALTER TABLE public.booking_requests DROP CONSTRAINT booking_requests_status_check;

ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'quoted'::text,
    'rejected'::text,
    'deposit_paid'::text,
    'couple_cancelled'::text,
    'vendor_cancelled'::text,
    'cancelled_mutual'::text,
    'completed'::text,
    'expired'::text
  ]));

ALTER TABLE public.booking_requests
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancellation_reason TEXT;

CREATE INDEX idx_booking_requests_auto_complete
  ON public.booking_requests(event_date)
  WHERE status = 'deposit_paid';

-- ============================================================================
-- 2. transactions: ledger lifecycle + timestamps
-- ============================================================================
-- authorized -> recognized (24h grace) -> earned (event completed) -> paid-out (transferred_at set)
-- Refund path: any prior state -> refunded (partial supported via partial_refund).

ALTER TABLE public.transactions DROP CONSTRAINT transactions_status_check;

ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'authorized'::text,
    'recognized'::text,
    'earned'::text,
    'refunded'::text,
    'partial_refund'::text,
    'failed'::text
  ]));

ALTER TABLE public.transactions
  ADD COLUMN platform_fee_recognized_at TIMESTAMPTZ,
  ADD COLUMN vendor_earned_at TIMESTAMPTZ,
  ADD COLUMN refunded_at TIMESTAMPTZ,
  ADD COLUMN refund_amount_cents INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN transferred_at TIMESTAMPTZ,
  ADD COLUMN stripe_refund_id TEXT;

-- ============================================================================
-- 3. stripe_accounts: deferred onboarding + no-show freeze
-- ============================================================================
-- minimal_created_at: timestamp of Custom-account creation (vendor signed up with just country)
-- frozen_reason: null in normal state; 'no_show_strikes' after 2 no-shows in calendar year
-- no_show_count_year + no_show_year: tracked for annual reset (cron bumps no_show_year each Jan 1)

ALTER TABLE public.stripe_accounts
  ADD COLUMN minimal_created_at TIMESTAMPTZ,
  ADD COLUMN frozen_reason TEXT CHECK (frozen_reason IS NULL OR frozen_reason IN ('no_show_strikes', 'admin_freeze')),
  ADD COLUMN frozen_at TIMESTAMPTZ,
  ADD COLUMN no_show_count_year INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN no_show_year INTEGER;

-- ============================================================================
-- 4. vendor_profiles: review count denormalization
-- ============================================================================
-- average_rating already exists (numeric(3,2)). Add review_count.

ALTER TABLE public.vendor_profiles
  ADD COLUMN review_count INTEGER DEFAULT 0 NOT NULL;

-- ============================================================================
-- 5. reviews table (Airbnb-style multi-metric, couple-only, one per booking)
-- ============================================================================

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id UUID NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  rating_overall INTEGER NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_quality INTEGER CHECK (rating_quality BETWEEN 1 AND 5),
  rating_communication INTEGER CHECK (rating_communication BETWEEN 1 AND 5),
  rating_professionalism INTEGER CHECK (rating_professionalism BETWEEN 1 AND 5),
  rating_value INTEGER CHECK (rating_value BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT reviews_one_per_booking UNIQUE (booking_request_id)
);

CREATE INDEX idx_reviews_vendor ON public.reviews(vendor_profile_id);
CREATE INDEX idx_reviews_reviewer ON public.reviews(reviewer_user_id);
CREATE INDEX idx_reviews_created ON public.reviews(created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly viewable"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "Couples can create review for own completed booking"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_user_id
    AND EXISTS (
      SELECT 1 FROM public.booking_requests
      WHERE id = booking_request_id
        AND couple_user_id = auth.uid()
        AND status = 'completed'
    )
  );

CREATE POLICY "Couples can update own review"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = reviewer_user_id);

CREATE POLICY "Couples can delete own review"
  ON public.reviews FOR DELETE
  USING (auth.uid() = reviewer_user_id);

-- ============================================================================
-- 6. Trigger: keep vendor_profiles.review_count + average_rating in sync
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_vendor_review_stats()
RETURNS TRIGGER AS $$
DECLARE
  vp_id UUID := COALESCE(NEW.vendor_profile_id, OLD.vendor_profile_id);
BEGIN
  UPDATE public.vendor_profiles
  SET
    review_count = (SELECT count(*) FROM public.reviews WHERE vendor_profile_id = vp_id),
    average_rating = (
      SELECT ROUND(AVG(rating_overall)::numeric, 2)
      FROM public.reviews
      WHERE vendor_profile_id = vp_id
    )
  WHERE id = vp_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER reviews_recalc_vendor_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalc_vendor_review_stats();

-- ============================================================================
-- 7. Trigger: on booking → completed, flip transactions to earned
-- ============================================================================
-- Platform fee recognition normally happens on the daily cron (24h after capture).
-- If event completes before grace elapsed, recognize now (grace was irrelevant).

CREATE OR REPLACE FUNCTION public.on_booking_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.transactions
    SET
      status = 'earned',
      vendor_earned_at = now(),
      platform_fee_recognized_at = COALESCE(platform_fee_recognized_at, now())
    WHERE booking_request_id = NEW.id
      AND status IN ('authorized', 'recognized');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_completed_unlocks_transactions
  AFTER UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_booking_completed();
