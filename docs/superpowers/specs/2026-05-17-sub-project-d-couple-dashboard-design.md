# Sub-project D — Couple Dashboard (Filterable Event Card Grid)

**Date:** 2026-05-17
**Status:** Design (pending user review)
**Predecessors:** A (packages + booking_events), B (vendor onboarding), F (notifications), G (calendar). All shipped to main.

---

## 1. Goal

Replace the couple's `/dashboard` page (currently a bare booking-count card) with a filterable grid of **3D flip cards**, one per upcoming or past `booking_event`. Front of the card shows the vendor's identity (photo, name, event type, countdown). Back shows event details (time, address, status, deep link).

## 2. Non-goals

- **Wedding planning checklist** — explicitly cut from the original scope. Discovery happens via the existing `/vendors` browse.
- **Payment summary card** — cut.
- **Timeline view** — cut.
- **Couple's booking detail page** — already rich (status, events, payment, actions); no changes.
- **`/dashboard/bookings` list page** — leaves alone for now. The dashboard overview is the new entry point; the bookings list stays as a secondary view.
- **Vendor side of the dashboard** — unchanged.
- **Schema changes** — none. All needed data already in `booking_events`, `bookings`, `vendor_profiles`.

## 3. Locked decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Scope | Filterable grid of flip cards on the couple's `/dashboard` overview. |
| Card design | Uiverse.io "ElSombrero2" 3D flip card — dark theme, orange gradient back, hover-to-flip. CSS module. |
| Card content | **Front:** vendor portfolio image bg, event type badge, vendor name, date + countdown ("3w"). **Back:** event type, time range, address, status badge, "Open booking →" link. |
| Filter bar | Time tabs (**Upcoming** / Past / All — Upcoming default) + Category dropdown (All categories + 10 enum values). |
| Card data unit | One card per **booking_event** (not per booking). Multi-event weddings produce N cards. |
| Animation | Use the Uiverse CSS as-is (3D flip on hover, animated orange gradient background, floating blobs). Adapted to a responsive grid via a CSS module. |

## 4. Data fetching

Single server-side query in `src/app/dashboard/page.tsx` (couple branch):

```typescript
const { data: events } = await supabase
  .from('booking_events')
  .select(`
    id, sequence, event_date, event_start_time, event_end_time, event_type_label,
    location_name, address_line_1, city, state, postal_code,
    bookings!inner(
      id, status, couple_user_id,
      vendor_profiles!inner(id, business_name, slug, category, portfolio_images)
    )
  `)
  .eq('bookings.couple_user_id', user.id)
  .order('event_date');
```

Filter on the client side (no SSR re-fetch per filter — small dataset, ≤50 events per couple typically). Apply the time-tab filter and category-dropdown filter as derived state from the full event list.

**Status filter visibility**: cancelled bookings' events are excluded from this view (`bookings.status NOT IN ('couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'expired')`). Add the filter to the query.

## 5. UI structure

### `/dashboard` page (for couples)

```
Hello, {name}                    [Browse vendors →]

[ Upcoming ] [ Past ] [ All ]    Category: [ All ▾ ]

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│      │ │      │ │      │ │      │
│ card │ │ card │ │ card │ │ card │
│      │ │      │ │      │ │      │
└──────┘ └──────┘ └──────┘ └──────┘
┌──────┐ ┌──────┐
│      │ │      │
│ card │ │ card │
└──────┘ └──────┘

(empty state when no cards: "No upcoming events yet. Browse vendors to start planning your wedding. →")
```

Vendor view of `/dashboard` stays as-is. Branch on `role === 'couple'` to render the new grid; vendor branch keeps the existing earnings + recent unlocks layout.

### Card — Front

- Bg image: first `vendor_profiles.portfolio_images[0]` (fallback to a solid dark color if missing)
- Top-left badge: event type label (`event_type_label`, e.g. "Mehndi", "Sangeet", "Reception")
- Top-right badge: countdown — relative date format ("3w", "2d", "tomorrow", "Past")
- Bottom strip (`.description` from the CSS): vendor business name + date in `MMM D, YYYY` format

### Card — Back

- Orange animated gradient bg (the CSS's `::before` animation rotates the gradient)
- Centered content (`.back-content`):
  - Event type (bigger heading)
  - Time range: `10:00 AM – 12:00 PM`
  - Address: `123 Main St, Chicago, IL` (or city + state only if booking not yet deposit_paid)
  - Status badge with colored dot
  - "Open booking →" link to `/dashboard/bookings/{booking_id}`

### Countdown logic

```typescript
function countdown(eventDate: string): string {
  const days = Math.ceil((new Date(eventDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Past';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
```

## 6. CSS strategy

Use a CSS module at `src/components/dashboard/EventCard.module.css` containing the Uiverse styles. The user-provided CSS is adapted to:

1. **Responsive sizing** — keep the `190px × 254px` card dimensions but allow the grid to wrap. Each card is a fixed size to preserve the flip geometry; the grid is flex-wrap with `gap: 16px`.
2. **Image background** — the `.front .img` rule positions the vendor photo. Set via inline `style={{ backgroundImage: \`url(\${portfolioImage})\` }}` on the `.front` div.
3. **Class names** — keep `.card`, `.content`, `.front`, `.back`, `.back-content`, `.front-content`, `.badge`, `.description`, `.title`, `.card-footer`, `.circle`, `#bottom`, `#right` as scoped CSS module class names.
4. **Keyframe fix** — the user's CSS has a typo in `@keyframes rotation_481` (both stops are `0%`). Fix to `0%` → `100%`.

The accessibility tradeoff: `backface-visibility: hidden` + 3D rotation hides the back content from screen readers in the un-flipped state. We'll add `aria-label` on the card describing the front contents AND a separate fully-accessible "Open booking" link below the grid for keyboard users. The back's "Open booking →" link inside the flip is still keyboard-tabbable but won't be visually obvious without mouse hover.

**Mobile**: hover doesn't exist on touch devices. The card flips on tap instead. Add a tap handler that toggles a `flipped` state class.

## 7. Files affected

**New files:**
- `src/components/dashboard/EventCard.tsx` — single flip card (client component)
- `src/components/dashboard/EventCard.module.css` — the Uiverse-derived styles
- `src/components/dashboard/EventCardGrid.tsx` — grid container + filter state owner (client component)
- `src/components/dashboard/EventCardFilters.tsx` — time tabs + category dropdown (client component)
- `src/lib/dashboard/countdown.ts` — `countdown(eventDate)` helper
- `src/__tests__/lib/dashboard/countdown.test.ts` — unit tests for countdown

**Modified files:**
- `src/app/dashboard/page.tsx` — couple branch fetches booking_events and renders `<EventCardGrid events={events} />`. Vendor branch unchanged.

**No schema changes, no migrations.**

## 8. Testing

**Unit:**
- `countdown.test.ts` — table-driven tests for each branch (past, today, tomorrow, days, weeks, months, years)

**No new E2E tests required for this phase** — the underlying booking + vendor data is exercised by existing `happy-path.spec.ts` and `vendor-onboarding.spec.ts`. The card rendering is pure UI; e2e for a flip animation is brittle. Manual smoke after merge: log in as a seeded couple with ≥2 bookings of different categories, verify cards render + filter works + flip animates.

## 9. Phasing

Single PR, sequential tasks:

- **D1** — `countdown` helper + tests; CSS module.
- **D2** — `EventCard` component + `EventCardFilters` component.
- **D3** — `EventCardGrid` (filter state + memoization).
- **D4** — Wire into `/dashboard/page.tsx` couple branch; empty state.
- **D5** — PR + manual smoke.

## 10. Open questions (none — locked from chat)

Decisions log captured above. Ready for plan.
