-- Phase D product gaps: dispute window (D1), fault flag (D5), onboarding-pending timestamp (D4).

-- ──────────────────────────────────────────────────────────────────────────────
-- D1 — Dispute window on booking_requests
-- ──────────────────────────────────────────────────────────────────────────────
-- When a couple reports an issue with an event they attended, they flip the booking
-- to 'disputed'. Cron skips disputed bookings for auto-completion. Admin resolves manually.

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
    'expired'::text,
    'disputed'::text
  ]));

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

-- ──────────────────────────────────────────────────────────────────────────────
-- D5 — Fault flag on cancellations
-- ──────────────────────────────────────────────────────────────────────────────
-- Distinguishes "scheduling conflict 60 days out" from "no-showed the wedding".
-- Only fault='vendor_fault' triggers strike + claw + 100% refund via computeRefundPolicy.
-- Existing vendor_cancelled rows default to 'none' (safer than retroactive strikes).

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS cancellation_fault TEXT
    CHECK (cancellation_fault = ANY (ARRAY[
      'none'::text,
      'vendor_fault'::text,
      'force_majeure'::text
    ]));

-- ──────────────────────────────────────────────────────────────────────────────
-- D4 — Onboarding-pending timestamp on stripe_accounts
-- ──────────────────────────────────────────────────────────────────────────────
-- Set when Stripe's account.updated webhook reports details_submitted=true but
-- charges_enabled is still false. UI uses this to show "Stripe is verifying…" state.

ALTER TABLE public.stripe_accounts
  ADD COLUMN IF NOT EXISTS details_submitted_at TIMESTAMPTZ;

-- Backfill Noah's existing account so his EarningsCard doesn't show pending-verification
-- noise (he went through the old Standard flow which was already fully onboarded).
UPDATE public.stripe_accounts
  SET details_submitted_at = NOW()
  WHERE charges_enabled = true
    AND payouts_enabled = true
    AND details_submitted_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- Dispute-window index: find bookings whose event just ended and who haven't
-- marked complete or disputed yet. Used by the (future) dispute-window reminder cron.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_booking_requests_awaiting_completion
  ON public.booking_requests(event_date)
  WHERE status = 'deposit_paid';
