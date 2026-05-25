# Baazar Vendor Card — Component Design

## 0. Status

- **Type**: Component-level design. Item #4 of 6 in the Day-1 brand component queue.
- **Origin**: Brand brainstorm 2026-05-24. Builds on the locked button + tooltip + search bar + filter chips primitives (PRs #16-#19). HV-B hover pattern was locked earlier in the brand foundation work; this spec composes the FULL card layout around that hover.
- **Branch**: `feat/baazar-vendor-card`.
- **Sequencing**: Last of the marketplace-surface components (#5 footer + #6 date picker remain). Renders inside the `/vendors` grid that was rewritten in PR #19 (filter chips).
- **Build approach**: Rewrite `src/components/marketplace/VendorCard.tsx` from the current shadcn-baseline (Card + Badge) to the locked Direction B (editorial 4:5 portrait + kicker + enriched meta). Add derived data fields to the vendor page query (wedding count + date availability). Save heart UI ships without persistence (POSTs nowhere) — persistence is a follow-up PR.

## 1. Goals

Replace the existing shadcn-style `VendorCard` with the editorial 4:5 portrait card per the locked Direction B + 3 conversion-driving signal additions (response time text, wedding count, "Available your date" haldi pill).

### Success criteria

1. **4:5 portrait photo** with single vendor-selected thumbnail (`portfolio_images[0]` fallback until thumbnail-selection UX ships per the build-time requirement).
2. **Verified pill** (top-left, indigo dot + ink text on cream-bg backdrop-blur surface).
3. **"Available [date]" haldi pill** — only renders when `?date=` is present in the URL AND the vendor has no calendar block on that date. Sits below the Verified pill on the photo.
4. **Save heart** (top-right, cream-bg backdrop-blur surface; outline-ink when unsaved, hot-pink filled when saved). UI ships with click handler that toggles local visual state only — persistence backend deferred to follow-up PR.
5. **HV-B hover** (locked, see DESIGN.md `vendor-card-hover` entry) — `translateY(-3px)` + photo `scale(1.04)` inside `overflow:hidden` frame + indigo arrow orb (36px, bottom-right) slides in from `translateX(-8px) → 0` + `elevation.one` shadow appears + border fades to transparent. All at `motion.medium` (320ms) on `motion.ease-out`. `prefers-reduced-motion` disables transform + orb slide, keeps shadow + border fade.
6. **Card body content** (Direction B layout):
   - Indigo kicker label (category, e.g. "PHOTOGRAPHY", uppercase, 10px, font-bold, tracking-[0.14em])
   - Spectral name (21px, font-bold, tracking-[-0.014em], ink color)
   - Meta row: `{neighborhood} · Responds in {sla}h · {wedding count}+ weddings` (with `·` separators in `ink-soft` color, response-time prefixed with an indigo dot, wedding-count omitted if vendor has <10 confirmed bookings)
   - Price line: "From $X" (ink color, 14px, font-semibold; "From" prefix in `ink-muted`)
7. **Click anywhere** on the card navigates to `/vendors/[slug]` (vendor profile page). Save heart click is captured and does NOT navigate.
8. **No explicit CTA button** on the card — implicit via card click + save heart + HV-B arrow orb. (Inquiry happens on the profile page, not the card.)
9. **Mobile** (<md): same card shape, grid collapses from 4 columns → 2 columns at md → 1 column at sm. Hover effects disabled below md (touch devices don't have hover; tap navigates).
10. **Accessible**: card is a single `<Link>` wrapping the photo + body; save-heart is a nested `<button>` with `aria-pressed`; verified + available pills have semantic text labels for screen readers; HV-B arrow orb is decorative (`aria-hidden`); WCAG AA contrast verified on all overlay-on-photo elements (`bg-cream/94` + `backdrop-blur` provides enough contrast even over busy photos).

### Acceptance criteria

- Couple browses `/vendors` — sees portrait cards in a 4-column grid (desktop). Each card has the verified pill, save heart, name + kicker + meta, price.
- Couple hovers a card — it lifts 3px, photo scales subtly, indigo arrow orb slides in from the bottom-right of the photo, shadow appears.
- Couple sets a date in the search pill (`?date=2026-10-17`) — vendor cards now show a haldi "Available Oct 17" pill below the verified pill (only on vendors who have that date open).
- Couple clicks the save heart on a card — heart fills hot-pink immediately. Refresh loses the state (persistence is follow-up).
- Couple clicks the rest of the card → navigates to vendor profile.
- A new vendor with <10 confirmed bookings — wedding-count segment omitted from the meta row entirely.
- A vendor with no portfolio_images — placeholder image: a cream-soft fill with a small ink "Photo coming soon" caption (graceful empty state).
- Mobile (375px viewport): cards stack 1-column, same content, hover replaced with active state on tap.

### Out of scope (deferred)

| Area                                                           | Disposition                                                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save-heart persistence (saved_vendors table + auth-gated POST) | Out — UI ships, no backend persistence. Follow-up PR.                                                                                                                              |
| Vendor-selected thumbnail (instead of portfolio_images[0])     | Out — build-time requirement captured in memory. Onboarding wizard + CRM both need thumbnail-selection surfaces. Falls back to first portfolio image for Day-1.                    |
| Star rating + review count                                     | Out — no reviews infrastructure yet. Requires reviews table + collection flow + booking volume to seed. Day-1+ work.                                                               |
| Sophisticated capacity-aware availability                      | Out — Day-1 check is "vendor has no block on date X" (Sub-project G's `vendor_blocks` table). Capacity / multi-team / team-availability is Sub-project G's domain, can ship later. |
| "Featured" / "Top in category" curation badges                 | Out — no editorial curation system yet.                                                                                                                                            |
| Mini portfolio thumbnails on card                              | Out — contradicts the locked HV-B "single thumbnail" decision.                                                                                                                     |
| Recent-activity / urgency signals ("Booked 3 times this week") | Out — manipulative without genuine volume data. Revisit when we have real booking density.                                                                                         |
| Hover-reveal CTA in card body                                  | Out — implicit click + orb stays.                                                                                                                                                  |

## 2. Component API

### Props

```ts
interface VendorCardProps {
  vendor: VendorRow & {
    vendor_packages_price_band?: {
      min_price_cents: number | null;
      max_price_cents: number | null;
    } | null;
    /** Derived field: count of confirmed booking_requests for this vendor. */
    confirmed_wedding_count?: number;
    /** Derived field: true when the page's ?date= URL param matches a date this vendor has open. */
    is_available_for_date?: boolean;
  };
  /** The date the user has selected in search (for the "Available [date]" pill copy). */
  searchDate?: string; // ISO YYYY-MM-DD
  /** Locally-tracked save state (no persistence). Default false. */
  isSaved?: boolean;
  /** Save handler — parent decides whether to persist or just track in local state. */
  onSaveToggle?: (saved: boolean) => void;
}
```

### Default render

`<VendorCard vendor={vendor} />` renders the card with no save state, no date pill. Adding `searchDate` + `is_available_for_date` enables the haldi pill. Adding `isSaved` + `onSaveToggle` enables the save flow.

## 3. Anatomy

```
┌──────────────────────────────────┐
│                                  │  ← Photo (4:5 portrait)
│  [Verified ●]          [♡]       │  ← Pills + save heart on photo
│  [Available Oct 17]              │  ← Conditional haldi pill (date in URL)
│                                  │
│                                  │
│                                  │
│                       (●)        │  ← HV-B arrow orb (hover only)
├──────────────────────────────────┤
│ PHOTOGRAPHY                      │  ← Indigo kicker
│ Khan Photography                 │  ← Spectral name
│ Lincoln Park · ● Responds in 2h  │  ← Meta row
│   · 150+ weddings                │
│ From $2,500                      │  ← Price
└──────────────────────────────────┘
```

- **Photo**: `aspect-ratio: 4/5`, `overflow: hidden`. Inner `<img>` fills + scales 1.04 on hover.
- **Verified pill** (`top-12px`, `left-12px`): `inline-flex` with 7px indigo dot + "Verified" text, `bg-cream/94 backdrop-blur` border `border-ink/6`, padding `5px 10px`, `rounded-full`, `text-[11px] font-semibold`.
- **Available pill** (`top-46px`, `left-12px` — sits BELOW verified): solid `bg-haldi text-ink`, 7px ink dot + "Available {short-date}", `rounded-full`, `padding 5px 10px`, `text-[11px] font-bold`, subtle shadow. Only renders when `searchDate && vendor.is_available_for_date`.
- **Save heart** (`top-12px`, `right-12px`): 34px circle, `bg-cream/94 backdrop-blur`, outline heart icon (ink) when unsaved, filled heart (hot-pink) when saved.
- **Arrow orb** (`bottom-14px`, `right-14px`): 40px circle, `bg-indigo text-cream`, arrow icon, `opacity: 0 + translateX(-8px)` default → `opacity: 1 + translateX(0)` on hover.
- **Body** (`padding 16px 18px 20px`):
  - Kicker: `text-[10px] font-bold uppercase tracking-[0.14em] text-indigo mb-1.5`
  - Name: `font-display text-[21px] font-bold leading-[1.18] tracking-[-0.014em] text-ink mb-2`
  - Meta: `flex items-center gap-1.5 text-[12px] text-ink-muted mt-2.5 flex-wrap` with `·` dot separators (ink-soft); response-time segment has an inline indigo dot prefix and `text-ink font-semibold`
  - Price: `text-[14px] font-semibold text-ink mt-3` with `From` prefix in `ink-muted font-normal text-[12px]`

## 4. Content data + sources

| Field                    | Source                                                                                                                 | Notes                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photo (single thumbnail) | `vendor.portfolio_images[0]`                                                                                           | Day-1 fallback. Future: `vendor.active_thumbnail_photo_id` per build-time req.                                                                                          |
| Verified pill            | `vendor.verified`                                                                                                      | Boolean. Renders pill if true.                                                                                                                                          |
| Save state               | Parent-managed (`isSaved` prop)                                                                                        | No persistence Day-1. Follow-up PR adds saved_vendors table.                                                                                                            |
| Kicker (category)        | `VENDOR_CATEGORY_LABELS[vendor.category]` from `src/lib/utils.ts`                                                      | Existing mapping.                                                                                                                                                       |
| Name                     | `vendor.business_name`                                                                                                 | Existing.                                                                                                                                                               |
| Neighborhood             | `vendor.base_city` OR first of `vendor.service_area[]`                                                                 | Prefer `base_city` (more reliable per Sub-project I's location work). Falls back to service_area[0]. Falls back to "Chicago" if both null.                              |
| Response time            | `vendor.response_sla_hours`                                                                                            | Shipped in PR #19 filter chips. Format: `Responds in {n}h` (e.g. "Responds in 2h"). Hidden if NULL.                                                                     |
| Wedding count            | Derived: `COUNT(*) FROM booking_requests WHERE vendor_profile_id = vendor.id AND status = 'confirmed'`                 | Computed in the page query via a `LATERAL` subquery or a denormalized count column (decide at impl time — see §10). Format: `{n}+ weddings`. **Omitted if count < 10.** |
| Available-for-date       | Derived: `NOT EXISTS (SELECT 1 FROM vendor_blocks WHERE vendor_profile_id = vendor.id AND blocked_date = $searchDate)` | Sub-project G's `vendor_blocks` table. Only computed when `?date=` is present in URL.                                                                                   |
| Price                    | `vendor.vendor_packages_price_band.min_price_cents`                                                                    | Existing join. Format: "From $X,XXX". Hidden if NULL.                                                                                                                   |

## 5. States

### Default (no save, no date in URL)

Photo + verified pill + save outline + body. No haldi pill. No arrow orb visible.

### Default + date in URL

Adds haldi "Available {date}" pill below verified, ONLY IF `vendor.is_available_for_date === true`. If the vendor has the date blocked, no pill (don't render an "Unavailable" pill — silent omission keeps the card optimistic).

### Default + saved

Heart fills hot-pink.

### Hover (HV-B)

Card lifts -3px, photo scales 1.04, shadow appears, border fades, arrow orb slides in. Per the locked pattern.

### No portfolio photo

Photo area renders a cream-soft fill with an outline camera icon + "Photo coming soon" caption (ink-muted text, centered). Verified pill + save heart + arrow orb still render normally.

### New vendor (no wedding count)

Meta row omits the "X+ weddings" segment entirely. Reads: "Lincoln Park · Responds in 4h" (just 2 segments). Don't show "0 weddings" — that's worse than nothing.

### Missing meta data

Hide gracefully: if no neighborhood, omit (don't show "—"). If no response_sla, omit. Card adapts to whatever data exists.

### Loading skeleton

While the vendor list is fetching server-side, render a 4:5 cream-soft block + 2 text-line shimmer placeholders for name and meta. Standard tailwindcss-animate `animate-pulse` is fine.

## 6. Mobile behavior

- **Grid columns**: Desktop (≥lg) = 4 cols, md = 2 cols, sm = 1 col. Existing `VendorGrid` already handles this; no change.
- **Card shape**: Stays 4:5 portrait at all breakpoints — readable on mobile, just narrower.
- **Hover**: All `:hover` styles disabled below `md` breakpoint (using `md:hover:` Tailwind prefix). The arrow orb is hidden on mobile entirely. On tap, browser shows native focus ring on the underlying `<Link>`.
- **Pills + save heart**: Same positions, same sizes (34px heart is finger-tappable; 5px-padding pills don't shrink on small viewports).

## 7. Tokens used

| Token                   | Used by                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `colors.cream`          | Card bg, pill bgs                                                  |
| `colors.cream-soft`     | Empty-photo fallback, skeleton loader                              |
| `colors.ink`            | Name text, pill text, save heart outline, kicker contrast          |
| `colors.ink-muted`      | Meta segments, "From" prefix                                       |
| `colors.ink-soft`       | Meta dot separators                                                |
| `colors.indigo`         | Kicker label, response-time dot, arrow orb fill, verified pill dot |
| `colors.hot-pink`       | Saved heart fill                                                   |
| `colors.haldi`          | "Available {date}" pill bg                                         |
| `colors.hairline`       | Card border (default state)                                        |
| `radii.lg` (10px)       | Card outer corner radius                                           |
| `radii.full`            | Pills, save heart, arrow orb                                       |
| `elevation.one`         | Hover shadow                                                       |
| `motion.medium` (320ms) | Hover transitions                                                  |
| `motion.ease-out`       | Every transition                                                   |

Reuses the locked `vendor-card-hover` motion pattern (HV-B). Photo uses `next/image` with `fill` + `object-cover`.

## 8. Implementation approach

### File structure

| File                                        | Action                 | Responsibility                                                                                                                                                                                                   |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/VendorCard.tsx` | **Rewrite**            | The card component — pure presentational, takes vendor + searchDate + save props.                                                                                                                                |
| `src/components/marketplace/VendorGrid.tsx` | **Modify**             | Read `?date=` from `useSearchParams()` (client) OR `searchParams` prop (server) and pass to each `<VendorCard searchDate={...} />`. Maintains local save state (Map keyed by vendor id) until persistence ships. |
| `src/app/(marketplace)/vendors/page.tsx`    | **Modify**             | Update the supabase vendor query to select the derived wedding count + availability. Pass `searchDate` to `<VendorGrid>`.                                                                                        |
| `src/lib/vendor-card-derivations.ts`        | **Create**             | Helper functions: `formatShortDate(iso)`, `formatPrice(cents)` (reuse from utils.ts if present), `formatWeddingCount(n)` returning `"{n}+ weddings"` or `null` if <10.                                           |
| `DESIGN.md`                                 | **Modify frontmatter** | Add `vendor-card` entry to `components` block (in addition to existing `vendor-card-hover`).                                                                                                                     |

### Wedding-count query approach

Two options:

- **(a) LATERAL subquery in the vendor list query** — single round-trip, scales with row count but PostgreSQL is happy. Add to `applyVendorFilters` chain in `src/lib/vendor-filters.ts`.
- **(b) Denormalized `confirmed_bookings_count` column** on `vendor_profiles` maintained by a trigger on `booking_requests`. Cleaner reads, more write infrastructure.

**Recommendation: (a) LATERAL subquery** for Day-1. Vendor list is ~20-50 rows per page; the subquery cost is negligible. Migrate to (b) if list pages start showing latency in production.

### Availability query approach

Similar choice:

- **(a) LATERAL subquery** that checks `NOT EXISTS` against `vendor_blocks` for the given date. Only added when `?date=` is present.
- **(b) Skip availability check, surface vendors with no calendar block trivially** — server already filters out unavailable vendors elsewhere.

**Recommendation: (a)** — same rationale as wedding count.

### Save state (no persistence Day-1)

`VendorGrid` holds a `useState<Set<string>>(new Set())` of saved vendor ids. `<VendorCard isSaved={savedSet.has(vendor.id)} onSaveToggle={...}>` flips the set entry. No fetch. Lost on page navigation.

Follow-up PR adds:

- `saved_vendors` table (`user_id`, `vendor_profile_id`, `saved_at`)
- `POST /api/users/me/saved/:vendorId`
- `DELETE /api/users/me/saved/:vendorId`
- Optimistic UI in `VendorCard` with rollback on error
- Server-side fetch of user's saved set + pass into VendorGrid

## 9. Migration

The existing `VendorCard` is consumed only by `VendorGrid`. Rewriting it doesn't affect any other surface. Existing props (`vendor`) remain valid; new props (`searchDate`, `isSaved`, `onSaveToggle`) are all optional with sensible defaults.

The `VendorGrid` signature changes:

- Today: `<VendorGrid vendors={...} />`
- After: `<VendorGrid vendors={...} searchDate={date} />` — backwards-compatible (searchDate optional)

`vendors/page.tsx` mounts VendorGrid; one-line change to pass the date.

## 10. Accessibility

- Card root = single `<Link>` per vendor (existing pattern). Entire card area clickable; cursor pointer.
- Save heart = nested `<button type="button">` with `aria-pressed={isSaved}` and `aria-label="Save vendor"` / `aria-label="Unsave vendor"`. Click handler calls `event.preventDefault()` + `event.stopPropagation()` so the Link doesn't navigate.
- Verified pill = `<span aria-label="Verified vendor">` (the indigo dot is decorative).
- "Available [date]" pill = `<span>Available {date}</span>` — screen readers read it inline.
- Arrow orb = `<span aria-hidden="true">` — purely decorative hover affordance.
- Photo = `<Image alt={vendor.business_name + ' — ' + category}>` for SEO + screen readers.
- Meta row segments use semantic separators (the `·` is decorative; SRs get clean comma-separated text via `aria-label` on the row).
- `prefers-reduced-motion`: disables `translate-y` lift + photo scale + arrow orb slide. Hover keeps shadow + border-fade (state still communicated without movement). Skeleton loader's `animate-pulse` is disabled.
- Color contrast: all overlay text on photo uses `bg-cream/94 backdrop-blur` which guarantees ≥4.5:1 contrast regardless of photo content.

## 11. DESIGN.md updates

Add to `components:` block in frontmatter (in addition to the existing `vendor-card-hover` and `vendor-gallery` entries — `vendor-card` is the COMPONENT, `vendor-card-hover` is its MOTION):

```yaml
vendor-card:
  pattern: 'Editorial 4:5 portrait + indigo kicker + Spectral name + enriched meta row'
  photo: '4:5 aspect, vendor-selected single thumbnail (see vendor portfolio note + build-time req)'
  badges: "Verified pill top-left (indigo dot, cream-bg blur). Optional haldi 'Available {date}' pill below — only when ?date in URL AND vendor has no block on that date."
  body: "Indigo uppercase kicker (category) → Spectral 21px name → meta row (neighborhood · indigo-dot Responds in Xh · X+ weddings) → 'From $X' price"
  save: 'Cream-bg heart top-right; outline ink unsaved, hot-pink filled saved'
  hover: 'HV-B (locked) — lift -3px + photo scale 1.04 + indigo arrow orb + elevation.one shadow'
  omissions: 'Wedding count omitted when <10. Response time omitted when SLA NULL. Date pill omitted when no search date or vendor blocked.'
  cta: 'Implicit only — card click navigates to /vendors/[slug]; save heart captures separately. No explicit Inquire button on card (inquiry lives on profile page).'
```

## 12. Testing

Per codebase convention (no React component test infra), validation = TypeScript compile + lint + Playwright visual screenshots:

- Card default state in /vendors grid
- Card with date in URL → haldi pill visible
- Card hover → orb visible + lift + shadow
- Card saved state → hot-pink heart
- New vendor (no count) → meta row shorter
- Missing photo → fallback renders
- Mobile (375px) → 1-column grid, no hover, finger-tappable heart

Future (when test infra ships): unit-test `formatWeddingCount(n)` threshold logic + the availability-derivation query.

## 13. Related

- [`DESIGN.md`](../../../DESIGN.md) — locked palette + typography + motion + vendor-card-hover pattern
- [Button design spec](./2026-05-23-baazar-button-design.md) — hover -3px lift family (cards share this lift)
- [Filter chips spec](./2026-05-24-baazar-filter-chips-design.md) — provided the `response_sla_hours` + `languages` + `years_in_business` fields used here
- Sub-project G calendar — provides `vendor_blocks` table used by availability derivation
- Build-time requirement: vendor-selected thumbnail surface in onboarding + CRM (captured in [memory](../../../.claude/projects/-Users-sardarkhan-IdeaProjects-vendors-io/memory/baazar_vendor_thumbnail_selection_requirement.md))
- Brainstorm files: `vendor-card-directions.html`, `vendor-card-directions-v2.html`, `vendor-card-enriched.html` in `.superpowers/brainstorm/55066-1779426490/content/`
