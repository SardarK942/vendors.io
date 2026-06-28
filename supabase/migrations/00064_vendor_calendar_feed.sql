-- vendor_profiles new columns (idempotent — supports re-runs after partial apply)
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS calendar_feed_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS calendar_feed_state text NOT NULL DEFAULT 'not_connected'
    CHECK (calendar_feed_state IN ('not_connected', 'pending', 'connected')),
  ADD COLUMN IF NOT EXISTS calendar_feed_intent_at timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_feed_intent_method text,
  ADD COLUMN IF NOT EXISTS calendar_feed_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_feed_connected_via_ua text,
  ADD COLUMN IF NOT EXISTS calendar_feed_nudge_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_confirmed_booking_at timestamptz;

-- polls table (service-role-only — no RLS policy needed)
CREATE TABLE IF NOT EXISTS vendor_calendar_feed_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  polled_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  recognized_provider text,
  ip_hash text,
  status_returned smallint NOT NULL DEFAULT 200
);
CREATE INDEX IF NOT EXISTS vendor_calendar_feed_polls_vendor_idx
  ON vendor_calendar_feed_polls (vendor_profile_id, polled_at DESC);

ALTER TABLE vendor_calendar_feed_polls ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies for non-service-role; service-role bypasses RLS.

-- Backfill first_confirmed_booking_at for vendors with existing confirmed bookings.
-- bookings.accepted_at does not exist on this schema — using created_at as the
-- best-effort proxy for "when did this vendor's first locked booking arrive."
-- The trigger below uses now() going forward, so backfill precision matters only
-- for vendors who already have locked bookings (and for them the prompt won't
-- re-fire on past bookings anyway — first_confirmed_booking_at just needs to be
-- non-null to keep the going-forward gate correct).
UPDATE vendor_profiles vp
SET first_confirmed_booking_at = sub.first_at
FROM (
  SELECT b.vendor_profile_id, MIN(b.created_at) AS first_at
  FROM bookings b
  WHERE b.status IN ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined',
                     'deposit_paid', 'completed')
  GROUP BY b.vendor_profile_id
) sub
WHERE vp.id = sub.vendor_profile_id
  AND vp.first_confirmed_booking_at IS NULL;

-- Trigger function: maintain first_confirmed_booking_at on status transitions
CREATE OR REPLACE FUNCTION sync_first_confirmed_booking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined',
                    'deposit_paid', 'completed')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('accepted', 'adjusted_quote_sent',
                                                    'adjusted_quote_declined',
                                                    'deposit_paid', 'completed')) THEN
    UPDATE vendor_profiles
    SET first_confirmed_booking_at = COALESCE(first_confirmed_booking_at, now())
    WHERE id = NEW.vendor_profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_first_confirmed_trigger ON bookings;
CREATE TRIGGER bookings_first_confirmed_trigger
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION sync_first_confirmed_booking();
