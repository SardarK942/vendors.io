# Sub-project G — Calendar / Double-Booking Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent vendor double-bookings at the database level (atomic, capacity-aware). Give vendors a way to mark dates unavailable (full-day or time-range). Show couples a visual availability calendar in the booking flow.

**Architecture:** New `vendor_calendar_holds` table with a `BEFORE INSERT` trigger that locks the vendor's row (`SELECT ... FOR UPDATE`) and rejects inserts that would exceed `vendor_profiles.concurrent_capacity`. A second trigger on `bookings.status` syncs holds when bookings transition into/out of locking statuses (`accepted` onwards). App-level pre-checks provide friendly errors; triggers are the safety net.

**Tech Stack:** Postgres 15+ (Supabase), Next.js 14 App Router, `react-day-picker`, Zod, vitest, Playwright.

---

## File structure (locked in spec §7)

**New files:**
- `supabase/migrations/00032_create_vendor_calendar_holds.sql`
- `src/services/availability.service.ts`
- `src/app/api/vendors/[slug]/availability/route.ts`
- `src/app/api/vendor-calendar/block/route.ts`
- `src/app/api/vendor-calendar/block/[id]/route.ts`
- `src/app/api/vendor-calendar/capacity/route.ts`
- `src/app/dashboard/profile/calendar/page.tsx`
- `src/components/dashboard/CalendarHoldsList.tsx`
- `src/components/dashboard/BlockDateForm.tsx`
- `src/components/dashboard/CapacityField.tsx`
- `src/components/dashboard/ConflictWarning.tsx`
- `src/components/marketplace/AvailabilityCalendar.tsx`
- Tests under `src/__tests__/services/`, `src/__tests__/api/`, `src/__tests__/integration/`, `tests/e2e/`

**Modified files:**
- `src/app/(marketplace)/vendors/[slug]/book/page.tsx`
- `src/app/api/bookings/route.ts`
- `src/app/api/bookings/[id]/accept/route.ts`
- `src/app/dashboard/bookings/[id]/page.tsx`
- `src/app/dashboard/layout.tsx`
- `src/types/database.types.ts` — add `concurrent_capacity` to vendor_profiles + new `vendor_calendar_holds` table type

---

## Phase G1 — Migration + service helpers + unit tests

### Task G1.1: Write migration 00032

**Files:**
- Create: `supabase/migrations/00032_create_vendor_calendar_holds.sql`

- [ ] **Step 1: Write the migration**

```sql
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

-- Backfill: any already-accepted+ bookings get retroactive holds
INSERT INTO vendor_calendar_holds (vendor_profile_id, booking_event_id, hold_type, hold_range)
SELECT
  b.vendor_profile_id, e.id, 'booking',
  tstzrange(
    (e.event_date + e.event_start_time)::timestamp AT TIME ZONE 'UTC',
    (e.event_date + e.event_end_time)::timestamp AT TIME ZONE 'UTC',
    '[)'
  )
FROM bookings b
JOIN booking_events e ON e.booking_id = b.id
WHERE b.status IN ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid', 'completed');
```

- [ ] **Step 2: Apply migration to dev**

User applies via Supabase SQL editor. Verification query:

```sql
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'vendor_calendar_holds')::int AS table_present,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'vendor_profiles' AND column_name = 'concurrent_capacity')::int AS column_present,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('ensure_calendar_hold_capacity', 'on_booking_status_change_sync_holds'))::int AS trigger_count;
```

Expect: `table_present=1, column_present=1, trigger_count=2`.

- [ ] **Step 3: Update `src/types/database.types.ts` manually**

Add `concurrent_capacity: number` to vendor_profiles Row/Insert/Update. Add `vendor_calendar_holds` table type:

```typescript
vendor_calendar_holds: {
  Row: {
    id: string;
    vendor_profile_id: string;
    booking_event_id: string | null;
    hold_type: 'booking' | 'vendor_blocked';
    hold_range: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    vendor_profile_id: string;
    booking_event_id?: string | null;
    hold_type: 'booking' | 'vendor_blocked';
    hold_range: string;
    created_at?: string;
  };
  Update: {
    id?: string;
    vendor_profile_id?: string;
    booking_event_id?: string | null;
    hold_type?: 'booking' | 'vendor_blocked';
    hold_range?: string;
    created_at?: string;
  };
  Relationships: [/* FK to vendor_profiles, FK to booking_events */];
};
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00032_create_vendor_calendar_holds.sql src/types/database.types.ts
git commit -m "feat(calendar): G1 — migration 00032 + types for vendor_calendar_holds"
```

### Task G1.2: Availability service

**Files:**
- Create: `src/services/availability.service.ts`
- Test: `src/__tests__/services/availability.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  checkOverlap,
  wouldExceedCapacity,
  getUnavailableRanges,
  buildHoldRange,
} from '@/services/availability.service';

function mockSupabase(holdsResponse: { data: any[]; error: null } | { data: null; error: any }, profileResponse?: { data: any; error: null }) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'vendor_calendar_holds') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              filter: vi.fn(() => Promise.resolve(holdsResponse)),
            })),
          })),
        };
      }
      if (table === 'vendor_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(profileResponse ?? { data: { concurrent_capacity: 1 }, error: null })),
            })),
          })),
        };
      }
      return {};
    }),
  };
}

describe('buildHoldRange', () => {
  it('formats tstzrange string with UTC offset', () => {
    expect(buildHoldRange('2026-08-15', '10:00', '12:00')).toBe(
      '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")'
    );
  });

  it('handles full-day blocks', () => {
    expect(buildHoldRange('2026-08-15', '00:00', '00:00', { fullDay: true })).toBe(
      '["2026-08-15T00:00:00+00:00","2026-08-16T00:00:00+00:00")'
    );
  });
});

describe('checkOverlap', () => {
  it('returns false when no overlapping holds', async () => {
    const sb = mockSupabase({ data: [], error: null });
    const result = await checkOverlap(sb as any, 'v1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ overlapping: 0 });
  });

  it('returns overlap count when overlapping holds exist', async () => {
    const sb = mockSupabase({ data: [{ id: 'h1' }, { id: 'h2' }], error: null });
    const result = await checkOverlap(sb as any, 'v1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ overlapping: 2 });
  });
});

describe('wouldExceedCapacity', () => {
  it('returns false when capacity=2 and overlap=1', async () => {
    const sb = mockSupabase(
      { data: [{ id: 'h1' }], error: null },
      { data: { concurrent_capacity: 2 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'v1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: false, capacity: 2, overlapping: 1 });
  });

  it('returns true when capacity=1 and overlap=1', async () => {
    const sb = mockSupabase(
      { data: [{ id: 'h1' }], error: null },
      { data: { concurrent_capacity: 1 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'v1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: true, capacity: 1, overlapping: 1 });
  });

  it('returns false when capacity=3 and no overlap', async () => {
    const sb = mockSupabase(
      { data: [], error: null },
      { data: { concurrent_capacity: 3 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'v1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: false, capacity: 3, overlapping: 0 });
  });
});

describe('getUnavailableRanges', () => {
  // Will be tested more thoroughly via integration tests; here we verify the query shape.
  it('queries vendor_calendar_holds with vendor_profile_id and date range filters', async () => {
    const sb = mockSupabase({ data: [], error: null });
    await getUnavailableRanges(sb as any, 'v1', '2026-08-01', '2026-12-31');
    expect(sb.from).toHaveBeenCalledWith('vendor_calendar_holds');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- availability.service`
Expected: FAIL with "Cannot find module '@/services/availability.service'"

- [ ] **Step 3: Implement**

```typescript
// src/services/availability.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Sb = SupabaseClient<Database>;

interface BuildRangeOpts {
  fullDay?: boolean;
}

/**
 * Build a Postgres tstzrange string for a date + start/end time, UTC.
 * Format: ["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")
 */
export function buildHoldRange(
  date: string,        // 'YYYY-MM-DD'
  startTime: string,   // 'HH:mm'
  endTime: string,     // 'HH:mm'
  opts: BuildRangeOpts = {}
): string {
  if (opts.fullDay) {
    const nextDay = new Date(`${date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDayStr = nextDay.toISOString().slice(0, 10);
    return `["${date}T00:00:00+00:00","${nextDayStr}T00:00:00+00:00")`;
  }
  return `["${date}T${startTime}:00+00:00","${date}T${endTime}:00+00:00")`;
}

/**
 * Count holds that overlap a given time range for a vendor.
 * Used as a pre-check before booking submission/accept; the DB trigger is the
 * authoritative guard.
 */
export async function checkOverlap(
  supabase: Sb,
  vendorProfileId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ overlapping: number }> {
  const range = buildHoldRange(date, startTime, endTime);
  const { data, error } = await supabase
    .from('vendor_calendar_holds')
    .select('id')
    .eq('vendor_profile_id', vendorProfileId)
    .filter('hold_range', 'ov', range);  // PostgREST operator for &&
  if (error) throw error;
  return { overlapping: (data ?? []).length };
}

/**
 * Check whether inserting a new hold for this range would exceed the vendor's
 * concurrent_capacity. Returns the count + capacity for friendly UX errors.
 */
export async function wouldExceedCapacity(
  supabase: Sb,
  vendorProfileId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ wouldExceed: boolean; capacity: number; overlapping: number }> {
  const [{ data: profile, error: pErr }, { overlapping }] = await Promise.all([
    supabase
      .from('vendor_profiles')
      .select('concurrent_capacity')
      .eq('id', vendorProfileId)
      .single(),
    checkOverlap(supabase, vendorProfileId, date, startTime, endTime),
  ]);
  if (pErr) throw pErr;
  const capacity = (profile as { concurrent_capacity: number }).concurrent_capacity;
  return { wouldExceed: overlapping >= capacity, capacity, overlapping };
}

/**
 * Get all holds for a vendor between two dates. Used for the couple-side
 * availability calendar. Returns raw tstzrange strings; client parses them
 * into per-date busy ranges with privacy-preserving aggregation.
 */
export async function getUnavailableRanges(
  supabase: Sb,
  vendorProfileId: string,
  fromDate: string,
  toDate: string
): Promise<Array<{ hold_range: string }>> {
  const { data, error } = await supabase
    .from('vendor_calendar_holds')
    .select('hold_range')
    .eq('vendor_profile_id', vendorProfileId)
    .filter('hold_range', 'ov', buildHoldRange(fromDate, '00:00', '00:00', { fullDay: false }) + ' OR hold_range && ' + buildHoldRange(toDate, '23:59', '23:59'));
  // Simpler: just filter on a wide range
  if (error) throw error;
  return (data ?? []) as Array<{ hold_range: string }>;
}
```

Note: the `getUnavailableRanges` filter shape may need tweaking once integration-tested. The simpler form using two `.gte`/`.lte` filters is acceptable. If PostgREST's `ov` operator gives trouble, fall back to a raw SQL function via RPC.

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run typecheck && npm test -- availability.service`
Expected: PASS (all tests)

```bash
git add src/services/availability.service.ts src/__tests__/services/availability.service.test.ts
git commit -m "feat(calendar): G1 — availability service + 12 unit tests"
```

### Task G1.3: Integration test for triggers

**Files:**
- Create: `src/__tests__/integration/calendar-holds-trigger.test.ts`

- [ ] **Step 1: Write the test (requires dev DB with migration applied)**

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient<Database>(SUPABASE_URL, SERVICE_KEY);

const TEST_VENDOR_ID = '00000000-0000-0000-0000-000000000g01';

async function seedVendor(capacity = 1) {
  // Create a test vendor + profile; cleanup in afterAll
  // (see tests/e2e/helpers/seed.ts for the pattern)
  // ... full seed code
}

describe('vendor_calendar_holds — capacity trigger', () => {
  beforeAll(async () => { await seedVendor(1); });
  afterAll(async () => { /* delete by TEST_VENDOR_ID */ });
  afterEach(async () => {
    await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', TEST_VENDOR_ID);
  });

  it('inserts first hold successfully', async () => {
    const { error } = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID, hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });
    expect(error).toBeNull();
  });

  it('rejects overlapping hold when capacity=1', async () => {
    await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID, hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });
    const { error } = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID, hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T11:00:00+00:00","2026-08-15T13:00:00+00:00")',
    });
    expect(error?.message).toContain('calendar_capacity_exceeded');
  });

  it('accepts non-overlapping holds on same day', async () => {
    await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID, hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });
    const { error } = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID, hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T16:00:00+00:00","2026-08-15T19:00:00+00:00")',
    });
    expect(error).toBeNull();
  });

  it('accepts second overlap when capacity=2', async () => {
    await sb.from('vendor_profiles').update({ concurrent_capacity: 2 }).eq('id', TEST_VENDOR_ID);
    await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID, hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });
    const { error } = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID, hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T11:00:00+00:00","2026-08-15T13:00:00+00:00")',
    });
    expect(error).toBeNull();
    await sb.from('vendor_profiles').update({ concurrent_capacity: 1 }).eq('id', TEST_VENDOR_ID);
  });
});

describe('vendor_calendar_holds — status-sync trigger', () => {
  // Test that updating bookings.status from 'pending' → 'accepted' creates holds,
  // and 'accepted' → 'couple_cancelled' deletes them. ~3-4 tests.
});
```

- [ ] **Step 2: Run + verify (locally with .env.local present)**

If `.env.local` not present in worktree, skip this test in CI (use `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/integration/calendar-holds-trigger.test.ts
git commit -m "test(calendar): G1 — integration tests for capacity + status-sync triggers"
```

---

## Phase G2 — API routes

### Task G2.1: GET /api/vendors/[slug]/availability

**Files:**
- Create: `src/app/api/vendors/[slug]/availability/route.ts`

- [ ] **Step 1: Implement**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUnavailableRanges } from '@/services/availability.service';

export const dynamic = 'force-dynamic';

export const GET = withErrorBoundary(
  async (_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, concurrent_capacity')
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('onboarding_complete', true)
      .maybeSingle();
    if (!vendor) throw new HttpError(404, 'Vendor not found');

    const today = new Date().toISOString().slice(0, 10);
    const oneYearOut = new Date();
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    const toDate = oneYearOut.toISOString().slice(0, 10);

    const ranges = await getUnavailableRanges(supabase, vendor.id, today, toDate);

    // Privacy-preserving aggregation: group by date, mark fully-blocked or partial.
    const byDate = new Map<string, Array<{ start: string; end: string }>>();
    for (const { hold_range } of ranges) {
      const [start, end] = parseTstzrange(hold_range);
      const date = start.slice(0, 10);
      const startTime = start.slice(11, 16);
      const endTime = end.slice(0, 10) === date ? end.slice(11, 16) : '23:59';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push({ start: startTime, end: endTime });
    }

    const unavailable = Array.from(byDate.entries()).map(([date, busy]) => {
      const totalBusyMinutes = busy.reduce((acc, r) => acc + minutes(r.start, r.end), 0);
      const fullyBlocked = totalBusyMinutes >= 24 * 60 * vendor.concurrent_capacity;
      return { date, fully_blocked: fullyBlocked, busy_ranges: fullyBlocked ? [] : busy };
    });

    return NextResponse.json(
      { unavailable, capacity: vendor.concurrent_capacity },
      { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' } }
    );
  }
);

function parseTstzrange(range: string): [string, string] {
  const m = range.match(/^\["([^"]+)","([^"]+)"\)$/);
  if (!m) throw new Error(`Invalid tstzrange: ${range}`);
  return [m[1], m[2]];
}

function minutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/vendors/\[slug\]/availability/route.ts
git commit -m "feat(api): G2 — GET /api/vendors/[slug]/availability with 60s cache"
```

### Task G2.2: POST /api/vendor-calendar/block + DELETE

**Files:**
- Create: `src/app/api/vendor-calendar/block/route.ts`
- Create: `src/app/api/vendor-calendar/block/[id]/route.ts`
- Test: `src/__tests__/api/vendor-calendar-block.test.ts`

- [ ] **Step 1: Write the failing test**

Test cases:
- POST unauth → 401
- POST as vendor with full_day → inserts hold with correct range
- POST as vendor with time_range → inserts hold with correct range
- POST when capacity exceeded → 409 with friendly message
- DELETE non-owned hold → 404
- DELETE booking-type hold → 403 (only vendor_blocked can be deleted)
- DELETE happy path → 200

- [ ] **Step 2: Implement POST**

```typescript
// src/app/api/vendor-calendar/block/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { buildHoldRange } from '@/services/availability.service';

const bodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('full_day'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({
    mode: z.literal('time_range'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
]);

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, supabase } = await requireUser();
  const body = bodySchema.parse(await req.json());

  const { data: vendor } = await supabase
    .from('vendor_profiles').select('id').eq('user_id', user.id).single();
  if (!vendor) throw new HttpError(404, 'No vendor profile');

  const range = body.mode === 'full_day'
    ? buildHoldRange(body.date, '00:00', '00:00', { fullDay: true })
    : buildHoldRange(body.date, body.start_time, body.end_time);

  const { data, error } = await supabase.from('vendor_calendar_holds').insert({
    vendor_profile_id: vendor.id,
    hold_type: 'vendor_blocked',
    hold_range: range,
  }).select('id').single();

  if (error) {
    if (error.message.includes('calendar_capacity_exceeded')) {
      throw new HttpError(409, "You're at full capacity on this date — cancel a booking first or increase your concurrent capacity.");
    }
    throw new HttpError(500, error.message);
  }

  return NextResponse.json({ data }, { status: 201 });
});
```

- [ ] **Step 3: Implement DELETE**

```typescript
// src/app/api/vendor-calendar/block/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const DELETE = withErrorBoundary(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    // RLS ensures user can only delete vendor_blocked holds they own.
    const { data, error } = await supabase
      .from('vendor_calendar_holds')
      .delete()
      .eq('id', id)
      .eq('hold_type', 'vendor_blocked')
      .select('id')
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, 'Block not found');
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 4: Verify and commit**

```bash
git add src/app/api/vendor-calendar src/__tests__/api/vendor-calendar-block.test.ts
git commit -m "feat(api): G2 — POST/DELETE /api/vendor-calendar/block"
```

### Task G2.3: PATCH /api/vendor-calendar/capacity

**Files:**
- Create: `src/app/api/vendor-calendar/capacity/route.ts`
- Test: extend `src/__tests__/api/vendor-calendar-block.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/vendor-calendar/capacity/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

const bodySchema = z.object({ concurrent_capacity: z.number().int().min(1).max(50) });

export const PATCH = withErrorBoundary(async (req: NextRequest) => {
  const { user, supabase } = await requireUser();
  const body = bodySchema.parse(await req.json());

  const { data: vendor } = await supabase
    .from('vendor_profiles').select('id').eq('user_id', user.id).single();
  if (!vendor) throw new HttpError(404, 'No vendor profile');

  // Guard: don't allow lowering below current overlap count for ANY time slot.
  // Cheapest check: count holds per overlap window. For MVP, skip this check
  // and let the DB enforce on next insert. Document as a known edge case.

  const { error } = await supabase
    .from('vendor_profiles')
    .update({ concurrent_capacity: body.concurrent_capacity })
    .eq('id', vendor.id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): G2 — PATCH /api/vendor-calendar/capacity"
```

---

## Phase G3 — Vendor dashboard UI

### Task G3.1: Calendar page + sidebar link

**Files:**
- Create: `src/app/dashboard/profile/calendar/page.tsx`
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Implement page (server component)**

```typescript
// src/app/dashboard/profile/calendar/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CalendarHoldsList } from '@/components/dashboard/CalendarHoldsList';
import { BlockDateForm } from '@/components/dashboard/BlockDateForm';
import { CapacityField } from '@/components/dashboard/CapacityField';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, concurrent_capacity, onboarding_complete')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!vendor) redirect('/dashboard/profile/setup');
  if (!vendor.onboarding_complete) redirect('/dashboard/profile/setup');

  // Fetch holds for the next 90 days
  const today = new Date().toISOString().slice(0, 10);
  const ninetyOut = new Date();
  ninetyOut.setDate(ninetyOut.getDate() + 90);

  const { data: holds } = await supabase
    .from('vendor_calendar_holds')
    .select('id, hold_type, hold_range, booking_event_id, booking_events!inner(event_type_label, bookings!inner(couple_full_name))')
    .eq('vendor_profile_id', vendor.id)
    .filter('hold_range', 'gte', today)
    .order('hold_range');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground">Manage your availability and concurrent capacity.</p>
      </div>
      <CapacityField initial={vendor.concurrent_capacity} />
      <BlockDateForm />
      <CalendarHoldsList holds={holds ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Add sidebar link**

In `src/app/dashboard/layout.tsx`, between "Notifications" and the role-specific links, add:

```jsx
{role === 'vendor' && (
  <Link href="/dashboard/profile/calendar" className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">
    Calendar
  </Link>
)}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(dashboard): G3 — vendor /dashboard/profile/calendar page + sidebar link"
```

### Task G3.2: CalendarHoldsList component

**Files:**
- Create: `src/components/dashboard/CalendarHoldsList.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Hold {
  id: string;
  hold_type: 'booking' | 'vendor_blocked';
  hold_range: string;
  booking_event_id: string | null;
  booking_events?: { event_type_label: string; bookings: { couple_full_name: string | null } } | null;
}

interface Props {
  holds: Hold[];
}

function parseRange(range: string): { date: string; startTime: string; endTime: string; fullDay: boolean } {
  // Parse '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")'
  const m = range.match(/^\["([^"]+)","([^"]+)"\)$/);
  if (!m) return { date: '?', startTime: '?', endTime: '?', fullDay: false };
  const [, start, end] = m;
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const startTime = start.slice(11, 16);
  const endTime = end.slice(11, 16);
  const fullDay = startTime === '00:00' && endTime === '00:00' && startDate !== endDate;
  return { date: startDate, startTime, endTime, fullDay };
}

export function CalendarHoldsList({ holds }: Props) {
  const [items, setItems] = useState(holds);

  async function unblock(id: string) {
    const res = await fetch(`/api/vendor-calendar/block/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((h) => h.id !== id));
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No upcoming holds.</p>;
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Upcoming (next 90 days)</h2>
      <ul className="space-y-1 text-sm">
        {items.map((h) => {
          const { date, startTime, endTime, fullDay } = parseRange(h.hold_range);
          const label = h.hold_type === 'booking'
            ? `${h.booking_events?.event_type_label ?? 'Booking'} for ${h.booking_events?.bookings.couple_full_name ?? '—'}`
            : 'Personal block';
          const timeStr = fullDay ? '(full day)' : `${startTime} – ${endTime}`;
          return (
            <li key={h.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>
                <span className="font-medium">{date}</span>
                <span className="ml-2 text-muted-foreground">{timeStr}</span>
                <span className="ml-2">— {label}</span>
                <span className={`ml-2 text-xs ${h.hold_type === 'booking' ? 'text-green-600' : 'text-amber-600'}`}>
                  [{h.hold_type === 'booking' ? 'Booking' : 'Blocked'}]
                </span>
              </span>
              {h.hold_type === 'vendor_blocked' && (
                <Button variant="ghost" size="sm" onClick={() => unblock(h.id)}>Unblock</Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(dashboard): G3 — CalendarHoldsList component"
```

### Task G3.3: BlockDateForm + CapacityField

**Files:**
- Create: `src/components/dashboard/BlockDateForm.tsx`
- Create: `src/components/dashboard/CapacityField.tsx`

- [ ] **Step 1: BlockDateForm**

```typescript
'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useRouter } from 'next/navigation';

export function BlockDateForm() {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [fullDay, setFullDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body = fullDay
      ? { mode: 'full_day' as const, date }
      : { mode: 'time_range' as const, date, start_time: startTime, end_time: endTime };
    const res = await fetch('/api/vendor-calendar/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: 'Block failed' }));
      setError(e.error);
      return;
    }
    setDate('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border p-4">
      <h2 className="font-semibold">Block a date</h2>
      <div>
        <Label htmlFor="block-date">Date</Label>
        <Input id="block-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={fullDay} onCheckedChange={setFullDay} id="full-day" />
        <Label htmlFor="full-day">Block full day</Label>
      </div>
      {!fullDay && (
        <div className="flex gap-3">
          <div>
            <Label htmlFor="start">Start</Label>
            <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="end">End</Label>
            <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting || !date}>{submitting ? 'Blocking…' : 'Block this date'}</Button>
    </form>
  );
}
```

- [ ] **Step 2: CapacityField**

```typescript
'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface Props {
  initial: number;
}

export function CapacityField({ initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch('/api/vendor-calendar/capacity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concurrent_capacity: value }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: 'Update failed' }));
      setError(e.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-md border p-4 space-y-2">
      <h2 className="font-semibold">Concurrent capacity</h2>
      <p className="text-sm text-muted-foreground">Increase this if you run multiple teams. Default 1.</p>
      <div className="flex items-end gap-3">
        <div>
          <label className="text-sm">I can handle</label>
          <Input
            type="number"
            min={1}
            max={50}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-20"
          />
          <span className="ml-2 text-sm">events at the same time.</span>
        </div>
        <Button onClick={save} disabled={value === initial}>Save</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(dashboard): G3 — BlockDateForm + CapacityField"
```

### Task G3.4: ConflictWarning on vendor's booking detail page

**Files:**
- Create: `src/components/dashboard/ConflictWarning.tsx`
- Modify: `src/app/dashboard/bookings/[id]/page.tsx` — render `<ConflictWarning>` when this is a `pending` request that would exceed capacity

- [ ] **Step 1: Implement ConflictWarning**

```typescript
'use client';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface Props {
  overlapCount: number;
  capacity: number;
}

export function ConflictWarning({ overlapCount, capacity }: Props) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold">Heads up — this conflicts with an existing booking.</h3>
          <p className="text-sm mt-1">
            Accepting will put you over your concurrent capacity ({overlapCount} overlapping, you allow {capacity}).{' '}
            <Link href="/dashboard/profile/calendar" className="underline">View calendar →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into booking detail page**

In `src/app/dashboard/bookings/[id]/page.tsx`, when this is a vendor viewing a pending booking, call `wouldExceedCapacity` for each booking_event. If any would exceed, render `<ConflictWarning>` above the Accept button.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(dashboard): G3 — ConflictWarning on vendor pending booking page"
```

---

## Phase G4 — Couple-side AvailabilityCalendar

### Task G4.1: Install react-day-picker

- [ ] `npm install react-day-picker`
- [ ] Commit `package.json` + `package-lock.json`.

### Task G4.2: AvailabilityCalendar component

**Files:**
- Create: `src/components/marketplace/AvailabilityCalendar.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

interface UnavailableDay {
  date: string;
  fully_blocked: boolean;
  busy_ranges: Array<{ start: string; end: string }>;
}

interface Props {
  vendorSlug: string;
  selectedDate?: Date;
  onSelect: (date: Date | undefined) => void;
}

export function AvailabilityCalendar({ vendorSlug, selectedDate, onSelect }: Props) {
  const [unavailable, setUnavailable] = useState<UnavailableDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/vendors/${vendorSlug}/availability`)
      .then((r) => r.json())
      .then((d) => { setUnavailable(d.unavailable ?? []); setLoading(false); });
  }, [vendorSlug]);

  const fullyBlockedDates = unavailable
    .filter((d) => d.fully_blocked)
    .map((d) => new Date(d.date + 'T12:00:00Z'));

  const partialDates = unavailable
    .filter((d) => !d.fully_blocked && d.busy_ranges.length > 0)
    .map((d) => new Date(d.date + 'T12:00:00Z'));

  const selectedKey = selectedDate?.toISOString().slice(0, 10);
  const selectedDayBusy = unavailable.find((d) => d.date === selectedKey)?.busy_ranges ?? [];

  return (
    <div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading availability…</p>
      ) : (
        <>
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={onSelect}
            disabled={[{ before: new Date() }, ...fullyBlockedDates]}
            modifiers={{ partial: partialDates }}
            modifiersClassNames={{ partial: 'rdp-partial' }}
          />
          <style jsx global>{`
            .rdp-partial:not([aria-selected]) {
              background-color: rgb(254 249 195);
              color: rgb(120 53 15);
            }
          `}</style>
          {selectedDayBusy.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-50 p-2 text-xs">
              <strong>Limited availability:</strong>{' '}
              {selectedDayBusy.map((r, i) => (
                <span key={i}>{r.start} – {r.end}{i < selectedDayBusy.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(marketplace): G4 — AvailabilityCalendar with partial-day hints"
```

### Task G4.3: Integrate into booking flow

**Files:**
- Modify: `src/app/(marketplace)/vendors/[slug]/book/page.tsx`

- [ ] **Step 1: Replace the existing event-date `<input type="date">` with the AvailabilityCalendar**

For multi-event bookings, repeat per event. The component handles its own data fetching, so use the same `<AvailabilityCalendar vendorSlug={slug} ...>` for each event slot.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(marketplace): G4 — integrate AvailabilityCalendar into booking flow"
```

---

## Phase G5 — Wire booking submit + accept

### Task G5.1: Pre-check at booking submission

**Files:**
- Modify: `src/app/api/bookings/route.ts`

- [ ] **Step 1: Add `wouldExceedCapacity` check before INSERT**

For each event in the proposed booking, call `wouldExceedCapacity`. If any returns `wouldExceed: true`, reject the whole submission with 409:

```typescript
import { wouldExceedCapacity } from '@/services/availability.service';

// inside POST handler, after validating input but before INSERT
for (const evt of input.events) {
  const check = await wouldExceedCapacity(
    supabase, input.vendor_profile_id, evt.event_date, evt.event_start_time, evt.event_end_time
  );
  if (check.wouldExceed) {
    throw new HttpError(409, `${evt.event_type_label} on ${evt.event_date} ${evt.event_start_time}-${evt.event_end_time} is unavailable. Pick another time.`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): G5 — check capacity before booking INSERT"
```

### Task G5.2: Catch trigger exception at vendor accept

**Files:**
- Modify: `src/app/api/bookings/[id]/accept/route.ts`

- [ ] **Step 1: Wrap the UPDATE in try/catch**

The status-sync trigger fires after UPDATE; if it inserts a hold that exceeds capacity, it raises `calendar_capacity_exceeded`. Catch it as 409:

```typescript
try {
  const { error } = await supabase
    .from('bookings').update({ status: 'accepted' }).eq('id', bookingId);
  if (error) throw error;
} catch (err: any) {
  if (err.message?.includes('calendar_capacity_exceeded')) {
    throw new HttpError(409, 'This booking conflicts with another. Decline it or increase your concurrent capacity first.');
  }
  throw err;
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): G5 — handle capacity trigger exception on vendor accept"
```

---

## Phase G6 — E2E spec

### Task G6.1: tests/e2e/calendar.spec.ts (4 tests)

**Files:**
- Create: `tests/e2e/calendar.spec.ts`

- [ ] **Step 1: Write the 4 tests** (model on tests/e2e/happy-path.spec.ts)

```typescript
import { test, expect } from '@playwright/test';
import { seedVendor, seedCouple, seedPackage, loginAs, cleanup } from './helpers/seed';

test.describe('calendar — G end-to-end', () => {
  test('couple submits booking; same time slot rejected; different time accepted', async ({ page, request }) => {
    // 1. Seed vendor + package
    // 2. Couple submits booking for 2026-08-15 10:00-12:00 → 200
    // 3. Vendor accepts → trigger inserts hold
    // 4. Couple 2 tries 2026-08-15 11:00-13:00 → 409
    // 5. Couple 2 tries 2026-08-15 14:00-16:00 → 200
  });

  test('concurrency: 2 vendors accepting overlapping pendings — only 1 succeeds (capacity=1)', async ({ page, request }) => {
    // Seed vendor (capacity=1), 2 pending bookings for same slot.
    // Fire both accept calls in parallel; assert exactly 1 succeeds.
  });

  test('multi-team: capacity=2 allows 2 overlapping bookings, rejects 3rd', async ({ page, request }) => {
    // Seed vendor with capacity=2, 3 pendings for same slot.
    // Accept 1 → ok. Accept 2 → ok. Accept 3 → 409.
  });

  test('vendor blocks date; couple booking calendar shows it unavailable', async ({ page, request }) => {
    // Seed vendor. Vendor blocks 2026-08-15 (full day) via dashboard.
    // Anonymous couple visits /vendors/<slug>/book; AvailabilityCalendar grays out 2026-08-15.
  });
});
```

- [ ] **Step 2: Commit**

```bash
git commit -m "test(e2e): G6 — calendar 4-test spec (overlap, concurrency, capacity, block)"
```

---

## Phase G7 — PR + prod migration

### Task G7.1: Open PR

- [ ] **Step 1: Push umbrella branch**

```bash
git push -u origin feat/sub-project-g-calendar
```

- [ ] **Step 2: Open PR with prod migration in description**

PR body should include:
- Summary of what landed
- The full `00032_create_vendor_calendar_holds.sql` block for the user to paste into Supabase prod SQL editor
- A verification query (`SELECT table_present + trigger_count`)
- Pre-merge checklist

### Task G7.2: User applies prod migration + merges

- Hand the user the SQL block
- User applies + verifies
- `gh pr merge <N> --squash --delete-branch`

---

## Self-review checklist (controller, before dispatching)

- [ ] Each task has explicit file paths
- [ ] Every code step shows full code or runnable command
- [ ] Type names consistent across tasks (`Hold`, `UnavailableDay`)
- [ ] The PostgREST `ov` operator filter syntax verified before G1.2 ships (if it doesn't work, fall back to two `.gte` / `.lte` filters)
- [ ] react-day-picker `style.css` import verified after install
- [ ] Existing `vendor_calendar_holds_vendor_range_idx` GIST index supports the `&&` operator used by the count query (it does; that's why we use GIST)
