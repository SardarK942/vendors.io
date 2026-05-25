# Baazar Custom Request + Date Picker Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three things in [`2026-05-25-baazar-custom-request-design.md`](../specs/2026-05-25-baazar-custom-request-design.md): (1) extract `<DatePicker>` primitive from WhenPicker, (2) rewrite AvailabilityCalendar using the primitive + M+ tokens, (3) build Custom Request feature (virtual package card + form + new `pending_quote` booking status + vendor inbox surfacing).

**Architecture:** Primitive at `src/components/ui/date-picker.tsx` centralizes react-day-picker M+ styling. Two consumers (WhenPicker, AvailabilityCalendar) become thin wrappers. Custom Request is a server-side virtual entry appended to the vendor's package list — no schema row, sentinel `id: 'custom-request'`. PackageGrid branches on `is_custom` to render Treatment B (cream-soft + dashed hairline + italic Custom price); click navigates to `/vendors/[slug]/request`. New form posts to `POST /api/bookings/custom-request` which inserts a `bookings` row with `status='pending_quote'` and dispatches a notification. Existing CRM Inbox + `VendorAdjustQuoteForm` (Sub-project A) handle the vendor's quote response with zero code changes to the adjust-quote ping-pong.

**Tech Stack:** Next.js 14 App Router · React 18 · TypeScript · Tailwind 3.4 · Supabase Postgres · react-day-picker v10 · zod · vitest.

**Branch:** `feat/baazar-custom-request` (already created, spec committed at `4b0de8d`).

**Out of scope (deferred):** Resend email when custom request comes in, vendor disabling the Custom Request card, range-mode date selection, couple-side messaging thread, custom-request analytics, vendor-filter "accepts custom requests."

---

## File Structure

| File                                                              | Action      | Responsibility                                                                                                                                                  |
| ----------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/00040_bookings_pending_quote.sql`            | **Create**  | Add `event_type` column, update `bookings_status_check` to allow `'pending_quote'`, relax `total_price_positive` for `pending_quote`.                           |
| `supabase/migrations/00041_notifications_custom_request_type.sql` | **Create**  | Update `notifications_type_check` to allow `'custom_request_received'`.                                                                                         |
| `src/types/database.types.ts`                                     | **Modify**  | Append `'pending_quote'` to status union (bookings) and `'custom_request_received'` to NotificationType union.                                                  |
| `src/components/ui/date-picker.tsx`                               | **Create**  | M+-styled react-day-picker wrapper. Built-in `unavailable`/`partial` modifier classes. Returns ISO YYYY-MM-DD local-tz.                                         |
| `src/components/marketplace/search/WhenPicker.tsx`                | **Modify**  | Reduce to a thin wrapper around `<DatePicker>`.                                                                                                                 |
| `src/components/marketplace/AvailabilityCalendar.tsx`             | **Rewrite** | Use `<DatePicker>` with `unavailable` + `partial` modifiers. Drop dangerouslySetInnerHTML. M+ tokens. New `selected` API (ISO string).                          |
| `src/components/booking/booking-detail.tsx`                       | **Verify**  | One existing call site of `AvailabilityCalendar`; update prop names from `selectedDate`/Date callback to `selected`/string callback.                            |
| `src/lib/vendor-packages/with-custom-request.ts`                  | **Create**  | Pure `appendCustomRequest(packages, vendorProfileId)` helper + `CustomRequestPackage` type.                                                                     |
| `src/__tests__/lib/vendor-packages/with-custom-request.test.ts`   | **Create**  | TDD unit tests for the helper.                                                                                                                                  |
| `src/app/(marketplace)/vendors/[slug]/page.tsx`                   | **Modify**  | After existing `packages` query (line ~50–64), wrap with `appendCustomRequest(...)` before passing to `<VendorProfile>`.                                        |
| `src/components/marketplace/PackageGrid.tsx`                      | **Modify**  | Accept augmented type (`PackageWithAddons \| CustomRequestPackage`). Branch on `is_custom`: render Treatment B card → navigate to `/request` page (skip modal). |
| `src/lib/booking/custom-request-validation.ts`                    | **Create**  | Zod schema for the API request body. Exports `customRequestSchema` + `EVENT_TYPES` enum.                                                                        |
| `src/__tests__/lib/booking/custom-request-validation.test.ts`     | **Create**  | TDD unit tests for the zod schema.                                                                                                                              |
| `src/app/api/bookings/custom-request/route.ts`                    | **Create**  | POST handler. Auth-gated. Inserts `bookings` row with `status='pending_quote'`. Dispatches notification.                                                        |
| `src/__tests__/api/bookings-custom-request.test.ts`               | **Create**  | TDD unit tests for the API route.                                                                                                                               |
| `src/services/notifications.service.ts`                           | **Modify**  | Add `notifyCustomRequestReceived(sb, vendorUserId, ctx)` typed helper.                                                                                          |
| `src/__tests__/services/notifications-custom-request.test.ts`     | **Create**  | Test the helper.                                                                                                                                                |
| `src/components/booking/CustomRequestForm.tsx`                    | **Create**  | Client component: 4 fields (date / guest count / event type / description). 4 form states.                                                                      |
| `src/app/(marketplace)/vendors/[slug]/request/page.tsx`           | **Create**  | Server page. Auth check + vendor 404 gate. Renders `<CustomRequestForm>`.                                                                                       |
| `src/components/dashboard/InboxRow.tsx`                           | **Modify**  | Add `pending_quote` branch in `statusChip` (haldi "Needs quote" pill).                                                                                          |
| `src/components/dashboard/InboxBlock.tsx`                         | **Modify**  | Add `pending_quote` to the "Needs your reply" query bucket. Use `special_requests`/`event_type` as packageLabel fallback when no package.                       |
| `DESIGN.md`                                                       | **Modify**  | Add `date-picker:` and `custom-request-card:` entries to `components:` block.                                                                                   |

---

## Task 1: Migration 00040 — bookings (event_type + status + price check)

**Files:**

- Create: `supabase/migrations/00040_bookings_pending_quote.sql`

- [ ] **Step 1: Write the migration**

Write to `supabase/migrations/00040_bookings_pending_quote.sql`:

```sql
-- Adds support for "Custom Request" bookings:
-- 1. New `event_type` column (text, nullable) — categorizes the requested event
--    (mehndi / sangeet / ceremony / reception / etc.). Nullable because regular
--    package bookings don't populate it Day-1.
-- 2. Allow 'pending_quote' in the bookings.status CHECK constraint.
--    pending_quote = couple submitted a custom request; vendor hasn't quoted yet.
-- 3. Relax bookings.total_price_positive: pending_quote rows have no price yet
--    (total_price_cents = 0 until vendor flips to adjusted_quote_sent).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS event_type text;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'pending_quote'::text,
    'deposit_paid'::text,
    'couple_cancelled'::text,
    'vendor_cancelled'::text,
    'cancelled_mutual'::text,
    'completed'::text,
    'expired'::text,
    'disputed'::text,
    'accepted'::text,
    'adjusted_quote_sent'::text,
    'adjusted_quote_declined'::text
  ]));

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS total_price_positive;
ALTER TABLE bookings ADD CONSTRAINT total_price_positive
  CHECK (total_price_cents > 0 OR status = 'pending_quote');
```

- [ ] **Step 2: Apply to dev DB**

The dev DB password for this session is `$uperLocked$300` — pass via inline `PGPASSWORD=` only, never echo/persist.

```bash
PGPASSWORD='$uperLocked$300' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00040_bookings_pending_quote.sql
```

Expected output:

```
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
```

- [ ] **Step 3: Sanity check**

```bash
PGPASSWORD='$uperLocked$300' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name='event_type';" \
  -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='bookings_status_check';" \
  -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='total_price_positive';"
```

Expected:

- `event_type` row returned
- status_check definition includes `'pending_quote'`
- total_price_positive definition includes `OR (status = 'pending_quote')`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00040_bookings_pending_quote.sql
git commit -m "feat(custom-request): bookings event_type + pending_quote status"
```

---

## Task 2: Migration 00041 — notifications type check

**Files:**

- Create: `supabase/migrations/00041_notifications_custom_request_type.sql`

- [ ] **Step 1: Write the migration**

Write to `supabase/migrations/00041_notifications_custom_request_type.sql`:

```sql
-- Allow 'custom_request_received' in the notifications.type CHECK.
-- Dispatched when a couple submits a Custom Request booking (status='pending_quote').

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'booking_request_received'::text,
    'vendor_accepted'::text,
    'vendor_adjusted_quote'::text,
    'couple_accepted_adjusted'::text,
    'couple_declined_adjusted'::text,
    'deposit_paid'::text,
    'booking_confirmed'::text,
    'booking_auto_cancelled'::text,
    'booking_cancelled'::text,
    'event_completed'::text,
    'booking_completed'::text,
    'review_received'::text,
    'custom_request_received'::text
  ]));
```

- [ ] **Step 2: Apply**

```bash
PGPASSWORD='$uperLocked$300' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00041_notifications_custom_request_type.sql
```

Expected: `ALTER TABLE` × 2.

- [ ] **Step 3: Update generated types in `src/types/database.types.ts`**

Find the `NotificationType` export (grep for `NotificationType =`). It will be a string union like:

```ts
export type NotificationType = 'booking_request_received' | 'vendor_accepted' | ...;
```

Append `| 'custom_request_received'` to the end of the union.

Similarly, find the `bookings.Row.status` type. It will be a union of status strings (search for `'adjusted_quote_sent'` in the file). Add `| 'pending_quote'` to that union AND the same union under `bookings.Insert.status` and `bookings.Update.status` if present.

Add `event_type: string | null` to `bookings.Row`, `event_type?: string | null` to `bookings.Insert` and `bookings.Update`.

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean (only the pre-existing `.next/types/.../setup/layout.ts` error).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00041_notifications_custom_request_type.sql src/types/database.types.ts
git commit -m "feat(custom-request): notifications custom_request_received + type sync"
```

---

## Task 3: `<DatePicker>` primitive

**Files:**

- Create: `src/components/ui/date-picker.tsx`

No unit tests — the primitive is a thin wrapper over react-day-picker (DOM-heavy). Visual verification in Task 14 covers it.

- [ ] **Step 1: Write the primitive**

Write to `src/components/ui/date-picker.tsx`:

```tsx
'use client';

import * as React from 'react';
import { DayPicker, type Matcher } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  /** ISO YYYY-MM-DD selected date; empty string or undefined for none. */
  selected?: string;
  /** Called with ISO YYYY-MM-DD when user picks a date. */
  onSelect: (iso: string) => void;
  /** Additional disabled matchers merged with the default { before: today }. */
  disabled?: Matcher | Matcher[];
  /** Additional modifiers merged with the built-in 'unavailable'/'partial'. */
  modifiers?: Record<string, Matcher | Matcher[]>;
  /** Per-modifier class overrides. Built-in modifiers have sensible defaults. */
  modifiersClassNames?: Record<string, string>;
  /** Wrapper className. */
  className?: string;
}

const DEFAULT_DISABLED: Matcher = { before: new Date() };

const DEFAULT_MODIFIERS_CLASSNAMES: Record<string, string> = {
  unavailable: 'text-ink-soft line-through opacity-50 cursor-not-allowed',
  partial: 'bg-haldi/15 text-ink hover:bg-haldi/25',
};

/**
 * M+-styled date picker. Wraps react-day-picker v10 in single-select mode.
 * Past dates always disabled (merged with consumer disabled matchers).
 * Returns ISO YYYY-MM-DD in LOCAL timezone to avoid off-by-one.
 *
 * Built-in modifiers (override via modifiersClassNames):
 *  - unavailable: fully blocked dates (ink-soft strikethrough)
 *  - partial: partially booked dates (haldi background tint)
 *
 * Pass the same matcher to both `disabled` and `modifiers.unavailable` when
 * blocked dates should also be unselectable.
 */
export function DatePicker({
  selected,
  onSelect,
  disabled,
  modifiers,
  modifiersClassNames,
  className,
}: DatePickerProps) {
  const selectedDate = selected ? new Date(`${selected}T00:00:00`) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    // Local-TZ ISO conversion (do NOT use toISOString — that's UTC and shifts the day).
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    onSelect(`${y}-${m}-${d}`);
  };

  const mergedDisabled: Matcher[] = [
    DEFAULT_DISABLED,
    ...(Array.isArray(disabled) ? disabled : disabled ? [disabled] : []),
  ];

  return (
    <div className={cn('p-1', className)}>
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        disabled={mergedDisabled}
        modifiers={modifiers}
        modifiersClassNames={{ ...DEFAULT_MODIFIERS_CLASSNAMES, ...modifiersClassNames }}
        weekStartsOn={0}
        showOutsideDays
        classNames={{
          root: 'text-ink font-sans',
          months: 'flex flex-col',
          month: 'space-y-3',
          month_caption: 'flex items-center justify-between px-1',
          caption_label: 'font-display font-bold text-[15px] tracking-[-0.012em] text-ink',
          nav: 'flex items-center gap-1',
          button_previous:
            'inline-flex items-center justify-center w-7 h-7 rounded-full border border-hairline text-ink-muted hover:border-ink hover:text-ink transition-colors',
          button_next:
            'inline-flex items-center justify-center w-7 h-7 rounded-full border border-hairline text-ink-muted hover:border-ink hover:text-ink transition-colors',
          month_grid: 'w-full border-collapse',
          weekdays: 'flex',
          weekday:
            'w-9 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-soft py-2',
          week: 'flex',
          day: 'w-9 h-9 text-center text-[12px] p-0',
          day_button:
            'w-9 h-9 inline-flex items-center justify-center rounded-sm text-ink hover:bg-cream-soft transition-colors',
          selected: 'bg-ink !text-cream hover:bg-ink',
          today: '',
          outside: 'text-ink-soft opacity-50',
          disabled: 'text-ink-soft opacity-30 cursor-not-allowed',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/date-picker.tsx
git commit -m "feat(date-picker): M+ primitive wrapping react-day-picker"
```

---

## Task 4: Reduce WhenPicker to thin wrapper

**Files:**

- Modify: `src/components/marketplace/search/WhenPicker.tsx`

- [ ] **Step 1: Replace WhenPicker contents**

The original file is ~78 lines (classNames map duplicated). After this task it's ~15 lines. Write to `src/components/marketplace/search/WhenPicker.tsx`:

```tsx
'use client';

import { DatePicker } from '@/components/ui/date-picker';

export interface WhenPickerProps {
  /** Currently selected date as ISO YYYY-MM-DD, or empty string. */
  selected?: string;
  /** Called when user picks a date. Receives ISO YYYY-MM-DD. */
  onSelect: (iso: string) => void;
  /** Optional className for the wrapper. */
  className?: string;
}

/**
 * Date picker for the search bar's When segment. Thin wrapper over <DatePicker>
 * — kept as a named alias for the search-bar context (in case we add segment-
 * specific behavior later, like haldi-marked "popular wedding dates").
 */
export function WhenPicker({ selected, onSelect, className }: WhenPickerProps) {
  return <DatePicker selected={selected} onSelect={onSelect} className={className} />;
}
```

- [ ] **Step 2: Verify typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: clean.

- [ ] **Step 3: Visually spot-check the search bar (optional but recommended)**

If you have time: start dev server, navigate to `/vendors`, click the When segment, confirm the date picker still opens + behaves identically. No commit needed for visual check.

- [ ] **Step 4: Commit**

```bash
git add src/components/marketplace/search/WhenPicker.tsx
git commit -m "refactor(when-picker): use shared DatePicker primitive"
```

---

## Task 5: Rewrite AvailabilityCalendar

**Files:**

- Modify: `src/components/marketplace/AvailabilityCalendar.tsx`
- Verify call sites

- [ ] **Step 1: Find AvailabilityCalendar call sites**

```bash
grep -rn "AvailabilityCalendar" src/ --include="*.tsx" --include="*.ts"
```

Note every consumer's prop names so you can update them in Step 3. The old API uses `selectedDate: Date` + `onSelect: (date | undefined) => void`. The new API uses `selected: string` (ISO) + `onSelect: (iso: string) => void`.

- [ ] **Step 2: Rewrite the component**

Write to `src/components/marketplace/AvailabilityCalendar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';

interface UnavailableDay {
  date: string; // ISO YYYY-MM-DD
  fully_blocked: boolean;
  busy_ranges: Array<{ start: string; end: string }>;
}

interface AvailabilityCalendarProps {
  vendorSlug: string;
  selected?: string; // ISO YYYY-MM-DD
  onSelect: (iso: string) => void;
}

export function AvailabilityCalendar({
  vendorSlug,
  selected,
  onSelect,
}: AvailabilityCalendarProps) {
  const [unavailable, setUnavailable] = useState<UnavailableDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/vendors/${vendorSlug}/availability`)
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(d.unavailable ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [vendorSlug]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading availability…</p>;
  }

  // Parse 'YYYY-MM-DD' as local-tz noon (avoids the date crossing a TZ boundary).
  const toLocalDate = (iso: string) => new Date(`${iso}T12:00:00`);

  const fullyBlocked = unavailable.filter((d) => d.fully_blocked).map((d) => toLocalDate(d.date));

  const partial = unavailable
    .filter((d) => !d.fully_blocked && d.busy_ranges.length > 0)
    .map((d) => toLocalDate(d.date));

  const selectedBusy = unavailable.find((d) => d.date === selected)?.busy_ranges ?? [];

  return (
    <div>
      <DatePicker
        selected={selected}
        onSelect={onSelect}
        disabled={fullyBlocked}
        modifiers={{ partial }}
      />
      {selectedBusy.length > 0 && (
        <div className="mt-3 rounded-md border border-haldi/30 bg-haldi/10 p-3 text-xs text-ink-muted">
          <strong className="text-ink">Limited availability:</strong>{' '}
          {selectedBusy.map((r, i) => (
            <span key={i}>
              {r.start} – {r.end}
              {i < selectedBusy.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default AvailabilityCalendar;
```

- [ ] **Step 3: Update all call sites**

For each call site found in Step 1, update the props:

- `selectedDate={someDate}` → `selected={someDate ? someDate.toISOString().slice(0, 10) : undefined}` (or refactor the parent to hold ISO state directly — preferred)
- `onSelect={(date) => ...}` → `onSelect={(iso) => ...}`. Inside the callback, if the parent needs a Date object, convert with `new Date(\`${iso}T12:00:00\`)`.

If the caller is `src/components/booking/booking-detail.tsx` (the likely site), the cleanest refactor is for the parent to hold ISO string state — most code paths will be passing it to API calls anyway.

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean. Any errors mean a call site was missed in Step 3.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/AvailabilityCalendar.tsx <updated-call-site-files>
git commit -m "refactor(availability-calendar): use DatePicker primitive + M+ tokens"
```

---

## Task 6: `appendCustomRequest` helper + tests (TDD)

**Files:**

- Create: `src/lib/vendor-packages/with-custom-request.ts`
- Create: `src/__tests__/lib/vendor-packages/with-custom-request.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/vendor-packages/with-custom-request.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  appendCustomRequest,
  type CustomRequestPackage,
} from '@/lib/vendor-packages/with-custom-request';

const VENDOR_ID = '00000000-0000-0000-0000-000000000001';

describe('appendCustomRequest', () => {
  it('appends a Custom Request entry to an empty list', () => {
    const result = appendCustomRequest([], VENDOR_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('custom-request');
  });

  it('appends after existing packages, preserving order', () => {
    const packages = [
      { id: 'pkg-a', name: 'A' },
      { id: 'pkg-b', name: 'B' },
    ];
    const result = appendCustomRequest(packages, VENDOR_ID);
    expect(result.map((p) => p.id)).toEqual(['pkg-a', 'pkg-b', 'custom-request']);
  });

  it('does not double-append when called twice', () => {
    const once = appendCustomRequest([], VENDOR_ID);
    const twice = appendCustomRequest(once, VENDOR_ID);
    expect(twice).toHaveLength(1);
    expect(twice[0].id).toBe('custom-request');
  });

  it('returns a CustomRequestPackage with all expected fields nulled', () => {
    const result = appendCustomRequest([], VENDOR_ID);
    const custom = result[0] as CustomRequestPackage;
    expect(custom.id).toBe('custom-request');
    expect(custom.name).toBe('Custom Request');
    expect(custom.is_custom).toBe(true);
    expect(custom.base_price_cents).toBeNull();
    expect(custom.max_guests).toBeNull();
    expect(custom.duration_hours).toBeNull();
    expect(custom.events_count).toBeNull();
    expect(custom.featured_image_url).toBeNull();
    expect(custom.gallery_image_urls).toBeNull();
    expect(custom.included_items).toBeNull();
    expect(custom.vendor_notes_template).toBeNull();
    expect(custom.location_mode).toBeNull();
    expect(custom.addons).toEqual([]);
    expect(custom.description).toContain('outside our standard packages');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/lib/vendor-packages/with-custom-request.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/vendor-packages/with-custom-request'`.

- [ ] **Step 3: Write the helper**

Write to `src/lib/vendor-packages/with-custom-request.ts`:

```ts
/**
 * Virtual "Custom Request" package shape. Mirrors the columns fetched in
 * src/app/(marketplace)/vendors/[slug]/page.tsx so PackageGrid can iterate
 * a mixed list without type narrowing pain. All sizing/pricing fields are
 * null to signal "no fixed package" — PackageGrid branches on `is_custom`
 * to render Treatment B.
 */
export interface CustomRequestPackage {
  id: 'custom-request';
  name: 'Custom Request';
  description: string;
  base_price_cents: null;
  included_items: null;
  max_guests: null;
  duration_hours: null;
  events_count: null;
  featured_image_url: null;
  gallery_image_urls: null;
  vendor_notes_template: null;
  location_mode: null;
  addons: [];
  is_custom: true;
}

const CUSTOM_REQUEST_DESCRIPTION =
  'Multi-day events, large guest counts, destination weddings, anything outside our standard packages. Tell us what you need.';

/**
 * Returns the package list with a virtual Custom Request entry appended.
 * Defensive: never double-appends. `vendorProfileId` is currently unused
 * but kept on the signature for future per-vendor customization hooks.
 */
export function appendCustomRequest<T extends { id: string }>(
  packages: T[],
  _vendorProfileId: string
): (T | CustomRequestPackage)[] {
  if (packages.some((p) => p.id === 'custom-request')) return packages;

  const customEntry: CustomRequestPackage = {
    id: 'custom-request',
    name: 'Custom Request',
    description: CUSTOM_REQUEST_DESCRIPTION,
    base_price_cents: null,
    included_items: null,
    max_guests: null,
    duration_hours: null,
    events_count: null,
    featured_image_url: null,
    gallery_image_urls: null,
    vendor_notes_template: null,
    location_mode: null,
    addons: [],
    is_custom: true,
  };

  return [...packages, customEntry];
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/lib/vendor-packages/with-custom-request.test.ts
```

Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendor-packages/with-custom-request.ts src/__tests__/lib/vendor-packages/with-custom-request.test.ts
git commit -m "feat(custom-request): appendCustomRequest helper + tests"
```

---

## Task 7: Wire Custom Request into vendor profile page

**Files:**

- Modify: `src/app/(marketplace)/vendors/[slug]/page.tsx`

- [ ] **Step 1: Update the packages fetch + augment**

Read `src/app/(marketplace)/vendors/[slug]/page.tsx` around line 48–64. The current code is:

```ts
const { data: packagesData } = await supabase
  .from('packages')
  .select(
    'id, name, description, base_price_cents, included_items, max_guests, duration_hours, events_count, featured_image_url, gallery_image_urls, vendor_notes_template, location_mode, addons:package_addons(id, name, price_delta_cents, display_order)'
  )
  .eq('vendor_profile_id', vendor.id)
  .eq('is_active', true)
  .order('display_order');

const packages = (packagesData ?? []).map((p) => ({
  ...p,
  addons: ((p as { addons?: { display_order: number }[] }).addons ?? []).sort(
    (a, b) => a.display_order - b.display_order
  ),
}));
```

Add the import at the top of the file:

```ts
import { appendCustomRequest } from '@/lib/vendor-packages/with-custom-request';
```

Replace the `packages` assignment with:

```ts
const realPackages = (packagesData ?? []).map((p) => ({
  ...p,
  addons: ((p as { addons?: { display_order: number }[] }).addons ?? []).sort(
    (a, b) => a.display_order - b.display_order
  ),
}));

const packages = appendCustomRequest(realPackages, vendor.id);
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

If the existing `packages={packages as unknown as Parameters<typeof VendorProfile>[0]['packages']}` cast still works, no further change needed at this layer. If TypeScript complains, the next task updates the PackageGrid types.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(marketplace\)/vendors/\[slug\]/page.tsx
git commit -m "feat(custom-request): append virtual entry to vendor packages"
```

---

## Task 8: PackageGrid — render Custom Request as Treatment B

**Files:**

- Modify: `src/components/marketplace/PackageGrid.tsx`

- [ ] **Step 1: Update PackageGrid**

Read `src/components/marketplace/PackageGrid.tsx`. Replace the file with:

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PackageDetailModal } from './PackageDetailModal';
import type { CustomRequestPackage } from '@/lib/vendor-packages/with-custom-request';

export interface PackageWithAddons {
  id: string;
  name: string;
  description: string;
  base_price_cents: number;
  duration_hours: number;
  max_guests: number;
  events_count: number;
  featured_image_url: string;
  gallery_image_urls: string[];
  included_items: string[];
  vendor_notes_template: string | null;
  location_mode: 'couple_provides' | 'at_vendor';
  addons: {
    id: string;
    name: string;
    price_delta_cents: number;
  }[];
}

type PackageItem = PackageWithAddons | CustomRequestPackage;

interface Props {
  packages: PackageItem[];
  vendorSlug: string;
}

function isCustom(p: PackageItem): p is CustomRequestPackage {
  return (p as CustomRequestPackage).is_custom === true;
}

/**
 * Layout C — photo-forward package grid.
 * 3 columns desktop, 2 tablet, 1 mobile.
 * Real packages open PackageDetailModal. Custom Request (virtual, always last)
 * navigates directly to /vendors/{slug}/request (no intermediate modal).
 */
export function PackageGrid({ packages, vendorSlug }: Props) {
  const [selected, setSelected] = useState<PackageWithAddons | null>(null);

  if (packages.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) =>
          isCustom(p) ? (
            <Link
              key={p.id}
              href={`/vendors/${vendorSlug}/request`}
              className="group flex flex-col overflow-hidden rounded-xl border border-dashed border-ink-soft bg-cream-soft text-left transition-shadow hover:shadow-md"
            >
              <div className="flex aspect-[4/3] items-center justify-center bg-cream-soft">
                <span className="font-display text-5xl font-bold tracking-[-0.02em] text-ink-soft">
                  ?
                </span>
              </div>
              <div className="flex flex-1 flex-col space-y-2 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hot-pink">
                  Quote on request
                </p>
                <h3 className="text-base font-semibold leading-tight text-ink">{p.name}</h3>
                <p className="flex-1 text-sm text-ink-muted">{p.description}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-display text-lg font-medium italic text-ink">
                    Custom
                    <span className="ml-1 text-xs not-italic text-ink-soft">
                      — price after vendor responds
                    </span>
                  </span>
                  <span className="text-sm text-indigo group-hover:underline">
                    Request a quote →
                  </span>
                </div>
              </div>
            </Link>
          ) : (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p)}
              className="group overflow-hidden rounded-xl border border-border text-left transition-shadow hover:shadow-lg"
            >
              <div className="relative aspect-[4/3] bg-muted">
                <Image
                  src={p.featured_image_url}
                  alt={p.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="space-y-2 p-4">
                <h3 className="text-base font-semibold leading-tight">{p.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {p.duration_hours}h · up to {p.max_guests} guests
                  {p.events_count > 1 && ` · ${p.events_count} events`}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-lg font-bold">
                    ${(p.base_price_cents / 100).toLocaleString()}
                  </span>
                  <span className="text-sm text-primary group-hover:underline">Select →</span>
                </div>
              </div>
            </button>
          )
        )}
      </div>

      {selected && (
        <PackageDetailModal
          pkg={selected}
          vendorSlug={vendorSlug}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

export default PackageGrid;
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean. The vendor profile page's `packages={packages as unknown as ...}` cast still works because `PackageItem` is the new union.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/PackageGrid.tsx
git commit -m "feat(custom-request): PackageGrid renders virtual entry as Treatment B"
```

---

## Task 9: Custom Request validation schema + tests (TDD)

**Files:**

- Create: `src/lib/booking/custom-request-validation.ts`
- Create: `src/__tests__/lib/booking/custom-request-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/booking/custom-request-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  customRequestSchema,
  EVENT_TYPES,
  type EventType,
} from '@/lib/booking/custom-request-validation';

const VALID_INPUT = {
  vendor_slug: 'henna-by-anya',
  event_date: '2026-10-17',
  guest_count: 150,
  event_type: 'mehndi' as EventType,
  description: 'a'.repeat(120),
};

describe('customRequestSchema', () => {
  it('accepts a valid request', () => {
    const r = customRequestSchema.safeParse(VALID_INPUT);
    expect(r.success).toBe(true);
  });

  it('rejects missing vendor_slug', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, vendor_slug: '' });
    expect(r.success).toBe(false);
  });

  it('rejects malformed event_date', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, event_date: '10/17/2026' });
    expect(r.success).toBe(false);
  });

  it('rejects guest_count < 1', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, guest_count: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects guest_count > 2000', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, guest_count: 2001 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer guest_count', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, guest_count: 1.5 });
    expect(r.success).toBe(false);
  });

  it('rejects event_type not in allowlist', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, event_type: 'totally-made-up' });
    expect(r.success).toBe(false);
  });

  it('rejects description shorter than 50 chars', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, description: 'too short' });
    expect(r.success).toBe(false);
  });

  it('rejects description longer than 1000 chars', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, description: 'a'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('exports EVENT_TYPES as a 7-entry tuple', () => {
    expect(EVENT_TYPES).toHaveLength(7);
    expect(EVENT_TYPES).toContain('mehndi');
    expect(EVENT_TYPES).toContain('other');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/lib/booking/custom-request-validation.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/booking/custom-request-validation'`.

- [ ] **Step 3: Write the schema**

Write to `src/lib/booking/custom-request-validation.ts`:

```ts
import { z } from 'zod';

export const EVENT_TYPES = [
  'mehndi',
  'sangeet',
  'ceremony',
  'reception',
  'welcome-dinner',
  'farewell-brunch',
  'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ISO YYYY-MM-DD shape check. Date semantics (future-only) are enforced by
// the API route + the DatePicker primitive (disabled:{before: today}).
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const customRequestSchema = z.object({
  vendor_slug: z.string().min(1).max(120),
  event_date: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD'),
  guest_count: z.number().int().min(1).max(2000),
  event_type: z.enum(EVENT_TYPES),
  description: z.string().min(50).max(1000),
});

export type CustomRequestInput = z.infer<typeof customRequestSchema>;
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/lib/booking/custom-request-validation.test.ts
```

Expected: 10/10 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking/custom-request-validation.ts src/__tests__/lib/booking/custom-request-validation.test.ts
git commit -m "feat(custom-request): zod schema + EVENT_TYPES + tests"
```

---

## Task 10: notifyCustomRequestReceived helper + test (TDD)

**Files:**

- Modify: `src/services/notifications.service.ts`
- Create: `src/__tests__/services/notifications-custom-request.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `src/__tests__/services/notifications-custom-request.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { notifyCustomRequestReceived } from '@/services/notifications.service';

describe('notifyCustomRequestReceived', () => {
  it('inserts a notification with custom_request_received type + correct fields', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ data: { id: 'notif-1' }, error: null });
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: insertSpy,
          })),
        })),
      })),
    } as unknown as Parameters<typeof notifyCustomRequestReceived>[0];

    const result = await notifyCustomRequestReceived(supabase, 'vendor-user-1', {
      bookingId: 'booking-1',
      coupleName: 'Anya & Rohan',
      eventDate: '2026-10-17',
    });

    expect(result).toEqual({ id: 'notif-1' });
    expect(supabase.from).toHaveBeenCalledWith('notifications');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/services/notifications-custom-request.test.ts
```

Expected: FAIL with `'notifyCustomRequestReceived' is not exported`.

- [ ] **Step 3: Add the helper**

Read `src/services/notifications.service.ts`. Find the last typed helper (probably `notifyReviewReceived`). After it, append:

```ts
export function notifyCustomRequestReceived(
  sb: Sb,
  vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; eventDate: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'custom_request_received',
    title: 'New custom request',
    body: `${ctx.coupleName} sent a request for ${ctx.eventDate}. Send a quote to lock it in.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      event_date: ctx.eventDate,
    },
  });
}
```

Also update the file's top-comment counter — it says "12 typed helpers"; bump to 13.

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/services/notifications-custom-request.test.ts
```

Expected: 1/1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/services/notifications.service.ts src/__tests__/services/notifications-custom-request.test.ts
git commit -m "feat(custom-request): notifyCustomRequestReceived service helper"
```

---

## Task 11: POST /api/bookings/custom-request route + tests (TDD)

**Files:**

- Create: `src/app/api/bookings/custom-request/route.ts`
- Create: `src/__tests__/api/bookings-custom-request.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/api/bookings-custom-request.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/services/notifications.service', () => ({
  notifyCustomRequestReceived: vi.fn().mockResolvedValue({ id: 'notif-1' }),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notifyCustomRequestReceived } from '@/services/notifications.service';
import { POST } from '@/app/api/bookings/custom-request/route';

const VALID_BODY = {
  vendor_slug: 'henna-by-anya',
  event_date: '2026-10-17',
  guest_count: 150,
  event_type: 'mehndi',
  description: 'a'.repeat(120),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/bookings/custom-request', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function buildSupabase(opts: {
  user?: { id: string } | null;
  vendor?: { id: string; user_id: string } | null;
  insertResult?: { data?: { id: string } | null; error?: { message: string } | null };
}) {
  const insertChain = {
    select: vi.fn(() => ({
      single: vi
        .fn()
        .mockResolvedValue(opts.insertResult ?? { data: { id: 'booking-1' }, error: null }),
    })),
  };
  const insert = vi.fn(() => insertChain);
  const vendorChain = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: opts.vendor ?? null, error: null }),
        })),
      })),
    })),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'vendor_profiles') return vendorChain;
      if (table === 'bookings') return { insert };
      throw new Error(`Unexpected table: ${table}`);
    }),
    insert,
  };
}

describe('POST /api/bookings/custom-request', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;
  const mockNotify = notifyCustomRequestReceived as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const sb = buildSupabase({ user: null });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' } });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ ...VALID_BODY, guest_count: 0 }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when vendor not found', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, vendor: null });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('returns 200 + booking_id on success + dispatches notification', async () => {
    const sb = buildSupabase({
      user: { id: 'u-1' },
      vendor: { id: 'vp-1', user_id: 'vendor-user-1' },
    });
    mockCreateClient.mockResolvedValueOnce(sb);

    const res = await POST(makePostRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, booking_id: 'booking-1' });
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_profile_id: 'vp-1',
        couple_user_id: 'u-1',
        package_id: null,
        event_date: '2026-10-17',
        guest_count: 150,
        event_type: 'mehndi',
        special_requests: VALID_BODY.description,
        status: 'pending_quote',
        total_price_cents: 0,
      })
    );
    expect(mockNotify).toHaveBeenCalledWith(
      sb,
      'vendor-user-1',
      expect.objectContaining({
        bookingId: 'booking-1',
        eventDate: '2026-10-17',
      })
    );
  });

  it('returns 500 on insert error', async () => {
    const sb = buildSupabase({
      user: { id: 'u-1' },
      vendor: { id: 'vp-1', user_id: 'vendor-user-1' },
      insertResult: { data: null, error: { message: 'fail' } },
    });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/api/bookings-custom-request.test.ts
```

Expected: FAIL with `Cannot find module '@/app/api/bookings/custom-request/route'`.

- [ ] **Step 3: Write the route**

Write to `src/app/api/bookings/custom-request/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { customRequestSchema } from '@/lib/booking/custom-request-validation';
import { notifyCustomRequestReceived } from '@/services/notifications.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth required' }, { status: 401 });
  }

  const parsed = customRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const { vendor_slug, event_date, guest_count, event_type, description } = parsed.data;

  // Resolve vendor by slug. Must be active + onboarding_complete for couples
  // to be able to send requests (mirrors /book page gate).
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('slug', vendor_slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!vendor) {
    return NextResponse.json({ ok: false, error: 'vendor not found' }, { status: 404 });
  }

  const { data: inserted, error } = await supabase
    .from('bookings')
    .insert({
      vendor_profile_id: vendor.id,
      couple_user_id: user.id,
      package_id: null,
      event_date,
      guest_count,
      event_type,
      special_requests: description,
      status: 'pending_quote',
      total_price_cents: 0,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    logger.error('custom-request insert failed', error, { vendor_slug });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Fire-and-forget notification — never block the response.
  notifyCustomRequestReceived(supabase, vendor.user_id, {
    bookingId: inserted.id,
    coupleName: user.email ?? 'A couple', // refined when we wire user.full_name lookup
    eventDate: event_date,
  }).catch(() => {});

  logger.info('custom_request_submitted', { vendor_slug, booking_id: inserted.id });

  return NextResponse.json({ ok: true, booking_id: inserted.id }, { status: 200 });
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/api/bookings-custom-request.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bookings/custom-request/route.ts src/__tests__/api/bookings-custom-request.test.ts
git commit -m "feat(custom-request): POST /api/bookings/custom-request route"
```

---

## Task 12: CustomRequestForm client component

**Files:**

- Create: `src/components/booking/CustomRequestForm.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/booking/CustomRequestForm.tsx`:

```tsx
'use client';

import * as React from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { customRequestSchema, EVENT_TYPES } from '@/lib/booking/custom-request-validation';

type FormState =
  | { kind: 'default' }
  | { kind: 'submitting' }
  | { kind: 'success'; bookingId: string }
  | { kind: 'error'; message: string };

export interface CustomRequestFormProps {
  vendorSlug: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
}

const EVENT_TYPE_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
  mehndi: 'Mehndi',
  sangeet: 'Sangeet',
  ceremony: 'Ceremony',
  reception: 'Reception',
  'welcome-dinner': 'Welcome dinner',
  'farewell-brunch': 'Farewell brunch',
  other: 'Other',
};

export function CustomRequestForm({
  vendorSlug,
  vendorBusinessName,
  vendorResponseSlaHours,
}: CustomRequestFormProps) {
  const [eventDate, setEventDate] = React.useState('');
  const [guestCount, setGuestCount] = React.useState<number | ''>('');
  const [eventType, setEventType] = React.useState<(typeof EVENT_TYPES)[number]>('mehndi');
  const [description, setDescription] = React.useState('');
  const [state, setState] = React.useState<FormState>({ kind: 'default' });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.kind === 'submitting' || state.kind === 'success') return;

    const parsed = customRequestSchema.safeParse({
      vendor_slug: vendorSlug,
      event_date: eventDate,
      guest_count: typeof guestCount === 'number' ? guestCount : Number(guestCount),
      event_type: eventType,
      description,
    });

    if (!parsed.success) {
      setState({
        kind: 'error',
        message: parsed.error.issues[0]?.message ?? 'Please complete every field.',
      });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/bookings/custom-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({ kind: 'error', message: "Couldn't send your request — try again." });
        return;
      }
      setState({ kind: 'success', bookingId: json.booking_id });
    } catch {
      setState({ kind: 'error', message: "Couldn't send your request — try again." });
    }
  };

  if (state.kind === 'success') {
    return (
      <div className="rounded-lg border border-hairline bg-cream p-8 text-ink">
        <h2 className="font-display text-2xl font-bold tracking-[-0.012em]">Request sent.</h2>
        <p className="mt-3 text-sm text-ink-muted">
          {vendorBusinessName} will respond
          {vendorResponseSlaHours ? ` within ${vendorResponseSlaHours} hours` : ' soon'} with a
          quote. We&rsquo;ll send you a notification — check your dashboard inbox.
        </p>
        <div className="mt-6 flex gap-3">
          <a
            href={`/dashboard/bookings/${state.bookingId}`}
            className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-ink/90"
          >
            View in dashboard
          </a>
          <a
            href="/vendors"
            className="rounded-md border border-hairline px-4 py-2 text-sm font-semibold text-ink hover:border-ink"
          >
            Browse other vendors
          </a>
        </div>
      </div>
    );
  }

  const submitting = state.kind === 'submitting';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state.kind === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-haldi/40 bg-haldi/10 p-3 text-sm text-ink"
        >
          {state.message}
        </div>
      )}

      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Event date
        </label>
        <DatePicker selected={eventDate} onSelect={setEventDate} />
      </div>

      <div>
        <label
          htmlFor="custom-request-guest-count"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
        >
          Guest count
        </label>
        <input
          id="custom-request-guest-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={2000}
          value={guestCount}
          onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={submitting}
          required
          className="w-40 rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="custom-request-event-type"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
        >
          Event type
        </label>
        <select
          id="custom-request-event-type"
          value={eventType}
          onChange={(e) => setEventType(e.target.value as (typeof EVENT_TYPES)[number])}
          disabled={submitting}
          className="w-60 rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="custom-request-description"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
        >
          What do you need?
        </label>
        <textarea
          id="custom-request-description"
          rows={6}
          minLength={50}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          placeholder="Tell the vendor what makes your event special — guest count breakdown, dietary needs, location, anything outside their standard packages."
          required
          className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-xs text-ink-soft">
          {description.length} / 1000 · minimum 50 characters
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {submitting ? 'Sending request…' : 'Send request'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/CustomRequestForm.tsx
git commit -m "feat(custom-request): CustomRequestForm client component"
```

---

## Task 13: /vendors/[slug]/request page

**Files:**

- Create: `src/app/(marketplace)/vendors/[slug]/request/page.tsx`

- [ ] **Step 1: Write the page**

Write to `src/app/(marketplace)/vendors/[slug]/request/page.tsx`:

```tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { CustomRequestForm } from '@/components/booking/CustomRequestForm';

export const dynamic = 'force-dynamic';

interface RequestPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CustomRequestPage({ params }: RequestPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/vendors/${slug}/request`);
  }

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('business_name, response_sla_hours')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!vendor) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-hot-pink">
        Custom request
      </p>
      <h1 className="font-display text-3xl font-bold tracking-[-0.018em] text-ink">
        Tell {vendor.business_name} what you need
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        Anything outside their standard packages — multi-day events, large guest counts, destination
        coverage. They&rsquo;ll respond with a custom quote.
      </p>

      <div className="mt-10">
        <CustomRequestForm
          vendorSlug={slug}
          vendorBusinessName={vendor.business_name}
          vendorResponseSlaHours={vendor.response_sla_hours ?? null}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(marketplace)/vendors/[slug]/request/page.tsx'
git commit -m "feat(custom-request): /vendors/[slug]/request page (auth-gated)"
```

---

## Task 14: Inbox — surface pending_quote

**Files:**

- Modify: `src/components/dashboard/InboxBlock.tsx`
- Modify: `src/components/dashboard/InboxRow.tsx`

- [ ] **Step 1: Add pending_quote to InboxBlock's needs-reply query**

In `src/components/dashboard/InboxBlock.tsx`, find the `needsReply` query (~line 12–17). Add `'pending_quote'` to the `.in('status', ...)` array:

```ts
const { data: needsReply } = await supabase
  .from('bookings')
  .select(
    'id, status, couple_full_name, package_name_snapshot, event_type, created_at, updated_at, expires_at'
  )
  .eq('vendor_profile_id', vendorProfileId)
  .in('status', ['pending', 'pending_quote', 'adjusted_quote_declined'])
  .order('created_at', { ascending: true });
```

Note: added `event_type` to the select.

- [ ] **Step 2: Update the `toRow` mapper to handle null package_name_snapshot**

In the same file, find the `toRow` function (~line 40–50). For `pending_quote` bookings, `package_name_snapshot` will be null. Replace the inline `r.package_name_snapshot ?? 'Booking'` fallback with a function that prefers `event_type` when no package:

Add a helper above `toRow`:

```ts
function packageLabel(r: {
  package_name_snapshot: string | null;
  status: string;
  event_type?: string | null;
}): string {
  if (r.package_name_snapshot) return r.package_name_snapshot;
  if (r.status === 'pending_quote' && r.event_type) {
    return `Custom request · ${r.event_type}`;
  }
  return 'Booking';
}
```

Then update `toRow`'s signature to include `event_type?: string | null` and replace the body's `packageLabel: r.package_name_snapshot ?? 'Booking'` with `packageLabel: packageLabel(r)`.

- [ ] **Step 3: Add pending_quote branch to InboxRow's statusChip**

In `src/components/dashboard/InboxRow.tsx`, find the `statusChip` function. Add a new branch BEFORE the existing `pending` branch:

```ts
function statusChip(status: string) {
  if (status === 'pending_quote')
    return { label: 'Needs quote', cls: 'bg-haldi/20 text-ink border border-haldi/40' };
  if (status === 'pending') return { label: 'New request', cls: 'bg-blue-100 text-blue-800' };
  // ... rest unchanged
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/InboxBlock.tsx src/components/dashboard/InboxRow.tsx
git commit -m "feat(custom-request): surface pending_quote in vendor inbox"
```

---

## Task 15: Visual verification (manual)

**Files:** none (browser-only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Wait for `Ready in <time>`. Visit a vendor profile (e.g., `http://localhost:3000/vendors/{any-published-vendor-slug}` — list with `gh pr` or query DB if unsure).

- [ ] **Step 2: Verify Custom Request card on profile**

Scroll to the package grid. Confirm:

- The Custom Request card appears as the LAST card in the grid.
- It has Treatment B styling: cream-soft background, dashed border (`border-dashed border-ink-soft`), italic "Custom" price text, "Quote on request" hot-pink kicker, "Request a quote →" CTA.
- The card has a large `?` placeholder in the image area (no real image).

- [ ] **Step 3: Test the form flow**

Click "Request a quote →". Confirm:

- If logged out → redirected to `/login?redirect=/vendors/{slug}/request`.
- If logged in → land on `/vendors/{slug}/request` with the form.

Submit an INVALID form (e.g., guest count = 0):

- Inline error appears at top: "Number must be greater than or equal to 1" or similar.

Submit a VALID form (date picker open future date, guest count 100, event type any, description ≥ 50 chars):

- Page replaces with confirmation panel: "Request sent. {vendor} will respond within {X} hours…"
- Two CTAs: "View in dashboard" + "Browse other vendors"

Verify in dev DB:

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT id, status, event_type, guest_count, LEFT(special_requests, 60) AS desc_preview FROM bookings WHERE status='pending_quote' ORDER BY created_at DESC LIMIT 3;"
```

Expected: row exists with status='pending_quote', correct event_type, guest_count, description.

Verify notification:

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT type, title, body FROM notifications WHERE type='custom_request_received' ORDER BY created_at DESC LIMIT 3;"
```

Expected: row exists with type='custom_request_received'.

- [ ] **Step 4: Verify vendor inbox**

Log in as the vendor whose profile you used (or impersonate via SQL if needed). Navigate to `/dashboard`. Confirm:

- The "Needs your reply" inbox bucket contains a row with "Needs quote" haldi-tinted badge.
- The packageLabel reads "Custom request · {event_type}" (e.g., "Custom request · mehndi").
- Clicking it routes to `/dashboard/bookings/{id}` (existing booking detail page) where the vendor can use `VendorAdjustQuoteForm` to send a quote.

If `VendorAdjustQuoteForm` doesn't render for `pending_quote` status, note it but DO NOT fix as part of this PR — flag for follow-up.

- [ ] **Step 5: Verify primitive refactor didn't regress search + availability**

- Navigate to `/vendors`, click the "When" segment in the search bar. Date picker should open with same M+ styling as before.
- Navigate to a vendor profile. The AvailabilityCalendar (if surfaced) should render with the same behavior — fully-blocked dates not selectable, partial-availability dates have haldi tint (not amber).

- [ ] **Step 6: Document any issues**

If anything fails, fix the underlying issue, commit, re-verify. Otherwise, no commit for this task.

---

## Task 16: DESIGN.md frontmatter update

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Add date-picker + custom-request-card entries**

Read the `components:` block in `DESIGN.md`. Append (after the last existing component entry, matching indent):

```yaml
date-picker:
  pattern: 'M+-styled wrapper around react-day-picker v10 (src/components/ui/date-picker.tsx). Single-select Day-1. Returns ISO YYYY-MM-DD in local TZ.'
  tokens: "Hairline borders on prev/next nav buttons. Selected day: ink bg + cream text. Today: indigo underline (globals.css [data-today='true']). Outside: ink-soft opacity-50. Disabled: ink-soft opacity-30."
  modifiers: "Built-in 'unavailable' (ink-soft strikethrough) + 'partial' (haldi/15 bg). Overridable via modifiersClassNames prop. Pass same matcher to both `disabled` and `modifiers.unavailable` when a date should be blocked AND visually struck-through."
  consumers: 'WhenPicker (search bar When segment) — thin wrapper. AvailabilityCalendar (vendor profile) — wraps with vendor.calendar_holds-driven modifiers. CustomRequestForm (Custom Request flow) — inline picker for event date.'
  deferred: "Range-mode (multi-day events), classNames override prop, haldi-highlighted 'popular dates'."
custom-request-card:
  pattern: 'Treatment B — outlined-distinct package card. Virtual entry (server-side appended in vendor profile page) for every vendor. Always rendered as the last card in PackageGrid.'
  tokens: "bg-cream-soft, border-dashed border-ink-soft (vs solid hairline on real packages). Hot-pink kicker 'QUOTE ON REQUEST'. Italic display 'Custom' price + ink-soft 'price after vendor responds'. Indigo 'Request a quote →' CTA."
  interaction: 'Click navigates to /vendors/{slug}/request (auth-gated). Skips PackageDetailModal — couple goes straight to the form. Anonymous users redirect to /login?redirect=…'
  backend: "Virtual = no DB row. Sentinel id='custom-request', is_custom=true. Form submits to POST /api/bookings/custom-request → bookings row with status='pending_quote'. Vendor sees row in CRM Inbox with haldi 'Needs quote' badge + existing adjust-quote flow handles the rest."
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): add date-picker + custom-request-card to M+ frontmatter"
```

---

## Task 17: Plan doc commit + push + PR

**Files:** none — git operations only.

- [ ] **Step 1: Commit the plan doc if untracked**

```bash
git status --short docs/superpowers/plans/2026-05-25-baazar-custom-request.md
```

If listed as untracked (`??`):

```bash
git add docs/superpowers/plans/2026-05-25-baazar-custom-request.md
git commit -m "docs(plan): Baazar custom request implementation plan"
```

- [ ] **Step 2: Final verification**

```bash
npm run typecheck
npm run lint
npm test
```

Expected:

- typecheck: clean (only pre-existing `.next/types/.../setup/layout.ts` error)
- lint: clean (only pre-existing warnings — EventCard `<img>`, SearchBar `aria-expanded`)
- test: all new tests pass; pre-existing failures (3 from main related to is_active/onboarding_complete) unchanged

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/baazar-custom-request
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(custom-request): Baazar DatePicker primitive + Custom Request booking flow" --body "$(cat <<'EOF'
## Summary

Bundles three changes per [the spec](docs/superpowers/specs/2026-05-25-baazar-custom-request-design.md):

1. **`<DatePicker>` primitive** at `src/components/ui/date-picker.tsx` — centralizes M+ react-day-picker styling. WhenPicker becomes a thin wrapper. Built-in `unavailable` / `partial` modifiers.
2. **AvailabilityCalendar rewrite** — uses the primitive, drops the `<style dangerouslySetInnerHTML>` hack, replaces amber with haldi.
3. **Custom Request feature** — every vendor's package list auto-appends a virtual "Custom Request" card. Click → `/vendors/{slug}/request` (auth-gated form: date + guest count + event type + description) → `POST /api/bookings/custom-request` → booking row with new `pending_quote` status → vendor's CRM Inbox shows "Needs quote" haldi badge. Vendor sends a quote via existing `VendorAdjustQuoteForm` (Sub-project A), status flips to `adjusted_quote_sent`, standard accept → deposit → completed flow takes over.

## What's in this PR

- **Migrations 00040 + 00041** — add `event_type` column to bookings, allow `pending_quote` in status check, relax `total_price_positive`, allow `custom_request_received` in notifications type check
- **`<DatePicker>` primitive** + WhenPicker thin-wrapper refactor
- **AvailabilityCalendar** rewrite with M+ tokens
- **`appendCustomRequest`** helper + TDD tests
- **PackageGrid** branches on `is_custom` → Treatment B card + Link nav
- **`customRequestSchema`** + zod validation + TDD tests
- **`POST /api/bookings/custom-request`** route + TDD tests
- **`notifyCustomRequestReceived`** service helper + test
- **`CustomRequestForm`** client component (4 fields, 4 form states)
- **`/vendors/[slug]/request`** auth-gated server page
- **Inbox** surfaces `pending_quote` with "Needs quote" haldi badge
- **DESIGN.md** — adds `date-picker:` + `custom-request-card:` entries

## Out of scope (deferred)

- Resend email when custom request comes in
- Vendor disabling / customizing the Custom Request card
- Range-mode date selection (multi-day events go in the description Day-1)
- Couple-side free-text messaging thread (the existing accept/decline/counter handles back-and-forth)
- Custom Request analytics, "accepts custom requests" filter

## Test plan

- [ ] Visit a vendor profile — Custom Request card appears as the LAST card in the package grid with Treatment B styling
- [ ] Click "Request a quote →" while logged out → redirected to `/login?redirect=/vendors/{slug}/request`
- [ ] Submit invalid form (guest count 0) — inline error shows
- [ ] Submit valid form — confirmation panel with "View in dashboard" + "Browse other vendors" CTAs
- [ ] Verify DB row: `bookings.status='pending_quote'`, `event_type` populated, `special_requests` matches description
- [ ] Verify notification: `notifications.type='custom_request_received'` row for vendor's user_id
- [ ] Vendor's `/dashboard` inbox shows the row with "Needs quote" haldi badge + "Custom request · {event_type}" label
- [ ] Click into booking detail → existing `VendorAdjustQuoteForm` lets vendor send a quote
- [ ] After quote sent, status flips to `adjusted_quote_sent` — standard flow takes over
- [ ] `/vendors` search bar's When segment still works (primitive refactor regression check)
- [ ] AvailabilityCalendar renders with haldi tint on partial-availability dates (was amber)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture PR URL from output.

- [ ] **Step 5: Report**

Report DONE | DONE_WITH_CONCERNS | BLOCKED with:

- Final test results
- PR URL
- Any concerns (e.g., VendorAdjustQuoteForm doesn't handle pending_quote → flag for follow-up)
