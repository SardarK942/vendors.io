# Baazar Filter Chips — Component & Surface Design

## 0. Status

- **Type**: Component-level design. Item #3 of 6 in the Day-1 brand component queue.
- **Origin**: Brand brainstorm 2026-05-24. Builds on the locked button + tooltip + search bar primitives (PR #18). Replaces the current `FilterSidebar` on `/vendors`.
- **Branch**: `feat/baazar-filter-chips`.
- **Sequencing**: Unblocks the vendor card layout (#4) which renders inside the filtered grid. Touches Sub-project B (onboarding wizard) for 3 new fields; touches Sub-project A's schema via 3 new columns.
- **Build approach**: Single PR covering the chip primitive + the chip row on `/vendors` + the "All filters" sheet + 3 schema migrations + 3 onboarding wizard step additions. Sidebar removed.

## 1. Goals

Replace the existing left-rail `FilterSidebar` with a modern chip-row + side-drawer pattern, and add 3 vendor-profile fields (languages, years_in_business, response_sla_hours) that power the most Baazar-distinctive filters.

### Success criteria

1. **Chip primitive** with 5 variants — `toggle`, `dropdown`, `with-count`, `applied` (removable), and `all-filters` (sheet trigger). Standardized 32px height, pill-shaped, M+ tokens.
2. **Default chip row** on `/vendors`: Verified (toggle) · Responds < 24h (toggle) · Price (dropdown) · Cash-friendly (toggle) · Languages (with-count dropdown) · All filters (trigger). Horizontally scrollable on mobile.
3. **"All filters" side sheet** (Vaul drawer — right edge desktop, bottom mobile) with sections:
   - Trust & responsiveness (Verified, Responds, Cash-friendly toggles)
   - Price (band chips + free-form min/max)
   - Languages spoken (multi-select chip group)
   - Experience (years dropdown: 1+ / 3+ / 5+ / 10+ years)
   - Event types served (multi-select chip group)
   - Category-specific (conditional, only when search pill has a Category set — Photography style, Mehndi style, etc.)
4. **Sticky footer in sheet**: "Clear all" link on left, "Show N vendors" ink CTA on right with live count (debounced fetch as filters change).
5. **Sidebar removed.** `/vendors` grid becomes full-width inside the page container.
6. **URL state**: every filter serializes to URL params (`?verified=1&respondsIn=24&priceMin=…&priceMax=…&lang=hindi,urdu&years=5&events=wedding,reception&style=traditional`). Refresh = same filter state. Shareable link = same filter state.
7. **Three new vendor-profile fields** via DB migrations + onboarding wizard step additions:
   - `languages text[]` — multi-select at onboarding
   - `years_in_business int` — number input at onboarding
   - `response_sla_hours int` (1, 4, 24, 48, 72) — single-select at onboarding
     All required for **new vendors**; **existing vendors** get an optional backfill prompt on next dashboard visit (don't block them from operating).
8. **Accessible**: chip = button with `aria-pressed` (toggle) or `aria-expanded` (dropdown); sheet = `role="dialog"` with focus trap + Esc to close; chip row keyboard-navigable; `prefers-reduced-motion` honored.

### Acceptance criteria

- Couple lands on `/vendors`, sees the chip row immediately under the sticky search pill. Clicks "Verified" → URL becomes `?verified=1` + grid re-fetches showing only verified vendors. Chip turns ink-filled.
- Clicks "Price" dropdown → small panel docks below the chip with 4 band options (Budget / Mid / Premium / Luxury). Clicks "Premium" → chip becomes "Price · $$$" + URL becomes `?priceBand=premium`.
- Clicks "All filters" → side sheet slides in from right with all sections + live count "Show 142 vendors" in sticky footer. Toggles Verified + selects Hindi/Urdu in Languages → count drops to "Show 38 vendors" live. Clicks "Show 38 vendors" → sheet closes + URL contains all filters + grid shows the 38.
- On 375px mobile: chip row scrolls horizontally. Tapping "All filters" opens a bottom sheet with the same sections, sticky footer at the bottom.
- A new vendor running through onboarding sees 3 new steps (Languages multi-select, Years in business, Response SLA). All three are required — Next button disabled until selected.
- An existing vendor visiting their dashboard sees a one-time "Complete your profile" banner pointing at the 3 new fields. Dismissable. Doesn't block operation.

### Out of scope (deferred)

| Area                                                              | Disposition                                                                                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service area / coverage filter                                    | Out — Illinois Desi vendors mostly travel metro-wide. Per-vendor coverage areas are a future PR if needed.                                                       |
| Computed actual-response-time                                     | Out Day-1. Stored SLA only. Once booking volume accumulates, a follow-up computes actual avg and demotes/flags vendors who consistently miss their declared SLA. |
| Sort control (sort by most-booked / newest / price low→high etc.) | Out — current `/vendors` is verified DESC + total_bookings DESC implicit sort. Sort chip is a future addition.                                                   |
| Saved filter sets                                                 | Out — no auth dependency yet.                                                                                                                                    |
| Filter analytics (most-used filters, abandonment)                 | Out.                                                                                                                                                             |
| Search-as-you-type within the Languages multi-select              | Out — 10 options is short enough to scan; typeahead would be feature creep.                                                                                      |
| Vendor's response-SLA verified-vs-declared mismatch dashboard     | Out — surfaces when there's real booking volume.                                                                                                                 |

## 2. Chip component API

### Props

```ts
type ChipVariant = 'toggle' | 'dropdown' | 'applied' | 'all-filters';

interface ChipProps {
  /** Visual + interaction variant. */
  variant?: ChipVariant; // default: 'toggle'
  /** Whether the chip is in its active state (ink-filled). Applies to toggle + dropdown. */
  isActive?: boolean;
  /** Inner label text. */
  children: React.ReactNode;
  /** Optional count badge (with-count chip — applies on top of toggle or dropdown). */
  count?: number;
  /** Called on click. For toggle: parent flips isActive. For dropdown: parent opens panel. */
  onClick?: () => void;
  /** Called when × is clicked on `applied` variant. */
  onRemove?: () => void;
  /** ID of the panel this chip controls (for aria-controls + aria-expanded on dropdown variant). */
  panelId?: string;
  /** Optional className override. */
  className?: string;
}
```

### Render contract

- **Toggle chip** (`variant="toggle"`): renders as `<button type="button" aria-pressed={isActive}>{children}</button>`. Click flips `isActive` in parent. Default = outline, active = ink fill + cream text.
- **Dropdown chip** (`variant="dropdown"`): renders as `<button aria-expanded={isActive} aria-controls={panelId}>{children}<Chevron /></button>`. Click toggles the panel. `isActive` here means "panel-open OR value-selected" — parent decides.
- **With-count** (any variant + `count` prop): adds an indigo badge after children showing the count. Badge swaps to cream-on-ink when chip is active.
- **Applied** (`variant="applied"`): renders as `<button>{children}<XButton onClick={onRemove} /></button>`. Cream-soft fill, ink border. The × is a focusable nested button.
- **All-filters** (`variant="all-filters"`): renders as `<button>` with a filter-bars icon prefix + "All filters" label. Always ink border, indicates it opens the sheet.

## 3. Anatomy

```
┌────────────────────────────────────────────────────────────────────┐
│  STICKY BAND (above /vendors grid)                                  │
│  [search pill — When/Cat/What + orb] (from PR #18)                  │
│  ─ Filter chip row ──────────────────────────────────────────────   │
│  [Verified ✓] [Responds] [Price ▾] [Cash-friendly] [Languages ▾³] ◯│
│                                                       [All filters] │
└────────────────────────────────────────────────────────────────────┘
[full-width vendor grid below]
```

- **Pill chip**: `inline-flex`, `rounded-full`, `bg-cream`, `border border-hairline`, 32px tall, 8/14px padding.
- **Active state**: `bg-ink text-cream border-ink`.
- **Hover** (non-active): `border-ink`.
- **Disabled** (rare): `opacity-40 pointer-events-none cursor-not-allowed`.
- **Focus**: `2px outline in colors.indigo at 2px offset`.

## 4. Default chip row content

| Order | Chip           | Variant                                        | URL param          | Backing data                               |
| ----- | -------------- | ---------------------------------------------- | ------------------ | ------------------------------------------ |
| 1     | Verified       | toggle                                         | `?verified=1`      | `vendor_profiles.verified` ✅              |
| 2     | Responds < 24h | toggle                                         | `?respondsIn=24`   | `vendor_profiles.response_sla_hours` (new) |
| 3     | Price          | dropdown (opens 4-band panel)                  | `?priceBand=mid`   | `vendor_packages_price_band` ✅            |
| 4     | Cash-friendly  | toggle                                         | `?cashFriendly=1`  | `vendor_profiles.payment_mode = 'cash'` ✅ |
| 5     | Languages      | with-count dropdown (opens multi-select panel) | `?lang=hindi,urdu` | `vendor_profiles.languages` (new)          |
| 6     | All filters    | trigger                                        | n/a (opens sheet)  | n/a                                        |

**Dropdown chips (#3, #5) open a small docked panel** below the chip — same pattern as the search bar's segment panels. Panel docks to the chip's left edge, 240–280px wide, animates fade-in over `motion.fast` (200ms).

**Click-outside on dropdown panel**: closes the panel. **Esc**: closes the panel. (Same pattern as search bar.)

**Chip row sticky behavior**: lives inside the same sticky band as the search pill (per PR #18 sticky-header). The whole band sticks to `top-16` (below the navbar) on scroll.

## 5. "All filters" sheet layout

### Surface

- **Desktop**: Vaul `Drawer` from the right edge, 480px wide, full viewport height.
- **Mobile (<md)**: Vaul `Drawer` from the bottom, ~85vh height, drag-to-close enabled.
- **Backdrop**: `colors.scrim` (ink at 50%).
- **Open animation**: `320ms` slide-in, `motion.ease-out`.
- **Close**: × button in header · click backdrop · Esc · `Show N vendors` footer CTA.

### Sections (top → bottom)

1. **Trust & responsiveness**
   - Toggle row: "Verified vendors only" → `verified=1`
   - Toggle row: "Responds within 24 hours" → `respondsIn=24` (also exposes Within 1h / 4h / 24h / 48h / 72h as a secondary dropdown for power-users — defer if too much surface; Day-1 just the single 24h toggle)
   - Toggle row: "Cash-friendly payments" → `cashFriendly=1`

2. **Price**
   - 4-chip band selector (Budget / Mid / Premium / Luxury) — single-select → `priceBand=mid`
   - OR free-form min/max inputs → `priceMin=2500&priceMax=8000`
   - If band selected, min/max greys out and shows the band's derived range as placeholder. If min/max set, band selection clears.

3. **Languages spoken**
   - Multi-select chip group (10 options): Hindi · Urdu · Punjabi · Bengali · Gujarati · Tamil · Telugu · Marathi · Arabic · English
   - Selected → `lang=hindi,urdu,punjabi` (comma-separated, sorted alphabetically for URL stability)

4. **Experience**
   - Single-select dropdown: 1+ years / 3+ years / 5+ years / 10+ years → `years=5`
   - Vendors with `years_in_business >= filter_value` match.

5. **Event types served**
   - Multi-select chip group: Wedding ceremony · Reception · Sangeet · Mehndi · Baraat · Engagement
   - → `events=wedding,reception,sangeet`
   - Backing data: TBD — could be `vendor_profiles.event_types text[]` (new field?) or derived from package metadata. **Decision: defer the event-types DB field; ship as a placeholder UI for Day-1 that doesn't actually filter.** Add real backing in a follow-up PR. (Adding a 4th onboarding field this PR is too much.)

6. **Category-specific** (conditional — only renders when search pill has a Category set)
   - **Photography style** (multi-select): Candid · Traditional · Fine art · Documentary → `style=traditional,candid`
   - **Mehndi style** (multi-select): Traditional · Modern · Arabic
   - **Catering** (toggles): Halal · Jain · Vegan · Vegetarian
   - **DJ** (multi-select): Bollywood · EDM · Bhangra · Top 40 · International
   - **Venues** (toggles + range): Wheelchair accessible · Capacity range
   - Backing data: TBD. **Decision: defer all category-specific backing for Day-1.** Ship as UI placeholder; activate per-category as data lands. Each becomes a follow-up PR.

### Sticky footer

- **Left**: "Clear all" link (text link, ink color, underline on hover). Clears all URL params.
- **Right**: ink primary button "Show N vendors" — N is the live count from a debounced count query (`/api/vendors/count?<current filter params>`). Clicking the button closes the sheet + applies the filters (URL update + grid re-fetch).

### Live count debounce

- 300ms debounce on filter changes inside the sheet
- During fetch: button shows spinner + "Show vendors" (no number)
- On result: button text updates to "Show N vendors"
- On 0 vendors: button text becomes "No matches" + disabled state

## 6. Mobile behavior

- **Chip row**: full-width horizontal-scroll container (`overflow-x: auto`), no scroll-snap (chips don't need centering). Padding-left/right matches the page gutter so the first/last chips don't clip.
- **Hides scrollbar** via `scrollbar-width: none` + `-ms-overflow-style: none` + `::-webkit-scrollbar { display: none }`.
- **"All filters" trigger** stays at the END of the scroll — user has to scroll the chip row to reach it (or we sticky-pin it to the right; Day-1 = scroll).
- **Sheet on mobile**: Vaul bottom drawer, ~85vh, drag-handle at top, sections stacked vertically (same content as desktop), sticky footer at bottom.

## 7. URL state contract

All filter state lives in URL params. Read on page mount + after every chip/sheet change.

| Param                      | Format                                                 | Example                             |
| -------------------------- | ------------------------------------------------------ | ----------------------------------- |
| `verified`                 | `1` or absent                                          | `?verified=1`                       |
| `respondsIn`               | hours int (1,4,24,48,72)                               | `?respondsIn=24`                    |
| `cashFriendly`             | `1` or absent                                          | `?cashFriendly=1`                   |
| `priceBand`                | one of `budget`/`mid`/`premium`/`luxury`               | `?priceBand=premium`                |
| `priceMin`                 | cents int                                              | `?priceMin=250000`                  |
| `priceMax`                 | cents int                                              | `?priceMax=800000`                  |
| `lang`                     | comma-separated lowercase slugs, alphabetically sorted | `?lang=hindi,punjabi,urdu`          |
| `years`                    | int (years_in_business >= this)                        | `?years=5`                          |
| `events`                   | comma-separated lowercase slugs                        | `?events=reception,sangeet,wedding` |
| (category-specific params) | each filter gets its own param key                     | `?style=candid,traditional`         |

**On `/vendors` page load**: `searchParams` is read server-side, passed to the Supabase query for filtering, AND mirrored into the chip + sheet UI state for visual feedback.

**On filter change**: `router.push('/vendors?<merged params>')` — re-fetches the page server-side with new filters. (Not `router.replace` — we want browser-back to undo a filter step.)

**Pagination reset**: any filter change clears the `?page=N` param (per existing FilterSidebar pattern at `updateFilters('page', delete)`).

## 8. Tokens used

All from DESIGN.md / Tailwind config.

| Token                   | Used by                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `colors.cream`          | chip bg, sheet bg, panel bg                                  |
| `colors.cream-soft`     | applied-chip fill, hover state on light chips                |
| `colors.ink`            | active chip fill, label text, sheet header text              |
| `colors.ink-muted`      | inactive chip label (subtle), help text in sheet             |
| `colors.hairline`       | chip border, section separators, sheet border                |
| `colors.indigo`         | with-count badge bg, focus rings                             |
| `colors.scrim`          | sheet backdrop                                               |
| `radii.full`            | chips, applied × button                                      |
| `radii.lg`              | sheet rounding (top corners on mobile, left edge on desktop) |
| `radii.md`              | price-input fields, primary CTA                              |
| `motion.fast` (200ms)   | dropdown panel fade                                          |
| `motion.medium` (320ms) | sheet open/close                                             |
| `motion.ease-out`       | every transition                                             |

Reuses the locked `Button` primitive for the sheet's "Show N vendors" footer CTA (variant=primary size=md).

## 9. Implementation approach

### File structure

| File                                                                      | Action     | Responsibility                                                                                                                                                                              |
| ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/filters/Chip.tsx`                             | **Create** | Chip primitive — 5 variants via `variant` prop. Pure presentational.                                                                                                                        |
| `src/components/marketplace/filters/FilterChipRow.tsx`                    | **Create** | The chip row on `/vendors`. Composes Chip + dropdown panels for Price + Languages.                                                                                                          |
| `src/components/marketplace/filters/AllFiltersSheet.tsx`                  | **Create** | Vaul drawer + all sections + sticky footer with live count.                                                                                                                                 |
| `src/components/marketplace/filters/sections/TrustSection.tsx`            | **Create** | Verified / Responds / Cash-friendly toggle rows.                                                                                                                                            |
| `src/components/marketplace/filters/sections/PriceSection.tsx`            | **Create** | Band chips + min/max inputs.                                                                                                                                                                |
| `src/components/marketplace/filters/sections/LanguagesSection.tsx`        | **Create** | Multi-select chip group (10 languages).                                                                                                                                                     |
| `src/components/marketplace/filters/sections/ExperienceSection.tsx`       | **Create** | Years dropdown.                                                                                                                                                                             |
| `src/components/marketplace/filters/sections/EventTypesSection.tsx`       | **Create** | Multi-select chip group (placeholder filter — no backing this PR).                                                                                                                          |
| `src/components/marketplace/filters/sections/CategorySpecificSection.tsx` | **Create** | Conditional render based on URL `?category=`. Placeholder content this PR.                                                                                                                  |
| `src/components/marketplace/filters/use-filter-state.ts`                  | **Create** | Custom hook for filter state + URL serialization. Mirror of `use-search-state.ts`.                                                                                                          |
| `src/components/marketplace/filters/constants.ts`                         | **Create** | LANGUAGES list, EVENT_TYPES list, RESPONDS_OPTIONS, YEARS_OPTIONS, PRICE_BANDS.                                                                                                             |
| `src/components/marketplace/FilterSidebar.tsx`                            | **Delete** | Replaced by the chip row. Update any remaining imports (probably none — only `/vendors/page.tsx`).                                                                                          |
| `src/app/(marketplace)/vendors/page.tsx`                                  | **Modify** | Remove `<FilterSidebar />`, add `<FilterChipRow />` to the sticky band; remove sidebar layout grid; widen vendor grid to full container width. Add new filter params to the Supabase query. |
| `src/app/api/vendors/count/route.ts`                                      | **Create** | New API route returning `{ count: number }` for the live-count footer. Accepts same params as the main page query.                                                                          |
| `src/lib/vendor-filters.ts`                                               | **Create** | Shared filter→Supabase-query function. Used by both `vendors/page.tsx` and `api/vendors/count/route.ts` so the SAME filter logic produces both the rendered grid + the count.               |

### Onboarding wizard updates (Sub-project B)

`src/components/onboarding/wizard/*` — three new steps (positioned between existing steps; exact order TBD by wizard author):

1. **Languages step** — multi-select chip group, must select ≥1 language. Writes to `vendor_profiles.languages`.
2. **Years in business step** — number input with helper text ("approximate is fine"). Min 0, max 99. Writes to `vendor_profiles.years_in_business`.
3. **Response SLA step** — single-select radio group: "Within 1 hour / 4 hours / 24 hours / 48 hours / 72 hours". Writes to `vendor_profiles.response_sla_hours`.

All three required (Next button disabled until set) for new vendors.

**Existing vendor backfill** — on first dashboard visit after this PR ships, show a dismissable banner: "Help couples find you — add languages, years in business, and your response time" with a link to a `/dashboard/profile/setup?backfill=true` page that walks through just the 3 new steps. Banner stored in `users.profile_backfill_dismissed_at`.

### DB migrations

`supabase/migrations/0003X_vendor_profile_filter_fields.sql`:

```sql
ALTER TABLE vendor_profiles
  ADD COLUMN languages text[] DEFAULT NULL,
  ADD COLUMN years_in_business int CHECK (years_in_business >= 0 AND years_in_business <= 99),
  ADD COLUMN response_sla_hours int CHECK (response_sla_hours IN (1, 4, 24, 48, 72));

CREATE INDEX idx_vendor_profiles_languages ON vendor_profiles USING GIN (languages);
CREATE INDEX idx_vendor_profiles_response_sla ON vendor_profiles (response_sla_hours);
```

GIN index on `languages` for efficient `?lang=hindi,urdu` filters (array overlap query). B-tree on `response_sla_hours` for `<=` comparisons.

Backfill: existing vendors get NULL for all three. NULLs are excluded from filter matches (e.g. `languages @> ARRAY['hindi']` excludes NULLs).

Existing `users.profile_backfill_dismissed_at` column add — separate small migration or bundled.

## 10. Migration plan

### `/vendors/page.tsx` layout change

**Before:**

```tsx
<div className="grid grid-cols-[240px,1fr] gap-8">
  <FilterSidebar />
  <VendorGrid vendors={...} />
</div>
```

**After:**

```tsx
<div className="sticky top-16 ...">
  <SearchBar variant="sticky-header" initialCategory={...} />
  <FilterChipRow /> {/* new */}
</div>
<VendorGrid vendors={...} className="mt-6" /> {/* full-width */}
```

### Removing FilterSidebar

`grep -r "from '@/components/marketplace/FilterSidebar'"` first. Currently used by `/vendors/page.tsx` only (per the page read earlier). Delete the file once unmounted.

### Sub-project B wizard updates

Read the existing wizard at `src/components/onboarding/wizard/` and slot the 3 new steps in. Match existing step component pattern.

## 11. Accessibility

- **Chip**: `<button>` with `aria-pressed` (toggle), `aria-expanded` + `aria-controls` (dropdown), `aria-label` if children are icon-only.
- **Applied × button**: nested `<button aria-label="Remove {label} filter">`. Tab moves to chip; Tab again moves to ×. Enter on chip = no-op (or focus its filter section?). Enter on × = remove.
- **Dropdown panel**: `role="dialog" aria-modal="false"`, traps Tab when open, Esc closes + returns focus to the chip.
- **Sheet**: `role="dialog" aria-modal="true"`, focus trap (Vaul handles), Esc closes, returns focus to "All filters" trigger.
- **Live count**: `aria-live="polite"` on the footer CTA — screen readers announce count changes.
- **Chip row scrollable on mobile**: `tabindex={0}` on the scroll container so keyboard users can arrow-scroll.
- **`prefers-reduced-motion`**: panel + sheet animations disabled (instant show/hide).
- **Color contrast**: chip ink-on-cream-soft (applied) ~12:1 ✓. Active chip cream-on-ink ~14.5:1 ✓.

## 12. DESIGN.md updates

Add to `components:` block in frontmatter:

```yaml
filter-chip:
  pattern: '5 variants — toggle, dropdown, with-count, applied-removable, all-filters trigger'
  surface: '32px tall, pill-shaped (radii.full), ink fill on active, cream-soft fill on applied'
  interaction: 'Toggle = aria-pressed click flip. Dropdown = aria-expanded + docked panel (same as search bar). Applied = nested × button removes filter.'
  motion: '180ms hover bg, 200ms panel fade-in (motion.fast)'
  accessibility: 'WCAG AA on all variant×state combos. Sheet uses focus trap; chip row keyboard-navigable.'
filter-sheet:
  pattern: 'Vaul side drawer (right desktop, bottom mobile) with sectioned filters + live-count footer CTA'
  sections: 'Trust · Price · Languages · Experience · Event types · Category-specific (conditional)'
  footer: "Sticky — Clear-all link left, ink primary 'Show N vendors' CTA right with debounced live count"
  motion: '320ms slide-in/out (motion.medium)'
```

## 13. Testing

Per codebase convention (no React component test infra), validation = TypeScript compile + lint + Playwright visual screenshots:

- Chip row default state (all chips inactive)
- Chip row with 2 active filters (Verified + Cash-friendly)
- Dropdown chip open (Price panel docked)
- "All filters" sheet open with several filters set + footer count visible
- Mobile (375px): chip row horizontal scroll + bottom sheet open
- URL pre-fill: `/vendors?verified=1&priceBand=premium&lang=hindi,urdu` → chip row reflects state, grid shows filtered vendors

Future (when test infra ships): unit-test `use-filter-state.ts` URL serialization round-trip; unit-test `vendor-filters.ts` Supabase query builder against fixture data.

## 14. Out of scope (same as Goals §1)

See §1 Out of Scope. Most notable:

- Service area / coverage filter — not relevant for Day-1
- Computed actual-response-time — Day-1 is self-declared SLA only
- Sort control — current implicit sort stays
- Event types real backing — UI placeholder only; data backing is follow-up PR
- Category-specific sections real backing — UI placeholders only; activate per-category as backing data lands

## 15. Related

- [`DESIGN.md`](../../../DESIGN.md) — palette, motion, button + tooltip + search-bar primitives this composes on
- [Button design spec](./2026-05-23-baazar-button-design.md) — the "Show N vendors" footer CTA uses the locked primary button
- [Search bar design spec](./2026-05-23-baazar-search-bar-design.md) — chip row + dropdown panels mirror the search-bar segment-panel pattern
- [Sub-project B onboarding wizard](../../sub-project-b-vendor-onboarding-wizard-design.md) — receives 3 new step additions
- Brainstorm files: `filter-chip-variants.html`, `filter-sheet-layout.html` in `.superpowers/brainstorm/55066-1779426490/content/`
