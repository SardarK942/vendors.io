-- ============================================================================
-- Sub-project A · Phase A1 · Step 2/7
-- Create booking_events table
-- ============================================================================
-- A booking is the contract; booking_events are the deliverable days under
-- it. Default 1 event per booking (single-day events). Multi-day bundles
-- (Mehndi + Shaadi + Walima at one vendor) have 2..N events.
--
-- The FK to bookings is added in migration 00017, after booking_requests is
-- renamed to bookings.
--
-- location fields capture the event venue per row — different events in a
-- multi-day booking may happen at different venues. address fields are
-- required (we always need to know where to serve/show up); location_name
-- is optional (e.g. mobile makeup at the client's home has no formal name).
-- google_place_id is optional to support free-form addresses.
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.1.

CREATE TABLE booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,  -- FK added in 00017 after table rename
  sequence integer NOT NULL CHECK (sequence >= 1),
  event_date date NOT NULL,
  event_start_time timestamptz NOT NULL,
  event_end_time timestamptz NOT NULL,
  event_type_label text NOT NULL,
  location_name text,
  address_line_1 text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  google_place_id text,
  guest_count_override integer,
  location_overridden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_end_time > event_start_time),
  UNIQUE (booking_id, sequence)
);

CREATE INDEX booking_events_booking_idx ON booking_events(booking_id);
CREATE INDEX booking_events_city_idx ON booking_events(city);
