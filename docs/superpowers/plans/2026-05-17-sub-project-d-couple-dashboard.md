# Sub-project D — Couple Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Replace the couple's `/dashboard` overview with a filterable grid of 3D flip cards (one per `booking_event`). Uiverse.io "ElSombrero2" flip card style via CSS module.

**Architecture:** Server component fetches `booking_events` joined with bookings + vendors. Client component `EventCardGrid` owns filter state (time tab + category dropdown). Each card is `EventCard` — flipping via CSS `transform: rotateY(180deg)` on hover/tap. Vendor branch of `/dashboard` unchanged.

**Tech Stack:** Next.js 14 App Router, CSS Modules, vitest. No new dependencies.

---

## File structure (locked in spec §7)

**New:**
- `src/lib/dashboard/countdown.ts`
- `src/__tests__/lib/dashboard/countdown.test.ts`
- `src/components/dashboard/EventCard.module.css`
- `src/components/dashboard/EventCard.tsx`
- `src/components/dashboard/EventCardFilters.tsx`
- `src/components/dashboard/EventCardGrid.tsx`

**Modified:**
- `src/app/dashboard/page.tsx` — couple branch only

---

## Task D1: countdown helper + CSS module

### D1.1: countdown helper + tests

**Files:**
- Create: `src/lib/dashboard/countdown.ts`
- Test: `src/__tests__/lib/dashboard/countdown.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/lib/dashboard/countdown.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { countdown } from '@/lib/dashboard/countdown';

const NOW = new Date('2026-08-01T12:00:00Z');

describe('countdown', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns "Past" for past dates', () => {
    expect(countdown('2026-07-30')).toBe('Past');
  });

  it('returns "today" for today', () => {
    expect(countdown('2026-08-01')).toBe('today');
  });

  it('returns "tomorrow" for tomorrow', () => {
    expect(countdown('2026-08-02')).toBe('tomorrow');
  });

  it('returns Nd for 2-6 days', () => {
    expect(countdown('2026-08-04')).toBe('3d');
    expect(countdown('2026-08-07')).toBe('6d');
  });

  it('returns Nw for 1-4 weeks', () => {
    expect(countdown('2026-08-08')).toBe('1w');
    expect(countdown('2026-08-22')).toBe('3w');
  });

  it('returns Nmo for ~1-12 months', () => {
    expect(countdown('2026-09-15')).toBe('1mo');
    expect(countdown('2027-02-01')).toBe('6mo');
  });

  it('returns Ny for 1+ years out', () => {
    expect(countdown('2027-08-01')).toBe('1y');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npm test -- countdown` → expect FAIL on missing module.

- [ ] **Step 3: Implement**

```typescript
// src/lib/dashboard/countdown.ts
export function countdown(eventDate: string): string {
  const days = Math.ceil(
    (new Date(eventDate + 'T12:00:00Z').getTime() - Date.now()) / 86_400_000
  );
  if (days < 0) return 'Past';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
```

The `T12:00:00Z` anchor avoids timezone-edge bugs where a date "moves" by one day when interpreted in a different timezone.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- countdown
git add src/lib/dashboard/countdown.ts src/__tests__/lib/dashboard/countdown.test.ts
git commit -m "feat(dashboard): D1 — countdown helper + 7 unit tests"
```

### D1.2: CSS module

**Files:**
- Create: `src/components/dashboard/EventCard.module.css`

- [ ] **Step 1: Adapt the user-provided Uiverse CSS to a CSS module**

```css
/* src/components/dashboard/EventCard.module.css */
/* Adapted from Uiverse.io by ElSombrero2 (flip card with orange gradient back).
   Spec: docs/superpowers/specs/2026-05-17-sub-project-d-couple-dashboard-design.md §6 */

.card {
  overflow: visible;
  width: 190px;
  height: 254px;
  perspective: 1000px;
}

.content {
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 300ms;
  box-shadow: 0px 0px 10px 1px #000000ee;
  border-radius: 5px;
  position: relative;
}

.card:hover .content,
.flipped .content {
  transform: rotateY(180deg);
}

.front,
.back {
  background-color: #151515;
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 5px;
  overflow: hidden;
}

.back {
  display: flex;
  justify-content: center;
  align-items: center;
}

.back::before {
  position: absolute;
  content: ' ';
  display: block;
  width: 160px;
  height: 160%;
  background: linear-gradient(90deg, transparent, #ff9966, #ff9966, #ff9966, #ff9966, transparent);
  animation: rotation_481 5000ms infinite linear;
}

.backContent {
  position: absolute;
  width: 99%;
  height: 99%;
  background-color: #151515;
  border-radius: 5px;
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 16px;
  text-align: center;
}

.front {
  transform: rotateY(180deg);
  color: white;
}

.frontContent {
  position: absolute;
  width: 100%;
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  z-index: 2;
}

.frontImg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: 1;
}

.badge {
  background-color: #00000088;
  padding: 2px 10px;
  border-radius: 10px;
  backdrop-filter: blur(2px);
  width: fit-content;
  font-size: 11px;
  font-weight: 500;
}

.titleRow {
  display: flex;
  justify-content: space-between;
  z-index: 3;
}

.description {
  box-shadow: 0px 0px 10px 5px #00000088;
  width: 100%;
  padding: 10px;
  background-color: #000000aa;
  backdrop-filter: blur(5px);
  border-radius: 5px;
  z-index: 3;
}

.vendorName {
  font-size: 13px;
  font-weight: 600;
}

.cardFooter {
  color: #ffffffaa;
  margin-top: 4px;
  font-size: 10px;
}

/* Fixed: original CSS had two 0% keyframes — corrected to 0% / 100%. */
@keyframes rotation_481 {
  0% { transform: rotateZ(0deg); }
  100% { transform: rotateZ(360deg); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/EventCard.module.css
git commit -m "feat(dashboard): D1 — EventCard CSS module (flip + orange gradient)"
```

---

## Task D2: EventCard + EventCardFilters components

### D2.1: EventCard

**Files:**
- Create: `src/components/dashboard/EventCard.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';
import { useState } from 'react';
import Link from 'next/link';
import styles from './EventCard.module.css';
import { countdown } from '@/lib/dashboard/countdown';

export interface EventCardData {
  eventId: string;
  bookingId: string;
  eventTypeLabel: string;
  eventDate: string;
  eventStartTime: string;  // ISO timestamp
  eventEndTime: string;    // ISO timestamp
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  status: string;
  vendor: {
    businessName: string;
    category: string;
    portfolioImage: string | null;
  };
}

interface Props {
  data: EventCardData;
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTimeRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const f = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${f(s)} – ${f(e)}`;
}

function statusBadge(status: string): { label: string; color: string } {
  if (status === 'deposit_paid' || status === 'completed') return { label: 'Confirmed', color: '#34d399' };
  if (status === 'pending') return { label: 'Awaiting vendor', color: '#fbbf24' };
  if (status === 'accepted') return { label: 'Awaiting deposit', color: '#fbbf24' };
  if (status === 'adjusted_quote_sent') return { label: 'Adjusted quote', color: '#60a5fa' };
  if (status === 'adjusted_quote_declined') return { label: 'Re-quote needed', color: '#fb923c' };
  return { label: status, color: '#9ca3af' };
}

const REVEAL_STATUSES = new Set(['deposit_paid', 'completed']);

export function EventCard({ data }: Props) {
  const [flipped, setFlipped] = useState(false);
  const cd = countdown(data.eventDate);
  const isPast = cd === 'Past';
  const fullAddress = REVEAL_STATUSES.has(data.status);
  const addressLine = fullAddress
    ? `${data.addressLine1}, ${data.city}, ${data.state} ${data.postalCode}`
    : `${data.city}, ${data.state}`;
  const sb = statusBadge(data.status);

  return (
    <div
      className={`${styles.card} ${flipped ? styles.flipped : ''}`}
      aria-label={`${data.eventTypeLabel} with ${data.vendor.businessName} on ${fmtDate(data.eventDate)} — ${cd}`}
      onClick={() => setFlipped((v) => !v)}  // mobile tap-to-flip
      role="button"
      tabIndex={0}
    >
      <div className={styles.content}>
        {/* FRONT */}
        <div className={styles.front}>
          {data.vendor.portfolioImage && (
            <img src={data.vendor.portfolioImage} alt="" className={styles.frontImg} aria-hidden />
          )}
          <div className={styles.frontContent}>
            <div className={styles.titleRow}>
              <span className={styles.badge}>{data.eventTypeLabel}</span>
              <span className={styles.badge}>{isPast ? 'Past' : cd}</span>
            </div>
            <div className={styles.description}>
              <p className={styles.vendorName}>{data.vendor.businessName}</p>
              <p className={styles.cardFooter}>{fmtDate(data.eventDate)}</p>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div className={styles.back}>
          <div className={styles.backContent}>
            <p style={{ fontSize: '16px', fontWeight: 700 }}>{data.eventTypeLabel}</p>
            <p style={{ fontSize: '12px' }}>{fmtTimeRange(data.eventStartTime, data.eventEndTime)}</p>
            <p style={{ fontSize: '11px', opacity: 0.8 }}>{addressLine}</p>
            <p style={{ fontSize: '11px' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: sb.color, marginRight: 6 }} />
              {sb.label}
            </p>
            <Link
              href={`/dashboard/bookings/${data.bookingId}`}
              style={{ color: '#ff9966', fontSize: '11px', textDecoration: 'underline' }}
              onClick={(e) => e.stopPropagation()}
            >
              Open booking →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/EventCard.tsx
git commit -m "feat(dashboard): D2 — EventCard flip component"
```

### D2.2: EventCardFilters

**Files:**
- Create: `src/components/dashboard/EventCardFilters.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

export type TimeFilter = 'upcoming' | 'past' | 'all';

interface Props {
  timeFilter: TimeFilter;
  onTimeChange: (t: TimeFilter) => void;
  categoryFilter: string;  // '' = all categories
  onCategoryChange: (c: string) => void;
}

export function EventCardFilters({ timeFilter, onTimeChange, categoryFilter, onCategoryChange }: Props) {
  const tabs: Array<{ key: TimeFilter; label: string }> = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTimeChange(t.key)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              timeFilter === t.key
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-sm text-muted-foreground">Category:</span>
        <Select value={categoryFilter || 'all'} onValueChange={(v) => onCategoryChange(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {VENDOR_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{VENDOR_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/EventCardFilters.tsx
git commit -m "feat(dashboard): D2 — EventCardFilters (time tabs + category dropdown)"
```

---

## Task D3: EventCardGrid

**Files:**
- Create: `src/components/dashboard/EventCardGrid.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EventCard, type EventCardData } from './EventCard';
import { EventCardFilters, type TimeFilter } from './EventCardFilters';
import { countdown } from '@/lib/dashboard/countdown';

interface Props {
  events: EventCardData[];
}

export function EventCardGrid({ events }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('upcoming');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const filtered = useMemo(() => {
    return events.filter((e) => {
      // Time filter
      const isPast = countdown(e.eventDate) === 'Past';
      if (timeFilter === 'upcoming' && isPast) return false;
      if (timeFilter === 'past' && !isPast) return false;
      // Category filter
      if (categoryFilter && e.vendor.category !== categoryFilter) return false;
      return true;
    });
  }, [events, timeFilter, categoryFilter]);

  if (events.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No upcoming events yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse vendors to start planning your wedding.
        </p>
        <Button asChild className="mt-4">
          <Link href="/vendors">Browse Vendors →</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <EventCardFilters
        timeFilter={timeFilter}
        onTimeChange={setTimeFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No events match the current filter.
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {filtered.map((e) => (
            <EventCard key={e.eventId} data={e} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/EventCardGrid.tsx
git commit -m "feat(dashboard): D3 — EventCardGrid with filter state + memoization"
```

---

## Task D4: Wire into /dashboard page

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Read the existing page**

Note where the couple branch lives. The current couple branch just fetches a `bookingCount`. Replace that fetch with a `booking_events` query and render `<EventCardGrid />` instead of the existing "View bookings" card link (or keep the link as a secondary "View list →" link below the grid).

- [ ] **Step 2: Modify the couple branch**

In the page handler, when `role === 'couple'`:

```typescript
if (role === 'couple') {
  const { data: rawEvents } = await supabase
    .from('booking_events')
    .select(`
      id,
      event_date,
      event_start_time,
      event_end_time,
      event_type_label,
      address_line_1,
      city,
      state,
      postal_code,
      bookings!inner(
        id,
        status,
        couple_user_id,
        vendor_profiles!inner(business_name, category, portfolio_images)
      )
    `)
    .eq('bookings.couple_user_id', user.id)
    .not('bookings.status', 'in', '("couple_cancelled","vendor_cancelled","cancelled_mutual","expired")')
    .order('event_date');

  // Flatten into EventCardData[]
  const events = (rawEvents ?? []).map((e: Record<string, unknown>) => {
    const b = (e.bookings as Record<string, unknown>);
    const v = (b.vendor_profiles as Record<string, unknown>);
    return {
      eventId: e.id as string,
      bookingId: b.id as string,
      eventTypeLabel: e.event_type_label as string,
      eventDate: e.event_date as string,
      eventStartTime: e.event_start_time as string,
      eventEndTime: e.event_end_time as string,
      addressLine1: e.address_line_1 as string,
      city: e.city as string,
      state: e.state as string,
      postalCode: e.postal_code as string,
      status: b.status as string,
      vendor: {
        businessName: v.business_name as string,
        category: v.category as string,
        portfolioImage: ((v.portfolio_images as string[] | null) ?? [])[0] ?? null,
      },
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {profile?.full_name || user.email}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/vendors">Browse vendors →</Link>
        </Button>
      </div>

      <EventCardGrid events={events} />
    </div>
  );
}
```

The vendor branch keeps its existing render path. Wrap the couple branch in an early `return` so the vendor render code stays untouched.

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): D4 — wire EventCardGrid into couple /dashboard branch"
```

---

## Task D5: Push + PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/sub-project-d-couple-dashboard
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(dashboard): Sub-project D — couple dashboard with filterable event card grid" --body "<PR body>"
```

No migration needed. Merge after manual smoke (log in as a seeded couple with ≥2 bookings, verify cards render + flip + filter works).

---

## Self-review checklist

- [ ] Every task has explicit file paths
- [ ] Code uses real existing imports (VENDOR_CATEGORIES from @/lib/utils — verify it's exported there)
- [ ] CSS module fixes the @keyframes typo (both `0%` → `0%` and `100%`)
- [ ] Address-reveal gate matches the existing booking detail page behavior
- [ ] Empty state when 0 events; second empty state when 0 events match filter
- [ ] Click handler on card uses stopPropagation on the Link inside .back so opening the booking doesn't toggle flip
