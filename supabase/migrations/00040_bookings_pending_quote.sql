-- Adds support for "Custom Request" bookings:
-- 1. New `event_type` column (text, nullable) — categorizes the requested event
--    (mehndi / sangeet / ceremony / reception / etc.). Nullable because regular
--    package bookings don't populate it Day-1.
-- 2. Allow 'pending_quote' in the bookings.status CHECK constraint.
--    pending_quote = couple submitted a custom request; vendor hasn't quoted yet.
-- 3. Relax bookings.total_price_positive: pending_quote rows have no price yet
--    (total_price_cents = 0 until vendor flips to adjusted_quote_sent).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS event_type text;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'pending_quote'::text,
    'deposit_paid'::text,
    'couple_cancelled'::text,
    'vendor_cancelled'::text,
    'cancelled_mutual'::text,
    'completed'::text,
    'expired'::text,
    'disputed'::text,
    'accepted'::text,
    'adjusted_quote_sent'::text,
    'adjusted_quote_declined'::text
  ]));

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS total_price_positive;
ALTER TABLE bookings ADD CONSTRAINT total_price_positive
  CHECK (total_price_cents > 0 OR status = 'pending_quote');
