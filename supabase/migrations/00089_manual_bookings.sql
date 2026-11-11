-- 00089_manual_bookings.sql
-- Manual (off-platform) bookings: a vendor logs a gig they booked off Baazar
-- (e.g. via Instagram/DM). These have no couple account and no Baazar deposit.
--
-- They DO appear on the vendor's calendar (via the existing
-- sync_booking_calendar_holds trigger once they reach a locking status) and in
-- the vendor Bookings list, but are EXCLUDED from earnings/analytics — see the
-- `source <> 'manual'` filter in getVendorAttribution (payment.attribution.ts).
--
-- Apply: dev via psql (Claude); prod via Supabase SQL editor (user).

BEGIN;

-- Distinguishes a vendor-logged off-platform booking from a normal platform one.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'platform'
    CHECK (source IN ('platform', 'manual'));

-- Off-platform customers have no Baazar account, so the couple FK may be null —
-- but ONLY for manual bookings. Platform bookings still require a couple.
ALTER TABLE bookings ALTER COLUMN couple_user_id DROP NOT NULL;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_couple_required_unless_manual;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_couple_required_unless_manual
    CHECK (couple_user_id IS NOT NULL OR source = 'manual');

CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings(source);

-- A manual booking may be logged without a price (value is optional), so relax
-- the positive-price constraint to permit a $0 total when source = 'manual'.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS total_price_positive;
ALTER TABLE bookings ADD CONSTRAINT total_price_positive
  CHECK (total_price_cents > 0 OR status = 'pending_quote' OR source = 'manual');

COMMIT;

-- Refresh PostgREST's schema cache so the new `source` column is usable
-- immediately (otherwise: "Could not find the 'source' column ... in the
-- schema cache"). Safe to run repeatedly.
NOTIFY pgrst, 'reload schema';
