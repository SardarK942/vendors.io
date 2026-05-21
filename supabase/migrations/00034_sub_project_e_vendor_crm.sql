-- 00034_sub_project_e_vendor_crm.sql
-- Sub-project E — vendor dashboard CRM redesign
-- See docs/superpowers/specs/2026-05-20-sub-project-e-vendor-dashboard-crm-design.md §8
--
-- Three additive changes. All non-destructive — safe to roll forward without backfill.
-- Idempotent: safe to re-run after a partial-apply failure.

------------------------------------------------------------------------
-- Change 1: booking_events.vendor_notes + booking_events_public view
------------------------------------------------------------------------

ALTER TABLE booking_events
  ADD COLUMN IF NOT EXISTS vendor_notes text;

COMMENT ON COLUMN booking_events.vendor_notes IS
  'Private vendor-only notes. Never returned to couple-side queries. Max ~5KB (UX-enforced, not DB-constrained).';

-- RLS: vendor can UPDATE notes on their own booking_events.
-- (SELECT is already governed by existing booking_events policies.)
DROP POLICY IF EXISTS "Vendors can update vendor_notes on own booking_events"
  ON booking_events;
CREATE POLICY "Vendors can update vendor_notes on own booking_events"
  ON booking_events FOR UPDATE
  USING (
    booking_id IN (
      SELECT b.id
      FROM bookings b
      JOIN vendor_profiles vp ON vp.id = b.vendor_profile_id
      WHERE vp.user_id = auth.uid()
    )
  );

-- Public view (couple-side reads must go through this — Postgres RLS can't filter columns).
-- Explicitly enumerates safe columns from booking_events; vendor_notes is omitted.
-- security_invoker = on ensures the view propagates the calling user's identity to RLS
-- on the underlying booking_events table (default is off in PG 15+, which would bypass RLS).
CREATE OR REPLACE VIEW booking_events_public
  WITH (security_invoker = on)
  AS
  SELECT id, booking_id, sequence, event_date, event_start_time, event_end_time,
         event_type_label, location_name, address_line_1, city, state, postal_code,
         google_place_id, guest_count_override, location_overridden,
         completed_at, created_at
  FROM booking_events;

COMMENT ON VIEW booking_events_public IS
  'Couple-safe projection of booking_events. Excludes vendor_notes. All couple-facing code must read from this view, not from booking_events directly.';

------------------------------------------------------------------------
-- Change 2: vendor_profile_views
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_profile_views (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  viewer_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  ip_hash           text NOT NULL,
  user_agent        text,
  viewed_at         timestamptz NOT NULL DEFAULT now()
);

-- Dedupe via expression-based unique index (inline UNIQUE doesn't allow expressions in PG).
-- AT TIME ZONE 'UTC' is required: date_trunc on timestamptz is STABLE (depends on session
-- timezone), but index expressions must be IMMUTABLE. Casting to UTC removes the
-- timezone dependency. Matches the daily-salt convention used by computeIpHash() which
-- builds keys from UTC day boundaries.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_profile_views_dedupe_idx
  ON vendor_profile_views
  (vendor_profile_id, ip_hash, (date_trunc('day', viewed_at AT TIME ZONE 'UTC')));

CREATE INDEX IF NOT EXISTS vendor_profile_views_vendor_idx
  ON vendor_profile_views (vendor_profile_id, viewed_at DESC);

ALTER TABLE vendor_profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can read their own views" ON vendor_profile_views;
CREATE POLICY "Vendors can read their own views"
  ON vendor_profile_views FOR SELECT
  USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

-- INSERT happens via service_role from server actions; no INSERT policy needed.

------------------------------------------------------------------------
-- Change 3: payouts + payout_bookings
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payouts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id   uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  stripe_payout_id    text UNIQUE NOT NULL,
  amount_cents        integer NOT NULL CHECK (amount_cents > 0),
  currency            text NOT NULL DEFAULT 'usd',
  status              text NOT NULL CHECK (status IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  arrival_date        date,
  failure_message     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_vendor_date_idx
  ON payouts (vendor_profile_id, arrival_date DESC);

CREATE TABLE IF NOT EXISTS payout_bookings (
  payout_id  uuid NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (payout_id, booking_id)
);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can read their own payouts" ON payouts;
CREATE POLICY "Vendors can read their own payouts"
  ON payouts FOR SELECT
  USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

ALTER TABLE payout_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can read payout_bookings for their payouts" ON payout_bookings;
CREATE POLICY "Vendors can read payout_bookings for their payouts"
  ON payout_bookings FOR SELECT
  USING (
    payout_id IN (
      SELECT id FROM payouts
      WHERE vendor_profile_id IN (
        SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
      )
    )
  );
