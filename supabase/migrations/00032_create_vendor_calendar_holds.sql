-- 00032_create_vendor_calendar_holds.sql
-- Sub-project G — calendar / double-booking prevention.
-- See docs/superpowers/specs/2026-05-17-sub-project-g-calendar-design.md

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE vendor_profiles
  ADD COLUMN concurrent_capacity integer NOT NULL DEFAULT 1
    CHECK (concurrent_capacity BETWEEN 1 AND 50);

CREATE TABLE vendor_calendar_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  booking_event_id uuid REFERENCES booking_events(id) ON DELETE CASCADE,
  hold_type text NOT NULL CHECK (hold_type IN ('booking', 'vendor_blocked')),
  hold_range tstzrange NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_calendar_holds_vendor_range_idx
  ON vendor_calendar_holds USING gist (vendor_profile_id, hold_range);

CREATE INDEX vendor_calendar_holds_booking_event_idx
  ON vendor_calendar_holds (booking_event_id) WHERE booking_event_id IS NOT NULL;

ALTER TABLE vendor_calendar_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors see own calendar holds" ON vendor_calendar_holds
  FOR SELECT TO authenticated
  USING (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Vendors manage own vendor_blocked holds" ON vendor_calendar_holds
  FOR ALL TO authenticated
  USING (
    hold_type = 'vendor_blocked'
    AND vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    hold_type = 'vendor_blocked'
    AND vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

-- Trigger 1: capacity check on insert
CREATE OR REPLACE FUNCTION check_calendar_hold_capacity() RETURNS TRIGGER AS $$
DECLARE
  cap integer;
  cnt integer;
BEGIN
  SELECT concurrent_capacity INTO cap
    FROM vendor_profiles
    WHERE id = NEW.vendor_profile_id
    FOR UPDATE;

  SELECT COUNT(*) INTO cnt
    FROM vendor_calendar_holds
    WHERE vendor_profile_id = NEW.vendor_profile_id
      AND hold_range && NEW.hold_range;

  IF cnt >= cap THEN
    RAISE EXCEPTION 'calendar_capacity_exceeded'
      USING DETAIL = format('vendor_profile_id=%s, capacity=%s, overlap_count=%s', NEW.vendor_profile_id, cap, cnt);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_calendar_hold_capacity
  BEFORE INSERT ON vendor_calendar_holds
  FOR EACH ROW
  EXECUTE FUNCTION check_calendar_hold_capacity();

-- Trigger 2: sync holds with bookings.status transitions
CREATE OR REPLACE FUNCTION sync_booking_calendar_holds() RETURNS TRIGGER AS $$
DECLARE
  locking_statuses text[] := ARRAY['accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid', 'completed'];
  evt RECORD;
BEGIN
  IF NEW.status = ANY(locking_statuses) AND (OLD.status IS NULL OR NOT OLD.status = ANY(locking_statuses)) THEN
    FOR evt IN
      SELECT id, event_date, event_start_time, event_end_time
      FROM booking_events WHERE booking_id = NEW.id
    LOOP
      -- event_start_time / event_end_time are already timestamptz (full timestamp);
      -- event_date is denormalized for indexing. Use the timestamps directly.
      INSERT INTO vendor_calendar_holds (vendor_profile_id, booking_event_id, hold_type, hold_range)
      VALUES (
        NEW.vendor_profile_id, evt.id, 'booking',
        tstzrange(evt.event_start_time, evt.event_end_time, '[)')
      );
    END LOOP;
  ELSIF NOT NEW.status = ANY(locking_statuses) AND OLD.status = ANY(locking_statuses) THEN
    DELETE FROM vendor_calendar_holds WHERE booking_event_id IN (
      SELECT id FROM booking_events WHERE booking_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_booking_status_change_sync_holds
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_booking_calendar_holds();

-- Backfill: any already-accepted+ bookings get retroactive holds
INSERT INTO vendor_calendar_holds (vendor_profile_id, booking_event_id, hold_type, hold_range)
SELECT
  b.vendor_profile_id, e.id, 'booking',
  tstzrange(e.event_start_time, e.event_end_time, '[)')
FROM bookings b
JOIN booking_events e ON e.booking_id = b.id
WHERE b.status IN ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid', 'completed');
