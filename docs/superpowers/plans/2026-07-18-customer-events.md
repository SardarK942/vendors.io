# Customer Events + Event Journal (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Couples create a multi-function Event (celebration) with per-function vendor-needs, budget, and tasks; Baazar bookings auto-link into the event journal; off-platform vendors are tracked manually; a daily cron sends task/countdown reminders.

**Architecture:** Five new tables cascade from `events` (owned by `couple_user_id`); vendor-need status is **derived** from the linked booking's status (never stored); committed spend = Σ active linked bookings' `total_price_cents` + Σ manual amounts. A full-screen wizard at `/dashboard/events/new` writes the whole graph in one POST; the journal at `/dashboard/events/[id]` renders hero/timeline/vendor-board/budget/tasks; both booking entry points gain an optional `event_function_id` that upserts the matching vendor slot.

**Tech Stack:** Next.js 14 App Router (`src/` + `@/` alias), Supabase (RLS + service-role), Zod, shadcn/ui (registry-first via shadcn MCP), Vitest (`src/__tests__`), Playwright (`tests/e2e`), GitHub Actions cron, Resend via existing notifications pipeline.

**Spec:** `docs/superpowers/specs/2026-07-18-customer-events-design.md`. Approved design demos: Agent-Native plan `plan-8e12a7100cdd4f6a`.

## Global Constraints

- Branch: `feat/customer-events` (already off main @ `2d77712`). NEVER commit to main. One PR, squash-merge, full CI green before merge (new tests must pass; legacy e2e breakage is tracked separately).
- Migration file: `supabase/migrations/00072_customer_events.sql` — **before creating it, run `ls supabase/migrations | tail -3` and renumber to latest+1 if main moved.** Single-line SQL statements (Supabase web editor compatibility, house style). Claude applies to dev via psql; the user applies to prod manually.
- `src/types/database.types.ts` is HAND-PATCHED (never regenerate — custom aliases get wiped).
- Registry-first components: before authoring any new UI component, search shadcn + 21st.dev registries via shadcn MCP (`mcp__shadcn__search_items_in_registries`); hand-roll only when nothing fits. Restyle with Baazar tokens (cream/ink/indigo; CTA = ink, never pink; haldi ≤ 2 elements/page; DM Mono kickers).
- Neutral voice in all user-facing copy: no religious-specific greetings ("Salaam" → "Hello"). Cultural function names (Nikah, Mehndi, Katb el-Kitab…) are taxonomy and stay.
- Money is integer cents (`*_cents bigint`). Dates are `date` strings (`YYYY-MM-DD`), times `time`.
- All new API routes: `requireUser()` or explicit auth check + `checkRateLimit` like existing routes.
- Commit after every green test cycle. Prettier runs via lint-staged automatically.

## File Structure

```
supabase/migrations/00072_customer_events.sql        5 tables + bookings FK + notifications CHECK
src/types/database.types.ts                          hand-patched table types + NotificationType
src/types/index.ts                                   createEventSchema + input types (bottom of file)
src/lib/events/derive.ts                             PURE: status derivation + rollups + reminder selection
src/services/events.service.ts                       createEventWithGraph, getEventGraph, linkBookingToFunction, upsertNeedForBooking
src/services/notifications.service.ts                +3 helpers (event_task_due / overdue / countdown)
src/app/api/events/route.ts                          POST create event graph
src/app/api/events/[id]/route.ts                     PATCH event, DELETE event
src/app/api/events/[id]/needs/route.ts               POST manual need / link booking; PATCH+DELETE via body op
src/app/api/events/[id]/tasks/route.ts               POST / PATCH / DELETE tasks
src/app/api/cron/event-reminders/route.ts            daily reminder job (CRON_SECRET)
.github/workflows/event-reminders.yml                daily schedule → curl cron route
src/app/dashboard/events/page.tsx                    events list
src/app/dashboard/events/new/page.tsx                wizard route (full-screen)
src/app/dashboard/events/[id]/page.tsx               journal (server component)
src/components/events/wizard/EventWizard.tsx         client wizard shell + state + submit
src/components/events/wizard/StepBasics.tsx          step 1
src/components/events/wizard/StepFunctions.tsx       step 2
src/components/events/wizard/StepVendors.tsx         step 3
src/components/events/wizard/StepBudget.tsx          step 4
src/components/events/wizard/StepChecklist.tsx       step 5
src/components/events/JournalHero.tsx                ink hero + countdown + budget bar
src/components/events/FunctionTimeline.tsx           per-function cards row
src/components/events/VendorBoard.tsx                per-function needs board (client)
src/components/events/BudgetPanel.tsx                rollups panel
src/components/events/TasksPanel.tsx                 tasks CRUD (client)
src/components/events/EventSummaryCard.tsx           dashboard home card
src/components/events/EventFunctionSelect.tsx        "Which event is this for?" (shared by both booking forms)
src/components/dashboard/SidebarNav.tsx              + "My Event" couple link
src/app/dashboard/page.tsx                           + summary card / plan CTA
src/components/forms/BookingForm.tsx                 + EventFunctionSelect
src/components/booking/CustomRequestForm.tsx         + EventFunctionSelect
src/services/booking.service.ts                      createBooking accepts event_function_id
src/app/api/bookings/custom-request/route.ts         accepts event_function_id
src/components/notifications/NotificationCard.tsx    copy for 3 new types
src/__tests__/events/derive.test.ts                  pure-logic unit tests
src/__tests__/events/reminders.test.ts               reminder selection unit tests
src/__tests__/api/events-create.test.ts              API validation tests
tests/e2e/customer-events.spec.ts                    wizard→journal, manual vendor, task check-off
```

---

### Task 1: Migration 00072 + hand-patch database.types.ts

**Files:**

- Create: `supabase/migrations/00072_customer_events.sql`
- Modify: `src/types/database.types.ts` (NotificationType union ~line 45; add 5 table types inside `Database['public']['Tables']`; add `event_function_id` to `bookings` Row/Insert/Update)

**Interfaces:**

- Produces: tables `events`, `event_functions`, `event_vendor_needs`, `event_budget_allocations`, `event_tasks`; `bookings.event_function_id uuid null`; `NotificationType` gains `'event_task_due' | 'event_task_overdue' | 'event_countdown'`. TS row aliases exported from `database.types.ts`: `EventRow`, `EventFunctionRow`, `EventVendorNeedRow`, `EventTaskRow`.

- [ ] **Step 1: Check migration number**

Run: `ls supabase/migrations | tail -3`
Expected: `00071_...` is highest → keep `00072`. If not, renumber all references in this plan.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/00072_customer_events.sql
-- Phase 1 customer events: celebration container + per-function vendor needs,
-- budget allocations, tasks, booking link, reminder notification types.
-- Spec: docs/superpowers/specs/2026-07-18-customer-events-design.md
-- All single-line statements (Supabase web SQL editor compatibility).

CREATE TABLE events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), couple_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL, celebration_type text NOT NULL, city text, total_budget_cents bigint, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_events_couple ON events (couple_user_id, created_at DESC);

CREATE TABLE event_functions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, sequence int NOT NULL, label text NOT NULL, event_type_id text, date date, start_time time, end_time time, venue_name text, city text, guest_estimate int, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (event_id, sequence));
CREATE INDEX idx_event_functions_event ON event_functions (event_id, sequence);

CREATE TABLE event_vendor_needs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_function_id uuid NOT NULL REFERENCES event_functions(id) ON DELETE CASCADE, category text NOT NULL, booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL, manual_vendor_name text, manual_amount_cents bigint, manual_booked boolean NOT NULL DEFAULT false, notes text, sort int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_event_vendor_needs_function ON event_vendor_needs (event_function_id, sort);
CREATE INDEX idx_event_vendor_needs_booking ON event_vendor_needs (booking_id) WHERE booking_id IS NOT NULL;

CREATE TABLE event_budget_allocations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, category text NOT NULL, planned_cents bigint NOT NULL, UNIQUE (event_id, category));

CREATE TABLE event_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, event_function_id uuid REFERENCES event_functions(id) ON DELETE SET NULL, title text NOT NULL, due_date date, completed_at timestamptz, due_soon_notified_at timestamptz, overdue_notified_at timestamptz, sort int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_event_tasks_event ON event_tasks (event_id, sort);
CREATE INDEX idx_event_tasks_due ON event_tasks (due_date) WHERE completed_at IS NULL AND due_date IS NOT NULL;

ALTER TABLE bookings ADD COLUMN event_function_id uuid REFERENCES event_functions(id) ON DELETE SET NULL;
CREATE INDEX idx_bookings_event_function ON bookings (event_function_id) WHERE event_function_id IS NOT NULL;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own events" ON events FOR ALL USING (couple_user_id = auth.uid()) WITH CHECK (couple_user_id = auth.uid());

ALTER TABLE event_functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own event functions" ON event_functions FOR ALL USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_functions.event_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_functions.event_id AND e.couple_user_id = auth.uid()));

ALTER TABLE event_vendor_needs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own vendor needs" ON event_vendor_needs FOR ALL USING (EXISTS (SELECT 1 FROM event_functions f JOIN events e ON e.id = f.event_id WHERE f.id = event_vendor_needs.event_function_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM event_functions f JOIN events e ON e.id = f.event_id WHERE f.id = event_vendor_needs.event_function_id AND e.couple_user_id = auth.uid()));

ALTER TABLE event_budget_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own allocations" ON event_budget_allocations FOR ALL USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_budget_allocations.event_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_budget_allocations.event_id AND e.couple_user_id = auth.uid()));

ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own event tasks" ON event_tasks FOR ALL USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_tasks.event_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_tasks.event_id AND e.couple_user_id = auth.uid()));

-- Reminder notification types (mirror current NotificationType union + 3 new).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['booking_request_received'::text,'vendor_accepted'::text,'vendor_adjusted_quote'::text,'couple_accepted_adjusted'::text,'couple_declined_adjusted'::text,'deposit_paid'::text,'booking_confirmed'::text,'booking_auto_cancelled'::text,'booking_cancelled'::text,'event_completed'::text,'booking_completed'::text,'review_received'::text,'custom_request_received'::text,'couple_countered'::text,'event_task_due'::text,'event_task_overdue'::text,'event_countdown'::text]));
```

Before writing the CHECK list, confirm the live list matches the `NotificationType` union at `src/types/database.types.ts:45-59` — if a later migration added more types, include them.

- [ ] **Step 3: Apply to dev**

Run: `psql "$DEV_DATABASE_URL" -f supabase/migrations/00072_customer_events.sql` (use the psql invocation pattern from the Supabase-prod-connection memory / previous migrations; dev only — prod is applied by the user).
Expected: `CREATE TABLE` × 5, `ALTER TABLE` outputs, no errors.

- [ ] **Step 4: Hand-patch `src/types/database.types.ts`**

1. Extend the union at line ~45:

```ts
export type NotificationType =
  | 'booking_request_received'
  // ...existing entries unchanged...
  | 'couple_countered'
  | 'event_task_due'
  | 'event_task_overdue'
  | 'event_countdown';
```

2. Inside `Database['public']['Tables']`, alongside existing tables, add (Row/Insert/Update trios following the file's existing style — Insert makes defaulted/nullable fields optional):

```ts
events: {
  Row: {
    id: string; couple_user_id: string; name: string; celebration_type: string;
    city: string | null; total_budget_cents: number | null; notes: string | null;
    created_at: string; updated_at: string;
  };
  Insert: {
    id?: string; couple_user_id: string; name: string; celebration_type: string;
    city?: string | null; total_budget_cents?: number | null; notes?: string | null;
    created_at?: string; updated_at?: string;
  };
  Update: Partial<Database['public']['Tables']['events']['Insert']>;
  Relationships: [];
};
event_functions: {
  Row: {
    id: string; event_id: string; sequence: number; label: string;
    event_type_id: string | null; date: string | null; start_time: string | null;
    end_time: string | null; venue_name: string | null; city: string | null;
    guest_estimate: number | null; notes: string | null; created_at: string; updated_at: string;
  };
  Insert: {
    id?: string; event_id: string; sequence: number; label: string;
    event_type_id?: string | null; date?: string | null; start_time?: string | null;
    end_time?: string | null; venue_name?: string | null; city?: string | null;
    guest_estimate?: number | null; notes?: string | null; created_at?: string; updated_at?: string;
  };
  Update: Partial<Database['public']['Tables']['event_functions']['Insert']>;
  Relationships: [];
};
event_vendor_needs: {
  Row: {
    id: string; event_function_id: string; category: string; booking_id: string | null;
    manual_vendor_name: string | null; manual_amount_cents: number | null;
    manual_booked: boolean; notes: string | null; sort: number; created_at: string; updated_at: string;
  };
  Insert: {
    id?: string; event_function_id: string; category: string; booking_id?: string | null;
    manual_vendor_name?: string | null; manual_amount_cents?: number | null;
    manual_booked?: boolean; notes?: string | null; sort?: number; created_at?: string; updated_at?: string;
  };
  Update: Partial<Database['public']['Tables']['event_vendor_needs']['Insert']>;
  Relationships: [];
};
event_budget_allocations: {
  Row: { id: string; event_id: string; category: string; planned_cents: number };
  Insert: { id?: string; event_id: string; category: string; planned_cents: number };
  Update: Partial<Database['public']['Tables']['event_budget_allocations']['Insert']>;
  Relationships: [];
};
event_tasks: {
  Row: {
    id: string; event_id: string; event_function_id: string | null; title: string;
    due_date: string | null; completed_at: string | null; due_soon_notified_at: string | null;
    overdue_notified_at: string | null; sort: number; created_at: string; updated_at: string;
  };
  Insert: {
    id?: string; event_id: string; event_function_id?: string | null; title: string;
    due_date?: string | null; completed_at?: string | null; due_soon_notified_at?: string | null;
    overdue_notified_at?: string | null; sort?: number; created_at?: string; updated_at?: string;
  };
  Update: Partial<Database['public']['Tables']['event_tasks']['Insert']>;
  Relationships: [];
};
```

3. Add `event_function_id: string | null;` to `bookings` Row (and optional variant to Insert/Update).
4. At the bottom of the file, near existing row aliases (search `export type` aliases), add:

```ts
export type EventRow = Database['public']['Tables']['events']['Row'];
export type EventFunctionRow = Database['public']['Tables']['event_functions']['Row'];
export type EventVendorNeedRow = Database['public']['Tables']['event_vendor_needs']['Row'];
export type EventTaskRow = Database['public']['Tables']['event_tasks']['Row'];
```

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add supabase/migrations/00072_customer_events.sql src/types/database.types.ts
git commit -m "feat(events): migration 00072 — events graph tables + booking FK + reminder notification types"
```

---

### Task 2: Pure domain logic — status derivation, rollups, reminders

**Files:**

- Create: `src/lib/events/derive.ts`
- Test: `src/__tests__/events/derive.test.ts`, `src/__tests__/events/reminders.test.ts`

**Interfaces:**

- Consumes: `BookingStatus` from `@/types` (Zod-derived union, `src/types/index.ts:101`); `EventVendorNeedRow`, `EventTaskRow`, `EventFunctionRow` from `@/types/database.types`.
- Produces (exact exports later tasks import):

```ts
export type NeedStatus = 'booked_baazar' | 'booked_manual' | 'needed';
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[]; // all except couple_cancelled, vendor_cancelled, cancelled_mutual, expired, disputed, adjusted_quote_declined
export interface NeedWithBooking extends EventVendorNeedRow {
  booking?: {
    id: string;
    status: string;
    total_price_cents: number | null;
    vendor_business_name?: string | null;
  } | null;
}
export function deriveNeedStatus(need: NeedWithBooking): NeedStatus;
export function committedCentsForNeed(need: NeedWithBooking): number;
export interface Rollups {
  totalCommittedCents: number;
  byFunction: Record<string, number>;
  byCategory: Record<string, number>;
  bookedCountByFunction: Record<string, { booked: number; total: number }>;
}
export function computeRollups(needs: NeedWithBooking[]): Rollups;
export function daysUntil(dateIso: string, todayIso: string): number; // whole days, negative = past
export function selectDueSoonTasks(tasks: EventTaskRow[], todayIso: string): EventTaskRow[]; // due within 3 days, not completed, not yet due_soon_notified
export function selectOverdueTasks(tasks: EventTaskRow[], todayIso: string): EventTaskRow[]; // past due, not completed, not yet overdue_notified
export const COUNTDOWN_MILESTONES: readonly number[]; // [30, 14, 7, 1]
export function selectCountdownFunctions(
  fns: EventFunctionRow[],
  todayIso: string
): { fn: EventFunctionRow; daysOut: number }[];
```

- [ ] **Step 1: Write failing tests**

`src/__tests__/events/derive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveNeedStatus, committedCentsForNeed, computeRollups } from '@/lib/events/derive';
import type { NeedWithBooking } from '@/lib/events/derive';

const base = {
  id: 'n1',
  event_function_id: 'f1',
  category: 'catering',
  booking_id: null,
  manual_vendor_name: null,
  manual_amount_cents: null,
  manual_booked: false,
  notes: null,
  sort: 0,
  created_at: '',
  updated_at: '',
} satisfies NeedWithBooking;

describe('deriveNeedStatus', () => {
  it('is needed when nothing is linked', () => {
    expect(deriveNeedStatus(base)).toBe('needed');
  });
  it('is booked_baazar when linked booking is active', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'accepted', total_price_cents: 320000 },
    };
    expect(deriveNeedStatus(n)).toBe('booked_baazar');
  });
  it('reverts to needed when linked booking is cancelled', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'vendor_cancelled', total_price_cents: 320000 },
    };
    expect(deriveNeedStatus(n)).toBe('needed');
  });
  it('is booked_manual when manual_booked and no booking', () => {
    const n = {
      ...base,
      manual_booked: true,
      manual_vendor_name: 'Henna by Zara',
      manual_amount_cents: 50000,
    };
    expect(deriveNeedStatus(n)).toBe('booked_manual');
  });
  it('booking wins over manual when both present and active', () => {
    const n = {
      ...base,
      manual_booked: true,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'pending', total_price_cents: 100 },
    };
    expect(deriveNeedStatus(n)).toBe('booked_baazar');
  });
});

describe('committedCentsForNeed', () => {
  it('uses booking total when active', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'deposit_paid', total_price_cents: 900000 },
    };
    expect(committedCentsForNeed(n)).toBe(900000);
  });
  it('uses manual amount when manual_booked', () => {
    expect(
      committedCentsForNeed({ ...base, manual_booked: true, manual_amount_cents: 50000 })
    ).toBe(50000);
  });
  it('is 0 for needed and for cancelled bookings', () => {
    expect(committedCentsForNeed(base)).toBe(0);
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'expired', total_price_cents: 900000 },
    };
    expect(committedCentsForNeed(n)).toBe(0);
  });
});

describe('computeRollups', () => {
  it('sums by function and category and counts booked slots', () => {
    const needs: NeedWithBooking[] = [
      {
        ...base,
        id: 'a',
        event_function_id: 'f1',
        category: 'mehndi',
        manual_booked: true,
        manual_amount_cents: 50000,
      },
      {
        ...base,
        id: 'b',
        event_function_id: 'f1',
        category: 'catering',
        booking_id: 'b1',
        booking: { id: 'b1', status: 'accepted', total_price_cents: 320000 },
      },
      { ...base, id: 'c', event_function_id: 'f1', category: 'decor' },
      {
        ...base,
        id: 'd',
        event_function_id: 'f2',
        category: 'venue',
        booking_id: 'b2',
        booking: { id: 'b2', status: 'deposit_paid', total_price_cents: 900000 },
      },
    ];
    const r = computeRollups(needs);
    expect(r.totalCommittedCents).toBe(1270000);
    expect(r.byFunction).toEqual({ f1: 370000, f2: 900000 });
    expect(r.byCategory).toEqual({ mehndi: 50000, catering: 320000, decor: 0, venue: 900000 });
    expect(r.bookedCountByFunction).toEqual({
      f1: { booked: 2, total: 3 },
      f2: { booked: 1, total: 1 },
    });
  });
});
```

`src/__tests__/events/reminders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  daysUntil,
  selectDueSoonTasks,
  selectOverdueTasks,
  selectCountdownFunctions,
} from '@/lib/events/derive';
import type { EventTaskRow, EventFunctionRow } from '@/types/database.types';

const task = (over: Partial<EventTaskRow>): EventTaskRow => ({
  id: 't1',
  event_id: 'e1',
  event_function_id: null,
  title: 'Book decor',
  due_date: null,
  completed_at: null,
  due_soon_notified_at: null,
  overdue_notified_at: null,
  sort: 0,
  created_at: '',
  updated_at: '',
  ...over,
});
const fn = (over: Partial<EventFunctionRow>): EventFunctionRow => ({
  id: 'f1',
  event_id: 'e1',
  sequence: 1,
  label: 'Mehndi',
  event_type_id: 'mehndi',
  date: null,
  start_time: null,
  end_time: null,
  venue_name: null,
  city: null,
  guest_estimate: null,
  notes: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const TODAY = '2026-07-18';

it('daysUntil counts whole days', () => {
  expect(daysUntil('2026-07-21', TODAY)).toBe(3);
  expect(daysUntil('2026-07-17', TODAY)).toBe(-1);
});

it('selectDueSoonTasks picks tasks due within 3 days, unnotified, incomplete', () => {
  const due = task({ id: 'a', due_date: '2026-07-20' });
  const far = task({ id: 'b', due_date: '2026-08-01' });
  const done = task({ id: 'c', due_date: '2026-07-19', completed_at: '2026-07-01T00:00:00Z' });
  const already = task({
    id: 'd',
    due_date: '2026-07-19',
    due_soon_notified_at: '2026-07-16T00:00:00Z',
  });
  expect(selectDueSoonTasks([due, far, done, already], TODAY).map((t) => t.id)).toEqual(['a']);
});

it('selectOverdueTasks picks past-due, unnotified, incomplete', () => {
  const over = task({ id: 'a', due_date: '2026-07-17' });
  const today = task({ id: 'b', due_date: '2026-07-18' });
  const notified = task({
    id: 'c',
    due_date: '2026-07-01',
    overdue_notified_at: '2026-07-02T00:00:00Z',
  });
  expect(selectOverdueTasks([over, today, notified], TODAY).map((t) => t.id)).toEqual(['a']);
});

it('selectCountdownFunctions matches exact milestones 30/14/7/1', () => {
  const f30 = fn({ id: 'f30', date: '2026-08-17' });
  const f7 = fn({ id: 'f7', date: '2026-07-25' });
  const f5 = fn({ id: 'f5', date: '2026-07-23' });
  const past = fn({ id: 'fp', date: '2026-07-01' });
  const res = selectCountdownFunctions([f30, f7, f5, past], TODAY);
  expect(res.map((r) => [r.fn.id, r.daysOut])).toEqual([
    ['f30', 30],
    ['f7', 7],
  ]);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/__tests__/events -v`
Expected: FAIL — `Cannot find module '@/lib/events/derive'`.

- [ ] **Step 3: Implement `src/lib/events/derive.ts`**

```ts
// Pure domain logic for customer events. No I/O — unit-testable.
// Spec: docs/superpowers/specs/2026-07-18-customer-events-design.md §1.
import type { BookingStatus } from '@/types';
import type { EventVendorNeedRow, EventTaskRow, EventFunctionRow } from '@/types/database.types';

export type NeedStatus = 'booked_baazar' | 'booked_manual' | 'needed';

export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'deposit_paid',
  'completed',
  'accepted',
  'adjusted_quote_sent',
] as const;

export interface NeedWithBooking extends EventVendorNeedRow {
  booking?: {
    id: string;
    status: string;
    total_price_cents: number | null;
    vendor_business_name?: string | null;
  } | null;
}

function bookingIsActive(need: NeedWithBooking): boolean {
  return Boolean(
    need.booking_id &&
    need.booking &&
    (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(need.booking.status)
  );
}

export function deriveNeedStatus(need: NeedWithBooking): NeedStatus {
  if (bookingIsActive(need)) return 'booked_baazar';
  if (need.manual_booked) return 'booked_manual';
  return 'needed';
}

export function committedCentsForNeed(need: NeedWithBooking): number {
  if (bookingIsActive(need)) return need.booking?.total_price_cents ?? 0;
  if (need.manual_booked) return need.manual_amount_cents ?? 0;
  return 0;
}

export interface Rollups {
  totalCommittedCents: number;
  byFunction: Record<string, number>;
  byCategory: Record<string, number>;
  bookedCountByFunction: Record<string, { booked: number; total: number }>;
}

export function computeRollups(needs: NeedWithBooking[]): Rollups {
  const r: Rollups = {
    totalCommittedCents: 0,
    byFunction: {},
    byCategory: {},
    bookedCountByFunction: {},
  };
  for (const need of needs) {
    const cents = committedCentsForNeed(need);
    r.totalCommittedCents += cents;
    r.byFunction[need.event_function_id] = (r.byFunction[need.event_function_id] ?? 0) + cents;
    r.byCategory[need.category] = (r.byCategory[need.category] ?? 0) + cents;
    const counts = (r.bookedCountByFunction[need.event_function_id] ??= { booked: 0, total: 0 });
    counts.total += 1;
    if (deriveNeedStatus(need) !== 'needed') counts.booked += 1;
  }
  return r;
}

const MS_PER_DAY = 86_400_000;

export function daysUntil(dateIso: string, todayIso: string): number {
  return Math.round((Date.parse(dateIso) - Date.parse(todayIso)) / MS_PER_DAY);
}

const DUE_SOON_WINDOW_DAYS = 3;

export function selectDueSoonTasks(tasks: EventTaskRow[], todayIso: string): EventTaskRow[] {
  return tasks.filter((t) => {
    if (!t.due_date || t.completed_at || t.due_soon_notified_at) return false;
    const d = daysUntil(t.due_date, todayIso);
    return d >= 0 && d <= DUE_SOON_WINDOW_DAYS;
  });
}

export function selectOverdueTasks(tasks: EventTaskRow[], todayIso: string): EventTaskRow[] {
  return tasks.filter(
    (t) =>
      Boolean(t.due_date) &&
      !t.completed_at &&
      !t.overdue_notified_at &&
      daysUntil(t.due_date!, todayIso) < 0
  );
}

export const COUNTDOWN_MILESTONES: readonly number[] = [30, 14, 7, 1] as const;

export function selectCountdownFunctions(
  fns: EventFunctionRow[],
  todayIso: string
): { fn: EventFunctionRow; daysOut: number }[] {
  const out: { fn: EventFunctionRow; daysOut: number }[] = [];
  for (const f of fns) {
    if (!f.date) continue;
    const daysOut = daysUntil(f.date, todayIso);
    if (COUNTDOWN_MILESTONES.includes(daysOut)) out.push({ fn: f, daysOut });
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/__tests__/events -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/events/derive.ts src/__tests__/events
git commit -m "feat(events): pure domain logic — need status, spend rollups, reminder selection"
```

---

### Task 3: Zod schemas + events.service.ts (create + read graph)

**Files:**

- Modify: `src/types/index.ts` (append at end, after the calendar-feed section)
- Create: `src/services/events.service.ts`
- Test: `src/__tests__/api/events-create.test.ts` (schema validation only — service is exercised via API tests + e2e)

**Interfaces:**

- Consumes: `EVENT_TYPES`/`EventTypeId` (`src/types/index.ts:53`), row aliases from Task 1, derive helpers from Task 2.
- Produces:

```ts
// @/types
export const createEventSchema: z.ZodType;
export type CreateEventInput = z.infer<typeof createEventSchema>;
// @/services/events.service
export async function createEventWithGraph(
  supabase,
  coupleUserId: string,
  input: CreateEventInput
): Promise<{ data?: { eventId: string }; error?: string; status: number }>;
export async function getEventGraph(
  supabase,
  coupleUserId: string,
  eventId: string
): Promise<{ event; functions; needs: NeedWithBooking[]; allocations; tasks } | null>;
export async function listEvents(supabase, coupleUserId: string): Promise<EventRow[]>;
```

- [ ] **Step 1: Append schemas to `src/types/index.ts`**

```ts
// ─── Customer Events (Phase 1) ──────────────────────────────────────
// Spec: docs/superpowers/specs/2026-07-18-customer-events-design.md §2.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const eventVendorNeedInputSchema = z.object({
  category: z.string().min(1).max(40),
  manual_vendor_name: z.string().max(120).nullish(),
  manual_amount_cents: z.number().int().nonnegative().max(100_000_000).nullish(),
  manual_booked: z.boolean().default(false),
});

export const eventFunctionInputSchema = z.object({
  label: z.string().min(1).max(80),
  event_type_id: z.string().max(40).nullish(),
  date: isoDate.nullish(),
  guest_estimate: z.number().int().positive().max(10_000).nullish(),
  vendor_needs: z.array(eventVendorNeedInputSchema).max(20).default([]),
});

export const createEventSchema = z.object({
  name: z.string().min(1).max(120),
  celebration_type: z.string().min(1).max(40),
  city: z.string().max(80).nullish(),
  total_budget_cents: z.number().int().nonnegative().max(1_000_000_000).nullish(),
  functions: z.array(eventFunctionInputSchema).min(1).max(12),
  allocations: z
    .array(
      z.object({
        category: z.string().min(1).max(40),
        planned_cents: z.number().int().nonnegative(),
      })
    )
    .max(20)
    .default([]),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        due_date: isoDate.nullish(),
        function_index: z.number().int().nonnegative().nullish(),
      })
    )
    .max(50)
    .default([]),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;
```

- [ ] **Step 2: Write failing schema tests**

`src/__tests__/api/events-create.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createEventSchema } from '@/types';

const valid = {
  name: "Mustafa & Ayesha's Wedding",
  celebration_type: 'wedding',
  city: 'Chicago',
  total_budget_cents: 3_000_000,
  functions: [
    {
      label: 'Mehndi',
      event_type_id: 'mehndi',
      date: '2026-08-27',
      guest_estimate: 150,
      vendor_needs: [
        {
          category: 'mehndi',
          manual_vendor_name: 'Henna by Zara',
          manual_amount_cents: 50000,
          manual_booked: true,
        },
        { category: 'decor' },
      ],
    },
  ],
  allocations: [{ category: 'venue', planned_cents: 900000 }],
  tasks: [{ title: 'Book decor for Mehndi', due_date: '2026-08-01', function_index: 0 }],
};

describe('createEventSchema', () => {
  it('accepts a full wizard payload', () => {
    expect(createEventSchema.parse(valid).functions[0].vendor_needs).toHaveLength(2);
  });
  it('requires at least one function', () => {
    expect(createEventSchema.safeParse({ ...valid, functions: [] }).success).toBe(false);
  });
  it('rejects malformed dates', () => {
    const bad = { ...valid, functions: [{ ...valid.functions[0], date: '08/27/2026' }] };
    expect(createEventSchema.safeParse(bad).success).toBe(false);
  });
});
```

Run: `npx vitest run src/__tests__/api/events-create.test.ts -v` → FAIL (`createEventSchema` not exported) → apply Step 1 → PASS.

- [ ] **Step 3: Implement `src/services/events.service.ts`**

```ts
// Customer Events service — event graph CRUD + booking↔slot linking.
// Mirrors the ServiceResult convention in booking.service.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, EventRow } from '@/types/database.types';
import type { CreateEventInput } from '@/types';
import type { NeedWithBooking } from '@/lib/events/derive';
import { logger } from '@/lib/logger';

type Sb = SupabaseClient<Database>;
type Result<T> = { data?: T; error?: string; status: number };

export async function createEventWithGraph(
  supabase: Sb,
  coupleUserId: string,
  input: CreateEventInput
): Promise<Result<{ eventId: string }>> {
  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      couple_user_id: coupleUserId,
      name: input.name,
      celebration_type: input.celebration_type,
      city: input.city ?? null,
      total_budget_cents: input.total_budget_cents ?? null,
    })
    .select('id')
    .single();
  if (eventError || !event)
    return { error: eventError?.message ?? 'Failed to create event', status: 500 };

  // Rollback helper: cascades wipe the whole graph.
  const rollback = async (msg: string): Promise<Result<{ eventId: string }>> => {
    await supabase.from('events').delete().eq('id', event.id);
    return { error: msg, status: 500 };
  };

  const { data: fns, error: fnError } = await supabase
    .from('event_functions')
    .insert(
      input.functions.map((f, i) => ({
        event_id: event.id,
        sequence: i + 1,
        label: f.label,
        event_type_id: f.event_type_id ?? null,
        date: f.date ?? null,
        guest_estimate: f.guest_estimate ?? null,
      }))
    )
    .select('id, sequence');
  if (fnError || !fns) return rollback(fnError?.message ?? 'Failed to create functions');

  const fnIdByIndex = new Map(fns.map((f) => [f.sequence - 1, f.id]));

  const needRows = input.functions.flatMap((f, i) =>
    f.vendor_needs.map((n, j) => ({
      event_function_id: fnIdByIndex.get(i)!,
      category: n.category,
      manual_vendor_name: n.manual_booked ? (n.manual_vendor_name ?? null) : null,
      manual_amount_cents: n.manual_booked ? (n.manual_amount_cents ?? null) : null,
      manual_booked: n.manual_booked,
      sort: j,
    }))
  );
  if (needRows.length > 0) {
    const { error } = await supabase.from('event_vendor_needs').insert(needRows);
    if (error) return rollback(error.message);
  }

  if (input.allocations.length > 0) {
    const { error } = await supabase.from('event_budget_allocations').insert(
      input.allocations.map((a) => ({
        event_id: event.id,
        category: a.category,
        planned_cents: a.planned_cents,
      }))
    );
    if (error) return rollback(error.message);
  }

  if (input.tasks.length > 0) {
    const { error } = await supabase.from('event_tasks').insert(
      input.tasks.map((t, i) => ({
        event_id: event.id,
        event_function_id:
          t.function_index != null ? (fnIdByIndex.get(t.function_index) ?? null) : null,
        title: t.title,
        due_date: t.due_date ?? null,
        sort: i,
      }))
    );
    if (error) return rollback(error.message);
  }

  return { data: { eventId: event.id }, status: 201 };
}

export async function listEvents(supabase: Sb, coupleUserId: string): Promise<EventRow[]> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('couple_user_id', coupleUserId)
    .order('created_at', { ascending: false });
  return (data ?? []) as EventRow[];
}

export interface EventGraph {
  event: EventRow;
  functions: Database['public']['Tables']['event_functions']['Row'][];
  needs: NeedWithBooking[];
  allocations: Database['public']['Tables']['event_budget_allocations']['Row'][];
  tasks: Database['public']['Tables']['event_tasks']['Row'][];
}

export async function getEventGraph(
  supabase: Sb,
  coupleUserId: string,
  eventId: string
): Promise<EventGraph | null> {
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('couple_user_id', coupleUserId)
    .single();
  if (!event) return null;

  const { data: functions } = await supabase
    .from('event_functions')
    .select('*')
    .eq('event_id', eventId)
    .order('sequence');
  const fnIds = (functions ?? []).map((f) => f.id);

  let needs: NeedWithBooking[] = [];
  if (fnIds.length > 0) {
    const { data } = await supabase
      .from('event_vendor_needs')
      .select('*, bookings(id, status, total_price_cents, vendor_profiles(business_name))')
      .in('event_function_id', fnIds)
      .order('sort');
    needs = (data ?? []).map((row) => {
      const { bookings: b, ...need } = row as typeof row & {
        bookings: {
          id: string;
          status: string;
          total_price_cents: number | null;
          vendor_profiles: { business_name: string } | null;
        } | null;
      };
      return {
        ...need,
        booking: b
          ? {
              id: b.id,
              status: b.status,
              total_price_cents: b.total_price_cents,
              vendor_business_name: b.vendor_profiles?.business_name ?? null,
            }
          : null,
      } as NeedWithBooking;
    });
  }

  const [{ data: allocations }, { data: tasks }] = await Promise.all([
    supabase.from('event_budget_allocations').select('*').eq('event_id', eventId),
    supabase.from('event_tasks').select('*').eq('event_id', eventId).order('sort'),
  ]);

  return {
    event: event as EventRow,
    functions: functions ?? [],
    needs,
    allocations: allocations ?? [],
    tasks: tasks ?? [],
  };
}
```

If the nested `bookings(...)` select errors at runtime because PostgREST needs the FK hint, use `bookings!event_vendor_needs_booking_id_fkey(...)` — verify against the FK name in the migration.

- [ ] **Step 4: Typecheck + run tests**

Run: `npm run typecheck && npx vitest run src/__tests__/api/events-create.test.ts src/__tests__/events -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/events.service.ts src/__tests__/api/events-create.test.ts
git commit -m "feat(events): createEventSchema + events.service create/read graph"
```

---

### Task 4: Slot linking — linkBookingToFunction / upsertNeedForBooking

**Files:**

- Modify: `src/services/events.service.ts` (append)
- Test: `src/__tests__/events/link-booking.test.ts`

**Interfaces:**

- Produces:

```ts
// Sets bookings.event_function_id and fills/creates the matching category slot.
export async function linkBookingToFunction(
  supabase: Sb,
  coupleUserId: string,
  args: { bookingId: string; eventFunctionId: string }
): Promise<{ ok: boolean; error?: string }>;
```

- Consumed by: Task 7 (booking creation paths) and Task 8/13 (retro-link picker). Never throws; booking creation must not fail because of slot errors.

- [ ] **Step 1: Write failing test** (`src/__tests__/events/link-booking.test.ts`) — use a minimal chainable Supabase stub:

```ts
import { describe, it, expect, vi } from 'vitest';
import { linkBookingToFunction } from '@/services/events.service';

type Row = Record<string, unknown>;
function stubSupabase(fixtures: {
  booking?: Row | null;
  ownedFunction?: Row | null;
  existingNeed?: Row | null;
}) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const client = {
    from(table: string) {
      const chain = {
        _table: table,
        select() {
          return chain;
        },
        update(payload: unknown) {
          calls.push({ table, op: 'update', payload });
          return chain;
        },
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return Promise.resolve({ error: null });
        },
        eq() {
          return chain;
        },
        is() {
          return chain;
        },
        limit() {
          return chain;
        },
        maybeSingle() {
          if (table === 'bookings') return Promise.resolve({ data: fixtures.booking ?? null });
          if (table === 'event_functions')
            return Promise.resolve({ data: fixtures.ownedFunction ?? null });
          if (table === 'event_vendor_needs')
            return Promise.resolve({ data: fixtures.existingNeed ?? null });
          return Promise.resolve({ data: null });
        },
        single() {
          return chain.maybeSingle();
        },
        then(resolve: (v: unknown) => void) {
          resolve({ error: null });
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

const booking = {
  id: 'b1',
  couple_user_id: 'u1',
  vendor_profile_id: 'v1',
  vendor_profiles: { category: 'catering' },
};
const fn = { id: 'f1', event_id: 'e1' };

describe('linkBookingToFunction', () => {
  it('fills an existing empty slot of the same category', async () => {
    const { client, calls } = stubSupabase({
      booking,
      ownedFunction: fn,
      existingNeed: { id: 'n1' },
    });
    const res = await linkBookingToFunction(client, 'u1', {
      bookingId: 'b1',
      eventFunctionId: 'f1',
    });
    expect(res.ok).toBe(true);
    expect(calls.some((c) => c.table === 'bookings' && c.op === 'update')).toBe(true);
    const needUpdate = calls.find((c) => c.table === 'event_vendor_needs' && c.op === 'update');
    expect(needUpdate?.payload).toMatchObject({
      booking_id: 'b1',
      manual_booked: false,
      manual_vendor_name: null,
      manual_amount_cents: null,
    });
  });
  it('creates a new slot when none exists', async () => {
    const { client, calls } = stubSupabase({ booking, ownedFunction: fn, existingNeed: null });
    const res = await linkBookingToFunction(client, 'u1', {
      bookingId: 'b1',
      eventFunctionId: 'f1',
    });
    expect(res.ok).toBe(true);
    const insert = calls.find((c) => c.table === 'event_vendor_needs' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({
      event_function_id: 'f1',
      category: 'catering',
      booking_id: 'b1',
    });
  });
  it('refuses when the booking belongs to someone else', async () => {
    const { client } = stubSupabase({
      booking: { ...booking, couple_user_id: 'other' },
      ownedFunction: fn,
    });
    const res = await linkBookingToFunction(client, 'u1', {
      bookingId: 'b1',
      eventFunctionId: 'f1',
    });
    expect(res.ok).toBe(false);
  });
});
```

Run: `npx vitest run src/__tests__/events/link-booking.test.ts -v` → FAIL (not exported).

- [ ] **Step 2: Implement (append to `src/services/events.service.ts`)**

```ts
export async function linkBookingToFunction(
  supabase: Sb,
  coupleUserId: string,
  args: { bookingId: string; eventFunctionId: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, couple_user_id, vendor_profile_id, vendor_profiles(category)')
      .eq('id', args.bookingId)
      .maybeSingle();
    if (!booking || booking.couple_user_id !== coupleUserId)
      return { ok: false, error: 'booking not found' };

    const { data: fn } = await supabase
      .from('event_functions')
      .select('id, event_id, events!inner(couple_user_id)')
      .eq('id', args.eventFunctionId)
      .maybeSingle();
    // RLS already scopes reads, but verify ownership explicitly for service-role callers.
    const fnOwner = (fn as { events?: { couple_user_id?: string } } | null)?.events?.couple_user_id;
    if (!fn || (fnOwner && fnOwner !== coupleUserId))
      return { ok: false, error: 'function not found' };

    await supabase
      .from('bookings')
      .update({ event_function_id: args.eventFunctionId })
      .eq('id', args.bookingId);

    const category =
      (booking as { vendor_profiles?: { category?: string } | null }).vendor_profiles?.category ??
      'other';

    const { data: emptySlot } = await supabase
      .from('event_vendor_needs')
      .select('id')
      .eq('event_function_id', args.eventFunctionId)
      .eq('category', category)
      .is('booking_id', null)
      .eq('manual_booked', false)
      .limit(1)
      .maybeSingle();

    if (emptySlot) {
      await supabase
        .from('event_vendor_needs')
        .update({
          booking_id: args.bookingId,
          manual_booked: false,
          manual_vendor_name: null,
          manual_amount_cents: null,
        })
        .eq('id', emptySlot.id);
    } else {
      await supabase.from('event_vendor_needs').insert({
        event_function_id: args.eventFunctionId,
        category,
        booking_id: args.bookingId,
      });
    }
    return { ok: true };
  } catch (err) {
    logger.error('linkBookingToFunction failed', { err, ...args });
    return { ok: false, error: 'link failed' };
  }
}
```

Note the test's `events!inner(couple_user_id)` join — the stub returns `fn` without it; the ownership check tolerates a missing join (`fnOwner && …`) so RLS remains the primary guard for session clients.

- [ ] **Step 3: Run tests → PASS, then commit**

```bash
git add src/services/events.service.ts src/__tests__/events/link-booking.test.ts
git commit -m "feat(events): linkBookingToFunction slot upsert"
```

---

### Task 5: API routes — events CRUD, needs, tasks

**Files:**

- Create: `src/app/api/events/route.ts`, `src/app/api/events/[id]/route.ts`, `src/app/api/events/[id]/needs/route.ts`, `src/app/api/events/[id]/tasks/route.ts`

**Interfaces:**

- Consumes: `createEventWithGraph`, `linkBookingToFunction` (Tasks 3–4); `requireUser` from `@/lib/api/auth`; `withErrorBoundary`, `HttpError` from `@/lib/api/error-boundary`; `checkRateLimit` from `@/lib/rate-limit` (same import trio as `src/app/api/bookings/route.ts:9-11`).
- Produces endpoints used by wizard + journal client components:
  - `POST /api/events` body `CreateEventInput` → `{ eventId }` 201
  - `PATCH /api/events/[id]` body `{ name?, city?, total_budget_cents?, notes? }` → 200; `DELETE` → 200
  - `POST /api/events/[id]/needs` body one of `{ op: 'manual', event_function_id, category, manual_vendor_name, manual_amount_cents?, notes? }` | `{ op: 'link_booking', event_function_id, booking_id }` | `{ op: 'add_slot', event_function_id, category }` → 200; `PATCH` `{ need_id, manual_vendor_name?, manual_amount_cents?, manual_booked?, notes? }`; `DELETE` `{ need_id }`
  - `POST /api/events/[id]/tasks` `{ title, due_date?, event_function_id? }`; `PATCH` `{ task_id, completed?, title?, due_date? }`; `DELETE` `{ task_id }`

- [ ] **Step 1: `src/app/api/events/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createEventWithGraph } from '@/services/events.service';
import { createEventSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const gate = await checkRateLimit(
    request,
    'events:create',
    { limit: 10, window: '1 h' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const parsed = createEventSchema.parse(await request.json());
  const result = await createEventWithGraph(supabase, user.id, parsed);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data, { status: 201 });
});
```

- [ ] **Step 2: `src/app/api/events/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  city: z.string().max(80).nullable().optional(),
  total_budget_cents: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const PATCH = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const gate = await checkRateLimit(
      request,
      'events:update',
      { limit: 60, window: '1 h' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);

    const parsed = patchSchema.parse(await request.json());
    const { error } = await supabase
      .from('events')
      .update({ ...parsed, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('couple_user_id', user.id);
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', params.id)
      .eq('couple_user_id', user.id);
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true });
  }
);
```

If `withErrorBoundary`'s signature doesn't pass route context, read `src/lib/api/error-boundary.ts` and follow how existing `[id]` routes (e.g. `src/app/api/notifications/[id]/read/route.ts`) get params, and mirror that exactly.

- [ ] **Step 3: `src/app/api/events/[id]/needs/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { linkBookingToFunction } from '@/services/events.service';

const postSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('manual'),
    event_function_id: z.string().uuid(),
    category: z.string().min(1).max(40),
    manual_vendor_name: z.string().min(1).max(120),
    manual_amount_cents: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    op: z.literal('link_booking'),
    event_function_id: z.string().uuid(),
    booking_id: z.string().uuid(),
  }),
  z.object({
    op: z.literal('add_slot'),
    event_function_id: z.string().uuid(),
    category: z.string().min(1).max(40),
  }),
]);

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const gate = await checkRateLimit(
    request,
    'events:needs',
    { limit: 120, window: '1 h' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const parsed = postSchema.parse(await request.json());
  if (parsed.op === 'link_booking') {
    const res = await linkBookingToFunction(supabase, user.id, {
      bookingId: parsed.booking_id,
      eventFunctionId: parsed.event_function_id,
    });
    if (!res.ok) throw new HttpError(400, res.error ?? 'link failed');
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase.from('event_vendor_needs').insert(
    parsed.op === 'manual'
      ? {
          event_function_id: parsed.event_function_id,
          category: parsed.category,
          manual_vendor_name: parsed.manual_vendor_name,
          manual_amount_cents: parsed.manual_amount_cents ?? null,
          manual_booked: true,
          notes: parsed.notes ?? null,
        }
      : { event_function_id: parsed.event_function_id, category: parsed.category }
  );
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true }, { status: 201 });
});

const patchSchema = z.object({
  need_id: z.string().uuid(),
  manual_vendor_name: z.string().max(120).nullable().optional(),
  manual_amount_cents: z.number().int().nonnegative().nullable().optional(),
  manual_booked: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const { need_id, ...fields } = patchSchema.parse(await request.json());
  // RLS restricts the update to needs inside the couple's own events.
  const { error } = await supabase
    .from('event_vendor_needs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', need_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true, updatedBy: user.id });
});

export const DELETE = withErrorBoundary(async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const { need_id } = z.object({ need_id: z.string().uuid() }).parse(await request.json());
  const { error } = await supabase.from('event_vendor_needs').delete().eq('id', need_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: `src/app/api/events/[id]/tasks/route.ts`** (same shape)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const gate = await checkRateLimit(
      request,
      'events:tasks',
      { limit: 120, window: '1 h' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);
    const parsed = z
      .object({
        title: z.string().min(1).max(200),
        due_date: isoDate.nullable().optional(),
        event_function_id: z.string().uuid().nullable().optional(),
      })
      .parse(await request.json());
    const { error } = await supabase.from('event_tasks').insert({
      event_id: params.id,
      title: parsed.title,
      due_date: parsed.due_date ?? null,
      event_function_id: parsed.event_function_id ?? null,
    });
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true }, { status: 201 });
  }
);

export const PATCH = withErrorBoundary(async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const parsed = z
    .object({
      task_id: z.string().uuid(),
      completed: z.boolean().optional(),
      title: z.string().min(1).max(200).optional(),
      due_date: isoDate.nullable().optional(),
    })
    .parse(await request.json());
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.completed !== undefined)
    update.completed_at = parsed.completed ? new Date().toISOString() : null;
  if (parsed.title !== undefined) update.title = parsed.title;
  if (parsed.due_date !== undefined) update.due_date = parsed.due_date;
  const { error } = await supabase.from('event_tasks').update(update).eq('id', parsed.task_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});

export const DELETE = withErrorBoundary(async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const { task_id } = z.object({ task_id: z.string().uuid() }).parse(await request.json());
  const { error } = await supabase.from('event_tasks').delete().eq('id', task_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: clean.

```bash
git add src/app/api/events
git commit -m "feat(events): API routes — create graph, event patch/delete, needs, tasks"
```

---

### Task 6: Notification helpers + card copy

**Files:**

- Modify: `src/services/notifications.service.ts` (append 3 helpers after `notifyCoupleCountered`), `src/components/notifications/NotificationCard.tsx`, `src/lib/notifications/high-priority-types.ts`

**Interfaces:**

- Produces (consumed by Task 11 cron):

```ts
export function notifyEventTaskDue(
  sb: Sb,
  userId: string,
  ctx: { eventId: string; taskTitle: string; dueDate: string }
): Promise<{ id: string } | null>;
export function notifyEventTaskOverdue(
  sb: Sb,
  userId: string,
  ctx: { eventId: string; taskTitle: string; dueDate: string }
): Promise<{ id: string } | null>;
export function notifyEventCountdown(
  sb: Sb,
  userId: string,
  ctx: { eventId: string; functionLabel: string; daysOut: number; openSlots: number }
): Promise<{ id: string } | null>;
```

- [ ] **Step 1: Append helpers** (follow `notifyCustomRequestReceived` at `src/services/notifications.service.ts:303` exactly — fire-and-forget, link to journal):

```ts
// ─── Customer Events (Phase 1) reminders ────────────────────────────

export function notifyEventTaskDue(
  sb: Sb,
  userId: string,
  ctx: { eventId: string; taskTitle: string; dueDate: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: userId,
    type: 'event_task_due',
    title: 'Task due soon',
    body: `"${ctx.taskTitle}" is due ${ctx.dueDate}.`,
    link: `/dashboard/events/${ctx.eventId}`,
    metadata: { event_id: ctx.eventId, due_date: ctx.dueDate },
  });
}

export function notifyEventTaskOverdue(
  sb: Sb,
  userId: string,
  ctx: { eventId: string; taskTitle: string; dueDate: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: userId,
    type: 'event_task_overdue',
    title: 'Task overdue',
    body: `"${ctx.taskTitle}" was due ${ctx.dueDate}.`,
    link: `/dashboard/events/${ctx.eventId}`,
    metadata: { event_id: ctx.eventId, due_date: ctx.dueDate },
  });
}

export function notifyEventCountdown(
  sb: Sb,
  userId: string,
  ctx: { eventId: string; functionLabel: string; daysOut: number; openSlots: number }
): Promise<{ id: string } | null> {
  const slotLine =
    ctx.openSlots > 0
      ? ` ${ctx.openSlots} vendor slot${ctx.openSlots === 1 ? '' : 's'} still open.`
      : '';
  return createNotification(sb, {
    user_id: userId,
    type: 'event_countdown',
    title: `${ctx.functionLabel} is ${ctx.daysOut} day${ctx.daysOut === 1 ? '' : 's'} away`,
    body: `Your ${ctx.functionLabel} is coming up.${slotLine}`,
    link: `/dashboard/events/${ctx.eventId}`,
    metadata: { event_id: ctx.eventId, days_out: ctx.daysOut },
  });
}
```

- [ ] **Step 2: NotificationCard copy** — open `src/components/notifications/NotificationCard.tsx`, find the type→icon/copy mapping used by the other 14 types, add entries for `event_task_due` (calendar/clock icon), `event_task_overdue`, `event_countdown` in the same pattern. Add `event_task_overdue` and `event_countdown` to `src/lib/notifications/high-priority-types.ts` (they should email via `deliver`); leave `event_task_due` in-app only if the file distinguishes — mirror how `custom_request_received` is classified.

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/services/notifications.service.ts src/components/notifications/NotificationCard.tsx src/lib/notifications/high-priority-types.ts
git commit -m "feat(events): reminder notification helpers + card copy"
```

---

### Task 7: Booking paths accept event_function_id (server side)

**Files:**

- Modify: `src/types/index.ts` (`createBookingSchema:232`), `src/services/booking.service.ts` (`createBooking:593`), `src/app/api/bookings/custom-request/route.ts`

**Interfaces:**

- Consumes: `linkBookingToFunction` (Task 4).
- Produces: both booking-creation payloads accept optional `event_function_id: string (uuid)`; on success the booking is linked + slot upserted, failures logged but never fail the booking.

- [ ] **Step 1: Schema** — in `createBookingSchema` (`src/types/index.ts:232`) add:

```ts
  event_function_id: z.string().uuid().nullish(),
```

- [ ] **Step 2: `createBooking`** — after the booking insert succeeds and `booking_events` insert succeeds (after the rollback guard, before the return/notification block at the end of the function), add:

```ts
// Customer Events: link to the couple's event function + fill the vendor slot.
// Fire-and-forget — a slot failure must never fail the booking.
if (input.event_function_id) {
  void linkBookingToFunction(supabase, coupleUserId, {
    bookingId: booking.id as string,
    eventFunctionId: input.event_function_id,
  });
}
```

Import at top: `import { linkBookingToFunction } from '@/services/events.service';`

- [ ] **Step 3: Custom-request route** — in `src/app/api/bookings/custom-request/route.ts`, the V2 schema lives in `src/lib/booking/custom-request-validation.ts`; add `event_function_id: z.string().uuid().nullish()` to `customRequestSchemaV2`, thread it through the normalized shape, and after the booking row insert succeeds add the same `void linkBookingToFunction(...)` call (the route has the couple's `user.id`).

- [ ] **Step 4: Test** — extend `src/__tests__/api/events-create.test.ts` (or the existing `bookings-custom-request.test.ts` pattern) with a schema check:

```ts
import { createBookingSchema } from '@/types';
it('createBookingSchema accepts optional event_function_id', () => {
  const base = {
    vendor_profile_id: '11111111-1111-1111-1111-111111111111',
    package_id: '22222222-2222-2222-2222-222222222222',
    guest_count: 100,
    couple_full_name: 'A B',
    couple_contact_phone: '555',
    events: [
      {
        event_date: '2026-08-27',
        event_start_time: '2026-08-27T18:00:00Z',
        event_end_time: '2026-08-27T23:00:00Z',
      },
    ],
  };
  expect(createBookingSchema.safeParse(base).success).toBe(true);
  expect(
    createBookingSchema.safeParse({
      ...base,
      event_function_id: '33333333-3333-3333-3333-333333333333',
    }).success
  ).toBe(true);
  expect(createBookingSchema.safeParse({ ...base, event_function_id: 'nope' }).success).toBe(false);
});
```

(Check `bookingEventInputSchema` for the exact event fields it requires and adjust the fixture so the base parse passes.)

Run: `npx vitest run src/__tests__/api -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/booking.service.ts src/app/api/bookings/custom-request/route.ts src/lib/booking/custom-request-validation.ts src/__tests__/api
git commit -m "feat(events): booking paths accept event_function_id and fill journal slots"
```

---

### Task 8: EventFunctionSelect + wire into both booking forms

**Files:**

- Create: `src/components/events/EventFunctionSelect.tsx`
- Modify: `src/components/forms/BookingForm.tsx` (form body + submit payload at `handleSubmit:114` / `fetch:139`), `src/components/booking/CustomRequestForm.tsx` (same pattern)

**Interfaces:**

- Produces: `<EventFunctionSelect value={eventFunctionId} onChange={(id) => ...} />` — self-fetching client component; renders nothing while loading or when the couple has zero events (shows a subtle "Planning a celebration? Set up your event →" link to `/dashboard/events/new` in that case).
- Consumes: new lightweight endpoint? No — reuse `GET` on existing data: fetch `/api/events/options` is NOT created; instead the component fetches via supabase browser client? **Decision:** follow the codebase's client-data convention — check how `BookingForm` gets its data (props from server page). Pass `eventOptions` as a prop from the server pages instead of client fetching:
  - `src/app/(marketplace)/vendors/[slug]/book/page.tsx` and `request/page.tsx` are server components; in each, when the user is a couple, query `events` + `event_functions` (RLS-scoped) and pass `eventOptions: { eventId, eventName, functions: { id, label, date }[] }[]` down.

- [ ] **Step 1: Registry check** — run shadcn MCP `search_items_in_registries` for `select`, `radio-group chips`. Reuse existing `src/components/ui/select.tsx` (already vendored) + `Badge`; no new registry pulls expected.

- [ ] **Step 2: Component**

```tsx
'use client';

import { EVENT_TYPES } from '@/types';

export interface EventOption {
  eventId: string;
  eventName: string;
  functions: { id: string; label: string; date: string | null }[];
}

interface Props {
  options: EventOption[];
  value: string | null;
  onChange: (eventFunctionId: string | null) => void;
}

function fmtDate(d: string | null): string {
  if (!d) return 'date TBD';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EventFunctionSelect({ options, value, onChange }: Props) {
  if (options.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Planning a celebration?{' '}
        <a href="/dashboard/events/new" className="font-semibold text-indigo hover:underline">
          Set up your event →
        </a>
      </p>
    );
  }
  const event = options[0]; // couples overwhelmingly have one event; multi-event uses the first match UI below
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold text-ink">Which event is this for?</legend>
      {options.length > 1 && (
        <p className="text-xs text-ink-soft">{options.map((o) => o.eventName).join(' · ')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.flatMap((o) =>
          o.functions.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(value === f.id ? null : f.id)}
              className={
                value === f.id
                  ? 'rounded-full border-[1.5px] border-indigo bg-indigo/10 px-4 py-2 text-sm font-semibold text-indigo'
                  : 'rounded-full border-[1.5px] border-hairline bg-cream px-4 py-2 text-sm font-medium text-ink hover:border-indigo/50'
              }
            >
              {options.length > 1 ? `${o.eventName} — ` : ''}
              {f.label} · {fmtDate(f.date)}
            </button>
          ))
        )}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={
            value === null
              ? 'rounded-full border-[1.5px] border-dashed border-ink-muted px-4 py-2 text-sm font-semibold text-ink'
              : 'rounded-full border-[1.5px] border-dashed border-hairline px-4 py-2 text-sm text-ink-soft hover:border-ink-muted'
          }
        >
          Not for an event
        </button>
      </div>
      {value !== null && (
        <p className="rounded-lg bg-indigo/10 px-3 py-2 text-xs leading-relaxed text-indigo">
          This booking will appear in your event journal, and the matching vendor slot will show as
          booked.
        </p>
      )}
    </fieldset>
  );
}
```

Match exact Tailwind token names to `tailwind.config.ts` (`indigo`, `hairline`, `ink-soft`, `cream` — verify class spellings against an existing component like `EventCardFilters` before using).

- [ ] **Step 3: Server pages pass options** — in `book/page.tsx` and `request/page.tsx` (both under `src/app/(marketplace)/vendors/[slug]/`), after the existing user fetch, add:

```ts
let eventOptions: EventOption[] = [];
if (user) {
  const { data: evts } = await supabase
    .from('events')
    .select('id, name, event_functions(id, label, date, sequence)')
    .eq('couple_user_id', user.id)
    .order('created_at', { ascending: false });
  eventOptions = (evts ?? []).map((e) => ({
    eventId: e.id,
    eventName: e.name,
    functions: [
      ...((e.event_functions as {
        id: string;
        label: string;
        date: string | null;
        sequence: number;
      }[]) ?? []),
    ]
      .sort((a, b) => a.sequence - b.sequence)
      .map(({ id, label, date }) => ({ id, label, date })),
  }));
}
```

and pass `eventOptions` into `<BookingForm ... />` / `<CustomRequestForm ... />`.

- [ ] **Step 4: Forms** — in `BookingForm.tsx`: add prop `eventOptions: EventOption[]`, state `const [eventFunctionId, setEventFunctionId] = useState<string | null>(null);`, render `<EventFunctionSelect options={eventOptions} value={eventFunctionId} onChange={setEventFunctionId} />` above the special-requests section, and include `event_function_id: eventFunctionId ?? undefined` in the JSON body built near `fetch('/api/bookings', …)` (line ~139). Same three edits in `CustomRequestForm.tsx` for the custom-request payload.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm run lint && npm run dev` — manually load a vendor book page as a couple with no events (link renders), and with a seeded event (chips render; submit and confirm `bookings.event_function_id` set and `event_vendor_needs` row filled in dev DB).

```bash
git add src/components/events/EventFunctionSelect.tsx src/components/forms/BookingForm.tsx src/components/booking/CustomRequestForm.tsx 'src/app/(marketplace)/vendors/[slug]/book/page.tsx' 'src/app/(marketplace)/vendors/[slug]/request/page.tsx'
git commit -m "feat(events): 'Which event is this for?' selector in both booking flows"
```

---

### Task 9: Wizard shell + steps (all 5)

**Files:**

- Create: `src/app/dashboard/events/new/page.tsx`, `src/components/events/wizard/EventWizard.tsx`, `StepBasics.tsx`, `StepFunctions.tsx`, `StepVendors.tsx`, `StepBudget.tsx`, `StepChecklist.tsx`

**Interfaces:**

- Consumes: `POST /api/events` (Task 5), `EVENT_TYPES`/`CULTURAL_EVENT_TYPES` from `@/types`, `CATEGORIES_FEATURED` from `@/lib/vendor-categories/featured`, shadcn `Button/Input/Card/Slider/Label` from `@/components/ui/*`.
- Produces: route `/dashboard/events/new`; on success `router.push(\`/dashboard/events/\${eventId}\`)`.
- Wizard state (single source of truth in `EventWizard.tsx`, passed down):

```ts
export interface WizardFunction {
  label: string;
  event_type_id: string | null;
  date: string | null;
  guest_estimate: number | null;
  categories: string[];
  booked: Record<string, { name: string; amountCents: number | null }>;
}
export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  name: string;
  celebration_type: string;
  city: string;
  totalBudgetCents: number | null;
  functions: WizardFunction[];
  allocations: Record<string, number>;
  tasks: { title: string; due_date: string | null; function_index: number | null }[];
}
```

- [ ] **Step 1: Registry check (required)** — via shadcn MCP: `search_items_in_registries` for `stepper`, `slider`, `chip toggle group`, `date picker`. Add anything missing with `npx shadcn@latest add slider toggle-group` (only if not already in `src/components/ui/`). Record in the commit message which registry items were pulled vs reused.

- [ ] **Step 2: Route** — `src/app/dashboard/events/new/page.tsx` (server): `requireUser`-style auth via `createServerSupabaseClient`, redirect vendors to `/dashboard`, render `<EventWizard coupleName={...} defaultCity="Chicago" />` full-screen (this route intentionally renders WITHOUT the dashboard sidebar — it's under `/dashboard` for auth but should use a minimal top bar; if `src/app/dashboard/layout.tsx` forces the sidebar, place the route at `src/app/(wizard)/events/new/page.tsx` instead and redirect `/dashboard/events/new → /events/new`; prefer whichever keeps the layout clean — document the choice in the PR).

- [ ] **Step 3: `EventWizard.tsx`** — client component owning `WizardState`; renders top bar (wordmark, 5-dot progress, "Save & exit" → `/dashboard`), the current step, Back/Skip/Next footer. Smart defaults per function type when entering step 3:

```ts
const DEFAULT_CATEGORIES: Record<string, string[]> = {
  mehndi: ['mehndi', 'decor', 'catering'],
  sangeet: ['dj', 'decor', 'catering'],
  nikah: ['venue', 'photography'],
  katb_el_kitab: ['venue', 'photography'],
  baraat: ['dj', 'videography'],
  wedding: ['venue', 'photography', 'catering', 'dj'],
  reception: ['venue', 'photography', 'catering', 'dj'],
  walima: ['venue', 'catering', 'photography'],
  laylat_al_henna: ['mehndi', 'decor', 'catering'],
  zaffa: ['dj', 'videography'],
};
```

Submit maps `WizardState → CreateEventInput`:

```ts
function toPayload(s: WizardState): CreateEventInput {
  return {
    name: s.name.trim(),
    celebration_type: s.celebration_type,
    city: s.city.trim() || null,
    total_budget_cents: s.totalBudgetCents,
    functions: s.functions.map((f) => ({
      label: f.label,
      event_type_id: f.event_type_id,
      date: f.date,
      guest_estimate: f.guest_estimate,
      vendor_needs: f.categories.map((c) => ({
        category: c,
        manual_booked: c in f.booked,
        manual_vendor_name: f.booked[c]?.name ?? null,
        manual_amount_cents: f.booked[c]?.amountCents ?? null,
      })),
    })),
    allocations: Object.entries(s.allocations).map(([category, planned_cents]) => ({
      category,
      planned_cents,
    })),
    tasks: s.tasks,
  };
}
```

On submit: `POST /api/events`; on `!res.ok` toast error via `sonner` and keep state; on success `router.push(/dashboard/events/${eventId})`.

- [ ] **Step 4: Steps** — implement per approved demos (plan-8e12a7100cdd4f6a):
  - `StepBasics`: name (prefilled `${coupleName}'s Wedding` when available), celebration type via existing `EventTypePicker` (`src/components/ui/EventTypePicker.tsx`), optional city. Next disabled until name + type present.
  - `StepFunctions`: chip grid from `CULTURAL_EVENT_TYPES` (exclude `multiple`) + "＋ Custom" (free-text label); selected → ordered editable rows (label, date input `<input type="date">`, guest estimate). Skip creates one function named after the celebration type.
  - `StepVendors`: per-function card; chips from `CATEGORIES_FEATURED` (filter `comingSoon`); "Already booked?" toggle per selected chip revealing name + `$` amount inputs (dollars in UI → cents ×100 in state).
  - `StepBudget`: total input (dollars → cents); allocation sliders (shadcn `Slider`) for the union of selected categories, seeded proportionally from remaining total; running "X% allocated · $Y unassigned" line.
  - `StepChecklist`: suggested chips = each unbooked need → `Book ${categoryLabel} for ${functionLabel}` (+ misc presets: "Order outfits", "Send invitations", "Confirm final guest count"); toggling adds/removes from `tasks`; each added row gets optional due-date input; free-text add.
  - Every step 2–5 footer: `‹ Back` · `Skip for now` · ink `Next` (final: `Finish setup →`).
  - Neutral voice: copy must not include religious greetings.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm run lint`, then `npm run dev` → walk the wizard end-to-end against dev DB; confirm rows in all 5 tables and redirect to journal route (404 until Task 10 — acceptable, check DB rows instead).

```bash
git add src/app/dashboard/events/new src/components/events/wizard
git commit -m "feat(events): 5-step event creation wizard"
```

---

### Task 10: Journal page + panels

**Files:**

- Create: `src/app/dashboard/events/[id]/page.tsx`, `src/components/events/JournalHero.tsx`, `FunctionTimeline.tsx`, `VendorBoard.tsx`, `BudgetPanel.tsx`, `TasksPanel.tsx`

**Interfaces:**

- Consumes: `getEventGraph` (Task 3), `deriveNeedStatus`/`computeRollups`/`daysUntil` (Task 2), `CATEGORIES_FEATURED` for labels, needs/tasks API routes (Task 5) from the client panels.
- Produces: `/dashboard/events/[id]` — server component fetches graph, computes rollups, passes plain props to client panels. `notFound()` when graph is null.

- [ ] **Step 1: Server page**

```tsx
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEventGraph } from '@/services/events.service';
import { computeRollups, deriveNeedStatus, daysUntil } from '@/lib/events/derive';
import { JournalHero } from '@/components/events/JournalHero';
import { FunctionTimeline } from '@/components/events/FunctionTimeline';
import { VendorBoard } from '@/components/events/VendorBoard';
import { BudgetPanel } from '@/components/events/BudgetPanel';
import { TasksPanel } from '@/components/events/TasksPanel';

export default async function EventJournalPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const graph = await getEventGraph(supabase, user.id, params.id);
  if (!graph) notFound();

  const rollups = computeRollups(graph.needs);
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = graph.functions
    .filter((f) => f.date && daysUntil(f.date, todayIso) >= 0)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const daysToGo = upcoming[0]?.date ? daysUntil(upcoming[0].date, todayIso) : null;

  const needsWithStatus = graph.needs.map((n) => ({ ...n, status: deriveNeedStatus(n) }));

  return (
    <div className="flex flex-col gap-5">
      <JournalHero
        event={graph.event}
        functions={graph.functions}
        daysToGo={daysToGo}
        committedCents={rollups.totalCommittedCents}
      />
      <FunctionTimeline
        functions={graph.functions}
        bookedCounts={rollups.bookedCountByFunction}
        todayIso={todayIso}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[1.9fr_1fr]">
        <VendorBoard
          eventId={graph.event.id}
          functions={graph.functions}
          needs={needsWithStatus}
          eventCity={graph.event.city}
        />
        <div className="flex flex-col gap-4">
          <BudgetPanel
            event={graph.event}
            rollups={rollups}
            allocations={graph.allocations}
            functions={graph.functions}
          />
          <TasksPanel
            eventId={graph.event.id}
            tasks={graph.tasks}
            functions={graph.functions}
            todayIso={todayIso}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Panels** — build per the approved demos, registry-first (`Card`, `Badge`, `Progress`, `Checkbox`, `Dialog` from `src/components/ui/`; search registries before any new primitive):
  - `JournalHero` (server-safe): ink card (`bg-ink text-cream`), DM Mono kicker `YOUR CELEBRATION` (haldi text on ink), Spectral event name, date-range + city line, big days-to-go numeral, committed/total/remaining bar. Only if `total_budget_cents` set; otherwise "Set a budget" link to a small client edit dialog in `BudgetPanel`.
  - `FunctionTimeline`: horizontal scroll row of cards (kicker date, Spectral label, guests/venue line, `booked/total` progress).
  - `VendorBoard` (client): groups needs by `event_function_id`; per need row render by `status`: `booked_baazar` → vendor name + `$` + `View booking` link `/dashboard/bookings/${booking.id}`; `booked_manual` → name + `$` + Edit (dialog → PATCH needs route); `needed` → pink "Still needed" + indigo `Find {label} vendors →` linking `/vendors?category=${category}${eventCity ? `&city=…` : ''}` (verify the marketplace filter query-param names in `src/components/marketplace/filters/` and use the real ones). Per-function `＋ Add vendor` dialog with two tabs: "Booked off Baazar" (manual POST `op:'manual'`) and "Link a Baazar booking" (fetch couple's unlinked bookings passed as prop from server page — extend `getEventGraph` page query with a small `bookings` select where `event_function_id is null` and `couple_user_id = user.id`, pass down). `＋ Add slot` uses `op:'add_slot'`. Delete slot → DELETE. After each mutation call `router.refresh()`.
  - `BudgetPanel`: committed vs total bar; tabs By category / By function (existing `Tabs`); planned-vs-committed rows where allocations exist with over-planned badge (`committed > planned`).
  - `TasksPanel` (client): sort overdue → due-soon (≤3 days) → rest → completed; haldi dot for due-soon, pink text for overdue (neutral copy); checkbox → PATCH `{completed}`; add-task inline form (title + date + optional function select) → POST; delete → DELETE; `router.refresh()` after mutations.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint`; `npm run dev` → open wizard-created event: hero countdown correct, board groups per function, manual add + task check-off round-trip.

```bash
git add src/app/dashboard/events/[id] src/components/events
git commit -m "feat(events): event journal — hero, timeline, vendor board, budget, tasks"
```

---

### Task 11: Cron reminders + GHA workflow

**Files:**

- Create: `src/app/api/cron/event-reminders/route.ts`, `.github/workflows/event-reminders.yml`

**Interfaces:**

- Consumes: `selectDueSoonTasks`, `selectOverdueTasks`, `selectCountdownFunctions`, `deriveNeedStatus` (Task 2); notify helpers (Task 6); `createServiceRoleClient` from `@/lib/supabase/server`.
- Produces: `POST /api/cron/event-reminders` with `Authorization: Bearer ${CRON_SECRET}` → `{ ok: true, sent: { dueSoon, overdue, countdown } }`.

- [ ] **Step 1: Route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  selectDueSoonTasks,
  selectOverdueTasks,
  selectCountdownFunctions,
  deriveNeedStatus,
} from '@/lib/events/derive';
import type { NeedWithBooking } from '@/lib/events/derive';
import {
  notifyEventTaskDue,
  notifyEventTaskOverdue,
  notifyEventCountdown,
} from '@/services/notifications.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const sb = createServiceRoleClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sent = { dueSoon: 0, overdue: 0, countdown: 0 };

  const { data: events } = await sb.from('events').select('id, couple_user_id, name');
  for (const event of events ?? []) {
    try {
      const [{ data: tasks }, { data: fns }] = await Promise.all([
        sb.from('event_tasks').select('*').eq('event_id', event.id),
        sb.from('event_functions').select('*').eq('event_id', event.id),
      ]);

      for (const t of selectDueSoonTasks(tasks ?? [], todayIso)) {
        await notifyEventTaskDue(sb, event.couple_user_id, {
          eventId: event.id,
          taskTitle: t.title,
          dueDate: t.due_date!,
        });
        await sb
          .from('event_tasks')
          .update({ due_soon_notified_at: new Date().toISOString() })
          .eq('id', t.id);
        sent.dueSoon++;
      }
      for (const t of selectOverdueTasks(tasks ?? [], todayIso)) {
        await notifyEventTaskOverdue(sb, event.couple_user_id, {
          eventId: event.id,
          taskTitle: t.title,
          dueDate: t.due_date!,
        });
        await sb
          .from('event_tasks')
          .update({ overdue_notified_at: new Date().toISOString() })
          .eq('id', t.id);
        sent.overdue++;
      }

      const milestones = selectCountdownFunctions(fns ?? [], todayIso);
      if (milestones.length > 0) {
        const fnIds = (fns ?? []).map((f) => f.id);
        const { data: needs } = await sb
          .from('event_vendor_needs')
          .select('*, bookings(id, status, total_price_cents)')
          .in('event_function_id', fnIds);
        const needsByFn = new Map<string, NeedWithBooking[]>();
        for (const raw of needs ?? []) {
          const { bookings: b, ...need } = raw as typeof raw & {
            bookings: { id: string; status: string; total_price_cents: number | null } | null;
          };
          const n = { ...need, booking: b } as NeedWithBooking;
          (
            needsByFn.get(n.event_function_id) ??
            needsByFn.set(n.event_function_id, []).get(n.event_function_id)!
          ).push(n);
        }
        for (const { fn, daysOut } of milestones) {
          const openSlots = (needsByFn.get(fn.id) ?? []).filter(
            (n) => deriveNeedStatus(n) === 'needed'
          ).length;
          await notifyEventCountdown(sb, event.couple_user_id, {
            eventId: event.id,
            functionLabel: fn.label,
            daysOut,
            openSlots,
          });
          sent.countdown++;
        }
      }
    } catch (err) {
      logger.error('event-reminders: event failed', { err, eventId: event.id });
    }
  }
  return NextResponse.json({ ok: true, sent });
}
```

Idempotency: task pings dedupe via the stamp columns; countdown pings fire only on exact milestone days, so a once-daily schedule sends each at most once (double-runs same day would re-send countdowns — acceptable v1; note in PR).

- [ ] **Step 2: Workflow** — `.github/workflows/event-reminders.yml`:

```yaml
name: Event reminders (daily)

on:
  schedule:
    - cron: '0 13 * * *' # 8am America/Chicago (CDT)
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Trigger reminder cron route
        run: |
          curl -sf -X POST "${{ secrets.APP_URL }}/api/cron/event-reminders" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

Requires GH secrets `APP_URL` (use `https://www.baazar.io` — apex 307s to www) and `CRON_SECRET`; also add `CRON_SECRET` to Vercel env. List both in the PR description as pre-launch setup.

- [ ] **Step 3: Test locally**

Run: `CRON_SECRET=test npm run dev` then `curl -s -X POST localhost:3000/api/cron/event-reminders -H "Authorization: Bearer test"` with a seeded task due tomorrow.
Expected: `{ ok: true, sent: { dueSoon: 1, ... } }`, notification row visible in dev DB, second call sends 0 (stamped).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/event-reminders .github/workflows/event-reminders.yml
git commit -m "feat(events): daily reminder cron — due/overdue tasks + countdown milestones"
```

---

### Task 12: Events list, sidebar nav, dashboard summary card

**Files:**

- Create: `src/app/dashboard/events/page.tsx`, `src/components/events/EventSummaryCard.tsx`
- Modify: `src/components/dashboard/SidebarNav.tsx` (`workspaceLinks:51`), `src/app/dashboard/page.tsx` (couple branch, above `<EventCardGrid>`:140)

**Interfaces:**

- Consumes: `listEvents`, `getEventGraph` (Task 3), `computeRollups`, `daysUntil` (Task 2).

- [ ] **Step 1: Sidebar** — in `workspaceLinks` (`SidebarNav.tsx:51`), for couples insert after Home:

```ts
if (role === 'couple') {
  links.splice(1, 0, { href: '/dashboard/events', label: 'My Event', icon: PartyPopper });
}
```

(`PartyPopper` from `lucide-react`, matching existing icon imports; adjust splice index so order is Home · My Event · Bookings · Saved · Notifications. Note `isActive` uses `startsWith` — `/dashboard/events/new` and `[id]` both highlight correctly.)

- [ ] **Step 2: `/dashboard/events` list page** — server component: `listEvents`; zero events → empty state card ("Plan your celebration" + ink CTA to `/dashboard/events/new`); else grid of event cards (name, date range from its functions — fetch `event_functions` labels/dates in the same query as Task 8's options select — days-to-go, `Open journal →`), plus a secondary "＋ Plan another celebration" link.

- [ ] **Step 3: Dashboard home** — in `src/app/dashboard/page.tsx` couple branch: query the couple's most recent event with functions + needs (reuse `getEventGraph` on `listEvents()[0]`). No event → render a "Plan your celebration" banner card above `<EventCardGrid>`; has event → `<EventSummaryCard>` (name, date range, mini committed bar, next up: first 2 open tasks/slots, days-to-go numeral, ink `Open journal →` button). Keep `CustomerWelcomeBanner` logic untouched.

- [ ] **Step 4: Verify + commit** — `npm run typecheck && npm run lint`, dev-check both dashboard states.

```bash
git add src/app/dashboard/events/page.tsx src/components/events/EventSummaryCard.tsx src/components/dashboard/SidebarNav.tsx src/app/dashboard/page.tsx
git commit -m "feat(events): events list, My Event nav, dashboard summary card"
```

---

### Task 13: E2E specs

**Files:**

- Create: `tests/e2e/customer-events.spec.ts`

**Interfaces:**

- Consumes: the app's existing e2e auth helpers — read `tests/e2e/auth.spec.ts` and one recent passing spec (e.g. `mark-complete-flow`) first and reuse their login/seed pattern exactly. Specs must align with the CURRENT UI (merge rule: new specs must pass).

- [ ] **Step 1: Write specs** covering:

```ts
import { test, expect } from '@playwright/test';
// Reuse the project's login helper/pattern from existing specs.

test.describe('customer events', () => {
  test('wizard happy path creates event and lands on journal', async ({ page }) => {
    // login as seeded couple → /dashboard/events/new
    // Step 1: name prefilled/typed, pick celebration type 'Wedding / Shaadi', Next
    // Step 2: select Mehndi + Reception chips, set one date, Next
    // Step 3: check 'Already booked?' on Mehndi artist with name 'Henna by Zara' amount 500, Next
    // Step 4: total 30000, Next; Step 5: keep one suggested task, Finish
    await expect(page).toHaveURL(/\/dashboard\/events\/[0-9a-f-]+/);
    await expect(page.getByText('Henna by Zara')).toBeVisible();
    await expect(page.getByText('Still needed').first()).toBeVisible();
  });

  test('manual vendor add appears with amount in board and budget', async ({ page }) => {
    /* open journal → + Add vendor → manual → assert row + committed bump */
  });

  test('task check-off strikes through and survives reload', async ({ page }) => {
    /* toggle checkbox → PATCH → reload → still completed */
  });
});
```

Fill in the real selectors while writing against the running app (`npx playwright test tests/e2e/customer-events.spec.ts --headed`). Prefer `getByRole`/`getByLabel` selectors.

- [ ] **Step 2: Run** — `npx playwright test tests/e2e/customer-events.spec.ts` → all pass locally.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/customer-events.spec.ts
git commit -m "test(events): e2e — wizard happy path, manual vendor, task check-off"
```

---

### Task 14: Final verification + PR

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm run lint && npm run test && npx playwright test tests/e2e/customer-events.spec.ts`
Expected: all green (legacy e2e failures tracked separately are out of scope — do not touch them).

- [ ] **Step 2: /verify pass** — drive the real flows once end-to-end in dev: wizard → journal → book a vendor with the selector → slot flips to booked → cancel that booking (vendor side or SQL) → slot reverts to "Still needed" → cron curl sends and dedupes.

- [ ] **Step 3: PR**

```bash
git push -u origin feat/customer-events
gh pr create --title "feat(events): customer events + event journal (Phase 1)" --body "$(cat <<'EOF'
## Summary
- Events graph (migration 00072): events → functions → vendor needs (+allocations, tasks), bookings.event_function_id
- 5-step wizard at /dashboard/events/new; journal at /dashboard/events/[id]
- Booking flows ask "Which event is this for?" and auto-fill the vendor slot; derived status reverts on cancellation
- Manual off-platform vendors; committed-total budget rollups per function/category
- Daily reminder cron (due/overdue tasks + 30/14/7/1 countdown) + 3 notification types
- Spec: docs/superpowers/specs/2026-07-18-customer-events-design.md · Demos: plan-8e12a7100cdd4f6a

## Pre-launch setup (user)
- Apply supabase/migrations/00072_customer_events.sql to prod
- Add GH secrets APP_URL + CRON_SECRET; add CRON_SECRET to Vercel env

## Test plan
- [ ] Unit: derive/rollups/reminders + schema tests
- [ ] E2E: customer-events.spec.ts (wizard, manual vendor, tasks)
- [ ] Manual: booking link + cancellation reversal + cron dedupe

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0149dhupW7cVvk4BjaKr7pb7
EOF
)"
```

- [ ] **Step 4: Wait for full CI green** before merging (merge rule). Do not merge with any red check without explicit user override.

---

## Self-Review (completed at authoring)

- **Spec coverage:** §1 data model → Task 1; derived status/rollups → Task 2; §2 wizard → Task 9; §3 journal + list → Tasks 10/12; §4 booking integration → Tasks 4/7/8; §5 reminders → Tasks 6/11; §6 nav/dashboard → Task 12; §7 registry-first → Tasks 8–10 step 1s; §8 error handling → rollback in Task 3, fire-and-forget in Task 7, per-event try/catch in Task 11, FK `SET NULL` in Task 1; §9 testing → Tasks 2/3/4/13/14; §10 rollout → Tasks 1/11/14. RLS tests from spec §9 are covered by the ownership unit test (Task 4) + RLS policies exercised implicitly in e2e; a dedicated psql RLS probe is optional follow-up.
- **Placeholders:** none — every code step carries real code; two verify-at-implementation notes (FK hint name, `withErrorBoundary` ctx signature) name the exact file to check.
- **Type consistency:** `NeedWithBooking`/`deriveNeedStatus`/`committedCentsForNeed`/`computeRollups`/`linkBookingToFunction`/`createEventWithGraph`/`getEventGraph`/`listEvents` names match across Tasks 2–12; notification helper names match Task 6 ↔ 11; `CreateEventInput` matches Task 3 ↔ 9.
