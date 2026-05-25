# Baazar Custom Request + Date Picker Primitive Design Spec

**Date:** 2026-05-25
**Components:** `<DatePicker>` primitive (#6 in Day-1 brand-work queue) + Custom Request feature (Sub-project bundled with the brand component since it consumes the primitive)
**Status:** Approved direction; ready for implementation plan
**Branch:** `feat/baazar-custom-request`

---

## Goal

Three things ship together in one PR:

1. **`<DatePicker>` primitive** — Lift the M+ styling from `src/components/marketplace/search/WhenPicker.tsx` into a reusable `src/components/ui/date-picker.tsx`. WhenPicker becomes a thin wrapper. The primitive supports custom modifier styling (haldi for partial availability, ink-soft strikethrough for blocked) so calendar surfaces stop forking visual treatment.
2. **`AvailabilityCalendar` rewrite** — Port `src/components/marketplace/AvailabilityCalendar.tsx` to the primitive. Replace pre-M+ tokens (`amber-50`, `text-muted-foreground`) with brand tokens (`haldi`, `ink-muted`). Remove the inline `<style dangerouslySetInnerHTML>` block.
3. **Custom Request feature** — Every vendor's package list auto-appends a "Custom Request" virtual entry (server-side, no DB row needed). Clicking it routes to a new `/vendors/{slug}/request` page with a form (date + guest count + event type + description). On submit, creates a `bookings` row with new status `pending_quote`. Vendor sees it in their existing CRM Inbox with a "Needs quote" haldi badge + "Send quote" CTA that opens the existing `VendorAdjustQuoteForm` (Sub-project A). Once vendor sends a quote, status flips to `adjusted_quote_sent` and the existing accept → deposit → completed flow takes over.

## Non-goals

- **In-house messaging / RFQ inbox.** No new `inquiries` table, no message threading, no chat surface. All communication flows through the existing booking-status state machine.
- **Vendor-editable Custom Request card.** The card is virtual (server-side append). Vendors can't disable it, can't customize copy, can't toggle it off. Day-1 standardization > vendor flexibility.
- **Contact-preference field on the form.** Anti-disintermediation: couples and vendors only exchange direct contact info AFTER deposit is paid (matches existing Baazar pattern). The form collects date + guest count + event type + description only.
- **Modal preview before the request form.** Skip the intermediate modal that real packages use (`PackageDetailModal`). The Custom Request card description already explains the use case; an explainer modal is redundant friction.
- **Range-mode date selection.** Single-date only Day-1. Multi-day events (e.g., Saturday + Sunday) are described in the free-text description field. Range mode is a primitive enhancement deferred to a follow-up.
- **Anonymous Custom Requests.** Couple must be logged in to submit (matches existing booking-request behavior; redirects to `/login?redirect=/vendors/{slug}/request`).
- **Email/SMS notifications to vendor.** Day-1 uses the existing in-app notification service (`special_request_received` → bell + dropdown). Email is a follow-up using Resend.
- **Public list of pending requests, vendor-side "responding to" inbox, response-time leaderboards** — all deferred or off the roadmap.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  src/components/ui/date-picker.tsx                       │  ← NEW primitive
│  - wraps react-day-picker v10 with M+ classNames         │
│  - built-in modifier styling (unavailable, partial)      │
│  - props: selected, onSelect, disabled, modifiers, …     │
└───────────────┬──────────────────────────────────────────┘
                │ consumed by
        ┌───────┴─────────────┬─────────────────────┐
        ▼                     ▼                     ▼
  WhenPicker            AvailabilityCalendar   CustomRequestForm
  (search bar)          (vendor profile)       (new — date field)
        │                     │                     │
        │                     │                     ▼
        │                     │              ┌──────────────────────────┐
        │                     │              │ /vendors/{slug}/request  │  ← NEW route
        │                     │              │ - server-renders form    │
        │                     │              │ - auth-gated             │
        │                     │              └──────────┬───────────────┘
        │                     │                         │ submit
        │                     │                         ▼
        │                     │              ┌──────────────────────────┐
        │                     │              │ POST /api/bookings/      │  ← NEW route
        │                     │              │      custom-request      │
        │                     │              │ - zod validation         │
        │                     │              │ - inserts booking row    │
        │                     │              │   status='pending_quote' │
        │                     │              │ - dispatches notif       │
        │                     │              └──────────┬───────────────┘
        │                     │                         │
        │                     │                         ▼
        │                     │              ┌──────────────────────────┐
        │                     │              │ vendor's CRM Inbox       │  ← MODIFIED
        │                     │              │ - "Needs quote" badge    │
        │                     │              │ - "Send quote" CTA →     │
        │                     │              │   existing adjust-quote  │
        │                     │              │   form (Sub-project A)   │
        │                     │              └──────────────────────────┘

  Packages API surface (vendor profile)
  ┌────────────────────────────────────┐
  │ Existing real packages + appended  │  ← MODIFIED at API layer
  │ virtual "Custom Request" entry     │
  └────────────────────────────────────┘
                │
                ▼
  PackageCard renders virtual entry as Treatment B (outlined-distinct):
  cream-soft fill + dashed hairline + italic "Custom" + hot-pink kicker
```

### Component decomposition

| File                                                                 | Action      | Responsibility                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/date-picker.tsx`                                  | **Create**  | M+-styled wrapper around `react-day-picker` v10. Single-select, configurable modifiers. Central home for the classNames map (currently in WhenPicker).                                  |
| `src/components/marketplace/search/WhenPicker.tsx`                   | **Modify**  | Reduce to a thin wrapper around `<DatePicker>` — pass through `selected`/`onSelect`, no other props. ISO date conversion stays.                                                         |
| `src/components/marketplace/AvailabilityCalendar.tsx`                | **Rewrite** | Same behavior (fetch + render) but uses `<DatePicker>` with `unavailable` + `partial` modifiers. Drop the dangerouslySetInnerHTML hack. M+ tokens throughout.                           |
| `src/lib/booking/custom-request-validation.ts`                       | **Create**  | Zod schema for the API request body. Exports `customRequestSchema`.                                                                                                                     |
| `src/__tests__/lib/booking/custom-request-validation.test.ts`        | **Create**  | Unit tests for the zod schema.                                                                                                                                                          |
| `src/app/api/bookings/custom-request/route.ts`                       | **Create**  | POST handler. Auth-gated, zod-validated, inserts `bookings` row with `status='pending_quote'`, dispatches notification.                                                                 |
| `src/__tests__/api/bookings-custom-request.test.ts`                  | **Create**  | Unit tests for the API route.                                                                                                                                                           |
| `supabase/migrations/00040_add_pending_quote_status.sql`             | **Create**  | Adds `'pending_quote'` to the `booking_status` enum. Applied to dev DB during implementation.                                                                                           |
| `src/lib/vendor-packages/with-custom-request.ts`                     | **Create**  | Pure helper: `appendCustomRequest(packages, vendor)` returns the list with the virtual Custom Request entry appended. Testable in isolation.                                            |
| `src/__tests__/lib/vendor-packages/with-custom-request.test.ts`      | **Create**  | Unit tests for the helper (always-appended, sentinel ID, correct shape, never appends if list already contains a custom entry — defensive).                                             |
| `src/app/(marketplace)/vendors/[slug]/page.tsx`                      | **Modify**  | Line ~50–64: after the existing `packages` query + addon-sort, run results through `appendCustomRequest(packages, vendor.id)` before passing to `<VendorProfile>`.                      |
| `src/components/marketplace/PackageCard.tsx`                         | **Modify**  | If `pkg.is_custom === true`: render Treatment B (cream-soft fill, dashed hairline, italic "Custom" price, hot-pink kicker, "Request a quote →" CTA). Click → `/vendors/{slug}/request`. |
| `src/components/booking/CustomRequestForm.tsx`                       | **Create**  | Client component. 4 fields: `<DatePicker>` (inline), guest count (`<input type="number">`), event type (`<select>`), description (`<textarea>`). Submit → API.                          |
| `src/app/(marketplace)/vendors/[slug]/request/page.tsx`              | **Create**  | Server page. Auth check + vendor lookup (404 if not active/published). Renders `<CustomRequestForm vendorSlug={slug} vendorCategory={category} />`.                                     |
| `src/components/dashboard/BookingInboxRow.tsx` (or equivalent)       | **Modify**  | When booking's `status === 'pending_quote'`: render haldi "Needs quote" badge + primary "Send quote" CTA wired to existing `VendorAdjustQuoteForm`.                                     |
| `src/services/notifications.service.ts`                              | **Modify**  | Add a `notifyCustomRequestReceived(vendorUserId, bookingId, eventDate)` typed helper following the existing "12 typed helpers" pattern.                                                 |
| `supabase/migrations/00041_add_custom_request_notification_type.sql` | **Create**  | Add `'custom_request_received'` to the `notification_type` enum. Applied to dev DB during implementation.                                                                               |
| `DESIGN.md`                                                          | **Modify**  | Add `date-picker:` (primitive tokens) and `custom-request-card:` (Treatment B styling) entries to `components:` block.                                                                  |

---

## `<DatePicker>` primitive

`src/components/ui/date-picker.tsx`

```ts
export interface DatePickerProps {
  /** ISO YYYY-MM-DD selected date; empty string or undefined for none. */
  selected?: string;
  /** Called with ISO YYYY-MM-DD when user picks a date. */
  onSelect: (iso: string) => void;
  /** Additional disabled matchers merged with the default {before: today}. */
  disabled?: Matcher | Matcher[];
  /** Additional modifiers merged with the built-in 'unavailable'/'partial'. */
  modifiers?: Record<string, Matcher[]>;
  /** Per-modifier class overrides. Built-in modifiers have sensible defaults. */
  modifiersClassNames?: Record<string, string>;
  /** Wrapper className. */
  className?: string;
}
```

### Behavior

- Wraps `react-day-picker` v10 in single-select mode.
- Past dates always disabled (`{ before: new Date() }`) by default. Consumer-provided `disabled` matchers are merged, not replaced.
- Returns dates as `YYYY-MM-DD` in **local timezone** (handles off-by-one — copy the conversion from current WhenPicker:24–30).
- Sundays first (`weekStartsOn={0}`), `showOutsideDays` on.

### Built-in modifier styling

Two named modifiers come with default M+ classes (overridable via `modifiersClassNames`):

| Modifier      | Meaning                                     | Default style                                              |
| ------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `unavailable` | Vendor fully blocked on this date           | `text-ink-soft line-through opacity-50 cursor-not-allowed` |
| `partial`     | Vendor partially booked (busy ranges exist) | `bg-haldi/15 text-ink hover:bg-haldi/25`                   |

These replace the existing `rdp-partial` hack in `AvailabilityCalendar:50–53`. The `unavailable` modifier should also flip the day to `disabled` so it can't be selected — consumers pass the same matcher into both `disabled` and `modifiers.unavailable` (or the primitive does it for them when a modifier named `unavailable` is provided).

### Classes (verbatim from WhenPicker.tsx, centralized)

Token-for-token migration of the WhenPicker classNames map. The full map (root, months, month, month_caption, caption_label, nav, button_previous, button_next, month_grid, weekdays, weekday, week, day, day_button, selected, today, outside, disabled) lives in the primitive. Consumers can override individual entries via a future `classNames` prop if needed (not Day-1).

---

## AvailabilityCalendar rewrite

`src/components/marketplace/AvailabilityCalendar.tsx`

```tsx
'use client';
import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';

interface UnavailableDay {
  date: string;
  fully_blocked: boolean;
  busy_ranges: Array<{ start: string; end: string }>;
}

interface Props {
  vendorSlug: string;
  selected?: string; // ISO YYYY-MM-DD
  onSelect: (iso: string) => void;
}

export function AvailabilityCalendar({ vendorSlug, selected, onSelect }: Props) {
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

  const fullyBlocked = unavailable
    .filter((d) => d.fully_blocked)
    .map((d) => new Date(`${d.date}T12:00:00Z`));

  const partial = unavailable
    .filter((d) => !d.fully_blocked && d.busy_ranges.length > 0)
    .map((d) => new Date(`${d.date}T12:00:00Z`));

  const selectedBusy = unavailable.find((d) => d.date === selected)?.busy_ranges ?? [];

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading availability…</p>;
  }

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
```

API change: `selectedDate: Date` → `selected: string` (ISO YYYY-MM-DD), `onSelect: (date | undefined) => void` → `onSelect: (iso: string) => void`. Matches WhenPicker/DatePicker shape. **All call sites of AvailabilityCalendar need to be updated** — check via grep during implementation.

---

## Custom Request — virtual package

### `appendCustomRequest` helper

`src/lib/vendor-packages/with-custom-request.ts`

```ts
/**
 * Virtual "Custom Request" package shape. Mirrors the `packages` table's
 * fetched columns (see src/app/(marketplace)/vendors/[slug]/page.tsx:50–57)
 * so the consumer can treat it identically when iterating the list. All
 * pricing/sizing fields are null to signal "no fixed price."
 */
export interface CustomRequestPackage {
  id: 'custom-request'; // sentinel ID
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

export function appendCustomRequest<T extends { id: string }>(
  packages: T[],
  _vendorProfileId: string
): (T | CustomRequestPackage)[] {
  // Defensive: never double-append if a custom entry already exists.
  if (packages.some((p) => p.id === 'custom-request')) return packages;

  const customEntry: CustomRequestPackage = {
    id: 'custom-request',
    name: 'Custom Request',
    description:
      'Multi-day events, large guest counts, destination weddings, anything outside our standard packages. Tell us what you need.',
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

The `vendorProfileId` param is currently unused but kept on the signature in case we later need to thread per-vendor data into the virtual entry (custom intro copy, etc.). Prefixed with `_` for now to satisfy lint.

Always appended last. Sentinel ID `'custom-request'` lets the frontend distinguish virtual from real packages without an `is_custom` flag check (though the flag is also present for clarity).

### Where to call it

In `src/app/(marketplace)/vendors/[slug]/page.tsx` around line 50–64. The current flow:

```ts
const { data: packagesData } = await supabase.from('packages').select(...);
const packages = (packagesData ?? []).map((p) => ({
  ...p,
  addons: (p.addons ?? []).sort((a, b) => a.display_order - b.display_order),
}));
```

After the existing map, wrap with `appendCustomRequest`:

```ts
const packages = appendCustomRequest(
  (packagesData ?? []).map((p) => ({ ...p, addons: ... })),
  vendor.id,
);
```

`<VendorProfile>` receives the augmented list and `PackageCard` branches on `is_custom`.

### PackageCard rendering

`src/components/marketplace/PackageCard.tsx` (modify):

When `pkg.is_custom === true`, render **Treatment B (outlined-distinct)**:

- Background: `bg-cream-soft` (`#F4ECDC`)
- Border: `border border-dashed border-ink-soft`
- Kicker: hot-pink "Quote on request"
- Name: "Custom Request" (Spectral 700, same as real packages)
- Description: same body styling as real packages
- Price: italic ink "Custom" + small ink-muted "— price after vendor responds"
- CTA: "Request a quote →" (text-link style, indigo arrow)
- Click: navigates to `/vendors/{slug}/request` (no modal preview)

Real packages keep their current rendering unchanged.

---

## Custom Request form

`src/components/booking/CustomRequestForm.tsx`

Client component. State: form fields + submit lifecycle (default / submitting / success / error).

### Fields

| Field           | Input                                       | Validation                                                                                                   |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Event date**  | `<DatePicker>` inline (no popover wrapping) | Required; ISO YYYY-MM-DD; future only                                                                        |
| **Guest count** | `<input type="number" min="1" max="2000">`  | Required; integer 1–2000                                                                                     |
| **Event type**  | `<select>` from a static list               | Required; one of: `mehndi`, `sangeet`, `ceremony`, `reception`, `welcome-dinner`, `farewell-brunch`, `other` |
| **Description** | `<textarea>` 6 rows                         | Required; 50–1000 chars                                                                                      |

Notes:

- Event type is a **fixed enum** (not derived from vendor category). Any vendor might handle any event type — let the couple pick.
- Description placeholder copy: "Tell the vendor what makes your event special — guest count breakdown, dietary needs, location, anything outside their standard packages."
- No contact preference field (anti-disintermediation per [non-goals]).

### CTA

Single primary button: ink "Send request" (matches existing booking-form CTA token).

### Submit lifecycle

| State          | Trigger                            | UI                                                                                          |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| **default**    | Mount                              | All fields editable, "Send request" button active                                           |
| **submitting** | Submit with valid fields           | Form disabled, button shows spinner + "Sending request…"                                    |
| **success**    | API returns 200                    | Replace form with confirmation panel (see below)                                            |
| **error**      | API returns non-200 or fetch fails | Inline error banner above form: "Couldn't send your request — try again." Form re-editable. |

### Confirmation panel (success state)

After successful submission, replace the form with:

> **Request sent.**
>
> {vendor_business_name} will respond within {response_sla_hours} hours with a quote. We'll send you a notification — check your dashboard inbox.
>
> [View in dashboard] [Browse other vendors]

`response_sla_hours` comes from `vendor_profiles.response_sla_hours` (existing field, also surfaced on the vendor card).

---

## API + data

### Migration `00040_add_pending_quote_status.sql`

```sql
-- Adds 'pending_quote' to the booking_status enum. Bookings in this state have:
--   - package_id = NULL (no real package selected)
--   - total_cents = NULL (vendor hasn't quoted yet)
--   - deposit_cents = NULL (no deposit charged Day-1)
-- Vendor flips status to 'adjusted_quote_sent' via existing VendorAdjustQuoteForm,
-- after which the booking enters the standard accept → deposit → completed flow.

ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_quote';
```

(`IF NOT EXISTS` is Postgres 12+; verify before applying — fallback is to wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object ... END $$` if needed.)

### POST `/api/bookings/custom-request`

`src/app/api/bookings/custom-request/route.ts`

- Method: POST
- Auth: required. If `auth.getUser()` returns no user → 401.
- Request body:
  ```ts
  {
    vendor_slug: string,
    event_date: string,    // ISO YYYY-MM-DD
    guest_count: number,   // 1–2000
    event_type: string,    // enum
    description: string,   // 50–1000 chars
  }
  ```
- Validation: zod via `customRequestSchema` (Task 3 file).
- Process:
  1. Resolve vendor by slug → 404 if not active/published.
  2. Insert `bookings` row:
     ```sql
     INSERT INTO bookings (
       vendor_profile_id, couple_user_id, package_id, event_date,
       guest_count, event_type, custom_request_description, status,
       total_cents, deposit_cents
     ) VALUES (
       $1, $2, NULL, $3,
       $4, $5, $6, 'pending_quote',
       NULL, NULL
     ) RETURNING id;
     ```
  3. Dispatch notification: `custom_request_received` to the vendor's `user_id`.
  4. Return `{ ok: true, booking_id: <uuid> }`.

NOTE: the existing `bookings` table may not have `guest_count`, `event_type`, or `custom_request_description` columns. **The implementer must verify the existing `bookings` schema first** (`\d bookings` against dev DB). If the columns are missing, extend migration 00040 to add them. Column specs if added:

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_count int,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS custom_request_description text;
```

(Nullable because non-custom-request bookings won't populate them. CHECK constraint could enforce non-null when `status = 'pending_quote'`, but Day-1 leave it permissive — the API route guarantees it.)

### Notification type

Two changes:

1. **Migration `00041_add_custom_request_notification_type.sql`** — adds `'custom_request_received'` to the existing `notification_type` enum (added by Sub-project F's migration 00030).
2. **`src/services/notifications.service.ts`** — add a new typed helper `notifyCustomRequestReceived(vendorUserId, bookingId, eventDate)` following the existing "12 typed helpers" pattern. Template: "{couple_name} sent you a custom request for {event_date}. Send a quote to lock it in." `link` field points to the booking detail in the vendor's CRM Inbox.

The API route's step 3 calls this helper after a successful insert.

---

## Vendor CRM Inbox treatment

Existing inbox rows show booking requests with their status. For `pending_quote`:

- **Status badge**: replace the default status pill with a `bg-haldi/20 text-ink border border-haldi/40` pill reading "Needs quote" (existing badge component, just different tokens).
- **Primary CTA on the row**: "Send quote" — routes to the booking detail page where the existing `VendorAdjustQuoteForm` (Sub-project A) renders. The vendor enters the price + scope notes, submits, and status flips to `adjusted_quote_sent`. From there it's the standard adjust-quote ping-pong.
- **Booking detail page** for `pending_quote` bookings: shows the couple's request fields (date, guest count, event type, description) prominently. No "accept/decline" buttons at this stage — those appear after the vendor sends the quote and the couple responds.

---

## Auth gating

- **Couple-side**: must be logged in to click "Request a quote →" on the Custom Request card. Anonymous click → redirect to `/login?redirect=/vendors/{slug}/request`. Matches existing "Book this" CTA pattern.
- **Vendor-side**: only the booking's `vendor_profile_id`'s owning user (and admins) can see the request in the inbox + send a quote. Standard RLS.
- **Anti-disintermediation**: form has no contact-preference field, no email/phone exchange before deposit. Couples and vendors only see each other's direct contact after deposit is paid (existing platform behavior).

---

## Brand integration

- DESIGN.md additions:
  - `date-picker:` — token reference for the primitive (caption font, day button radius, selected state, modifier defaults, today underline).
  - `custom-request-card:` — Treatment B styling (cream-soft fill, dashed hairline, italic Custom price, hot-pink kicker, "Request a quote" CTA).

---

## Out of scope (deferred follow-ups)

- **Resend email when custom request comes in** — wire actual email send via Resend. Day-1 is in-app notification only.
- **Vendor disabling the Custom Request card** — virtual = no per-vendor toggle. If we get strong signal that vendors want to opt out, promote to a real row with `is_custom` + `is_enabled` flags.
- **Range-mode date selection** — multi-day events go in the description field Day-1. Range mode is a primitive enhancement; consumers would need to be updated.
- **Couple-side messaging thread** — once a vendor sends a quote, all back-and-forth happens via the existing accept/decline/counter buttons. No free-text reply Day-1.
- **Custom Request analytics** — "% of bookings that came in as custom requests," vendor response time on custom requests, conversion rate — track when product-market fit signals are clearer.
- **Public "we accept custom requests" filter on the vendors index** — all vendors accept them by default (virtual), so the filter would always pass. Becomes useful only after we add a per-vendor opt-out.
- **AvailabilityCalendar fetching during Custom Request form** — couples picking a date for a custom request don't get availability-aware UX Day-1 (the primitive will accept any future date). Adding availability fetching here is a "nice to have" follow-up; the vendor will manually check their calendar before quoting.

---

## Visual references

- Brainstorm mockup archived at `.superpowers/brainstorm/55066-1779426490/content/special-package-card.html` (Treatment A vs B comparison; Treatment B locked).
- WhenPicker (the M+ source-of-truth for primitive styling): `src/components/marketplace/search/WhenPicker.tsx`.
- Existing AvailabilityCalendar (pre-M+ state being replaced): `src/components/marketplace/AvailabilityCalendar.tsx`.

---

## Open questions

None blocking. The `bookings` schema column-existence check (for `guest_count`, `event_type`, `custom_request_description`) is a discovery item for the implementation plan — the spec assumes a migration may need to add them and treats that as part of Task 00040 or a sibling migration.
