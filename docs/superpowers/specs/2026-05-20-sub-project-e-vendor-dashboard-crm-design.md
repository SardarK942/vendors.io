# Sub-project E — Vendor Dashboard CRM Redesign

## 0. Status

- **Branch**: `feat/sub-project-e-vendor-crm`
- **Migration**: `supabase/migrations/00034_sub_project_e_vendor_crm.sql`
- **Origin**: Sub-project E of the post-launch decomposition (see `docs/phases.md`). The out-of-scope row in [`sub-project A's design`](./2026-05-11-sub-project-a-packages-design.md) names E as "Vendor dashboard CRM redesign."
- **Sequencing**: Second-to-last functional sub-project. Follows C (cash vendor, shipped 2026-05-18). Unblocks I (multi-business per vendor account). UI polish (J, H) and the scraper (K) come after.
- **Build approach**: Single bundled PR (same shape as B/C/D/F/G).

## 1. Goals

Replace the current vendor `/dashboard` (three small status cards + flat bookings list) with a CRM-style surface centered on the two jobs vendors actually do daily: **respond to inquiries** and **stay on top of upcoming events**. Money lives in its own section. Analytics is a 3-number teaser pointing at a future analytics page.

### Success criteria

1. A vendor opens `/dashboard` and within 2 seconds sees: (a) how many things need their reply, (b) what's happening this week, (c) a 3-number performance peek.
2. Accept / adjust quote / decline / send-reminder all reachable from the Inbox row without losing the page (via slide-out side panel implemented as a Next App Router intercepting parallel route).
3. Past bookings discoverable in one place (`/dashboard/bookings` archive) with status filters and couple-name search.
4. Money section answers "how much am I owed", "what's available to withdraw", "did my payout arrive" without leaving the product.
5. Cash vendors see a Money-section variant adapted to their model (no escrow, just visibility into amounts to collect).
6. Vendor-only notes editable per `booking_event` from the side panel; never visible to couples.
7. Lint, build, vitest, and existing E2E pass. New tests cover the new server queries + the notes API + RLS on the privacy surface.

### Out of scope (deferred or parking lot)

| Area | Where it goes |
|---|---|
| Vendor↔couple in-app messaging | Parking lot (per A spec) |
| Vendor replies on reviews | Out per Stripe pivot decision |
| Full vendor analytics page | Later phase. E ships only the teaser; teaser links to a placeholder route in this PR |
| Customers/contacts aggregation | Not in MVP. Re-evaluate post-launch |
| Multi-business per vendor account | Sub-project I |
| Calendar redesign | Sub-project G is source of truth |
| Couple-side `/dashboard` | Sub-project D is source of truth — vendor branch only |
| Profile views as a public metric ("X people viewed this vendor") | Out — internal vendor analytics only |
| Bot/crawler filtering on `vendor_profile_views` | Accepting slight inflation for MVP |

### Acceptance criteria

A vendor logs in → lands on `/dashboard` → sees an Inbox with two subsections ("Needs your reply", "Waiting on couple") and an Operations block bucketed by time (Today / Tomorrow / This week / Later) and a 3-number analytics teaser. Clicks a pending request → side panel slides in from the right with the booking detail and Accept / Adjust Quote / Decline actions. Accepts the booking inline; panel updates, Inbox row disappears, Operations might add the event. Edits private notes on an event; reload — notes persist; couple side has no visibility. Visits `/dashboard/bookings` → sees a searchable archive with status tabs. Visits `/dashboard/money` → sees 3-card summary + payout history + recent unlocks (Stripe vendor) OR the 5%/95% explainer + cash-to-collect list (cash vendor). On mobile (`< md:`), clicking an Inbox row routes to the full-page `/dashboard/bookings/[id]` instead of the side panel.

## 2. Locked design decisions

12 decisions locked during brainstorming on 2026-05-20:

1. **Home shape** — Inbox + Operations + Analytics teaser
2. **Layout** — stacked (Inbox on top, Ops middle, Analytics at bottom)
3. **Sidebar IA** — Home · Bookings · Calendar · Money · Notifications · Profile
4. **Inbox scope** — Medium: vendor-action items + awaiting-couple items
5. **Inbox + Notifications coexist** — Slack pattern (same item appears in both surfaces by design; counts can diverge)
6. **Inbox row interaction** — Slide-out side panel (parallel route + intercepting route)
7. **Operations layout** — Bucketed list (Today / Tomorrow / This week / Later) — only buckets with items render
8. **Bookings page** — Searchable, filterable archive (Active / Upcoming / Past / Cancelled tabs)
9. **Money page** — Single dense page; cash variant on same route, branched by `payment_mode`
10. **Analytics teaser** — Mini funnel: Profile views (7d) · Inquiries (7d) · Bookings (7d), each with delta vs. prior 7d
11. **Per-booking private vendor notes** — In scope (one textarea per `booking_event`)
12. **No Customers section** for MVP

## 3. Sidebar IA & routing

### New sidebar order

| Item | Route | Status |
|---|---|---|
| Home | `/dashboard` | Redesigned — Inbox + Ops + Analytics teaser |
| Bookings | `/dashboard/bookings` | Repurposed — searchable archive (no longer the work surface) |
| Calendar | `/dashboard/profile/calendar` | Unchanged (sub-project G) |
| Money | `/dashboard/money` | New — replaces today's "Payments" → `/dashboard/stripe/success` link |
| Notifications | `/dashboard/notifications` | Unchanged (sub-project F) |
| Profile | `/dashboard/profile` | Unchanged — profile editor + packages CRUD |

### Routing changes

- `/dashboard/stripe/success` and `/dashboard/stripe/refresh` stay live (Stripe Connect uses them as redirect URIs) but are no longer linked from the sidebar.
- Couple-side `/dashboard` is **unchanged** (D's event card grid remains).
- The Inbox side panel uses Next App Router **intercepting parallel routes**: `/dashboard/@panel/(.)bookings/[id]/page.tsx` intercepts navigation from `/dashboard` to `/dashboard/bookings/[id]` and renders the booking detail into a panel slot; direct visit, refresh, or mobile (CSS-hidden slot + redirect shim) resolves to the existing standalone `/dashboard/bookings/[id]/page.tsx`.

### Sidebar component upgrades

While we're touching `src/app/dashboard/layout.tsx`:
- Add Lucide icons next to each sidebar entry (`Home`, `Calendar`, `Inbox`, `Wallet`, `Bell`, `User`).
- Active-route highlighting based on `usePathname()` — current layout has none.
- Move "Calendar" above "Money" to group operational items.

## 4. Home page design (`/dashboard`)

**File**: `src/app/dashboard/page.tsx` — replace today's vendor branch wholesale. Couple branch (sub-project D's event card grid) is unchanged.

### Block 1: Inbox (top, full width)

Two subsections, each with its own count chip in the header.

**"Needs your reply"** — items where the vendor must act:
- `bookings.status IN ('pending', 'adjusted_quote_declined')`, ordered by `created_at ASC` (oldest first signals urgency)
- Plus any `accepted` booking whose deposit window closes in the next 24h (`accept_at + interval '72 hours' < now() + interval '24 hours'`)

**"Waiting on couple"** — items in motion but not requiring vendor action:
- `bookings.status IN ('accepted', 'adjusted_quote_pending')`, ordered by `updated_at DESC`

**Row shape**:
- Couple name or first name (snapshot)
- Package label snapshot
- Relative timestamp ("2h ago", "1d ago")
- Status chip
- Urgency badge if applicable ("18h left", color red)
- Row click → side panel (intercepting parallel route to `/dashboard/bookings/[id]`)

**Empty state for the whole Inbox**: "No action needed. You'll see new requests here."

### Block 2: Operations (middle)

Header: "**Operations · next 30 days**"

Bucketed list. Only buckets with at least one item render. Bucket order: `TODAY`, `TOMORROW`, `THIS WEEK`, `LATER`.

**Data source**: `booking_events` joined to `bookings` where `bookings.vendor_profile_id = me` and `bookings.status IN ('deposit_paid', 'completed')` and `event_date BETWEEN today AND today + interval '30 days'`.

**Per-bucket detail**:
- `TODAY` / `TOMORROW` — full row: date+time, couple name, venue address line 1 + city, package label
- `THIS WEEK` — compact row: date + couple + package
- `LATER` — collapses to a one-line peek ("3 events: Jun 7, Jun 14, Jul 2"), expandable on click

**Empty state**: "No upcoming events. Once you have confirmed bookings, they'll show up here."

### Block 3: Analytics teaser (bottom)

Single horizontal strip with three numbers + a "Full analytics →" link (links to a placeholder route in this PR — real page is a later phase).

| Metric | Source | Window |
|---|---|---|
| Profile views | `vendor_profile_views` (new table — see §6) | last 7 days |
| Inquiries | `bookings` where `vendor_profile_id = me` and `created_at >= now() - interval '7 days'` | last 7 days |
| Bookings | `bookings` where `vendor_profile_id = me` and `status IN ('deposit_paid', 'completed')` and `accepted_at >= now() - interval '7 days'` | last 7 days |

Each number shows a delta vs. the prior 7 days ("12 ↑3 vs last week"). Click any number → placeholder page `/dashboard/analytics` showing "Full analytics coming soon" (real page in a later phase).

### Existing banners (retained)

- **Vendor onboarding gate**: `activePackageCount === 0` → existing yellow banner above Block 1 ("Add a package to go live")
- **Paused profile**: `vendor_profile.is_active === false` → existing banner above Block 1

## 5. Side panel (parallel route)

### File structure

```
src/app/dashboard/
  layout.tsx                                  # MODIFIED — accepts `panel` slot prop
  page.tsx                                    # MODIFIED — Home redesign (§4)
  default.tsx                                 # NEW — fallback for top slot
  @panel/
    default.tsx                               # NEW — empty fallback for panel slot
    (.)bookings/
      [id]/
        page.tsx                              # NEW — intercept renderer
  bookings/
    [id]/
      page.tsx                                # UNCHANGED — full-page fallback (deeplink, refresh, mobile)
```

### Layout slot

```tsx
// src/app/dashboard/layout.tsx
export default async function DashboardLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  // ... existing auth + sidebar code unchanged ...
  return (
    <div className="min-h-screen bg-muted/40">
      <Navbar />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <aside className="hidden w-56 shrink-0 md:block">{/* sidebar */}</aside>
        <main className="flex-1">{children}</main>
        {panel}
      </div>
    </div>
  );
}
```

### Intercept page

```tsx
// src/app/dashboard/@panel/(.)bookings/[id]/page.tsx
import { BookingDetail } from '@/components/dashboard/BookingDetail';
import { PanelShell } from '@/components/dashboard/PanelShell';

export default async function PanelBookingPage({ params }: { params: { id: string } }) {
  return (
    <PanelShell>
      <BookingDetail bookingId={params.id} mode="panel" />
    </PanelShell>
  );
}
```

### `<PanelShell>` (new client component)

`src/components/dashboard/PanelShell.tsx`:
- `fixed inset-y-0 right-0 z-40 w-full max-w-xl border-l bg-background shadow-xl`
- `hidden md:flex` — hidden on mobile, visible on tablet+
- Slide-in via Tailwind transition or Framer Motion (`translate-x-full → translate-x-0`)
- Close button → calls `useCloseToHome()` hook (below)
- ESC key listener closes via same hook
- **Mobile redirect shim**: `useEffect` checks `window.matchMedia('(max-width: 767px)').matches`; if true, calls `router.replace('/dashboard/bookings/' + bookingId)` to hand off to the standalone page

```tsx
function useCloseToHome() {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push('/dashboard');
  }, [router]);
}
```

### `<BookingDetail>` (extract from existing page)

New component at `src/components/dashboard/BookingDetail.tsx`. Extracted from today's `src/app/dashboard/bookings/[id]/page.tsx`. Accepts:

```ts
interface BookingDetailProps {
  bookingId: string;
  mode: 'panel' | 'page';
}
```

In `mode='panel'`, omits the page header and breadcrumbs (the panel chrome provides them). All existing actions (Accept, Adjust Quote, Cancel, Complete, Refund, Dispute, Review) work identically.

The existing `src/app/dashboard/bookings/[id]/page.tsx` becomes a thin wrapper that renders `<BookingDetail bookingId={params.id} mode="page" />`.

### Vendor notes editor

New section inside `<BookingDetail>`, only rendered when the viewer is the vendor (server-side check via `role`):

- One textarea per `booking_event` (a booking can have 1–5 events per the package model)
- Auto-save on blur (debounced 500ms PATCH to `/api/booking-events/[id]/notes`)
- Header: "**Private notes — only you can see this**"
- Empty placeholder: "e.g. couple is vegetarian, prefers minimal posing"
- Max 5000 chars (UX counter at 4500, blocks at 5000)
- Save indicator: "Saved · just now" / "Saving…" / "Couldn't save — retry"

### Mobile behavior

`PanelShell` has `hidden md:flex` so the panel never paints below `md:`. The parallel-route intercept still fires at the routing layer regardless of viewport — so on mobile, the user clicks an Inbox row and lands on a URL like `/dashboard/bookings/abc` with an invisible panel rendered into the slot. The shim in `PanelShell` detects mobile on mount and calls `router.replace('/dashboard/bookings/abc')`. Because that route resolves to the standalone page when navigated directly (not via the slot), this lands on the full-page detail. Cost: one extra navigation on mobile, ~10 LOC of shim.

## 6. Bookings archive (`/dashboard/bookings`)

**File**: `src/app/dashboard/bookings/page.tsx` — replace the flat list with the archive shape.

### Layout

```
┌─ Bookings · 28 total ─────────────────────────────────┐
│ [search couple name…]                  [▼ Sort: date] │
│                                                       │
│ [All 28] [Active 7] [Upcoming 5] [Past 14] [Cancelled 2] │
│                                                       │
│ ▸ Khan-Ali Walima      · Aug 14    · deposit_paid    │
│ ▸ Patel Mehndi         · Aug 22    · deposit_paid    │
│ ▸ Mehta Sangeet        · Jul 30    · accepted        │
│ ▸ Aisha K. consult     · Jun 7     · pending         │
│ ▸ Sharma family        · Apr 12    · couple_cancelled│
│                                                       │
│ ───── Load more ─────                                 │
└───────────────────────────────────────────────────────┘
```

### Filter tabs

| Tab | Status set |
|---|---|
| All | every status |
| Active | `pending`, `accepted`, `adjusted_quote_pending`, `adjusted_quote_declined`, `deposit_paid` |
| Upcoming | `deposit_paid` AND `min(event_date) >= today` |
| Past | `completed` |
| Cancelled | `couple_cancelled`, `vendor_cancelled`, `cancelled_mutual`, `expired`, `rejected` |

- Count chip on each tab
- Default tab: **All**
- Tab state in URL via `?tab=upcoming` for shareability
- Tab change resets pagination cursor

### Search

Client-side filter by `couple_name LIKE %q%` (snapshot field on bookings) over the already-loaded rows. Debounced 200ms. Server still does the heavy status filter. If we ever cross >100 bookings per vendor, switch to server-side search via `?q=` — until then, client-side is snappier.

### Sort

Default `event_date DESC` (most recent first). Toggle to `created_at DESC` (most recently received).

### Rows

Reuse `<BookingCard>` (already used today), tightened a bit. Click → side panel (same intercept route used from Home Inbox). Status chip color-coded per status.

### Pagination

Cursor-based. "Load more" button at the bottom. Page size 25. Server returns `nextCursor` if more rows exist.

### Empty states

- Vendor has zero bookings ever: existing "No bookings yet" message
- Vendor has bookings but current filter returns zero: "No bookings in this view" with a "Show all" reset link

### Service extension

`getBookingRequests` in `src/services/booking.service.ts` — extend signature:

```ts
interface GetBookingRequestsParams {
  status?: BookingStatus[];
  q?: string;
  cursor?: string;
  limit?: number;
  sort?: 'event_date' | 'created_at';
}
```

Existing callers that pass no params continue to work (couple-side usage).

## 7. Money section (`/dashboard/money`)

**New route**: `src/app/dashboard/money/page.tsx`. Server component. Branches on `vendor_profiles.payment_mode`.

### Stripe vendor variant (`payment_mode = 'stripe'` or null)

**Layout (top → bottom):**

1. **Three-card summary row**. Reuses `getVendorEarnings()` (existing service):
   - Card 1 — "Pending escrow" (`pending_escrow_cents`) + sub-label "N bookings"
   - Card 2 — "Available" (`available_cents`, green) + **Withdraw** button (opens existing withdraw flow; respects `requires_onboarding`, `verification_pending`, `frozen_reason`)
   - Card 3 — "Lifetime transferred" (`transferred_cents`, muted)

2. **Status banner** (conditional, between summary and payout history):
   - `requires_onboarding === true` → yellow: "Complete Stripe onboarding to enable withdrawals." [Continue]
   - `verification_pending === true` → blue: "Stripe is verifying your account. This usually takes 1–2 business days."
   - `frozen_reason` non-null → red: "Account frozen: {reason}. Contact support."

3. **Payout history** (new component `<PayoutHistory>`):
   - Query: new `payouts` table (see §8)
   - Row: `arrival_date`, `amount`, `status` chip (`pending` / `in_transit` / `paid` / `failed` / `canceled`), "N bookings" count
   - Click row → inline expand showing the contributing bookings (from `payout_bookings` join table)
   - Pagination: 25 per page, "Load more"

4. **Recent unlocks** (last 7 days):
   - Move existing `<RecentUnlocks>` here verbatim from today's home page
   - Lists `completed` bookings whose vendor funds became withdrawable in the last 7 days

### Cash vendor variant (`payment_mode = 'cash'`)

**Layout:**

1. **Explainer card** (single, top):
   ```
   💵 You and your client handle the 95%
   Baazar holds a 5% deposit to lock in the booking;
   everything else is yours to arrange.
   ```

2. **Two-card summary row**:
   - Card 1 — Confirmed bookings count (`status IN ('deposit_paid', 'completed')`)
   - Card 2 — Upcoming events count (future `event_date` on confirmed bookings)

3. **Cash to collect at upcoming events** (new component `<CashToCollect>`):
   - One row per `booking_event` in the next 30 days where the parent booking is `deposit_paid`
   - Each row: event date, couple name, package label, dollar amount = `total_price_cents * (1 - DEPOSIT_RATE)` (sourced from the same constant `payment.service.ts` uses; never hardcode 0.95)
   - Rolling total at top: "$X to collect over next 30 days"

4. **Collected this year** (read-only ledger):
   - Sum of `(1 - DEPOSIT_RATE) * total_price_cents` across all `completed` bookings YTD
   - Single number with year label
   - Footnote: "For tax / records — Baazar doesn't process this money."

### Sidebar entry

The sidebar "Money" link in `src/app/dashboard/layout.tsx` replaces today's "Payments" link to `/dashboard/stripe/success`. The Stripe redirect routes stay live but aren't sidebar-linked.

## 8. Data model — migration 00034

One migration file: `supabase/migrations/00034_sub_project_e_vendor_crm.sql`. Three changes, all additive.

### Change 1 — `booking_events.vendor_notes`

```sql
ALTER TABLE booking_events
  ADD COLUMN vendor_notes text;

COMMENT ON COLUMN booking_events.vendor_notes IS
  'Private vendor-only notes. Never returned to couple-side queries. Max ~5KB (UX-enforced, not DB-constrained).';
```

**RLS** — additive policy:

```sql
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
```

**Public view** (belt-and-suspenders against column leakage — Postgres RLS doesn't filter columns):

`security_invoker = on` is mandatory: Postgres 15+ views default to bypassing RLS (security_definer-like behavior), which would let any authenticated user read everyone's booking events through the view. With `security_invoker = on`, the view honors the caller's RLS and `booking_events`' existing policies (couple sees own, vendor sees their) still apply.

```sql
CREATE VIEW booking_events_public
  WITH (security_invoker = on)
  AS
  SELECT id, booking_id, sequence, event_date, event_start_time, event_end_time,
         event_type_label, location_name, address_line_1, city, state, postal_code,
         google_place_id, guest_count_override, location_overridden,
         completed_at, created_at
  FROM booking_events;
```

(Column list mirrors `booking_events`' actual schema — see `supabase/migrations/00016_create_booking_events.sql` for the source-of-truth column inventory.)

Couple-side code uses `booking_events_public`. Vendor-side uses `booking_events` directly (existing RLS filters to vendor's own rows). All existing couple-facing queries in the codebase must be audited and updated to use the view — see Implementation checklist below.

### Change 2 — `vendor_profile_views`

```sql
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

-- INSERT happens via service_role from server actions; no policy needed
```

**Dedupe**: `UNIQUE (vendor_profile_id, ip_hash, day)` prevents same-day re-counts. `ip_hash = sha256(ip || daily_salt)` where `daily_salt` is `date_trunc('day', now())::text` (rotates daily for k-anonymity).

### Change 3 — `payouts` + `payout_bookings`

```sql
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

**Population**: extend the existing `payout.paid` / `payout.failed` webhook handler (`src/app/api/webhooks/stripe/route.ts`) plus add `payout.created` / `payout.canceled` to upsert into `payouts` on every payout event. Booking attribution: join `transactions` rows whose `transferred_at` falls between `payout.created` and `payout.arrival_date` for the same vendor's Connect account.

### Backfill

`scripts/backfill-payouts.ts` — one-shot. Iterates active Connect accounts, calls `stripe.payouts.list({ stripe_account: accountId, limit: 100 })`, upserts each into `payouts`. Idempotent via `stripe_payout_id` unique constraint. Run once post-migration in prod.

### Migration application

Following the project's deployment runbook:
1. Apply to **dev** Supabase via SQL editor (`lquvhjedlzubqusnfaak`)
2. Verify via local + dev smoke tests
3. After merge to main → apply to **prod** Supabase via SQL editor (`obpdgihdskbxzgyctaib`)
4. Run `tsx scripts/backfill-payouts.ts` against prod
5. Update `MEMORY.md` with ship record

## 9. API surface

Most of E renders via Server Components + service functions. New HTTP endpoints are added only where client interactivity demands them.

### New HTTP endpoints

**`PATCH /api/booking-events/[id]/notes`**

```
Body: { notes: string }
Auth: vendor must own the parent booking
Rate limit: Upstash 10/min per user
Returns: 200 { ok: true } | 400 (validation) | 403 (not owner) | 404 (not found) | 429 (rate limit)
```

- Service: `updateVendorNotes(bookingEventId, userId, notes)` in `src/services/booking-event.service.ts` (new file)
- Validates: trim, max 5000 chars
- Last-write-wins (no optimistic locking — private notes don't need it)

### New server actions

**`recordVendorProfileView(vendorProfileId)`**

- Fired from `src/app/(marketplace)/vendors/[slug]/page.tsx` (Server Component) after the main render
- Reads IP from `x-forwarded-for` header (Vercel sets this)
- `ip_hash = sha256(ip + daily_salt)`
- `INSERT … ON CONFLICT DO NOTHING` into `vendor_profile_views`
- Skips when `viewer_user_id === vendor's user_id` (vendor viewing own profile)
- Fire-and-forget — wraps in try/catch, logs failures to Sentry, never blocks render

### New service functions

**`src/services/booking.service.ts`** (extended):
- `getBookingRequests(supabase, userId, role, params?: GetBookingRequestsParams)` — status filter, search, cursor pagination, sort
- `getOperationsBuckets(supabase, vendorProfileId, days = 30)` — returns `{ today, tomorrow, thisWeek, later }` arrays

**`src/services/analytics.service.ts`** (new):
- `getAnalyticsTeaser(supabase, vendorProfileId)` — three parallel queries (views, inquiries, bookings) with `{ count, prevCount, delta }` for each

**`src/services/payment.service.ts`** (extended):
- `getPayoutHistory(supabase, vendorProfileId, { cursor, limit })`
- `getCashToCollect(supabase, vendorProfileId)` — upcoming `booking_event` rows on `deposit_paid` bookings with 95% amount computed

### Webhook extension

**`POST /api/webhooks/stripe`** — extend to handle:
- `payout.created` → upsert payout row (`status='pending'`)
- `payout.paid` → upsert (`status='paid'`)
- `payout.failed` → upsert (`status='failed', failure_message=...`)
- `payout.canceled` → upsert (`status='canceled'`)
- On payout.paid: derive contributing bookings by joining `transactions` rows transferred during the payout window, insert into `payout_bookings`

## 10. Testing

### Service / unit tests (vitest)

| File | Coverage |
|---|---|
| `src/services/booking-event.service.test.ts` | `updateVendorNotes` happy path, vendor not owner (403), event not found (404), max-length enforcement, whitespace trim |
| `src/services/booking.service.test.ts` | `getBookingRequests` with status filter, with `q` search, with cursor pagination, sort by event_date vs created_at |
| `src/services/booking.service.test.ts` | `getOperationsBuckets` bucketing — events across day boundaries, only `deposit_paid` + `completed` included |
| `src/services/analytics.service.test.ts` | `getAnalyticsTeaser` counts in window, delta arithmetic, zero-data vendor |
| `src/services/payment.service.test.ts` | `getPayoutHistory` cursor + booking attribution join |
| `src/services/payment.service.test.ts` | `getCashToCollect` — 95% math (sourced from DEPOSIT_RATE constant), only future events on `deposit_paid` bookings |

### RLS / DB tests (critical privacy surface)

`tests/db/rls/`:
- `vendor_notes_view_excludes_column.test.ts` — `booking_events_public` view has no `vendor_notes` column at all (introspect via `information_schema.columns`). Postgres RLS can't filter columns, so the view is the defense.
- `vendor_notes_couple_api_never_returns.test.ts` — integration test: log in as couple, hit every couple-facing API/route that touches booking events, grep responses for any `vendor_notes` field. Fail if found.
- `vendor_notes_other_vendor_cannot_write.test.ts` — vendor B cannot UPDATE notes on vendor A's events (RLS update policy on `booking_events`).
- `vendor_profile_views_isolation.test.ts` — vendor B cannot SELECT vendor A's view rows.
- `payouts_isolation.test.ts` — vendor B cannot SELECT vendor A's payouts.
- `payouts_unique_constraint.test.ts` — second insert with same `stripe_payout_id` rejected (idempotent webhook handling).

### API route tests

- `src/app/api/booking-events/[id]/notes/route.test.ts` — auth, ownership, validation, rate limit

### E2E tests (Playwright)

`tests/e2e/`:
- `vendor-inbox.spec.ts` — login → `/dashboard` → see pending in Inbox → click row → panel opens → accept → row disappears
- `vendor-inbox-mobile.spec.ts` — same flow at viewport 375px → panel doesn't render, navigation lands on full-page `/dashboard/bookings/[id]` (verifies mobile-redirect shim)
- `vendor-bookings-archive.spec.ts` — `/dashboard/bookings` → tab through Active/Past/Cancelled → search by couple name → click row opens panel
- `vendor-notes-roundtrip.spec.ts` — vendor edits notes in panel → blur autosaves → navigate away and back → notes persist → couple's session has no visibility (verify via API returning `booking_events_public`)
- `vendor-money-stripe.spec.ts` — Stripe vendor `/dashboard/money` → sees 3 cards, payout history, withdraw button gated by onboarding
- `vendor-money-cash.spec.ts` — cash vendor `/dashboard/money` → sees the C-wording explainer, confirmed bookings count, cash-to-collect with 95% amounts
- `vendor-analytics-teaser.spec.ts` — seed `vendor_profile_views` + bookings → visit `/dashboard` → teaser numbers + delta correct

### Webhook tests

- `src/app/api/webhooks/stripe/route.test.ts` — extend with `payout.created` / `payout.paid` / `payout.failed` / `payout.canceled` payloads → rows inserted/updated, `payout_bookings` populated on `paid`

### Backfill script

- `scripts/backfill-payouts.test.ts` — uses Stripe test mode, asserts idempotency (run twice, same row count)

### Coverage target

No formal target. Every new exported service function gets at least happy-path + auth/edge tests. RLS tests cover privacy explicitly. E2E covers the seven user-visible flows above.

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `vendor_notes` leaks to couple via a forgotten `SELECT *` or raw `booking_events` query | Medium-high | Three layers: (1) `booking_events_public` view excludes the column at the DB layer; (2) grep audit of couple-facing code paths during implementation switches each to the view; (3) integration test logs in as couple, hits every couple-facing endpoint, fails CI if `vendor_notes` appears anywhere in the response payload. Postgres RLS alone can't filter columns. |
| Parallel-route intercepts misfire on edge cases (transitions, deep links) | Medium | Mobile-redirect shim + explicit Playwright tests for direct-URL visit, refresh-while-panel-open, browser-back, close-after-direct-visit |
| Payouts backfill double-counts or skips rows | Low | Idempotent via `stripe_payout_id` unique; test in Stripe test mode; document re-run path |
| Cash-vendor 95% math drifts if `DEPOSIT_RATE` changes | Low | Source from `DEPOSIT_RATE` constant in `payment.service.ts` — never hardcode 0.95 |
| Side-panel state in URL causes back-button confusion | Low | `useCloseToHome()` hook prefers `router.back()` with `router.push('/dashboard')` fallback; manual test 3-step navigation |
| Profile-view tracking inflates from server-rendered crawlers | Medium | Accept for MVP; revisit with UA denylist or client-side beacon if numbers look noisy |
| Inbox/Operations queries get slow at vendor scale (>100 active bookings) | Low for MVP | Indexes from sub-project A already in place; revisit if a real vendor hits this |

## 12. Implementation checklist

A high-level outline. The detailed phased plan goes in `docs/superpowers/plans/2026-05-20-sub-project-e-vendor-dashboard-crm.md`.

### Schema (single migration)
- [ ] Write `00034_sub_project_e_vendor_crm.sql` covering all three changes (vendor_notes + view, vendor_profile_views, payouts + payout_bookings)
- [ ] Apply to dev Supabase, run existing tests
- [ ] Update generated types if used

### Couple-side query audit (privacy gate)
- [ ] Grep for all `booking_events` selects in couple-facing code paths (`src/app/(marketplace)`, `src/app/dashboard/page.tsx` couple branch, `src/services/booking.service.ts` couple paths)
- [ ] Switch each to `booking_events_public` view OR explicit column list excluding `vendor_notes`
- [ ] Verify with RLS test that fails if couple can read `vendor_notes`

### Side panel infrastructure
- [ ] Extract `<BookingDetail>` from existing `bookings/[id]/page.tsx`
- [ ] Build `<PanelShell>` + `useCloseToHome()` hook + mobile redirect shim
- [ ] Add `@panel` slot to `dashboard/layout.tsx` + `default.tsx` fallbacks
- [ ] Create `(.)bookings/[id]/page.tsx` intercept route

### Home page
- [ ] Build `<InboxBlock>` with two subsections and row component
- [ ] Build `<OperationsBlock>` with bucketing logic
- [ ] Build `<AnalyticsTeaser>` with funnel numbers
- [ ] Replace vendor branch in `src/app/dashboard/page.tsx`
- [ ] Keep onboarding gate + paused-profile banners

### Bookings archive
- [ ] Extend `getBookingRequests` with status/q/cursor/sort params
- [ ] Build tab UI + search input + sort toggle in `src/app/dashboard/bookings/page.tsx`
- [ ] Cursor pagination
- [ ] Empty-state copy

### Money section
- [ ] Build `src/app/dashboard/money/page.tsx` with branch on `payment_mode`
- [ ] Move `<RecentUnlocks>` here from today's home
- [ ] Build `<PayoutHistory>` component + `getPayoutHistory()` service
- [ ] Build `<CashToCollect>` component + `getCashToCollect()` service
- [ ] Update sidebar Money link in layout

### Notes editor
- [ ] Add notes textarea to `<BookingDetail>` (vendor-only)
- [ ] Build `PATCH /api/booking-events/[id]/notes` route + rate limit
- [ ] Add `updateVendorNotes` service function
- [ ] Auto-save on blur, save indicator

### Analytics tracking
- [ ] Server action `recordVendorProfileView` fired from `vendors/[slug]/page.tsx`
- [ ] Build `getAnalyticsTeaser` service
- [ ] Placeholder `/dashboard/analytics` page

### Webhook + backfill
- [ ] Extend `/api/webhooks/stripe` route for payout events
- [ ] Write `scripts/backfill-payouts.ts`

### Tests
- [ ] Service unit tests (all new functions)
- [ ] RLS tests (privacy surface)
- [ ] API route tests for notes endpoint
- [ ] E2E specs (7 scenarios)
- [ ] Webhook extension tests
- [ ] Backfill script idempotency test

### Rollout
- [ ] PR into main, review, merge
- [ ] Apply migration to prod via Supabase SQL editor
- [ ] Run backfill against prod
- [ ] Smoke test on www.baazar.io with both Stripe and cash test vendors
- [ ] Update `MEMORY.md` ship record
- [ ] Update `docs/phases.md` ledger

## 13. What unblocks next

E shipping unblocks the second functional sub-project per the sequencing memory: **Sub-project I — Multi-business per vendor account**. After I, UI polish (J homepage, H search filters), then K (scraper) last.
