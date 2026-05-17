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
| Multi-team capacity | New `vendor_profiles.concurrent_capacity` integer (default 1). Conflict only triggers when overlap count would exceed capacity. Studios with multiple teams set it higher. |
| Concurrency | App-level pre-check + `BEFORE INSERT` trigger with `SELECT … FOR UPDATE` on the vendor row to serialize concurrent inserts. Capacity-aware. |
| Vendor blocked dates | Yes — supports **both** full-day blocks AND time-range blocks (e.g., "Aug 15, 6pm–10pm"). |
| Vendor calendar UI | Minimal — list of upcoming events + a form to add/remove blocked dates (with full-day or time-range toggle) + capacity setting. No month-view widget. |
| Couple calendar UI | Yes — month-view widget on the booking flow shows unavailable dates greyed out. Drill-in on partial-availability days shows time blocks. Capacity-aware: a date is "fully unavailable" only when overlap count equals capacity. |
| Privacy | Couples see "unavailable" only. No distinction between "booked" vs "vendor blocked", no count. |
| Pending-conflict warning | When vendor opens a pending request that would overlap with another accepted booking OR another open pending request, show an inline warning ("This date conflicts with…"). They can still accept; trigger enforces capacity. |
| Calendar library | `react-day-picker` |

## 4. Schema

### New column on `vendor_profiles`

```sql
ALTER TABLE vendor_profiles
  ADD COLUMN concurrent_capacity integer NOT NULL DEFAULT 1
    CHECK (concurrent_capacity BETWEEN 1 AND 50);
```

Default 1 — single-team vendors. Studios with multiple crews set it higher via the vendor calendar settings UI. Hard cap at 50 to prevent input mistakes.

### New table — `vendor_calendar_holds`

```sql
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
```

`hold_range` is a `tstzrange` constructed from `event_date + event_start_time` to `event_date + event_end_time` (cast as `timestamp`, then `AT TIME ZONE 'UTC'` for canonical storage). For full-day vendor blocks, the range is `[date 00:00, date + 1 00:00)`. For time-range vendor blocks, the range is the exact `[block_start, block_end)`.

**Note on the dropped `EXCLUDE` constraint:** the original draft used `EXCLUDE USING gist` to enforce zero overlaps at DB level. Postgres can't conditionally allow N overlaps based on a value in another table, so we replace it with a capacity-aware `BEFORE INSERT` trigger (see below). Trigger uses `SELECT … FOR UPDATE` on the vendor's row to serialize concurrent inserts — atomically equivalent to the old constraint for capacity-1 vendors.

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

### Trigger 1: capacity check on insert into vendor_calendar_holds

```sql
CREATE OR REPLACE FUNCTION check_calendar_hold_capacity() RETURNS TRIGGER AS $$
DECLARE
  cap integer;
  cnt integer;
BEGIN
  -- Lock the vendor's row for the duration of this transaction.
  -- Forces concurrent inserts targeting the same vendor to serialize.
  SELECT concurrent_capacity INTO cap
    FROM vendor_profiles
    WHERE id = NEW.vendor_profile_id
    FOR UPDATE;

  -- Count existing overlapping holds for this vendor.
  SELECT COUNT(*) INTO cnt
    FROM vendor_calendar_holds
    WHERE vendor_profile_id = NEW.vendor_profile_id
      AND hold_range && NEW.hold_range;

  -- New row is not yet in the table — if cnt already meets capacity, reject.
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
```

The `SELECT … FOR UPDATE` on `vendor_profiles` is the lock anchor. Two concurrent transactions both trying to insert overlapping holds for the same vendor will serialize at that lock; the second one sees the first one's pending insert and re-evaluates `cnt`. (Postgres's MVCC means the second transaction sees row-level lock contention and blocks until the first commits.)

### Trigger 2: sync holds with bookings.status

```sql
CREATE OR REPLACE FUNCTION sync_booking_calendar_holds() RETURNS TRIGGER AS $$
DECLARE
  locking_statuses text[] := ARRAY['accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid', 'completed'];
  evt RECORD;
BEGIN
  IF NEW.status = ANY(locking_statuses) AND (OLD.status IS NULL OR NOT OLD.status = ANY(locking_statuses)) THEN
    -- Transitioned INTO a locking status: insert holds for all events.
    -- The capacity trigger will fire per row and raise if capacity is exceeded,
    -- causing the whole UPDATE to roll back.
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
2. Body:
   ```typescript
   { date: 'YYYY-MM-DD'; mode: 'full_day' } |
   { date: 'YYYY-MM-DD'; mode: 'time_range'; start_time: 'HH:mm'; end_time: 'HH:mm' }
   ```
3. INSERT into `vendor_calendar_holds` with `hold_type = 'vendor_blocked'`:
   - `mode = 'full_day'`: `hold_range = tstzrange(date 00:00, date+1 00:00, '[)')`
   - `mode = 'time_range'`: `hold_range = tstzrange(date + start_time, date + end_time, '[)')`
4. If capacity trigger raises `calendar_capacity_exceeded`, return 409 with "You're at full capacity on this date — cancel a booking first, or increase your concurrent capacity if you have a team."

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
2. **Block a date** form — a date picker + a toggle for "Full day" vs "Time range" + start/end time inputs when "Time range" is selected + "Block this date" button. Shows inline error if there's a conflicting booking that would exceed capacity.

3. **Concurrent capacity** setting — a small inline field: "I can handle **[1]** events at the same time" with a save button. Help text: "Increase this if you run multiple teams. Default 1." Persists to `vendor_profiles.concurrent_capacity`. Lowering capacity below current overlap count is rejected with a clear error.

### Vendor — pending request page: conflict warning

On the existing `/dashboard/bookings/[id]` page (vendor side), if the booking is in `pending` state, calculate whether accepting it would conflict:

- Query `vendor_calendar_holds` for any overlapping holds.
- If overlap count + 1 > `concurrent_capacity`, render an inline warning above the Accept button:
  > ⚠️ **Heads up — this conflicts with an existing booking.**
  > Accepting will put you over your concurrent capacity ({count} overlapping). [View calendar →]

The Accept button stays enabled — the trigger ultimately enforces capacity, but the warning prevents accidental conflicts.

Sidebar nav: add "Calendar" link under "Notifications" in the dashboard layout.

## 7. Files affected

**New files:**
- `supabase/migrations/00032_create_vendor_calendar_holds.sql` — `concurrent_capacity` column + table + indexes + RLS + capacity trigger + status-sync trigger
- `src/services/availability.service.ts` — `checkOverlap(vendor, range)`, `getUnavailableRanges(vendor, from, to)`, `wouldExceedCapacity(vendor, range)`
- `src/app/api/vendors/[slug]/availability/route.ts` — GET endpoint with 60s server-side cache
- `src/app/api/vendor-calendar/block/route.ts` — POST (full_day | time_range)
- `src/app/api/vendor-calendar/block/[id]/route.ts` — DELETE
- `src/app/api/vendor-calendar/capacity/route.ts` — PATCH for `concurrent_capacity`
- `src/app/dashboard/profile/calendar/page.tsx` — vendor calendar page (server component)
- `src/components/dashboard/CalendarHoldsList.tsx` — upcoming list (client)
- `src/components/dashboard/BlockDateForm.tsx` — block-a-date form with full-day/time-range toggle (client)
- `src/components/dashboard/CapacityField.tsx` — inline capacity setting (client)
- `src/components/dashboard/ConflictWarning.tsx` — warning banner shown on vendor's pending request page
- `src/components/marketplace/AvailabilityCalendar.tsx` — couple-side react-day-picker wrapper
- `src/__tests__/services/availability.service.test.ts`
- `src/__tests__/api/vendor-calendar.test.ts`
- `src/__tests__/integration/calendar-holds-trigger.test.ts` — integration test against a real (dev) DB verifying both triggers + capacity-aware concurrency
- `tests/e2e/calendar.spec.ts` — 4 e2e tests (see §10)

**Modified files:**
- `src/app/(marketplace)/vendors/[slug]/book/page.tsx` — integrate AvailabilityCalendar in place of plain date inputs
- `src/app/api/bookings/route.ts` (POST) — call `wouldExceedCapacity` before INSERT (preview check, doesn't lock — definitive check happens at vendor accept)
- `src/app/api/bookings/[id]/accept/route.ts` — call `wouldExceedCapacity` before UPDATE; catch trigger exception as 409
- `src/app/dashboard/bookings/[id]/page.tsx` — render ConflictWarning when this is a pending request that would exceed capacity
- `src/app/dashboard/layout.tsx` — add "Calendar" sidebar link for vendors

## 8. Migration

```sql
-- 00032_create_vendor_calendar_holds.sql
-- Goal: prevent double-bookings at the DB level via a capacity-aware
-- BEFORE INSERT trigger on vendor_calendar_holds. Second trigger syncs
-- holds with bookings.status transitions.

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
  );

-- Capacity check trigger (full body — see §4 trigger 1)
CREATE OR REPLACE FUNCTION check_calendar_hold_capacity() RETURNS TRIGGER AS $$
DECLARE
  cap integer;
  cnt integer;
BEGIN
  SELECT concurrent_capacity INTO cap FROM vendor_profiles WHERE id = NEW.vendor_profile_id FOR UPDATE;
  SELECT COUNT(*) INTO cnt FROM vendor_calendar_holds
    WHERE vendor_profile_id = NEW.vendor_profile_id AND hold_range && NEW.hold_range;
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

-- Status-sync trigger (full body — see §4 trigger 2)
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
2. Vendor accepts a booking; race-tests concurrency: simulate two API calls accepting two different pending bookings for the same time slot for a capacity-1 vendor — assert exactly one succeeds with 200, other gets 409.
3. **Multi-team test**: seed a vendor with `concurrent_capacity = 2`. Submit 3 bookings for the same time slot. Assert 2 accept successfully, 3rd fails with 409.
4. Vendor blocks a date (full-day) via dashboard form → date appears as unavailable on the couple's booking calendar. Vendor blocks a time-range → only that range appears unavailable; rest of the day available.

## 10. Decisions log (resolved 2026-05-17)

1. **Vendor blocks** — support both full-day and time-range blocks via a mode toggle in the block form.
2. **Multi-team capacity** — new `vendor_profiles.concurrent_capacity` integer (default 1). Conflict only when overlap count meets capacity. Capacity-aware DB trigger replaces the original EXCLUDE constraint.
3. **Pending-conflict warning** — yes, render on the vendor's booking detail page when a pending request would exceed capacity. Vendor can still accept (trigger ultimately enforces capacity).
4. **Multi-event bookings** — all-or-nothing at submission. If one event in a 3-event booking conflicts, reject the whole submission with the conflicting event called out.
5. **Availability window** — 12 months forward. Past dates disabled via `react-day-picker`'s `disabled={{ before: today }}`.

## 11. Recurring blocks — explicitly deferred

Some vendors want "every Sunday morning blocked" or "I don't work Mondays." This sub-project ships single-instance blocks only. Vendors add multiple manually as needed. Recurring rules (RRULE-style) are a future polish, not a P0.
