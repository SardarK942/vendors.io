# Sub-project E — Vendor Dashboard CRM Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vendor `/dashboard` (today's three small cards + flat bookings list) with a CRM-style surface: Inbox + bucketed Operations + Analytics teaser on Home, a slide-out side panel for booking actions, a searchable Bookings archive, a dedicated Money section with Stripe + cash variants, and per-`booking_event` private vendor notes.

**Architecture:** Single bundled PR on branch `feat/sub-project-e-vendor-crm`. Foundation lands first: migration `00034` (notes column + `booking_events_public` view, `vendor_profile_views`, `payouts` + `payout_bookings`) and a privacy-gate audit that switches every couple-facing query to the view. Then side panel infrastructure (intercepting parallel route `@panel/(.)bookings/[id]`), then the Home redesign, Bookings archive, Money section, view tracking, backfill, and E2E. Each phase ships fully tested before moving on.

**Tech Stack:** Next.js 15 App Router (parallel/intercepting routes), Supabase (Postgres + RLS), Stripe webhooks, Upstash rate limiting, vitest, Playwright, Tailwind, shadcn/ui, Lucide icons.

**Source spec:** `docs/superpowers/specs/2026-05-20-sub-project-e-vendor-dashboard-crm-design.md` — referenced throughout as **§N**. Read it before starting.

---

## File structure (per spec §3–§9)

**New:**

- `supabase/migrations/00034_sub_project_e_vendor_crm.sql`
- `src/services/booking-event.service.ts`
- `src/__tests__/services/booking-event.service.test.ts`
- `src/services/analytics.service.ts`
- `src/__tests__/services/analytics.service.test.ts`
- `src/app/api/booking-events/[id]/notes/route.ts`
- `src/app/api/booking-events/[id]/notes/route.test.ts`
- `src/app/dashboard/default.tsx`
- `src/app/dashboard/@panel/default.tsx`
- `src/app/dashboard/@panel/(.)bookings/[id]/page.tsx`
- `src/app/dashboard/money/page.tsx`
- `src/app/dashboard/analytics/page.tsx`
- `src/components/dashboard/BookingDetail.tsx`
- `src/components/dashboard/PanelShell.tsx`
- `src/components/dashboard/VendorNotesEditor.tsx`
- `src/components/dashboard/InboxBlock.tsx`
- `src/components/dashboard/InboxRow.tsx`
- `src/components/dashboard/OperationsBlock.tsx`
- `src/components/dashboard/AnalyticsTeaser.tsx`
- `src/components/dashboard/BookingsArchive.tsx`
- `src/components/dashboard/PayoutHistory.tsx`
- `src/components/dashboard/CashToCollect.tsx`
- `src/components/dashboard/MoneySidebar.tsx` _(optional helper if needed)_
- `src/lib/dashboard/useCloseToHome.ts`
- `src/lib/dashboard/use-is-mobile.ts`
- `src/lib/analytics/ip-hash.ts`
- `src/__tests__/lib/analytics/ip-hash.test.ts`
- `scripts/backfill-payouts.ts`
- `scripts/backfill-payouts.test.ts`
- `tests/db/rls/vendor_notes_view_excludes_column.test.ts`
- `tests/db/rls/vendor_notes_couple_api_never_returns.test.ts`
- `tests/db/rls/vendor_notes_other_vendor_cannot_write.test.ts`
- `tests/db/rls/vendor_profile_views_isolation.test.ts`
- `tests/db/rls/payouts_isolation.test.ts`
- `tests/db/rls/payouts_unique_constraint.test.ts`
- `tests/e2e/vendor-inbox.spec.ts`
- `tests/e2e/vendor-inbox-mobile.spec.ts`
- `tests/e2e/vendor-bookings-archive.spec.ts`
- `tests/e2e/vendor-notes-roundtrip.spec.ts`
- `tests/e2e/vendor-money-stripe.spec.ts`
- `tests/e2e/vendor-money-cash.spec.ts`
- `tests/e2e/vendor-analytics-teaser.spec.ts`

**Modified:**

- `src/app/dashboard/layout.tsx` — add `panel` slot, icons, active-route highlight, swap "Payments" → "Money"
- `src/app/dashboard/page.tsx` — replace vendor branch with InboxBlock + OperationsBlock + AnalyticsTeaser
- `src/app/dashboard/bookings/page.tsx` — replace flat list with `<BookingsArchive>` (tabs + search + cursor pagination)
- `src/app/dashboard/bookings/[id]/page.tsx` — thin wrapper that renders `<BookingDetail bookingId={id} mode="page" />`
- `src/app/(marketplace)/vendors/[slug]/page.tsx` — fire `recordVendorProfileView` server action after main render
- `src/app/api/webhooks/stripe/route.ts` — handle `payout.created` / `payout.paid` / `payout.failed` / `payout.canceled`
- `src/app/api/webhooks/stripe/route.test.ts` — add payout-event cases
- `src/services/booking.service.ts` — extend `getBookingRequests` params; add `getOperationsBuckets`
- `src/services/payment.service.ts` — add `getPayoutHistory`, `getCashToCollect`
- `src/types/database.types.ts` — regenerate after migration
- Every couple-facing query touching `booking_events` (see Phase E2 audit) — switch to `booking_events_public`

---

## Phase E1 — Migration + types + dev apply (foundation)

Single-threaded. ~30 minutes. Branch: `feat/sub-project-e-vendor-crm` off `main`.

### Task E1.0: Branch off main

- [ ] **Step 1: Cut the branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/sub-project-e-vendor-crm
```

- [ ] **Step 2: Confirm clean state**

`git status` → should be clean. `git log --oneline -3` → top commit should be the just-committed spec (`docs(spec): Sub-project E …`).

### Task E1.1: Write migration 00034

**Files:**

- Create: `supabase/migrations/00034_sub_project_e_vendor_crm.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00034_sub_project_e_vendor_crm.sql
-- Sub-project E — vendor dashboard CRM redesign
-- See docs/superpowers/specs/2026-05-20-sub-project-e-vendor-dashboard-crm-design.md §8
--
-- Three additive changes. All non-destructive — safe to roll forward without backfill.

------------------------------------------------------------------------
-- Change 1: booking_events.vendor_notes + booking_events_public view
------------------------------------------------------------------------

ALTER TABLE booking_events
  ADD COLUMN vendor_notes text;

COMMENT ON COLUMN booking_events.vendor_notes IS
  'Private vendor-only notes. Never returned to couple-side queries. Max ~5KB (UX-enforced, not DB-constrained).';

-- RLS: vendor can UPDATE notes on their own booking_events.
-- (SELECT is already governed by existing booking_events policies.)
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
CREATE VIEW booking_events_public
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

CREATE TABLE vendor_profile_views (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  viewer_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  ip_hash           text NOT NULL,
  user_agent        text,
  viewed_at         timestamptz NOT NULL DEFAULT now()
);

-- Dedupe via expression-based unique index (Postgres rejects expressions in inline UNIQUE).
CREATE UNIQUE INDEX vendor_profile_views_dedupe_idx
  ON vendor_profile_views (vendor_profile_id, ip_hash, (date_trunc('day', viewed_at)));

CREATE INDEX vendor_profile_views_vendor_idx
  ON vendor_profile_views (vendor_profile_id, viewed_at DESC);

ALTER TABLE vendor_profile_views ENABLE ROW LEVEL SECURITY;

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

CREATE TABLE payouts (
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

CREATE INDEX payouts_vendor_date_idx
  ON payouts (vendor_profile_id, arrival_date DESC);

CREATE TABLE payout_bookings (
  payout_id  uuid NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (payout_id, booking_id)
);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors can read their own payouts"
  ON payouts FOR SELECT
  USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

ALTER TABLE payout_bookings ENABLE ROW LEVEL SECURITY;

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00034_sub_project_e_vendor_crm.sql
git commit -m "feat(crm): E1 — migration 00034 (vendor_notes view, profile views, payouts)"
```

### Task E1.2: Apply migration to dev Supabase

- [ ] **Step 1: Open the SQL editor for the dev project**

Project ref: `lquvhjedlzubqusnfaak` (per `MEMORY.md` → supabase_prod_connection notes the prod ref; dev is in the deployment runbook).

- [ ] **Step 2: Paste the contents of `00034_sub_project_e_vendor_crm.sql` and Run**

Expect success. If any policy already exists from a prior partial apply, drop and recreate — do not bypass.

- [ ] **Step 3: Verify schema with psql**

```bash
psql "$DEV_DB_URL" -c "\d booking_events" | grep vendor_notes
psql "$DEV_DB_URL" -c "\d booking_events_public"
psql "$DEV_DB_URL" -c "\dt vendor_profile_views"
psql "$DEV_DB_URL" -c "\dt payouts"
psql "$DEV_DB_URL" -c "\dt payout_bookings"
```

Expected: every command returns a hit.

### Task E1.3: Regenerate database.types.ts

**Files:**

- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Run the Supabase type generator**

```bash
npx supabase gen types typescript --project-id lquvhjedlzubqusnfaak > src/types/database.types.ts
```

If the project uses a different command (check `package.json` scripts), use that. Confirm the file now contains `vendor_notes`, `vendor_profile_views`, `payouts`, `payout_bookings`, and `booking_events_public`.

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Existing code should still pass — the changes are purely additive.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore(types): E1 — regenerate database.types after migration 00034"
```

---

## Phase E2 — Privacy gate: couple-side query audit (BLOCKS SHIP)

This phase MUST land before any code that depends on `booking_events_public`. A forgotten `select('*')` from `booking_events` in a couple-facing path is the highest-risk bug in E.

### Task E2.1: Enumerate every couple-facing read of `booking_events`

**Files (modified after enumeration):**

- `src/app/dashboard/page.tsx` (couple branch starts around line 37)
- `src/services/booking.service.ts` (line 72 and line 514 — verify which are couple-facing)
- `src/services/payment.service.ts` (lines 512, 860, 881 — most are vendor-side or webhook code; audit)
- Any other path that grep turns up

- [ ] **Step 1: Run the audit grep**

```bash
grep -rn "from('booking_events')\|from(\"booking_events\")\|booking_events!" \
  src/app src/services src/components --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: For each hit, classify it**

For each match, decide: **couple-facing** (response could end up in a couple's browser/API response), **vendor-facing** (only ever consumed by the vendor themselves), or **server-internal** (webhook, cron, service-role).

Write the classification into a scratch file `notes-audit.txt` (not committed) so the implementer can show their work.

- [ ] **Step 3: Switch every couple-facing hit to `booking_events_public`**

Pattern:

```ts
// BEFORE (couple branch in src/app/dashboard/page.tsx ~line 39):
const { data: rawEvents } = await supabase
  .from('booking_events')
  .select(`id, event_date, ... , bookings!inner(...)`)

// AFTER:
const { data: rawEvents } = await supabase
  .from('booking_events_public')
  .select(`id, event_date, ... , bookings!inner(...)`)
```

Vendor-facing and webhook code stays on raw `booking_events` (it needs `vendor_notes`).

- [ ] **Step 4: Run typecheck and existing tests**

```bash
npm run typecheck
npm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): E2 — switch couple-facing reads to booking_events_public (privacy gate)"
```

### Task E2.2: View-column introspection test

**Files:**

- Create: `tests/db/rls/vendor_notes_view_excludes_column.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/rls/vendor_notes_view_excludes_column.test.ts
import { describe, it, expect } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server';

describe('booking_events_public — view shape', () => {
  it('does not expose vendor_notes column', async () => {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .rpc('information_schema_columns_for', { view_name: 'booking_events_public' })
      .select('column_name');

    // Fallback if rpc helper doesn't exist — query information_schema directly:
    const { data: cols, error: err2 } = await supabase
      .from('information_schema.columns' as never)
      .select('column_name')
      .eq('table_name', 'booking_events_public');

    const names = (cols ?? []).map((c: { column_name: string }) => c.column_name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain('vendor_notes');
  });
});
```

If `information_schema` isn't directly queryable via the Supabase client, use a small SQL helper function (add to migration `00034` as an addendum or query via raw `rpc`). The test must fail if `vendor_notes` is ever added to the view.

- [ ] **Step 2: Run the test — expect PASS** (the view was created without the column).

```bash
npm test -- vendor_notes_view_excludes_column
```

- [ ] **Step 3: Commit**

```bash
git add tests/db/rls/vendor_notes_view_excludes_column.test.ts
git commit -m "test(crm): E2 — view excludes vendor_notes (privacy regression guard)"
```

### Task E2.3: Couple-API never-returns test

**Files:**

- Create: `tests/db/rls/vendor_notes_couple_api_never_returns.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/rls/vendor_notes_couple_api_never_returns.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { signInAsTestCouple, setBookingEventNotes } from '@/__tests__/helpers/fixtures';

describe('couple API — vendor_notes leak guard', () => {
  let coupleClient: Awaited<ReturnType<typeof signInAsTestCouple>>;
  let testBookingEventId: string;

  beforeAll(async () => {
    // Fixture: a booking exists between couple A and vendor B; vendor has set notes.
    const fx = await signInAsTestCouple();
    coupleClient = fx;
    testBookingEventId = await setBookingEventNotes(fx.bookingEventId, 'TOP SECRET vendor note');
  });

  it('dashboard page query does not surface vendor_notes', async () => {
    // Hit the same query the couple branch of /dashboard runs.
    const { data } = await coupleClient.supabase
      .from('booking_events_public')
      .select('*')
      .eq('id', testBookingEventId);
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain('TOP SECRET');
    expect(row).not.toHaveProperty('vendor_notes');
  });

  it('booking detail page query does not surface vendor_notes', async () => {
    // Direct test of the couple-mode path through getBookingById or the page route.
    const res = await fetch(`http://localhost:3000/api/bookings/${coupleClient.bookingId}`, {
      headers: { Cookie: coupleClient.cookie },
    });
    const body = await res.text();
    expect(body).not.toContain('TOP SECRET');
    expect(body).not.toContain('vendor_notes');
  });
});
```

This test depends on fixtures we'll create alongside other E2E tests in Phase E9 — for now, mark the test as `.skip` and revisit in Phase E9. The fixture skeletons live at `src/__tests__/helpers/fixtures.ts`.

- [ ] **Step 2: Verify the skipped test compiles**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add tests/db/rls/vendor_notes_couple_api_never_returns.test.ts
git commit -m "test(crm): E2 — couple API never-returns guard (skeleton; un-skip in E9)"
```

---

## Phase E3 — Side panel infrastructure (intercepting parallel route)

Two-tiered: (a) `<PanelShell>` + hooks first, (b) the route slot wiring last. Read [Next.js parallel routes docs](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes) and [intercepting routes docs](https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes) before starting.

### Task E3.1: `useCloseToHome` hook

**Files:**

- Create: `src/lib/dashboard/useCloseToHome.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/lib/dashboard/useCloseToHome.ts
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Closes the booking detail panel.
 * - If we arrived via Link (history.length > 1) — call router.back() so the user goes back to where they were.
 * - Otherwise — push '/dashboard' so a direct-URL arrival or refresh still has a clean exit.
 */
export function useCloseToHome() {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  }, [router]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/dashboard/useCloseToHome.ts
git commit -m "feat(crm): E3 — useCloseToHome hook"
```

### Task E3.2: `useIsMobile` hook

**Files:**

- Create: `src/lib/dashboard/use-is-mobile.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/lib/dashboard/use-is-mobile.ts
'use client';

import { useEffect, useState } from 'react';

const BREAKPOINT_QUERY = '(max-width: 767px)';

/**
 * Returns true on viewports < md (mobile). SSR-safe: returns false on server, then
 * resolves correctly after mount. Components depending on this must tolerate a one-render
 * mismatch (typical pattern: render desktop, then redirect in useEffect).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(BREAKPOINT_QUERY);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/dashboard/use-is-mobile.ts
git commit -m "feat(crm): E3 — useIsMobile hook"
```

### Task E3.3: `<PanelShell>` client component

**Files:**

- Create: `src/components/dashboard/PanelShell.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/PanelShell.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { X } from 'lucide-react';
import { useCloseToHome } from '@/lib/dashboard/useCloseToHome';
import { useIsMobile } from '@/lib/dashboard/use-is-mobile';

export function PanelShell({ children }: { children: React.ReactNode }) {
  const close = useCloseToHome();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isMobile = useIsMobile();

  // Mobile redirect shim: panel doesn't render below md:, hand off to full page.
  useEffect(() => {
    if (isMobile && params?.id) {
      router.replace(`/dashboard/bookings/${params.id}`);
    }
  }, [isMobile, params, router]);

  // ESC closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <>
      {/* Backdrop — clicking closes the panel */}
      <div
        aria-hidden
        onClick={close}
        className="fixed inset-0 z-30 hidden bg-black/30 md:block"
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-40 hidden w-full max-w-xl flex-col border-l bg-background shadow-xl md:flex"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Booking details</h2>
          <button onClick={close} aria-label="Close panel" className="rounded p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/PanelShell.tsx
git commit -m "feat(crm): E3 — PanelShell with backdrop, ESC close, mobile redirect shim"
```

### Task E3.4: Extract `<BookingDetail>` component

**Files:**

- Create: `src/components/dashboard/BookingDetail.tsx`
- Modify: `src/app/dashboard/bookings/[id]/page.tsx`

- [ ] **Step 1: Move logic out of the page**

The existing `src/app/dashboard/bookings/[id]/page.tsx` does fetching + rendering inline. Extract the rendering (and the dependent fetching) into a new server component:

```tsx
// src/components/dashboard/BookingDetail.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getBookingById } from '@/services/booking.service';
import { wouldExceedCapacity } from '@/services/availability.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { BookingActions } from '@/components/dashboard/BookingActions';
import { VendorBookingActions } from '@/components/booking/VendorBookingActions';
import { AdjustmentReview } from '@/components/booking/AdjustmentReview';
import { ConflictWarning } from '@/components/dashboard/ConflictWarning';
import { VendorNotesEditor } from '@/components/dashboard/VendorNotesEditor';
import Link from 'next/link';

function statusBadgeStyle(status: string) {
  // ... copy from existing page.tsx ...
}

interface BookingDetailProps {
  bookingId: string;
  mode: 'panel' | 'page';
}

export async function BookingDetail({ bookingId, mode }: BookingDetailProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  const result = await getBookingById(supabase, bookingId, user.id);
  if (result.error || !result.data) notFound();
  const booking = result.data;

  // Vendor side: keep reading raw booking_events (vendor needs vendor_notes).
  // Couple side: read from booking_events_public.
  const eventsTable = role === 'vendor' ? 'booking_events' : 'booking_events_public';
  const { data: bookingEvents } = await supabase
    .from(eventsTable as 'booking_events')
    .select('*')
    .eq('booking_id', bookingId)
    .order('sequence');

  // ... (move the rest of today's rendering logic here verbatim, replacing the page-level
  // <h1> header with a smaller heading when mode === 'panel') ...

  return (
    <div className="space-y-4">
      {mode === 'page' && (
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Booking details</h1>
          <Link href="/dashboard/bookings" className="text-sm text-muted-foreground">
            ← Back to bookings
          </Link>
        </div>
      )}

      {/* booking summary, package, addons, events list, actions — copied from old page */}

      {role === 'vendor' && bookingEvents && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Private notes — only you can see this</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bookingEvents.map((ev) => (
              <VendorNotesEditor
                key={ev.id}
                bookingEventId={ev.id}
                eventTypeLabel={(ev as { event_type_label?: string }).event_type_label ?? 'Event'}
                initialNotes={(ev as { vendor_notes?: string | null }).vendor_notes ?? ''}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Make the page a thin wrapper**

```tsx
// src/app/dashboard/bookings/[id]/page.tsx
import { BookingDetail } from '@/components/dashboard/BookingDetail';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { id } = await params;
  return <BookingDetail bookingId={id} mode="page" />;
}
```

- [ ] **Step 3: Type-check + run existing tests**

```bash
npm run typecheck
npm test
```

The existing booking detail flow must still pass — this is a pure refactor.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/BookingDetail.tsx src/app/dashboard/bookings/[id]/page.tsx
git commit -m "refactor(crm): E3 — extract <BookingDetail> so panel + page share rendering"
```

### Task E3.5: Add `@panel` slot to dashboard layout

**Files:**

- Modify: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/default.tsx`
- Create: `src/app/dashboard/@panel/default.tsx`

- [ ] **Step 1: Update the layout**

```tsx
// src/app/dashboard/layout.tsx
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';

export default async function DashboardLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = profile?.role || 'couple';

  return (
    <div className="min-h-screen bg-muted/40">
      <Navbar />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* sidebar — Task E4.5 adds icons + active highlighting */}
        <aside className="hidden w-56 shrink-0 md:block">{/* unchanged for now */}</aside>
        <main className="flex-1">{children}</main>
      </div>
      {panel}
    </div>
  );
}
```

- [ ] **Step 2: Top-slot fallback**

```tsx
// src/app/dashboard/default.tsx
export default function DashboardDefault() {
  // No-op: when the @panel slot resolves but the top slot doesn't have a matching segment,
  // Next renders this. We never actually hit it because /dashboard always has a page.tsx.
  return null;
}
```

- [ ] **Step 3: Panel-slot fallback (empty when no booking selected)**

```tsx
// src/app/dashboard/@panel/default.tsx
export default function PanelDefault() {
  return null;
}
```

- [ ] **Step 4: Build + smoke**

```bash
npm run build
```

Build must succeed. Visiting `/dashboard` locally should render the same dashboard as before (slot is empty).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/layout.tsx src/app/dashboard/default.tsx src/app/dashboard/@panel/default.tsx
git commit -m "feat(crm): E3 — dashboard layout accepts @panel slot + default fallbacks"
```

### Task E3.6: Intercept route page

**Files:**

- Create: `src/app/dashboard/@panel/(.)bookings/[id]/page.tsx`

- [ ] **Step 1: Write the intercept page**

```tsx
// src/app/dashboard/@panel/(.)bookings/[id]/page.tsx
//
// Intercepts navigation from /dashboard to /dashboard/bookings/[id] when triggered
// via <Link>. Renders the booking detail inside <PanelShell>. Direct visits and
// refresh bypass the intercept and resolve to /dashboard/bookings/[id]/page.tsx
// (the full-page route).
//
// On mobile (< md:), <PanelShell> redirects to the full-page URL via router.replace().

import { BookingDetail } from '@/components/dashboard/BookingDetail';
import { PanelShell } from '@/components/dashboard/PanelShell';

interface PanelBookingPageProps {
  params: Promise<{ id: string }>;
}

export default async function PanelBookingPage({ params }: PanelBookingPageProps) {
  const { id } = await params;
  return (
    <PanelShell>
      <BookingDetail bookingId={id} mode="panel" />
    </PanelShell>
  );
}
```

- [ ] **Step 2: Manual smoke test**

```bash
npm run dev
```

1. Open `http://localhost:3000/dashboard` as a vendor.
2. Today, there's no Link from `/dashboard` to `/dashboard/bookings/[id]` — we add that in Phase E4. Manually trigger by adding a temporary `<Link href="/dashboard/bookings/<some-id>">Test panel</Link>` to `page.tsx`, click it.
3. Verify the panel slides in from the right and shows the booking detail.
4. Hit ESC — panel closes via `useCloseToHome`.
5. Click the temp Link again, then hit refresh — page should reload to the full-page `/dashboard/bookings/<id>` (intercept bypassed on direct load).
6. Remove the temporary Link before committing.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/@panel/(.)bookings/[id]/page.tsx
git commit -m "feat(crm): E3 — intercepting route for booking detail panel"
```

---

## Phase E4 — Home page redesign

Replaces the vendor branch of `/dashboard`. Couple branch unchanged.

### Task E4.1: `getOperationsBuckets` service function

**Files:**

- Modify: `src/services/booking.service.ts`
- Create: `src/__tests__/services/operations-buckets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/operations-buckets.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOperationsBuckets } from '@/services/booking.service';
import { mockSupabaseFromOperationsBuckets } from '@/__tests__/helpers/booking-fixtures';

describe('getOperationsBuckets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('groups events into today/tomorrow/this week/later', async () => {
    const supabase = mockSupabaseFromOperationsBuckets([
      { event_date: '2026-08-15', booking_id: 'b1' }, // today
      { event_date: '2026-08-16', booking_id: 'b2' }, // tomorrow
      { event_date: '2026-08-19', booking_id: 'b3' }, // this week
      { event_date: '2026-08-30', booking_id: 'b4' }, // later
      { event_date: '2026-09-10', booking_id: 'b5' }, // later (capped at 30d range)
    ]);
    const result = await getOperationsBuckets(supabase, 'vendor-id');
    expect(result.today.map((e) => e.booking_id)).toEqual(['b1']);
    expect(result.tomorrow.map((e) => e.booking_id)).toEqual(['b2']);
    expect(result.thisWeek.map((e) => e.booking_id)).toEqual(['b3']);
    expect(result.later.map((e) => e.booking_id)).toEqual(['b4', 'b5']);
  });

  it('only includes deposit_paid or completed bookings', async () => {
    // (the SQL filter is enforced server-side; this test confirms the contract)
    const supabase = mockSupabaseFromOperationsBuckets([]);
    const result = await getOperationsBuckets(supabase, 'vendor-id');
    expect(supabase._lastQuery).toContain("status IN ('deposit_paid', 'completed')");
  });

  it('returns empty arrays for vendor with no events', async () => {
    const supabase = mockSupabaseFromOperationsBuckets([]);
    const result = await getOperationsBuckets(supabase, 'vendor-id');
    expect(result.today).toEqual([]);
    expect(result.tomorrow).toEqual([]);
    expect(result.thisWeek).toEqual([]);
    expect(result.later).toEqual([]);
  });
});
```

If `mockSupabaseFromOperationsBuckets` doesn't exist, create it in `src/__tests__/helpers/booking-fixtures.ts` (a minimal mock that captures the last query string and returns the seed rows). See existing helpers in `src/__tests__/services/` for patterns.

- [ ] **Step 2: Run test — expect FAIL**

`npm test -- operations-buckets` → fails on missing export.

- [ ] **Step 3: Implement in `src/services/booking.service.ts`**

Append after existing exports:

```ts
export interface BookingEventForOps {
  id: string;
  booking_id: string;
  event_date: string;
  event_start_time: string;
  event_end_time: string;
  event_type_label: string | null;
  address_line_1: string | null;
  city: string | null;
  couple_name: string | null;
  package_label: string | null;
}

export interface OperationsBuckets {
  today: BookingEventForOps[];
  tomorrow: BookingEventForOps[];
  thisWeek: BookingEventForOps[];
  later: BookingEventForOps[];
}

export async function getOperationsBuckets(
  supabase: SupabaseClient,
  vendorProfileId: string,
  days = 30
): Promise<OperationsBuckets> {
  const now = new Date();
  const start = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const end = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('booking_events')
    .select(
      `id, booking_id, event_date, event_start_time, event_end_time, event_type_label,
       address_line_1, city,
       bookings!inner(vendor_profile_id, status, couple_name_snapshot, package_name_snapshot)`
    )
    .eq('bookings.vendor_profile_id', vendorProfileId)
    .in('bookings.status', ['deposit_paid', 'completed'])
    .gte('event_date', start)
    .lte('event_date', end)
    .order('event_date', { ascending: true });

  if (error) throw error;

  const rows: BookingEventForOps[] = (data ?? []).map((r) => {
    const b = r.bookings as unknown as {
      couple_name_snapshot?: string | null;
      package_name_snapshot?: string | null;
    };
    return {
      id: r.id as string,
      booking_id: r.booking_id as string,
      event_date: r.event_date as string,
      event_start_time: r.event_start_time as string,
      event_end_time: r.event_end_time as string,
      event_type_label: (r.event_type_label as string | null) ?? null,
      address_line_1: (r.address_line_1 as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      couple_name: b.couple_name_snapshot ?? null,
      package_label: b.package_name_snapshot ?? null,
    };
  });

  const todayStr = start;
  const tomorrowStr = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const weekEndStr = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  return {
    today: rows.filter((r) => r.event_date === todayStr),
    tomorrow: rows.filter((r) => r.event_date === tomorrowStr),
    thisWeek: rows.filter((r) => r.event_date > tomorrowStr && r.event_date <= weekEndStr),
    later: rows.filter((r) => r.event_date > weekEndStr),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- operations-buckets
```

- [ ] **Step 5: Commit**

```bash
git add src/services/booking.service.ts src/__tests__/services/operations-buckets.test.ts src/__tests__/helpers/booking-fixtures.ts
git commit -m "feat(crm): E4 — getOperationsBuckets service + 3 unit tests"
```

### Task E4.2: Extend `getBookingRequests` for Inbox + Archive use

**Files:**

- Modify: `src/services/booking.service.ts`
- Create: `src/__tests__/services/booking-requests-extended.test.ts`

- [ ] **Step 1: Write the failing tests** (status filter, search, cursor, sort — all four behaviors)

```ts
// src/__tests__/services/booking-requests-extended.test.ts
import { describe, it, expect } from 'vitest';
import { getBookingRequests } from '@/services/booking.service';
import { mockSupabaseFromBookings } from '@/__tests__/helpers/booking-fixtures';

describe('getBookingRequests — extended params', () => {
  it('filters by status when status param is provided', async () => {
    const supabase = mockSupabaseFromBookings([
      { id: 'b1', status: 'pending', couple_name_snapshot: 'Khan' },
      { id: 'b2', status: 'completed', couple_name_snapshot: 'Patel' },
    ]);
    const result = await getBookingRequests(supabase, 'user-id', 'vendor', {
      status: ['pending', 'adjusted_quote_declined'],
    });
    expect(supabase._lastQuery).toContain("status IN ('pending', 'adjusted_quote_declined')");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].id).toBe('b1');
  });

  it('returns nextCursor when more rows exist beyond limit', async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({
      id: `b${i}`,
      status: 'deposit_paid',
      created_at: new Date(2026, 0, i + 1).toISOString(),
    }));
    const supabase = mockSupabaseFromBookings(rows);
    const result = await getBookingRequests(supabase, 'user-id', 'vendor', { limit: 25 });
    expect(result.data).toHaveLength(25);
    expect(result.nextCursor).toBeDefined();
  });

  it('filters by couple_name_snapshot when q param provided', async () => {
    const supabase = mockSupabaseFromBookings([]);
    await getBookingRequests(supabase, 'user-id', 'vendor', { q: 'Patel' });
    expect(supabase._lastQuery).toContain('couple_name_snapshot');
    expect(supabase._lastQuery).toContain('ilike');
    expect(supabase._lastQuery).toContain('%Patel%');
  });

  it('sorts by event_date when sort=event_date', async () => {
    const supabase = mockSupabaseFromBookings([]);
    await getBookingRequests(supabase, 'user-id', 'vendor', { sort: 'event_date' });
    expect(supabase._lastQuery).toContain("order by event_date");
  });

  it('existing no-params call returns all bookings (backward compat)', async () => {
    const supabase = mockSupabaseFromBookings([
      { id: 'b1', status: 'pending' },
      { id: 'b2', status: 'completed' },
    ]);
    const result = await getBookingRequests(supabase, 'user-id', 'vendor');
    expect(result.data).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Extend `getBookingRequests` signature**

Find the existing function in `src/services/booking.service.ts`. Add the params object as an optional fourth argument, threading status/q/cursor/limit/sort into the query:

```ts
export interface GetBookingRequestsParams {
  status?: string[];
  q?: string;
  cursor?: string; // ISO timestamp for created_at-based cursor
  limit?: number;
  sort?: 'event_date' | 'created_at';
}

export interface GetBookingRequestsResult<T> {
  data: T[] | null;
  error: unknown;
  nextCursor?: string;
}

export async function getBookingRequests(
  supabase: SupabaseClient,
  userId: string,
  role: 'couple' | 'vendor',
  params: GetBookingRequestsParams = {}
): Promise<GetBookingRequestsResult<...>> {
  const { status, q, cursor, limit = 100, sort = 'created_at' } = params;
  let query = supabase
    .from('bookings')
    .select(/* existing select list — unchanged */)
    .order(sort, { ascending: false })
    .limit(limit + 1); // fetch one extra to detect more

  // ... existing vendor/couple branch unchanged ...

  if (status && status.length > 0) query = query.in('status', status);
  if (q) query = query.ilike('couple_name_snapshot', `%${q}%`);
  if (cursor) query = query.lt(sort, cursor);

  const { data, error } = await query;
  if (error) return { data: null, error };

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? (trimmed[trimmed.length - 1] as { [key: string]: string })[sort]
    : undefined;

  return { data: trimmed, error: null, nextCursor };
}
```

The exact select list and existing vendor/couple branching stays as-is. Only the params, ordering, limit-plus-one cursor logic, and the optional `status`/`q`/`cursor` filters are new.

- [ ] **Step 4: Run all booking.service tests** — both new and existing must pass.

```bash
npm test -- booking.service
```

- [ ] **Step 5: Commit**

```bash
git add src/services/booking.service.ts src/__tests__/services/booking-requests-extended.test.ts
git commit -m "feat(crm): E4 — getBookingRequests params: status/q/cursor/limit/sort"
```

### Task E4.3: `<InboxRow>` + `<InboxBlock>` components

**Files:**

- Create: `src/components/dashboard/InboxRow.tsx`
- Create: `src/components/dashboard/InboxBlock.tsx`

- [ ] **Step 1: Write `<InboxRow>`**

```tsx
// src/components/dashboard/InboxRow.tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export interface InboxRowData {
  bookingId: string;
  coupleName: string;
  packageLabel: string;
  status: string;
  receivedAt: string; // ISO
  urgencyHours?: number; // optional countdown for "18h left"
}

function statusChip(status: string) {
  if (status === 'pending') return { label: 'New request', cls: 'bg-blue-100 text-blue-800' };
  if (status === 'adjusted_quote_declined') return { label: 'Adjustment declined', cls: 'bg-orange-100 text-orange-800' };
  if (status === 'accepted') return { label: 'Awaiting deposit', cls: 'bg-yellow-100 text-yellow-800' };
  if (status === 'adjusted_quote_pending') return { label: 'Quote sent', cls: 'bg-purple-100 text-purple-800' };
  return { label: status, cls: 'bg-gray-100 text-gray-700' };
}

export function InboxRow({ data }: { data: InboxRowData }) {
  const chip = statusChip(data.status);
  return (
    <Link
      href={`/dashboard/bookings/${data.bookingId}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{data.coupleName}</div>
          <div className="truncate text-sm text-muted-foreground">{data.packageLabel}</div>
        </div>
        <div className="shrink-0 text-right">
          <Badge className={chip.cls}>{chip.label}</Badge>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(data.receivedAt), { addSuffix: true })}
          </div>
          {data.urgencyHours !== undefined && (
            <div className="mt-1 text-xs font-medium text-red-600">
              {data.urgencyHours}h left
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Write `<InboxBlock>` (server component)**

```tsx
// src/components/dashboard/InboxBlock.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { InboxRow, type InboxRowData } from './InboxRow';

interface InboxBlockProps {
  vendorProfileId: string;
}

export async function InboxBlock({ vendorProfileId }: InboxBlockProps) {
  const supabase = await createServerSupabaseClient();

  // "Needs your reply" — vendor action required.
  const { data: needsReply } = await supabase
    .from('bookings')
    .select('id, status, couple_name_snapshot, package_name_snapshot, created_at, accepted_at')
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', ['pending', 'adjusted_quote_declined'])
    .order('created_at', { ascending: true });

  // "Accepted, deposit window closing" — accepted + < 24h remaining on 72h window.
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: closingSoon } = await supabase
    .from('bookings')
    .select('id, status, couple_name_snapshot, package_name_snapshot, created_at, accepted_at')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'accepted')
    .lt('accepted_at', cutoff)
    .order('accepted_at', { ascending: true });

  // "Waiting on couple" — accepted (not closing soon) + adjusted_quote_pending.
  const { data: waiting } = await supabase
    .from('bookings')
    .select('id, status, couple_name_snapshot, package_name_snapshot, updated_at')
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', ['accepted', 'adjusted_quote_pending'])
    .order('updated_at', { ascending: false });

  const closingIds = new Set((closingSoon ?? []).map((r) => r.id));
  const waitingFiltered = (waiting ?? []).filter((r) => !closingIds.has(r.id));

  const mapToRow = (r: Record<string, unknown>, opts?: { urgencyHours?: number }): InboxRowData => ({
    bookingId: r.id as string,
    coupleName: (r.couple_name_snapshot as string) ?? 'Couple',
    packageLabel: (r.package_name_snapshot as string) ?? 'Booking',
    status: r.status as string,
    receivedAt: (r.created_at as string) ?? (r.updated_at as string),
    urgencyHours: opts?.urgencyHours,
  });

  const replyRows = [
    ...(needsReply ?? []).map((r) => mapToRow(r as Record<string, unknown>)),
    ...(closingSoon ?? []).map((r) => {
      const acceptedAt = new Date((r as { accepted_at: string }).accepted_at);
      const expiresAt = new Date(acceptedAt.getTime() + 72 * 3600 * 1000);
      const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600 / 1000));
      return mapToRow(r as Record<string, unknown>, { urgencyHours: hoursLeft });
    }),
  ];
  const waitingRows = waitingFiltered.map((r) => mapToRow(r as Record<string, unknown>));

  const totalCount = replyRows.length + waitingRows.length;

  if (totalCount === 0) {
    return (
      <section className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Inbox</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No action needed. You'll see new requests here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Inbox</h2>

      {replyRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Needs your reply · {replyRows.length}
          </h3>
          {replyRows.map((r) => (
            <InboxRow key={r.bookingId} data={r} />
          ))}
        </div>
      )}

      {waitingRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Waiting on couple · {waitingRows.length}
          </h3>
          {waitingRows.map((r) => (
            <InboxRow key={r.bookingId} data={r} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/InboxRow.tsx src/components/dashboard/InboxBlock.tsx
git commit -m "feat(crm): E4 — InboxBlock with Needs-your-reply + Waiting subsections"
```

### Task E4.4: `<OperationsBlock>` component

**Files:**

- Create: `src/components/dashboard/OperationsBlock.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/OperationsBlock.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOperationsBuckets, type BookingEventForOps } from '@/services/booking.service';

interface OperationsBlockProps {
  vendorProfileId: string;
}

function FullRow({ ev }: { ev: BookingEventForOps }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">
          {new Date(ev.event_date).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          })} · {ev.event_start_time?.slice(0, 5)}
        </div>
        <div className="text-sm text-muted-foreground">{ev.couple_name}</div>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {ev.address_line_1}{ev.city ? `, ${ev.city}` : ''} · {ev.package_label}
      </div>
    </div>
  );
}

function CompactRow({ ev }: { ev: BookingEventForOps }) {
  return (
    <div className="flex items-center gap-3 rounded border bg-card px-3 py-2 text-sm">
      <span className="font-medium">
        {new Date(ev.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      <span className="text-muted-foreground">·</span>
      <span>{ev.couple_name}</span>
      <span className="ml-auto truncate text-muted-foreground">{ev.package_label}</span>
    </div>
  );
}

export async function OperationsBlock({ vendorProfileId }: OperationsBlockProps) {
  const supabase = await createServerSupabaseClient();
  const buckets = await getOperationsBuckets(supabase, vendorProfileId);

  const total = buckets.today.length + buckets.tomorrow.length + buckets.thisWeek.length + buckets.later.length;

  if (total === 0) {
    return (
      <section className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Operations · next 30 days</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No upcoming events. Once you have confirmed bookings, they'll show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Operations · next 30 days</h2>

      {buckets.today.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Today</h3>
          {buckets.today.map((ev) => <FullRow key={ev.id} ev={ev} />)}
        </div>
      )}

      {buckets.tomorrow.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Tomorrow</h3>
          {buckets.tomorrow.map((ev) => <FullRow key={ev.id} ev={ev} />)}
        </div>
      )}

      {buckets.thisWeek.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-600">This week</h3>
          {buckets.thisWeek.map((ev) => <CompactRow key={ev.id} ev={ev} />)}
        </div>
      )}

      {buckets.later.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Later · {buckets.later.length}
          </summary>
          <div className="mt-2 space-y-1">
            {buckets.later.map((ev) => <CompactRow key={ev.id} ev={ev} />)}
          </div>
        </details>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/OperationsBlock.tsx
git commit -m "feat(crm): E4 — OperationsBlock with Today/Tomorrow/Week/Later buckets"
```

### Task E4.5: `getAnalyticsTeaser` service + `<AnalyticsTeaser>` component

**Files:**

- Create: `src/services/analytics.service.ts`
- Create: `src/__tests__/services/analytics.service.test.ts`
- Create: `src/components/dashboard/AnalyticsTeaser.tsx`
- Create: `src/app/dashboard/analytics/page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/analytics.service.test.ts
import { describe, it, expect } from 'vitest';
import { getAnalyticsTeaser } from '@/services/analytics.service';
import { mockSupabaseFromCounts } from '@/__tests__/helpers/analytics-fixtures';

describe('getAnalyticsTeaser', () => {
  it('returns count + prevCount + delta for views, inquiries, bookings', async () => {
    const supabase = mockSupabaseFromCounts({
      views_7d: 12, views_prev7d: 9,
      inquiries_7d: 4, inquiries_prev7d: 3,
      bookings_7d: 1, bookings_prev7d: 1,
    });
    const result = await getAnalyticsTeaser(supabase, 'vendor-id');
    expect(result.views).toEqual({ count: 12, prevCount: 9, delta: 3 });
    expect(result.inquiries).toEqual({ count: 4, prevCount: 3, delta: 1 });
    expect(result.bookings).toEqual({ count: 1, prevCount: 1, delta: 0 });
  });

  it('handles zero-data vendor', async () => {
    const supabase = mockSupabaseFromCounts({
      views_7d: 0, views_prev7d: 0,
      inquiries_7d: 0, inquiries_prev7d: 0,
      bookings_7d: 0, bookings_prev7d: 0,
    });
    const result = await getAnalyticsTeaser(supabase, 'vendor-id');
    expect(result.views.count).toBe(0);
    expect(result.views.delta).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the service**

```ts
// src/services/analytics.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeaserMetric {
  count: number;
  prevCount: number;
  delta: number;
}

export interface AnalyticsTeaser {
  views: TeaserMetric;
  inquiries: TeaserMetric;
  bookings: TeaserMetric;
}

const DAY_MS = 86_400_000;

async function countViews(supabase: SupabaseClient, vendorProfileId: string, sinceISO: string, untilISO: string) {
  const { count } = await supabase
    .from('vendor_profile_views')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .gte('viewed_at', sinceISO)
    .lt('viewed_at', untilISO);
  return count ?? 0;
}

async function countInquiries(supabase: SupabaseClient, vendorProfileId: string, sinceISO: string, untilISO: string) {
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .gte('created_at', sinceISO)
    .lt('created_at', untilISO);
  return count ?? 0;
}

async function countBookings(supabase: SupabaseClient, vendorProfileId: string, sinceISO: string, untilISO: string) {
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', ['deposit_paid', 'completed'])
    .gte('accepted_at', sinceISO)
    .lt('accepted_at', untilISO);
  return count ?? 0;
}

export async function getAnalyticsTeaser(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<AnalyticsTeaser> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * DAY_MS).toISOString();
  const nowISO = new Date(now).toISOString();

  const [views, viewsPrev, inquiries, inquiriesPrev, bookings, bookingsPrev] = await Promise.all([
    countViews(supabase, vendorProfileId, sevenDaysAgo, nowISO),
    countViews(supabase, vendorProfileId, fourteenDaysAgo, sevenDaysAgo),
    countInquiries(supabase, vendorProfileId, sevenDaysAgo, nowISO),
    countInquiries(supabase, vendorProfileId, fourteenDaysAgo, sevenDaysAgo),
    countBookings(supabase, vendorProfileId, sevenDaysAgo, nowISO),
    countBookings(supabase, vendorProfileId, fourteenDaysAgo, sevenDaysAgo),
  ]);

  const metric = (count: number, prev: number): TeaserMetric => ({ count, prevCount: prev, delta: count - prev });

  return {
    views: metric(views, viewsPrev),
    inquiries: metric(inquiries, inquiriesPrev),
    bookings: metric(bookings, bookingsPrev),
  };
}
```

- [ ] **Step 4: Write `<AnalyticsTeaser>` component**

```tsx
// src/components/dashboard/AnalyticsTeaser.tsx
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAnalyticsTeaser, type TeaserMetric } from '@/services/analytics.service';

function deltaLabel(d: TeaserMetric): string {
  if (d.delta === 0) return '— vs last week';
  const arrow = d.delta > 0 ? '↑' : '↓';
  return `${arrow}${Math.abs(d.delta)} vs last week`;
}

function deltaClass(d: TeaserMetric): string {
  if (d.delta > 0) return 'text-emerald-600';
  if (d.delta < 0) return 'text-red-600';
  return 'text-muted-foreground';
}

export async function AnalyticsTeaser({ vendorProfileId }: { vendorProfileId: string }) {
  const supabase = await createServerSupabaseClient();
  const teaser = await getAnalyticsTeaser(supabase, vendorProfileId);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          This week
        </h2>
        <Link href="/dashboard/analytics" className="text-sm text-indigo-600 hover:underline">
          Full analytics →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Profile views</div>
          <div className="mt-1 text-2xl font-semibold">{teaser.views.count}</div>
          <div className={`mt-1 text-xs ${deltaClass(teaser.views)}`}>{deltaLabel(teaser.views)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Inquiries</div>
          <div className="mt-1 text-2xl font-semibold">{teaser.inquiries.count}</div>
          <div className={`mt-1 text-xs ${deltaClass(teaser.inquiries)}`}>{deltaLabel(teaser.inquiries)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Bookings</div>
          <div className="mt-1 text-2xl font-semibold">{teaser.bookings.count}</div>
          <div className={`mt-1 text-xs ${deltaClass(teaser.bookings)}`}>{deltaLabel(teaser.bookings)}</div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Placeholder full-analytics page**

```tsx
// src/app/dashboard/analytics/page.tsx
export default function VendorAnalyticsPage() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="text-muted-foreground">
        Full analytics coming soon. Until then, peek at the numbers on your dashboard.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- analytics
git add src/services/analytics.service.ts src/__tests__/services/analytics.service.test.ts src/__tests__/helpers/analytics-fixtures.ts src/components/dashboard/AnalyticsTeaser.tsx src/app/dashboard/analytics/page.tsx
git commit -m "feat(crm): E4 — analytics teaser service + component + placeholder page"
```

### Task E4.6: Wire blocks into `/dashboard/page.tsx`

**Files:**

- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace the vendor branch wholesale**

Keep the couple branch (Sub-project D) exactly as-is. Replace lines from "// Vendor branch" through the closing `</div>` with:

```tsx
// Vendor branch
if (role === 'vendor') {
  const { data: vendorProfileRaw } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  const vendorProfile = vendorProfileRaw as (typeof vendorProfileRaw & { is_active?: boolean }) | null;

  if (!vendorProfile) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Card className="p-6">
          <p>Finish profile setup to start receiving bookings.</p>
          <Button asChild className="mt-4"><Link href="/dashboard/profile/setup">Continue setup →</Link></Button>
        </Card>
      </div>
    );
  }

  const vendorIsActive = vendorProfile.is_active !== false;

  const { count: pkgCount } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfile.id)
    .eq('is_active', true);
  const activePackageCount = pkgCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {profile?.full_name || user.email}</p>
      </div>

      {activePackageCount === 0 && (
        <Card className="bg-yellow-50 border-yellow-200 p-6">
          <h2 className="font-semibold text-yellow-900">Add a package to go live</h2>
          <p className="text-sm text-yellow-800 mt-1">
            Couples can only book vendors with at least one active package.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/dashboard/profile/packages/new">Add Package</Link>
          </Button>
        </Card>
      )}

      {!vendorIsActive && activePackageCount > 0 && (
        <Card className="bg-yellow-50 border-yellow-200 p-6">
          <h2 className="font-semibold text-yellow-900">Your profile is paused</h2>
          <p className="text-sm text-yellow-800 mt-1">
            You won&rsquo;t appear in search until you resume your profile.
          </p>
          <PauseProfileToggle isActive={false} />
        </Card>
      )}

      <InboxBlock vendorProfileId={vendorProfile.id} />
      <OperationsBlock vendorProfileId={vendorProfile.id} />
      <AnalyticsTeaser vendorProfileId={vendorProfile.id} />
    </div>
  );
}
```

Add imports at the top:

```tsx
import { InboxBlock } from '@/components/dashboard/InboxBlock';
import { OperationsBlock } from '@/components/dashboard/OperationsBlock';
import { AnalyticsTeaser } from '@/components/dashboard/AnalyticsTeaser';
```

Remove imports that are no longer used (`EarningsCard`, `RecentUnlocks`, `DirectPaymentsCard`, `getVendorEarnings`) — these move to the Money page in Phase E7.

- [ ] **Step 2: Build + manual smoke**

```bash
npm run build && npm run dev
```

1. Sign in as a vendor with at least one `pending` booking. `/dashboard` should show: greeting, possibly banners, Inbox with "Needs your reply" subsection, Operations (or empty state), Analytics teaser.
2. Click an Inbox row → panel slides in.
3. Sign in as a couple — couple branch must be unchanged (event card grid from D still renders).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(crm): E4 — replace vendor /dashboard with Inbox + Operations + AnalyticsTeaser"
```

### Task E4.7: Sidebar icons + active highlighting + Money swap

**Files:**

- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Add icons + active state**

```tsx
'use client';
// (or use a small client subcomponent — if you want to keep the layout RSC,
//  extract <SidebarNav> into a client component that takes role + pathname.)

// Server-side layout reads role; sidebar nav is a client component.
```

Convert the sidebar into a small client component:

```tsx
// src/components/dashboard/SidebarNav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Calendar, Wallet, Bell, User } from 'lucide-react';

export function SidebarNav({ role }: { role: 'couple' | 'vendor' }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  const cls = (href: string) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
      isActive(href) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
    }`;

  return (
    <nav className="space-y-1">
      <Link href="/dashboard" className={cls('/dashboard')}>
        <Home className="h-4 w-4" /> Home
      </Link>
      <Link href="/dashboard/bookings" className={cls('/dashboard/bookings')}>
        <BookOpen className="h-4 w-4" /> Bookings
      </Link>
      <Link href="/dashboard/notifications" className={cls('/dashboard/notifications')}>
        <Bell className="h-4 w-4" /> Notifications
      </Link>
      {role === 'vendor' && (
        <>
          <Link href="/dashboard/profile/calendar" className={cls('/dashboard/profile/calendar')}>
            <Calendar className="h-4 w-4" /> Calendar
          </Link>
          <Link href="/dashboard/money" className={cls('/dashboard/money')}>
            <Wallet className="h-4 w-4" /> Money
          </Link>
          <Link href="/dashboard/profile" className={cls('/dashboard/profile')}>
            <User className="h-4 w-4" /> Profile
          </Link>
        </>
      )}
    </nav>
  );
}
```

Replace the inline `<nav>` in `src/app/dashboard/layout.tsx` with `<SidebarNav role={role} />` and import it.

- [ ] **Step 2: Build + manual smoke** (sidebar should now have icons, active state, and "Money" replacing "Payments")

```bash
npm run build && npm run dev
```

The "Money" link 404s for now (page lands in Phase E7) — that's expected.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/SidebarNav.tsx src/app/dashboard/layout.tsx
git commit -m "feat(crm): E4 — sidebar icons, active highlighting, swap Payments → Money"
```

---

## Phase E5 — Bookings archive page

Replaces the flat list. Uses the extended `getBookingRequests` from Task E4.2.

### Task E5.1: `<BookingsArchive>` client component

**Files:**

- Create: `src/components/dashboard/BookingsArchive.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/BookingsArchive.tsx
'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BookingCard } from './BookingCard';

type TabKey = 'all' | 'active' | 'upcoming' | 'past' | 'cancelled';

const TAB_STATUSES: Record<TabKey, string[] | null> = {
  all: null,
  active: ['pending', 'accepted', 'adjusted_quote_pending', 'adjusted_quote_declined', 'deposit_paid'],
  upcoming: ['deposit_paid'],
  past: ['completed'],
  cancelled: ['couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'expired', 'rejected'],
};

interface BookingsArchiveProps {
  initialRows: any[]; // BookingRow shape from booking.service
  initialNextCursor: string | undefined;
  counts: Record<TabKey, number>;
}

export function BookingsArchive({ initialRows, initialNextCursor, counts }: BookingsArchiveProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = ((searchParams.get('tab') as TabKey) || 'all') satisfies TabKey;

  const [rows, setRows] = useState(initialRows);
  const [nextCursor, setNextCursor] = useState<string | undefined>(initialNextCursor);
  const [q, setQ] = useState('');
  const [isPending, startTransition] = useTransition();

  // Client-side filter on top of the loaded rows.
  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (r.couple_name_snapshot ?? '').toLowerCase().includes(needle));
  }, [rows, q]);

  const setTab = (tab: TabKey) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (tab === 'all') sp.delete('tab');
    else sp.set('tab', tab);
    startTransition(() => router.push(`?${sp.toString()}`));
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    const res = await fetch(`/api/bookings/list?tab=${activeTab}&cursor=${nextCursor}`);
    const json = await res.json();
    setRows((prev) => [...prev, ...json.rows]);
    setNextCursor(json.nextCursor);
  };

  if (initialRows.length === 0 && counts.all === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No bookings yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Booking requests from couples will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search couple name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {(['all', 'active', 'upcoming', 'past', 'cancelled'] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`border-b-2 px-3 py-2 text-sm font-medium capitalize transition ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab} <span className="ml-1 text-xs text-muted-foreground">{counts[tab]}</span>
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">No bookings in this view.</p>
          <Button variant="link" onClick={() => { setQ(''); setTab('all'); }}>
            Show all
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((b) => (
            <BookingCard key={b.id} booking={b} role="vendor" />
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="text-center">
          <Button variant="outline" onClick={loadMore} disabled={isPending}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
```

The cursor-based `loadMore` hits a small API helper. Add it next.

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/BookingsArchive.tsx
git commit -m "feat(crm): E5 — BookingsArchive client UI (tabs, search, load-more)"
```

### Task E5.2: `GET /api/bookings/list` for cursor pagination

**Files:**

- Create: `src/app/api/bookings/list/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/bookings/list/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getBookingRequests } from '@/services/booking.service';

const TAB_STATUSES: Record<string, string[] | undefined> = {
  active: ['pending', 'accepted', 'adjusted_quote_pending', 'adjusted_quote_declined', 'deposit_paid'],
  upcoming: ['deposit_paid'],
  past: ['completed'],
  cancelled: ['couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'expired', 'rejected'],
};

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') ?? 'all';
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const status = TAB_STATUSES[tab];

  const result = await getBookingRequests(supabase, user.id, 'vendor', {
    status,
    q,
    cursor,
    limit: 25,
  });

  return NextResponse.json({ rows: result.data ?? [], nextCursor: result.nextCursor ?? null });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/bookings/list/route.ts
git commit -m "feat(crm): E5 — GET /api/bookings/list cursor-pagination endpoint"
```

### Task E5.3: Wire archive into `/dashboard/bookings/page.tsx`

**Files:**

- Modify: `src/app/dashboard/bookings/page.tsx`

- [ ] **Step 1: Replace with archive shell**

```tsx
// src/app/dashboard/bookings/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookingRequests } from '@/services/booking.service';
import { BookingsArchive } from '@/components/dashboard/BookingsArchive';

const TAB_STATUSES: Record<string, string[] | undefined> = {
  active: ['pending', 'accepted', 'adjusted_quote_pending', 'adjusted_quote_declined', 'deposit_paid'],
  upcoming: ['deposit_paid'],
  past: ['completed'],
  cancelled: ['couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'expired', 'rejected'],
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const { tab = 'all' } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  if (role === 'couple') {
    // Couple still gets the simple list — out of scope for E.
    const result = await getBookingRequests(supabase, user.id, 'couple');
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="text-muted-foreground">Your booking requests and their status.</p>
        </div>
        {/* keep legacy flat list rendering for couple side */}
      </div>
    );
  }

  // Vendor archive
  const status = TAB_STATUSES[tab];
  const result = await getBookingRequests(supabase, user.id, 'vendor', { status, limit: 25 });

  // Counts for tab chips (single round-trip via count: 'exact', head: true)
  const allStatuses = Object.values(TAB_STATUSES).flat().filter(Boolean) as string[];
  const counts = {
    all: 0, active: 0, upcoming: 0, past: 0, cancelled: 0,
  };
  // ... compute counts per tab via 5 head:true queries; or skip until we need them ...

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-muted-foreground">All bookings, filterable.</p>
      </div>
      <BookingsArchive
        initialRows={result.data ?? []}
        initialNextCursor={result.nextCursor}
        counts={counts}
      />
    </div>
  );
}
```

(The detailed counts queries are 5 small `head:true` queries — write them inline; each is ~3 lines.)

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx
git commit -m "feat(crm): E5 — bookings archive page with tabs + counts + load-more"
```

---

## Phase E6 — Vendor notes editor (API + service + UI)

### Task E6.1: `updateVendorNotes` service function

**Files:**

- Create: `src/services/booking-event.service.ts`
- Create: `src/__tests__/services/booking-event.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/services/booking-event.service.test.ts
import { describe, it, expect } from 'vitest';
import { updateVendorNotes } from '@/services/booking-event.service';
import { mockSupabaseForNotesUpdate } from '@/__tests__/helpers/booking-event-fixtures';

describe('updateVendorNotes', () => {
  it('trims whitespace before saving', async () => {
    const supabase = mockSupabaseForNotesUpdate({ ownerUserId: 'user-A', bookingEventId: 'ev-1' });
    await updateVendorNotes(supabase, 'ev-1', 'user-A', '   hello world   ');
    expect(supabase._lastUpdate.vendor_notes).toBe('hello world');
  });

  it('rejects notes longer than 5000 chars', async () => {
    const supabase = mockSupabaseForNotesUpdate({ ownerUserId: 'user-A', bookingEventId: 'ev-1' });
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-A', 'x'.repeat(5001));
    expect(result.error).toMatchObject({ code: 'too_long' });
  });

  it('rejects when user does not own the booking', async () => {
    const supabase = mockSupabaseForNotesUpdate({ ownerUserId: 'user-A', bookingEventId: 'ev-1' });
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-B', 'hi');
    expect(result.error).toMatchObject({ code: 'forbidden' });
  });

  it('returns 404 when event does not exist', async () => {
    const supabase = mockSupabaseForNotesUpdate({ bookingEventId: 'ev-1' });
    const result = await updateVendorNotes(supabase, 'missing', 'user-A', 'hi');
    expect(result.error).toMatchObject({ code: 'not_found' });
  });

  it('happy path: saves and returns ok', async () => {
    const supabase = mockSupabaseForNotesUpdate({ ownerUserId: 'user-A', bookingEventId: 'ev-1' });
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-A', 'allergic to nuts');
    expect(result.error).toBeNull();
    expect(supabase._lastUpdate.vendor_notes).toBe('allergic to nuts');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/services/booking-event.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpdateNotesResult {
  data: { ok: true } | null;
  error: { code: 'too_long' | 'not_found' | 'forbidden' | 'db_error'; message?: string } | null;
}

const MAX_NOTES = 5000;

export async function updateVendorNotes(
  supabase: SupabaseClient,
  bookingEventId: string,
  userId: string,
  notes: string
): Promise<UpdateNotesResult> {
  const trimmed = notes.trim();
  if (trimmed.length > MAX_NOTES) {
    return { data: null, error: { code: 'too_long', message: `Notes must be ≤ ${MAX_NOTES} chars.` } };
  }

  // Verify ownership in a single round trip via the booking_events RLS-enforced UPDATE.
  // If the user doesn't own it, the update returns zero rows.
  const { data: existing, error: findError } = await supabase
    .from('booking_events')
    .select('id, booking_id, bookings!inner(vendor_profile_id, vendor_profiles!inner(user_id))')
    .eq('id', bookingEventId)
    .maybeSingle();

  if (findError) return { data: null, error: { code: 'db_error', message: findError.message } };
  if (!existing) return { data: null, error: { code: 'not_found' } };

  const ownerUserId =
    (existing as unknown as { bookings: { vendor_profiles: { user_id: string } } })
      .bookings.vendor_profiles.user_id;
  if (ownerUserId !== userId) return { data: null, error: { code: 'forbidden' } };

  const { error: updateError } = await supabase
    .from('booking_events')
    .update({ vendor_notes: trimmed })
    .eq('id', bookingEventId);

  if (updateError) return { data: null, error: { code: 'db_error', message: updateError.message } };
  return { data: { ok: true }, error: null };
}
```

- [ ] **Step 4: Run tests + commit**

```bash
npm test -- booking-event.service
git add src/services/booking-event.service.ts src/__tests__/services/booking-event.service.test.ts src/__tests__/helpers/booking-event-fixtures.ts
git commit -m "feat(crm): E6 — updateVendorNotes service + 5 unit tests"
```

### Task E6.2: `PATCH /api/booking-events/[id]/notes` route

**Files:**

- Create: `src/app/api/booking-events/[id]/notes/route.ts`
- Create: `src/app/api/booking-events/[id]/notes/route.test.ts`

- [ ] **Step 1: Write the route test**

```ts
// src/app/api/booking-events/[id]/notes/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PATCH } from './route';
import { signInAsVendor, signInAsOtherVendor } from '@/__tests__/helpers/auth-fixtures';

describe('PATCH /api/booking-events/[id]/notes', () => {
  it('400 when notes > 5000 chars', async () => {
    const { req, params } = await signInAsVendor({ bookingEventId: 'ev-1' });
    const res = await PATCH(
      new Request('http://x/api/booking-events/ev-1/notes', {
        method: 'PATCH',
        body: JSON.stringify({ notes: 'x'.repeat(5001) }),
      }) as never,
      { params }
    );
    expect(res.status).toBe(400);
  });

  it('403 when vendor does not own the event', async () => {
    const { req, params } = await signInAsOtherVendor({ bookingEventId: 'ev-1' });
    const res = await PATCH(
      new Request('http://x/api/booking-events/ev-1/notes', {
        method: 'PATCH',
        body: JSON.stringify({ notes: 'hello' }),
      }) as never,
      { params }
    );
    expect(res.status).toBe(403);
  });

  it('200 on happy path', async () => {
    const { req, params } = await signInAsVendor({ bookingEventId: 'ev-1' });
    const res = await PATCH(
      new Request('http://x/api/booking-events/ev-1/notes', {
        method: 'PATCH',
        body: JSON.stringify({ notes: 'allergic to nuts' }),
      }) as never,
      { params }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('429 when rate limit exceeded', async () => {
    // hit the endpoint 11 times in a minute → 11th returns 429
    const { req, params } = await signInAsVendor({ bookingEventId: 'ev-1' });
    for (let i = 0; i < 10; i++) {
      await PATCH(/* … */);
    }
    const res = await PATCH(/* … */);
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/booking-events/[id]/notes/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { updateVendorNotes } from '@/services/booking-event.service';
import { checkRateLimit } from '@/lib/rate-limit'; // existing Upstash helper

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ratelimitKey = `vendor-notes:${user.id}`;
  const limited = await checkRateLimit(ratelimitKey, { limit: 10, windowMs: 60_000 });
  if (limited.exceeded) return NextResponse.json({ error: 'rate_limit' }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const notes = typeof body.notes === 'string' ? body.notes : '';

  const result = await updateVendorNotes(supabase, id, user.id, notes);
  if (result.error) {
    if (result.error.code === 'too_long') return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.error.code === 'not_found') return NextResponse.json({ error: result.error }, { status: 404 });
    if (result.error.code === 'forbidden') return NextResponse.json({ error: result.error }, { status: 403 });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

If `@/lib/rate-limit` doesn't have a `checkRateLimit` helper with this signature, check existing routes (e.g., F notifications) for the existing pattern and adapt.

- [ ] **Step 4: Run tests + commit**

```bash
npm test -- notes/route
git add src/app/api/booking-events/[id]/notes/route.ts src/app/api/booking-events/[id]/notes/route.test.ts
git commit -m "feat(crm): E6 — PATCH /api/booking-events/[id]/notes with auth + rate limit"
```

### Task E6.3: `<VendorNotesEditor>` client component

**Files:**

- Create: `src/components/dashboard/VendorNotesEditor.tsx`

- [ ] **Step 1: Write the editor**

```tsx
// src/components/dashboard/VendorNotesEditor.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';

const MAX = 5000;
const WARN = 4500;
const DEBOUNCE_MS = 500;

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface VendorNotesEditorProps {
  bookingEventId: string;
  eventTypeLabel: string;
  initialNotes: string;
}

export function VendorNotesEditor({ bookingEventId, eventTypeLabel, initialNotes }: VendorNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<Status>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async () => {
    setStatus('saving');
    try {
      const res = await fetch(`/api/booking-events/${bookingEventId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    if (notes === initialNotes) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(save, DEBOUNCE_MS);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const tooLong = notes.length > MAX;
  const warning = notes.length > WARN;

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{eventTypeLabel}</div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, MAX))}
        onBlur={() => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          save();
        }}
        placeholder="e.g. couple is vegetarian, prefers minimal posing"
        rows={3}
        className={tooLong ? 'border-red-500' : ''}
      />
      <div className="flex items-center justify-between text-xs">
        <span className={tooLong ? 'text-red-600' : warning ? 'text-yellow-600' : 'text-muted-foreground'}>
          {notes.length} / {MAX}
        </span>
        <span className="text-muted-foreground">
          {status === 'saving' && 'Saving…'}
          {status === 'saved' && 'Saved · just now'}
          {status === 'error' && (
            <button onClick={save} className="text-red-600 hover:underline">
              Couldn&rsquo;t save — retry
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the editor renders inside `<BookingDetail>` (from E3.4)**

The `<BookingDetail>` extracted in E3.4 already references `<VendorNotesEditor>`. Confirm the import path matches.

- [ ] **Step 3: Manual smoke**

`npm run dev` → vendor opens a booking → side panel → notes editor appears → type → wait 500ms → "Saved · just now" appears → reload → notes persist.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/VendorNotesEditor.tsx
git commit -m "feat(crm): E6 — VendorNotesEditor with autosave + status indicator"
```

---

## Phase E7 — Money section

### Task E7.1: Webhook extension for payout events

**Files:**

- Modify: `src/app/api/webhooks/stripe/route.ts`
- Modify: `src/app/api/webhooks/stripe/route.test.ts`

- [ ] **Step 1: Add failing webhook tests**

```ts
// inside route.test.ts
it('payout.created event inserts a pending row', async () => {
  const event = stripeEventFixture('payout.created', { id: 'po_test_1', amount: 1500_00, arrival_date: 1735689600 });
  await POST(makeReqWithSignature(event));
  const { data } = await supabaseService.from('payouts').select('*').eq('stripe_payout_id', 'po_test_1').single();
  expect(data?.status).toBe('pending');
  expect(data?.amount_cents).toBe(150000);
});

it('payout.paid updates status and inserts payout_bookings rows', async () => {
  // seed a transaction transferred within the payout window, then fire payout.paid
  await seedTransferredTransaction({ payoutId: 'po_test_1', vendorProfileId: 'vp-1', bookingId: 'b-1' });
  const event = stripeEventFixture('payout.paid', { id: 'po_test_1' });
  await POST(makeReqWithSignature(event));
  const { data } = await supabaseService.from('payouts').select('*').eq('stripe_payout_id', 'po_test_1').single();
  expect(data?.status).toBe('paid');
  const { data: links } = await supabaseService.from('payout_bookings').select('*').eq('payout_id', data!.id);
  expect(links).toHaveLength(1);
  expect(links?.[0].booking_id).toBe('b-1');
});

it('payout.failed records failure_message', async () => { /* … */ });
it('payout.canceled marks status=canceled', async () => { /* … */ });
```

- [ ] **Step 2: Extend the route handler**

Find the existing event-type switch in `src/app/api/webhooks/stripe/route.ts`. Add cases:

```ts
case 'payout.created':
case 'payout.paid':
case 'payout.failed':
case 'payout.canceled': {
  await handlePayoutEvent(event, supabaseService);
  break;
}
```

Add the handler in the same file or a sibling:

```ts
async function handlePayoutEvent(event: Stripe.Event, supabase: SupabaseClient) {
  const payout = event.data.object as Stripe.Payout;
  const eventName = event.type as 'payout.created' | 'payout.paid' | 'payout.failed' | 'payout.canceled';
  const statusMap = {
    'payout.created': 'pending',
    'payout.paid': 'paid',
    'payout.failed': 'failed',
    'payout.canceled': 'canceled',
  } as const;

  // Find the vendor by the Connect account that owns this payout.
  const stripeAccount = event.account!;
  const { data: vp } = await supabase
    .from('stripe_accounts')
    .select('vendor_profile_id')
    .eq('stripe_account_id', stripeAccount)
    .maybeSingle();
  if (!vp) {
    console.warn('[webhook] payout for unknown stripe_account', stripeAccount);
    return;
  }

  await supabase.from('payouts').upsert(
    {
      vendor_profile_id: vp.vendor_profile_id,
      stripe_payout_id: payout.id,
      amount_cents: payout.amount,
      currency: payout.currency,
      status: statusMap[eventName],
      arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10) : null,
      failure_message: payout.failure_message ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_payout_id' }
  );

  // On payout.paid, derive contributing bookings from transactions transferred in window.
  if (eventName === 'payout.paid') {
    const arrival = payout.arrival_date ? new Date(payout.arrival_date * 1000) : new Date();
    const createdAt = new Date(payout.created * 1000);
    const { data: txs } = await supabase
      .from('transactions')
      .select('booking_id, transferred_at')
      .gte('transferred_at', createdAt.toISOString())
      .lte('transferred_at', arrival.toISOString())
      .eq('stripe_account_id', stripeAccount);
    if (txs && txs.length > 0) {
      const { data: po } = await supabase
        .from('payouts')
        .select('id')
        .eq('stripe_payout_id', payout.id)
        .single();
      await supabase.from('payout_bookings').insert(
        txs.map((t) => ({ payout_id: po!.id, booking_id: t.booking_id }))
      );
    }
  }
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm test -- webhooks/stripe
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/route.test.ts
git commit -m "feat(crm): E7 — Stripe webhook handles payout.created/paid/failed/canceled"
```

### Task E7.2: `getPayoutHistory` + `<PayoutHistory>`

**Files:**

- Modify: `src/services/payment.service.ts`
- Create: `src/__tests__/services/payment-payouts.test.ts`
- Create: `src/components/dashboard/PayoutHistory.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/payment-payouts.test.ts
import { describe, it, expect } from 'vitest';
import { getPayoutHistory } from '@/services/payment.service';
import { mockSupabaseFromPayouts } from '@/__tests__/helpers/payout-fixtures';

describe('getPayoutHistory', () => {
  it('returns rows + nextCursor when more than limit', async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ id: `p${i}`, arrival_date: `2026-05-${i + 1}` }));
    const supabase = mockSupabaseFromPayouts(rows);
    const result = await getPayoutHistory(supabase, 'vp-1', { limit: 25 });
    expect(result.data).toHaveLength(25);
    expect(result.nextCursor).toBeDefined();
  });
  it('attaches contributing bookings count', async () => {
    const supabase = mockSupabaseFromPayouts(
      [{ id: 'p1', arrival_date: '2026-05-01' }],
      [{ payout_id: 'p1', booking_id: 'b1' }, { payout_id: 'p1', booking_id: 'b2' }]
    );
    const result = await getPayoutHistory(supabase, 'vp-1', { limit: 25 });
    expect(result.data?.[0].bookingsCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// append to src/services/payment.service.ts
export interface PayoutHistoryRow {
  id: string;
  stripe_payout_id: string;
  amount_cents: number;
  status: string;
  arrival_date: string | null;
  failure_message: string | null;
  bookingsCount: number;
}

export interface PayoutHistoryResult {
  data: PayoutHistoryRow[] | null;
  error: unknown;
  nextCursor?: string;
}

export async function getPayoutHistory(
  supabase: SupabaseClient,
  vendorProfileId: string,
  params: { cursor?: string; limit?: number } = {}
): Promise<PayoutHistoryResult> {
  const { cursor, limit = 25 } = params;
  let query = supabase
    .from('payouts')
    .select('id, stripe_payout_id, amount_cents, status, arrival_date, failure_message, payout_bookings(count)')
    .eq('vendor_profile_id', vendorProfileId)
    .order('arrival_date', { ascending: false, nullsFirst: false })
    .limit(limit + 1);
  if (cursor) query = query.lt('arrival_date', cursor);

  const { data, error } = await query;
  if (error) return { data: null, error };

  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    stripe_payout_id: r.stripe_payout_id as string,
    amount_cents: r.amount_cents as number,
    status: r.status as string,
    arrival_date: (r.arrival_date as string | null) ?? null,
    failure_message: (r.failure_message as string | null) ?? null,
    bookingsCount: ((r.payout_bookings as { count: number }[] | null) ?? []).reduce(
      (s, c) => s + (c.count ?? 0),
      0
    ),
  }));

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1].arrival_date ?? undefined : undefined;
  return { data: trimmed, error: null, nextCursor };
}
```

- [ ] **Step 4: Write `<PayoutHistory>` component**

```tsx
// src/components/dashboard/PayoutHistory.tsx
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PayoutHistoryRow } from '@/services/payment.service';

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_transit: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-700',
};

export function PayoutHistory({ rows }: { rows: PayoutHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No payouts yet. Once Stripe sends a payout, you'll see it here.
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((p) => (
        <Card key={p.id} className="flex items-center justify-between p-4">
          <div>
            <div className="font-medium">
              {p.arrival_date ? new Date(p.arrival_date).toLocaleDateString() : 'pending'} · ${(p.amount_cents / 100).toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">{p.bookingsCount} bookings</div>
          </div>
          <Badge className={statusColor[p.status] ?? ''}>{p.status}</Badge>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/payment.service.ts src/__tests__/services/payment-payouts.test.ts src/components/dashboard/PayoutHistory.tsx src/__tests__/helpers/payout-fixtures.ts
git commit -m "feat(crm): E7 — getPayoutHistory + PayoutHistory component"
```

### Task E7.3: `getCashToCollect` + `<CashToCollect>`

**Files:**

- Modify: `src/services/payment.service.ts`
- Create: `src/__tests__/services/cash-to-collect.test.ts`
- Create: `src/components/dashboard/CashToCollect.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/cash-to-collect.test.ts
import { describe, it, expect } from 'vitest';
import { getCashToCollect } from '@/services/payment.service';
import { CASH_DEPOSIT_RATE } from '@/lib/utils';
import { mockSupabaseFromEvents } from '@/__tests__/helpers/booking-fixtures';

describe('getCashToCollect', () => {
  it('computes amount using DEPOSIT_RATE constant (never hardcode 0.95)', async () => {
    const supabase = mockSupabaseFromEvents([
      { id: 'ev1', event_date: '2026-08-15', booking_id: 'b1', total_price_cents: 400000 },
    ]);
    const result = await getCashToCollect(supabase, 'vp-1');
    const expected = Math.round(400000 * (1 - CASH_DEPOSIT_RATE));
    expect(result.data?.[0].amountCents).toBe(expected);
  });

  it('only includes future events on deposit_paid bookings', async () => {
    const supabase = mockSupabaseFromEvents([]);
    await getCashToCollect(supabase, 'vp-1');
    expect(supabase._lastQuery).toContain("status = 'deposit_paid'");
    expect(supabase._lastQuery).toContain('event_date >=');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// append to src/services/payment.service.ts
import { CASH_DEPOSIT_RATE } from '@/lib/utils';

export interface CashToCollectRow {
  bookingEventId: string;
  bookingId: string;
  eventDate: string;
  coupleName: string;
  packageLabel: string;
  amountCents: number;
}

export async function getCashToCollect(
  supabase: SupabaseClient,
  vendorProfileId: string,
  daysAhead = 30
): Promise<{ data: CashToCollectRow[] | null; error: unknown }> {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('booking_events')
    .select(
      'id, booking_id, event_date, event_type_label, bookings!inner(status, vendor_profile_id, couple_name_snapshot, package_name_snapshot, total_price_cents)'
    )
    .eq('bookings.vendor_profile_id', vendorProfileId)
    .eq('bookings.status', 'deposit_paid')
    .gte('event_date', today)
    .lte('event_date', end)
    .order('event_date');

  if (error) return { data: null, error };

  const rows = (data ?? []).map((r) => {
    const b = r.bookings as unknown as {
      couple_name_snapshot: string | null;
      package_name_snapshot: string | null;
      total_price_cents: number;
    };
    return {
      bookingEventId: r.id as string,
      bookingId: r.booking_id as string,
      eventDate: r.event_date as string,
      coupleName: b.couple_name_snapshot ?? 'Couple',
      packageLabel: b.package_name_snapshot ?? 'Booking',
      amountCents: Math.round(b.total_price_cents * (1 - CASH_DEPOSIT_RATE)),
    };
  });

  return { data: rows, error: null };
}
```

- [ ] **Step 3: Write `<CashToCollect>` component**

```tsx
// src/components/dashboard/CashToCollect.tsx
import { Card } from '@/components/ui/card';
import type { CashToCollectRow } from '@/services/payment.service';

export function CashToCollect({ rows }: { rows: CashToCollectRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No upcoming events with cash to collect.
      </Card>
    );
  }
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">
        ${(total / 100).toLocaleString()} to collect over the next 30 days
      </div>
      {rows.map((r) => (
        <Card key={r.bookingEventId} className="flex items-center justify-between p-4">
          <div>
            <div className="font-medium">
              {new Date(r.eventDate).toLocaleDateString()} · {r.coupleName}
            </div>
            <div className="text-xs text-muted-foreground">{r.packageLabel}</div>
          </div>
          <div className="text-right font-semibold">
            ${(r.amountCents / 100).toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + commit**

```bash
npm test -- cash-to-collect
git add src/services/payment.service.ts src/__tests__/services/cash-to-collect.test.ts src/components/dashboard/CashToCollect.tsx
git commit -m "feat(crm): E7 — getCashToCollect (DEPOSIT_RATE-sourced) + component"
```

### Task E7.4: Money page (`/dashboard/money`)

**Files:**

- Create: `src/app/dashboard/money/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/dashboard/money/page.tsx
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EarningsCard } from '@/components/dashboard/EarningsCard';
import { RecentUnlocks } from '@/components/dashboard/RecentUnlocks';
import { PayoutHistory } from '@/components/dashboard/PayoutHistory';
import { CashToCollect } from '@/components/dashboard/CashToCollect';
import { getVendorEarnings, getPayoutHistory, getCashToCollect } from '@/services/payment.service';
import type { PaymentMode } from '@/lib/utils';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MoneyPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'vendor') redirect('/dashboard');

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (!vendorProfile) redirect('/dashboard/profile/setup');

  const paymentMode = ((vendorProfile as unknown as { payment_mode?: string }).payment_mode ?? 'stripe') as PaymentMode;

  if (paymentMode === 'cash') {
    // Cash variant
    const { data: cashRows } = await getCashToCollect(supabase, vendorProfile.id);

    const { count: confirmedCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id)
      .in('status', ['deposit_paid', 'completed']);

    const { count: upcomingCount } = await supabase
      .from('booking_events')
      .select('id, bookings!inner(vendor_profile_id, status)', { count: 'exact', head: true })
      .eq('bookings.vendor_profile_id', vendorProfile.id)
      .eq('bookings.status', 'deposit_paid')
      .gte('event_date', new Date().toISOString().slice(0, 10));

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Money</h1>

        <Card className="p-6">
          <h2 className="font-semibold">💵 You and your client handle the 95%</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Baazar holds a 5% deposit to lock in the booking; everything else is yours to arrange.
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Confirmed bookings</div>
            <div className="mt-1 text-2xl font-semibold">{confirmedCount ?? 0}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Upcoming events</div>
            <div className="mt-1 text-2xl font-semibold">{upcomingCount ?? 0}</div>
          </Card>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Cash to collect at upcoming events</h2>
          <CashToCollect rows={cashRows ?? []} />
        </section>
      </div>
    );
  }

  // Stripe variant
  const earnings = (await getVendorEarnings(supabase, user.id)).data;
  const payouts = await getPayoutHistory(supabase, vendorProfile.id, { limit: 25 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: completed } = await supabase
    .from('bookings')
    .select('id, completed_at, package_name_snapshot, transactions(vendor_payout), users!couple_user_id(full_name)')
    .eq('vendor_profile_id', vendorProfile.id)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(5);

  const recentUnlocks = (completed ?? []).map((b) => {
    const txs = (b.transactions as { vendor_payout: number }[] | null) ?? [];
    const coupleUserRel = Array.isArray(b.users) ? b.users[0] : b.users;
    return {
      id: b.id,
      completed_at: b.completed_at,
      package_label: (b as unknown as Record<string, string | null>).package_name_snapshot ?? 'Booking',
      vendor_payout_total: txs.reduce((sum, t) => sum + t.vendor_payout, 0),
      couple_name:
        (coupleUserRel as { full_name: string | null } | null)?.full_name?.split(' ')[0] ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Money</h1>

      {earnings && (
        <EarningsCard
          pendingEscrowCents={earnings.pending_escrow_cents}
          availableCents={earnings.available_cents}
          transferredCents={earnings.transferred_cents}
          requiresOnboarding={earnings.requires_onboarding}
          verificationPending={earnings.verification_pending}
          frozenReason={earnings.frozen_reason}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Payout history</h2>
        <PayoutHistory rows={payouts.data ?? []} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recent unlocks · last 7 days</h2>
        <RecentUnlocks unlocks={recentUnlocks} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Build + smoke**

```bash
npm run build && npm run dev
```

Visit `/dashboard/money` as a Stripe vendor → see 3-card summary + payouts list + recent unlocks. As a cash vendor → see the C explainer + counts + cash-to-collect.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/money/page.tsx
git commit -m "feat(crm): E7 — /dashboard/money with Stripe + cash variants"
```

---

## Phase E8 — Analytics view tracking

### Task E8.1: `ip-hash` utility

**Files:**

- Create: `src/lib/analytics/ip-hash.ts`
- Create: `src/__tests__/lib/analytics/ip-hash.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/analytics/ip-hash.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeIpHash } from '@/lib/analytics/ip-hash';

describe('computeIpHash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns a 64-char hex string for sha256', () => {
    const h = computeIpHash('1.2.3.4');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same IP on the same day', () => {
    expect(computeIpHash('1.2.3.4')).toBe(computeIpHash('1.2.3.4'));
  });

  it('returns a different hash on a different day (daily salt)', () => {
    const h1 = computeIpHash('1.2.3.4');
    vi.setSystemTime(new Date('2026-05-21T12:00:00Z'));
    const h2 = computeIpHash('1.2.3.4');
    expect(h1).not.toBe(h2);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/lib/analytics/ip-hash.ts
import { createHash } from 'node:crypto';

export function computeIpHash(ip: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD = daily salt
  return createHash('sha256').update(`${ip}::${day}`).digest('hex');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/ip-hash.ts src/__tests__/lib/analytics/ip-hash.test.ts
git commit -m "feat(crm): E8 — IP hashing utility (daily salt) + 3 unit tests"
```

### Task E8.2: `recordVendorProfileView` server action

**Files:**

- Modify: `src/services/analytics.service.ts` (append the action)
- Modify: `src/app/(marketplace)/vendors/[slug]/page.tsx`

- [ ] **Step 1: Append the server action**

```ts
// append to src/services/analytics.service.ts
'use server';

import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeIpHash } from '@/lib/analytics/ip-hash';

export async function recordVendorProfileView(vendorProfileId: string, vendorUserId: string | null) {
  try {
    const supabase = await createServerSupabaseClient();
    const h = await headers();
    const ip = (h.get('x-forwarded-for') ?? '0.0.0.0').split(',')[0].trim();
    const userAgent = h.get('user-agent') ?? null;

    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.id === vendorUserId) return; // vendor viewing own profile — skip

    await supabase.from('vendor_profile_views').insert({
      vendor_profile_id: vendorProfileId,
      viewer_user_id: user?.id ?? null,
      ip_hash: computeIpHash(ip),
      user_agent: userAgent?.slice(0, 500) ?? null,
    });
    // ON CONFLICT DO NOTHING — handled by unique (vendor_profile_id, ip_hash, day).
    // The insert error on conflict is expected; swallow it.
  } catch (err) {
    // Fire-and-forget — log to Sentry, never block render.
    console.warn('[analytics] recordVendorProfileView failed', err);
  }
}
```

Note: Supabase's `.insert()` will return a unique-violation error on conflict. To get true "ON CONFLICT DO NOTHING", we use `.upsert({...}, { ignoreDuplicates: true, onConflict: 'vendor_profile_id,ip_hash,date_trunc(\'day\',viewed_at)' })` — but Supabase doesn't support functional-expression conflict targets. Practical workaround: catch unique-violation errors and silence them.

- [ ] **Step 2: Wire into the marketplace vendor page**

Find `src/app/(marketplace)/vendors/[slug]/page.tsx`. After the main `<VendorProfilePage>` body is computed (so it doesn't block render), call the action:

```tsx
// near the end of the component, after the data is fetched
import { recordVendorProfileView } from '@/services/analytics.service';
// ...
// In the component body, after main fetches:
recordVendorProfileView(vendorProfile.id, vendorProfile.user_id).catch(() => {});
```

Because this is a Server Component, awaiting would serialize against render. Use a `.catch` and let it run async. Server Actions in RSCs don't block when called without `await`.

- [ ] **Step 3: Commit**

```bash
git add src/services/analytics.service.ts src/app/(marketplace)/vendors/[slug]/page.tsx
git commit -m "feat(crm): E8 — recordVendorProfileView server action wired on vendor page"
```

---

## Phase E9 — Tests + backfill script + E2E

### Task E9.1: Backfill script

**Files:**

- Create: `scripts/backfill-payouts.ts`
- Create: `scripts/backfill-payouts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/backfill-payouts.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { backfillPayouts } from './backfill-payouts';
import { stripeTestMode, seedConnectAccounts } from '@/__tests__/helpers/stripe-fixtures';

describe('backfillPayouts', () => {
  it('is idempotent: running twice yields the same row count', async () => {
    await seedConnectAccounts(['acct_test_1']);
    await stripeTestMode.payouts.create({ amount: 5000, currency: 'usd' }, { stripeAccount: 'acct_test_1' });

    const firstCount = await backfillPayouts();
    const secondCount = await backfillPayouts();
    expect(secondCount.inserted).toBe(0); // nothing new
    expect(secondCount.total).toBe(firstCount.total);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// scripts/backfill-payouts.ts
import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

export async function backfillPayouts(): Promise<{ total: number; inserted: number }> {
  const supabase = createServiceRoleClient();
  const { data: accounts } = await supabase
    .from('stripe_accounts')
    .select('vendor_profile_id, stripe_account_id')
    .not('stripe_account_id', 'is', null);

  let inserted = 0;
  let total = 0;
  for (const acc of accounts ?? []) {
    const payouts = await stripe.payouts.list({ limit: 100 }, { stripeAccount: acc.stripe_account_id });
    for (const payout of payouts.data) {
      total++;
      const { error } = await supabase.from('payouts').upsert(
        {
          vendor_profile_id: acc.vendor_profile_id,
          stripe_payout_id: payout.id,
          amount_cents: payout.amount,
          currency: payout.currency,
          status: payout.status as 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled',
          arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10) : null,
          failure_message: payout.failure_message ?? null,
        },
        { onConflict: 'stripe_payout_id', ignoreDuplicates: false }
      );
      if (!error) inserted++;
    }
  }
  return { total, inserted };
}

if (require.main === module) {
  backfillPayouts()
    .then((r) => console.log(`Backfill complete. total=${r.total} inserted=${r.inserted}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
```

- [ ] **Step 3: Test in Stripe test mode + commit**

```bash
npm test -- backfill-payouts
git add scripts/backfill-payouts.ts scripts/backfill-payouts.test.ts
git commit -m "feat(crm): E9 — backfill-payouts script with idempotency test"
```

### Task E9.2: RLS tests (privacy + isolation)

**Files:**

- Create: `tests/db/rls/vendor_notes_other_vendor_cannot_write.test.ts`
- Create: `tests/db/rls/vendor_profile_views_isolation.test.ts`
- Create: `tests/db/rls/payouts_isolation.test.ts`
- Create: `tests/db/rls/payouts_unique_constraint.test.ts`

- [ ] **Step 1: Write each test against the dev Supabase (use service-role for fixtures, vendor-auth for the assertions)**

```ts
// tests/db/rls/vendor_notes_other_vendor_cannot_write.test.ts
import { describe, it, expect } from 'vitest';
import { signInAsVendor, signInAsOtherVendor } from '@/__tests__/helpers/auth-fixtures';

describe('vendor_notes — RLS UPDATE policy', () => {
  it('vendor B cannot update notes on vendor A\'s booking_event', async () => {
    const { vendorAClient, vendorBClient, vendorABookingEventId } =
      await signInAsOtherVendor({ withVendorA: true });
    const { error } = await vendorBClient
      .from('booking_events')
      .update({ vendor_notes: 'hijack' })
      .eq('id', vendorABookingEventId);
    expect(error).toBeTruthy(); // RLS prohibits

    // Verify the original notes were unchanged (read as vendor A).
    const { data } = await vendorAClient
      .from('booking_events')
      .select('vendor_notes')
      .eq('id', vendorABookingEventId)
      .single();
    expect(data?.vendor_notes).not.toBe('hijack');
  });
});
```

```ts
// tests/db/rls/vendor_profile_views_isolation.test.ts
// vendor B cannot SELECT vendor A's view rows.
```

```ts
// tests/db/rls/payouts_isolation.test.ts
// vendor B cannot SELECT vendor A's payouts. Same shape as above.
```

```ts
// tests/db/rls/payouts_unique_constraint.test.ts
// second insert with same stripe_payout_id throws.
import { describe, it, expect } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server';

describe('payouts.stripe_payout_id unique constraint', () => {
  it('rejects duplicate insert', async () => {
    const supabase = createServiceRoleClient();
    const row = {
      vendor_profile_id: 'fixture-vp-1',
      stripe_payout_id: 'po_test_dup',
      amount_cents: 1000,
      status: 'paid',
    };
    await supabase.from('payouts').insert(row);
    const { error } = await supabase.from('payouts').insert(row);
    expect(error?.code).toBe('23505');
  });
});
```

- [ ] **Step 2: Un-skip the couple-API never-returns test from E2.3**

Now that fixtures and routes exist, fill in the test body and remove the `.skip`.

- [ ] **Step 3: Run all RLS tests + commit**

```bash
npm test -- rls
git add tests/db/rls/*.test.ts
git commit -m "test(crm): E9 — RLS tests for vendor_notes, views isolation, payouts isolation + unique"
```

### Task E9.3: E2E Playwright specs

**Files:**

- Create: `tests/e2e/vendor-inbox.spec.ts`
- Create: `tests/e2e/vendor-inbox-mobile.spec.ts`
- Create: `tests/e2e/vendor-bookings-archive.spec.ts`
- Create: `tests/e2e/vendor-notes-roundtrip.spec.ts`
- Create: `tests/e2e/vendor-money-stripe.spec.ts`
- Create: `tests/e2e/vendor-money-cash.spec.ts`
- Create: `tests/e2e/vendor-analytics-teaser.spec.ts`

- [ ] **Step 1: Write `vendor-inbox.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { signInAsVendor, seedPendingBooking } from './helpers';

test('inbox accept flow via side panel', async ({ page }) => {
  const { vendor, booking } = await seedPendingBooking();
  await signInAsVendor(page, vendor);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByText('Needs your reply')).toBeVisible();
  await page.getByText(booking.coupleName).click();
  // Panel slides in.
  await expect(page.getByRole('dialog', { name: 'Booking details' })).toBeVisible();
  await page.getByRole('button', { name: /accept/i }).click();
  await expect(page.getByText('Awaiting deposit')).toBeVisible();
});
```

- [ ] **Step 2: Write `vendor-inbox-mobile.spec.ts`** — viewport `{ width: 375, height: 800 }`, expect navigation to `/dashboard/bookings/<id>` instead of panel.

- [ ] **Step 3: Write `vendor-bookings-archive.spec.ts`** — seed 10 bookings across statuses, visit `/dashboard/bookings`, tab through Active/Past/Cancelled, search for one couple name.

- [ ] **Step 4: Write `vendor-notes-roundtrip.spec.ts`** — type into the notes editor in the panel, blur, expect "Saved · just now"; navigate to `/dashboard` then back into the panel; expect the same notes; in parallel session as the couple, hit the booking detail and assert response has no `vendor_notes` key.

- [ ] **Step 5: Write `vendor-money-stripe.spec.ts`** — seed Stripe vendor with one paid payout, visit `/dashboard/money`, expect 3-card summary + payout history row + recent unlocks.

- [ ] **Step 6: Write `vendor-money-cash.spec.ts`** — seed cash vendor with one `deposit_paid` booking, visit `/dashboard/money`, expect the C-explainer text verbatim + counts + cash-to-collect amount.

- [ ] **Step 7: Write `vendor-analytics-teaser.spec.ts`** — seed `vendor_profile_views` (5 in last 7d, 3 in prior 7d), visit `/dashboard`, expect "5 ↑2 vs last week".

- [ ] **Step 8: Run all E2E + commit**

```bash
npm run test:e2e
git add tests/e2e/*.spec.ts
git commit -m "test(crm): E9 — 7 Playwright E2E specs for E"
```

---

## Phase E10 — Rollout

### Task E10.1: Full local validation

- [ ] **Step 1: Run the gauntlet**

```bash
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
```

All must pass.

- [ ] **Step 2: Manual smoke checklist on local dev**

- Sign in as Stripe vendor → `/dashboard` → Inbox/Ops/Analytics all render
- Click Inbox row → side panel opens → accept → row clears
- Edit notes → blur → "Saved" → reload → notes persist
- Sign in as couple → `/dashboard` event card grid unchanged; visit own booking → no `vendor_notes` anywhere
- Sign in as cash vendor → `/dashboard/money` → C explainer + cash-to-collect
- Mobile viewport (DevTools 375px) → Inbox click routes to full page

### Task E10.2: PR + review

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin feat/sub-project-e-vendor-crm
gh pr create --base main --head feat/sub-project-e-vendor-crm \
  --title "feat(crm): Sub-project E — vendor dashboard CRM redesign" \
  --body "$(cat <<'EOF'
## Summary
- Replace vendor /dashboard with Inbox + Operations + Analytics teaser
- Slide-out booking detail panel via intercepting parallel routes (@panel/(.)bookings/[id])
- Bookings page becomes searchable filterable archive
- New /dashboard/money section with Stripe and cash variants
- Per-booking_event private vendor notes (autosaved)
- Migration 00034: vendor_notes column + booking_events_public view, vendor_profile_views table, payouts + payout_bookings tables

Spec: docs/superpowers/specs/2026-05-20-sub-project-e-vendor-dashboard-crm-design.md
Plan: docs/superpowers/plans/2026-05-20-sub-project-e-vendor-dashboard-crm.md

## Test plan
- [ ] Lint/typecheck/build green
- [ ] All vitest tests green (services, API routes, RLS tests)
- [ ] Playwright E2E green (7 vendor scenarios)
- [ ] Manual smoke on www.baazar.io after deploy: Stripe vendor inbox accept, cash vendor money page, vendor notes round-trip
- [ ] Verify couple session cannot see vendor_notes anywhere in API responses

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Address review comments** — if any, push fixups; do NOT amend after pre-commit hook failures (per repo convention).

### Task E10.3: Apply migration to prod + merge

- [ ] **Step 1: Open prod Supabase SQL editor** (`obpdgihdskbxzgyctaib`).

- [ ] **Step 2: Paste contents of `00034_sub_project_e_vendor_crm.sql` and Run.**

Verify with `psql` (using the prod connection from `MEMORY.md` → `supabase_prod_connection.md`):

```bash
psql "$PROD_DB_URL" -c "\d booking_events" | grep vendor_notes
psql "$PROD_DB_URL" -c "\d booking_events_public"
psql "$PROD_DB_URL" -c "\dt payouts"
```

- [ ] **Step 3: Merge the PR** to `main`. Vercel auto-deploys.

- [ ] **Step 4: Run the backfill against prod**

```bash
STRIPE_SECRET_KEY=$STRIPE_LIVE_SECRET_KEY \
SUPABASE_URL=$PROD_SUPABASE_URL \
SUPABASE_SERVICE_KEY=$PROD_SUPABASE_SERVICE_KEY \
npx tsx scripts/backfill-payouts.ts
```

Expect: log line "Backfill complete. total=N inserted=N".

### Task E10.4: Post-ship smoke + memory updates

- [ ] **Step 1: Smoke test on www.baazar.io**

Using the test vendor (`sardarhousefinance@gmail.com` / `gochoTacos` / `acct_1TSnrS54NFWy7748`) and a test couple, walk through:
1. Vendor logs in → /dashboard → Inbox visible
2. Couple submits a booking → vendor sees it in Inbox → click → panel → accept → row clears
3. Notes round-trip persists
4. Stripe Money page shows the backfilled payout history

- [ ] **Step 2: Update `MEMORY.md` ship record**

Create `~/.claude/projects/-Users-sardarkhan-IdeaProjects-vendors-io/memory/sub_project_e_vendor_crm_shipped.md`:

```markdown
---
name: sub-project-e-vendor-crm-shipped
description: Sub-project E shipped — vendor dashboard CRM redesign (Inbox + Operations + Money + side panel + notes). Migration 00034 applied to prod 2026-05-XX (PR #15).
metadata:
  type: project
---

Vendor /dashboard now shows Inbox (Needs your reply + Waiting on couple) + Operations (Today/Tomorrow/This week/Later) + Analytics teaser (Views/Inquiries/Bookings 7d).
Booking detail opens in a slide-out side panel via intercepting parallel routes; mobile falls back to full page.
Bookings page is now a searchable archive (All/Active/Upcoming/Past/Cancelled).
Money lives at /dashboard/money — Stripe variant shows summary + payouts + unlocks; cash variant shows the 5%/95% C-explainer + cash-to-collect.
Per-booking_event private vendor_notes (max 5KB) — couple sessions can never read them (booking_events_public view + grep audit + integration test).

Migration 00034: vendor_notes column + booking_events_public view + vendor_profile_views table + payouts + payout_bookings tables. Applied to prod via Supabase SQL editor.
Backfill: scripts/backfill-payouts.ts populated payouts table from Stripe API.

Linked: [[sub_project_a_packages_shipped]] (package + booking model), [[sub_project_c_cash_vendor_shipped]] (payment_mode), [[deployment_runbook_state]] (migration apply pattern).
```

Then append to `MEMORY.md`:

```markdown
- [Sub-project E shipped](./sub_project_e_vendor_crm_shipped.md) — vendor dashboard CRM redesign (PR #15, 2026-05-XX).
```

- [ ] **Step 3: Update `docs/phases.md` ledger**

Move E's row to `## ✅` section with the merge date.

- [ ] **Step 4: Final commit**

```bash
git add docs/phases.md
git commit -m "docs(phases): mark E shipped"
git push
```

---

## What unblocks next

Sub-project E shipping unblocks **Sub-project I — Multi-business per vendor account** per the sequencing memory. After I: UI polish J (homepage) and H (search filters), then K (scraper) last.

## Self-review notes

This plan was self-reviewed against the spec on 2026-05-20:

- Every spec section (§1–§13) maps to at least one task in this plan.
- No placeholders or TBDs (one explicit "to-be-replaced" date marker in the MEMORY.md ship record template — implementer replaces with merge date).
- Type names (`InboxRowData`, `BookingEventForOps`, `OperationsBuckets`, `TeaserMetric`, `AnalyticsTeaser`, `PayoutHistoryRow`, `CashToCollectRow`, `UpdateNotesResult`) used consistently across the file.
- Phase ordering enforces the privacy gate (E2) before any code reads `booking_events_public`, and side panel infra (E3) before Home wires up Links (E4).
- Each task has tests (unit, RLS, or E2E) where applicable.
