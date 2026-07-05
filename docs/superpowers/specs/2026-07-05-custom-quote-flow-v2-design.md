# Custom-quote flow v2 — design

**Status:** Design locked · ready for implementation plan
**Branch:** `feat/vendor-page-custom-quote-fallback` (extend, not new)
**Date:** 2026-07-05

---

## Why

PR #98 shipped the custom-quote fallback path (vendors with zero packages route couples to `/vendors/[slug]/request`). Live QA surfaced six issues in the form itself and the flow around it. This spec captures the fixes plus the structural rework that #98's launch made obvious we needed: a multi-day gate at the top, structured basics vendors actually need to quote, and Arab-specific event types beside our existing South Asian coverage.

## Scope — what's in

Six items, cross-checked against source before writing this spec:

| #   | Item                                                      | Root cause / file                                                                                                               |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Selected calendar day is unreadable (ink-on-ink)          | `src/components/ui/date-picker.tsx:99–102` — `!text-cream` is on outer `day` cell, `text-ink` on inner `day_button` wins        |
| 2   | Guest count locked to leading `1`; can't type `600`       | `src/components/booking/CustomRequestForm.tsx:200–202` — `Number(e.target.value) \|\| 1` coerces empty → `1` on every keystroke |
| 3   | Free-text description too open-ended; vendors can't quote | `CustomRequestForm.tsx:246–269` — single textarea, no location, no budget signal                                                |
| 4a  | Arab-specific event types missing                         | `src/types/index.ts:54–77` — only Islamic (nikah/walima/aqiqah), no Arab-specific ceremonies                                    |
| 4b  | Multi-day flow inverted                                   | Form treats each row as isolated event; no "multi-day?" gate up front; no calendar ordering                                     |
| 5   | Send-request button doesn't turn hot-pink on hover        | `CustomRequestForm.tsx:275` — `hover:bg-ink/90`                                                                                 |
| 6   | No back button; user is trapped on full-page form         | `src/app/(marketplace)/vendors/[slug]/request/page.tsx:34–55`                                                                   |

Bonus finding (in scope): `tests/e2e/custom-request-flow.spec.ts` bypasses the form UI and posts directly to the API. That's why #1, #2, #5 shipped. Rewrite to drive the actual form.

## Scope — what's out

- No vendor-side changes to BookingDetail beyond surfacing the 3 new fields (city, venue, budget).
- No per-vendor-category prompt customization (photographer vs caterer). YAGNI.
- No city autocomplete — plain text field is fine v1.
- No date-picker foundation swap. See memory `date-picker-foundation-upgrade-deferred`.

---

## Design

### 1) Container — multi-step modal (with page fallback)

Open the flow as a `Dialog` **in place** on the vendor page. The five existing CTAs in `VendorProfile.tsx` (lines 73, 131, 147, 186, 202) become buttons that mount the modal instead of `router.push`ing to `/request`.

**Fallback:** `/vendors/[slug]/request` keeps working as a real page — same React component, renders the modal _content_ inline as a page. This preserves:

- Notification deep-links from `notifications` table
- No-JS / bot access
- Anywhere else in the app that might link straight in

The modal contents and the page contents share one component (`CustomRequestFlow`); the mount wrapper is thin.

**Modal chrome (per approved mockup):**

- Thin indigo→hot-pink gradient bar at the top edge (single brand anchor)
- Header: `CUSTOM QUOTE · {vendor.business_name}` eyebrow + `Tell us the details` display title + step-indicator (3 pips, active = filled indigo, drop shadow)
- Close (X) — confirms if user has entered any data
- Esc closes with the same guard
- Modal body: cream ground (not white) so cards float on soft shadow

### 2) Steps — 3 total

**Step 1 — What's the shape?**

- Radio: **Single event** | **Multi-day / multi-event**
- If Multi-day: stepper "How many events?" default `3`, range `2–7`
- Nav: `Continue →`

**Step 2 — Details** (main form)

Per event, one card. 1 card if single, N cards if multi. Each card contains, in a 2-column grid:

| Left column                                                           | Right column                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Date** — expanded `react-day-picker` calendar (per approved mockup) | **Event type** (`EventTypePicker`, with 3 new Arab entries)          |
|                                                                       | **Start time** (native `<input type="time">`)                        |
|                                                                       | **Guest count** _(string during edit, coerced on submit — fixes #2)_ |

Multi-day rule: Day N's calendar disables all dates `<= Day N-1`. Dates don't have to be consecutive — just ascending. If the user re-picks Day 1 to a later date that invalidates Day 2, Day 2's date field clears and prompts a re-pick (silent revalidation on every Day 1 change).

Below the cards (shared across all events):

- **Location:**
  - Event city (text, required, e.g. `Houston, TX`)
  - Venue name (text, optional, placeholder `e.g. The Post Oak Hotel, or leave blank if not booked`)
- **Budget range** (optional radio chips): `Under $5k` / `$5k–15k` / `$15k–30k` / `$30k+` / `Prefer to discuss`
- **Tell them more** (textarea, 50–1000 char, existing widget) with a helper-chips row above listing suggestions: `Cultural specifics` `Coverage hours` `Must-have shots` `Dietary needs` `Color palette`

Nav: `← Back` / `Review →`

**Step 3 — Review & send**

- Read-only summary of Steps 1+2
- `← Back` returns to Step 2 with state intact
- **`Send request`** button — base `bg-ink` → `hover:bg-hot-pink` _(fixes #5)_

### 3) Palette usage (locked palette honored)

Per `baazar-palette-locked-m-plus`:

- **CTA stays ink** (Send request, Review →). Hover state is hot-pink.
- **Yellow (haldi) used exactly once** — subtle chip in the multi-day modal header: `DAYS MUST BE IN ORDER`.
- **Hot-pink** used at two state-marker moments: selected calendar day, and CTA hover. Neither is a rest-state CTA color, so palette rule holds.
- **Indigo** used for: eyebrows (existing), day-N pips inside multi-day cards (`1`/`2`/`3`), active step indicator, picked budget chip.
- Cards float on cream ground with soft shadow. Modal body is cream, not white.

Mockup reference: scratchpad `custom-quote-mockup.html` (v2).

### 4) Locked design decisions (3 questions I answered without more input)

1. **Location asked once at the bottom**, not per day. A wedding weekend has one story, one city, one budget. Per-day venues would balloon the form; if a couple really has multiple venues they can put it in the free-text field. Revisit if we see the pattern in real data.
2. **"Days must be in order" chip** kept — subtle haldi pill inline with the modal title. Only surfaces in multi-day mode. This is the single haldi usage on the page.
3. **Calendar expanded inline in each event card** (not collapsed to a popover). Matches the approved mockup. Concern noted: multi-day with 3+ events becomes a tall scrollable modal. If UX telemetry shows abandonment, follow-up ticket to swap to popover pattern per event card.

---

## Data model changes

Extend `POST /api/bookings/custom-request` payload (`src/lib/booking/custom-request-validation.ts`):

```ts
{
  vendor_slug: string,
  is_multi_day: boolean,                                     // NEW
  events: [{ date, startTime, guestCount, eventTypeId }],    // existing shape
  event_city: string,                                        // NEW, required
  venue_name?: string | null,                                // NEW
  budget_range?: 'lt_5k'|'5k_15k'|'15k_30k'|'gt_30k'|'discuss' | null,  // NEW
  description: string,                                       // existing
}
```

### Migration

`supabase/migrations/00070_bookings_custom_request_fields.sql`:

```sql
alter table public.bookings
  add column if not exists event_city text,
  add column if not exists venue_name text,
  add column if not exists budget_range text,
  add column if not exists is_multi_day boolean not null default false;

-- Loose check on budget_range so we can extend enum values without a new migration.
alter table public.bookings
  add constraint bookings_budget_range_check
  check (budget_range is null or budget_range in ('lt_5k','5k_15k','15k_30k','gt_30k','discuss'));
```

Old rows unaffected (columns nullable / defaulted). Vendor dashboard's `BookingDetail.tsx` reads these three fields and surfaces them in the request summary (small addition; see below).

Per migration policy: apply to dev via `psql` in the same PR; user applies to prod after merge.

Per `database.types.ts` cleanup pending: **hand-patch** the three new columns into `src/types/database.types.ts` — do NOT run `supabase gen types`.

---

## Files touched

| Change                     | File                                                                                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix selected-day contrast  | `src/components/ui/date-picker.tsx` — move `bg-ink !text-cream` styling onto `day_button` slot; verify against both single and multi-day usage                                                                                                                       |
| Add Arab event types       | `src/types/index.ts` — three entries added to `cultural` group                                                                                                                                                                                                       |
| Rebuild form as multi-step | `src/components/booking/CustomRequestForm.tsx` — split into `CustomRequestFlow.tsx` (state machine + steps) + `Step1Shape.tsx` + `Step2Details.tsx` + `Step3Review.tsx`; keep `CustomRequestForm.tsx` as thin export for backwards compat if we find other importers |
| Modal wrapper              | New `src/components/booking/CustomRequestModal.tsx` — wraps the flow component in a shadcn `Dialog`                                                                                                                                                                  |
| Vendor CTAs → modal        | `src/components/marketplace/vendor-profile/VendorProfile.tsx` — 5 sites replace `router.push`/`Link href` with modal-open handlers; keep `Link` fallback for no-JS (rendered `next/link` inside a button that intercepts click)                                      |
| Page still works           | `src/app/(marketplace)/vendors/[slug]/request/page.tsx` — swap `<CustomRequestForm>` for the shared `<CustomRequestFlow>`; add `← Back to {vendor.business_name}` link at top                                                                                        |
| API + validation           | `src/app/api/bookings/custom-request/route.ts` + `src/lib/booking/custom-request-validation.ts` — accept new fields, persist to bookings row                                                                                                                         |
| Types                      | `src/types/database.types.ts` — hand-patch 4 new columns                                                                                                                                                                                                             |
| Vendor surface             | `src/components/dashboard/BookingDetail.tsx` — render 3 new fields in the request-detail summary block                                                                                                                                                               |
| Migration                  | `supabase/migrations/00070_bookings_custom_request_fields.sql`                                                                                                                                                                                                       |

## Tests

Rewrite `tests/e2e/custom-request-flow.spec.ts`:

- Scenario A (single-event, happy path): open modal from vendor page → Step 1: Single → Continue → Step 2: click date on calendar, type guest count, select type, fill city, pick budget chip, type description → Review → Send. Assert booking row created with `is_multi_day=false`, `event_city` matches, `budget_range` matches, one event row.
- Scenario B (multi-day, 3 events): open modal → Step 1: Multi-day, 3 events → Continue → Step 2: fill all 3 cards with ascending dates + differing guest counts → Review → Send. Assert 3 events persisted, `is_multi_day=true`.
- Scenario C (multi-day ordering guard): after filling Day 1 = Mar 13 and Day 2 = Mar 14, re-pick Day 1 = Mar 20. Assert Day 2's date field clears and shows re-pick prompt.
- Scenario D (guest count edit): backspace guest count field to empty, retype `600`. Assert final value is `600` and does not snap to `1`.
- Scenario E (deep-link fallback): navigate directly to `/vendors/[slug]/request`. Assert the same flow renders as a page (not modal) with a `← Back to {vendor}` link.

Component-level test: `date-picker.test.tsx` snapshot of selected-day tile — assert computed color contrast passes (rough check: selected pill has a non-ink background OR text color is not `text-ink`).

## Rollout & risk

- Keep `/vendors/[slug]/request` working throughout — worst case, modal breaks and users still reach the page.
- Migration is additive, nullable, no backfill. Rollback = drop the 4 columns.
- No changes to vendor-side quote flow. BookingDetail surfacing of new fields is read-only additive.
- E2E rewrite runs against the real form UI — regression coverage for #1, #2, #5 all now real.

## Open (post-merge) follow-ups

- Consider swapping expanded-inline calendar for popover pattern if the multi-day modal proves too tall in real usage.
- Optional per-day venue field if data shows multi-venue weddings are common.
- Vendor-category-aware helper chips in the textarea hints (photographer vs venue vs caterer).
- See memory `date-picker-foundation-upgrade-deferred` for the eventual react-aria migration.
