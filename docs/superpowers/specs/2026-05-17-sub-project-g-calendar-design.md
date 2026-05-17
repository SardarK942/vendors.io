# Sub-project G — Calendar / Double-Booking Prevention

**Date:** 2026-05-17
**Status:** Design (pending user review)
**Predecessors:** A (packages + booking_events model), B (vendor onboarding), F (notifications). All shipped to main 2026-05-16.

---

## 1. Goal

Prevent double-bookings at the database level (atomic, race-proof). Give vendors a way to mark dates as unavailable. Give couples a visual calendar in the booking flow showing which dates have vendor availability. Use the existing `booking_events` time-overlap structure — no new event model.

## 2. Non-goals

- **Travel-time buffer** between back-to-back events — deferred to a vendor-settings sub-project.
- **Full month-view calendar UI on vendor dashboard** — vendors get a simpler list of upcoming events + an "add blocked date" form. Full calendar widget deferred.
- **Multi-vendor concurrency** — out of scope; each vendor's calendar is independent.
- **Recurring blocked dates** (e.g., "every Sunday") — single-date blocks only for MVP. Vendors can add multiple individually.
- **Time-of-day granularity for vendor blocks** — vendor blocks are full-day. Bookings remain time-granular.
- **Notification on conflict** — couple sees inline error at submission; not adding a notification type. Existing pattern (toast + form error) is sufficient.
- **Pre-existing booking_events overlap detection (data migration)** — assume any pre-existing data was test data and won't have real overlaps. If it does, the migration's CHECK will fail and we'll resolve manually.

## 3. Locked decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Lock point | From `status = 'accepted'` onwards. Auto-unlock on cancellation / expiry. |
| Granularity | Time overlap. Two events conflict only if their (start, end) ranges intersect on the same date. |
| Concurrency | DB-level `EXCLUDE USING gist` constraint. App-level pre-check for friendly UX. |
| Vendor blocked dates | Yes, full-day, single-date entries via small dashboard form. |
| Vendor calendar UI | Minimal — list of upcoming events + a form to add/remove blocked dates. No month-view widget. |
| Couple calendar UI | Yes — month-view widget on the booking flow shows unavailable dates greyed out. Drill-in on partial-availability days shows time blocks. |
| Privacy | Couples see "unavailable" only. No distinction between "booked" vs "vendor blocked", no count. |
| Calendar library | `react-day-picker` |

## 4. Schema

### New table — `vendor_calendar_holds`

```sql
CREATE TABLE vendor_calendar_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  booking_event_id uuid REFERENCES booking_events(id) ON DELETE CASCADE,
  hold_type text NOT NULL CHECK (hold_type IN ('booking', 'vendor_blocked')),
  hold_range tstzrange NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (
    vendor_profile_id WITH =,
    hold_range WITH &&
  )
);

CREATE INDEX vendor_calendar_holds_vendor_range_idx
  ON vendor_calendar_holds USING gist (vendor_profile_id, hold_range);

CREATE INDEX vendor_calendar_holds_booking_event_idx
  ON vendor_calendar_holds (booking_event_id) WHERE booking_event_id IS NOT NULL;

ALTER TABLE vendor_calendar_holds ENABLE ROW LEVEL SECURITY;
```

`hold_range` is a `tstzrange` constructed from `event_date + event_start_time` to `event_date + event_end_time` (cast as `timestamp`, then `AT TIME ZONE 'UTC'` for canonical storage). For vendor blocks, it's `[date, date + interval '1 day')` — full-day half-open range.

### RLS policies

```sql
-- Vendors see their own holds
CREATE POLICY "Vendors see own calendar holds"
  ON vendor_calendar_holds FOR SELECT
  TO authenticated
  USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

-- Vendors insert/delete their own vendor_blocked holds only
CREATE POLICY "Vendors manage own vendor_blocked holds"
  ON vendor_calendar_holds FOR ALL
  TO authenticated
  USING (
    hold_type = 'vendor_blocked'
    AND vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

-- Booking-type holds are service-role only (managed by trigger).
-- Anonymous reads are NOT allowed at the RLS level; couples query availability
-- via a server-side endpoint that returns deduplicated date ranges only.
```

### Trigger: sync holds with bookings

```sql
CREATE OR REPLACE FUNCTION sync_booking_calendar_holds() RETURNS TRIGGER AS $$
DECLARE
  locking_statuses text[] := ARRAY['accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid', 'completed'];
  evt RECORD;
BEGIN
  -- On status change, decide whether to create or delete holds for this booking's events.
  IF NEW.status = ANY(locking_statuses) AND (OLD.status IS NULL OR NOT OLD.status = ANY(locking_statuses)) THEN
    -- Transitioned INTO a locking status: insert holds for all events
    FOR evt IN
      SELECT id, event_date, event_start_time, event_end_time
      FROM booking_events WHERE booking_id = NEW.id
    LOOP
      INSERT INTO vendor_calendar_holds (vendor_profile_id, booking_event_id, hold_type, hold_range)
      VALUES (
        NEW.vendor_profile_id,
        evt.id,
        'booking',
        tstzrange(
          (evt.event_date + evt.event_start_time)::timestamp AT TIME ZONE 'UTC',
          (evt.event_date + evt.event_end_time)::timestamp AT TIME ZONE 'UTC',
          '[)'
        )
      );
    END LOOP;
  ELSIF NOT NEW.status = ANY(locking_statuses) AND OLD.status = ANY(locking_statuses) THEN
    -- Transitioned OUT of a locking status: delete this booking's holds
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
```

Trigger handles: status `pending → accepted` (creates holds), status `accepted → cancelled` (deletes holds), status `expired` (deletes holds), etc.

**Edge case:** When `vendorAcceptBooking()` runs the trigger, the EXCLUDE constraint kicks in if there's a conflict (e.g., vendor accidentally accepted two pending requests for the same time). Trigger raises a constraint violation. App layer must pre-check and offer a friendly error.

**Edge case:** Booking events are immutable post-acceptance (current model — verified). If we add an "edit event time" feature later, we'd need an `UPDATE` trigger on `booking_events`. Out of scope for G.

## 5. Conflict-check flow

### Couple submits booking → `/api/bookings` POST

1. Validate booking input (existing).
2. **NEW:** For each proposed `booking_event` (date + start + end), call `availabilityService.checkOverlap(vendor_profile_id, event_date, start, end)` which does a SELECT against `vendor_calendar_holds`. If any overlap → return 409 with friendly error including the conflicting date.
3. If clear, proceed with existing INSERT logic. Booking goes to `pending` — no hold inserted yet (trigger only fires on locking-status transitions).

### Vendor accepts booking → `/api/bookings/[id]/accept` POST

1. Existing logic transitions status `pending → accepted`.
2. **The trigger fires** and inserts holds. If a conflict exists (e.g., vendor accepted two pendings for same date), the EXCLUDE constraint raises an exception, the trigger fails, the UPDATE rolls back, and the API returns 409.
3. App layer pre-checks (the same `checkOverlap` call) before the UPDATE to provide a clean error path. The EXCLUDE constraint is the safety net for races, not the primary error surface.

### Couple-side calendar availability → `/api/vendors/[slug]/availability` GET

Returns a list of unavailable date ranges for a vendor, used to populate the booking-flow calendar:

```typescript
{
  unavailable: Array<{
    date: string;       // 'YYYY-MM-DD'
    fully_blocked: boolean;
    busy_ranges: Array<{ start: string; end: string }>;  // empty if fully_blocked
  }>;
}
```

Privacy filter: only return "unavailable" — no booking-vs-vendor-block distinction. Return ranges for the next 12 months from today. Cache server-side for 60 seconds (acceptable staleness vs DB load).

### Vendor blocks a date → `/api/vendor-calendar/block` POST

1. `requireUser` + must own the vendor_profile.
2. Body: `{ date: 'YYYY-MM-DD' }`.
3. INSERT into `vendor_calendar_holds` with `hold_type = 'vendor_blocked'` and `hold_range = tstzrange(date, date + interval '1 day', '[)')`.
4. If EXCLUDE conflict (vendor already has a booking on that date), return 409 with "You already have a booking on this date — cancel it first, or pick another date."

### Vendor unblocks a date → `/api/vendor-calendar/block/[id]` DELETE

1. `requireUser` + must own the row.
2. Only allowed for `hold_type = 'vendor_blocked'` (RLS enforces this).
3. Hard DELETE.

## 6. UI surfaces

### Couple booking flow — calendar widget

Modify the existing event-date input on the booking page (`/vendors/[slug]/book`). Today it's likely a `<input type="date">`. Replace with `react-day-picker` configured to:

- Show 1 month at a time, with prev/next navigation.
- Fetch `/api/vendors/[slug]/availability` on mount.
- Render fully-blocked dates as disabled (greyed, non-clickable).
- Render partial-availability dates as `bg-yellow-100` with a small tooltip "limited availability — pick a time" (drill-in details surfaced after date selection).
- Render fully-available dates as normal.
- Below the calendar, after a date is picked, render start/end time inputs. If the picked date is partially blocked, render a "Busy: 10am – 12pm, 4pm – 7pm" hint below the time inputs.
- Disable past dates and dates >12 months out.

For multi-event bookings (Desi weddings), repeat per event slot — each event has its own date picker. Each picker fetches the same availability data (one network call total, cached client-side).

### Vendor dashboard — calendar holds section

New section on `/dashboard/profile/calendar` (new route). Two parts:

1. **Upcoming list** — shows the next 90 days of holds (bookings + vendor-blocks) in a simple list. Each item:
   ```
   2026-08-15  Mehndi for Jane S.        10:00 – 12:00   [Booking]
   2026-09-01  Personal day                 (full day)   [Blocked]  [Unblock]
   ```
2. **Block a date** form — a date picker + "Block this date" button. Shows inline error if there's a conflicting booking on the chosen date.

Sidebar nav: add "Calendar" link under "Notifications" in the dashboard layout.

## 7. Files affected

**New files:**
- `supabase/migrations/00032_create_vendor_calendar_holds.sql` — table + indexes + RLS + trigger function + trigger
- `src/services/availability.service.ts` — `checkOverlap`, `getUnavailableRanges` (the server-side query helpers)
- `src/app/api/vendors/[slug]/availability/route.ts` — GET endpoint with 60s server-side cache
- `src/app/api/vendor-calendar/block/route.ts` — POST
- `src/app/api/vendor-calendar/block/[id]/route.ts` — DELETE
- `src/app/dashboard/profile/calendar/page.tsx` — vendor calendar page (server component)
- `src/components/dashboard/CalendarHoldsList.tsx` — upcoming list (client)
- `src/components/dashboard/BlockDateForm.tsx` — block-a-date form (client)
- `src/components/marketplace/AvailabilityCalendar.tsx` — couple-side react-day-picker wrapper
- `src/__tests__/services/availability.service.test.ts`
- `src/__tests__/api/vendor-calendar.test.ts`
- `src/__tests__/integration/calendar-holds-trigger.test.ts` — integration test against a real (dev) DB verifying trigger fires + EXCLUDE constraint blocks races
- `tests/e2e/calendar.spec.ts` — 3 e2e tests (see §10)

**Modified files:**
- `src/app/(marketplace)/vendors/[slug]/book/page.tsx` — integrate AvailabilityCalendar in place of plain date inputs
- `src/app/api/bookings/route.ts` (POST) — call `checkOverlap` before INSERT
- `src/app/api/bookings/[id]/accept/route.ts` — call `checkOverlap` before UPDATE; catch EXCLUDE constraint violation as 409
- `src/app/dashboard/layout.tsx` — add "Calendar" sidebar link for vendors

## 8. Migration

```sql
-- 00032_create_vendor_calendar_holds.sql
-- Goal: prevent double-bookings at the DB level via an EXCLUDE constraint
-- over (vendor_profile_id, hold_range tstzrange). Trigger syncs holds with
-- bookings.status transitions.

-- Enable btree_gist for the GIST exclusion constraint with the equality op
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE vendor_calendar_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  booking_event_id uuid REFERENCES booking_events(id) ON DELETE CASCADE,
  hold_type text NOT NULL CHECK (hold_type IN ('booking', 'vendor_blocked')),
  hold_range tstzrange NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (vendor_profile_id WITH =, hold_range WITH &&)
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
  );

-- Trigger function (full body — see §4)
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
      INSERT INTO vendor_calendar_holds (vendor_profile_id, booking_event_id, hold_type, hold_range)
      VALUES (
        NEW.vendor_profile_id, evt.id, 'booking',
        tstzrange(
          (evt.event_date + evt.event_start_time)::timestamp AT TIME ZONE 'UTC',
          (evt.event_date + evt.event_end_time)::timestamp AT TIME ZONE 'UTC',
          '[)'
        )
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

-- Backfill: for any already-accepted+ bookings, populate holds.
-- (Should be a no-op on prod since fake data will be wiped pre-launch, but
-- safe to include for dev convenience.)
INSERT INTO vendor_calendar_holds (vendor_profile_id, booking_event_id, hold_type, hold_range)
SELECT
  b.vendor_profile_id,
  e.id,
  'booking',
  tstzrange(
    (e.event_date + e.event_start_time)::timestamp AT TIME ZONE 'UTC',
    (e.event_date + e.event_end_time)::timestamp AT TIME ZONE 'UTC',
    '[)'
  )
FROM bookings b
JOIN booking_events e ON e.booking_id = b.id
WHERE b.status IN ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid', 'completed')
ON CONFLICT DO NOTHING;
```

## 9. Testing

**Unit:**
- `availability.service.test.ts` — `checkOverlap` returns true/false for ~12 boundary cases (back-to-back, overlapping by 1min, fully nested, etc.) using a mocked Supabase client.

**Integration (against dev DB):**
- `calendar-holds-trigger.test.ts` — fires UPDATE bookings.status transitions, asserts holds table mutates correctly. Tests the trigger end-to-end. Tests the EXCLUDE constraint by attempting to INSERT a conflicting row directly.

**API:**
- `vendor-calendar.test.ts` — POST /block + DELETE /block/[id] + 409 on conflict.

**E2E (`tests/e2e/calendar.spec.ts`):**
1. Couple submits booking for available date → succeeds. Submits for same date/time again → 409 inline error. Submits for different time same date → succeeds.
2. Vendor accepts a booking; race-tests concurrency: simulate two API calls accepting two different pending bookings for the same time slot — assert exactly one succeeds with 200, other gets 409.
3. Vendor blocks a date via dashboard form → date now appears as unavailable on the couple's booking calendar for that vendor.

## 10. Open questions for user review

1. **Vendor blocks for time ranges vs full days only** — spec locks full-day blocks. Some vendors might want to block "Sundays 9am – 12pm" (regular service commitment). Defer this complexity?
2. **Availability lookback window** — spec returns "next 12 months." Should past dates also be flagged unavailable? Decision: yes, automatically — `react-day-picker` `disabled={{ before: new Date() }}` covers this. No need for special handling.
3. **Multi-event bookings** — when a couple submits a booking with 3 events (mehndi, sangeet, reception) and event 2 conflicts but events 1 and 3 are free, what happens? Spec: all-or-nothing — reject the entire submission with a friendly error pointing at the conflicting event. Couple resubmits with different times. Reasonable?
4. **Vendor's own pre-existing bookings (today's `pending` state)** — if a vendor had two `pending` requests for the same date and time, today the system allows both. After G ships, the moment they accept one, the other will fail on accept. UX: should the vendor see a warning ("This request conflicts with another pending request you've accepted") when viewing the second one? Defer or include?
