# Baazar Search Bar — Component Design

## 0. Status

- **Type**: Component-level design. Item #2 of 6 in the Day-1 brand component queue.
- **Origin**: Brand brainstorm 2026-05-23. Builds on the locked button + tooltip primitives (see [`2026-05-23-baazar-button-design.md`](./2026-05-23-baazar-button-design.md)).
- **Build approach**: Rewrite `src/components/marketplace/SearchBar.tsx` from a single text input to a segmented Airbnb-style pill with 3 segments (When / Category / What) + submit orb. Split into focused sub-components for the segments + pickers. Add Vaul for the mobile bottom sheet. Single PR.
- **Branch**: `feat/baazar-search-bar` (per AGENTS.md workflow rule).
- **Sequencing**: Unblocks filter chips (#3) and the vendor card layout (#4). Most consumers of `Button` outside the homepage hero live on `/vendors` page — the sticky header variant of this search bar will live there.

## 1. Goals

Ship the canonical Baazar search interface — a segmented pill that funnels couples from "I'm looking" to "I've filtered to candidates" in three clicks or fewer. Replaces the current single-text-input `SearchBar`.

### Success criteria

1. **Segmented pill** with three segments (`When` / `Category` / `What`) plus a submit orb on the right. Each segment shows a label (uppercase 10px) + a current value (13px ink-muted).
2. **Click-to-activate interaction**: clicking a segment activates it (ink-inset ring + cream-soft fill + shadow) and docks a focused picker panel below. Click outside or hit `Esc` to close.
3. **Three pickers** built per segment:
   - **When** = react-day-picker (already in repo, restyled to M+ tokens). Single date select; past dates disabled.
   - **Category** = vertical list of vendor categories (Photography, Videography, Mehndi/Henna, Hair & Makeup, DJ & Music, Photo Booth, Catering, Venue, Decor & Floral, Invitations) with icons. Single-select.
   - **What** = free-text input with typeahead suggestions (popular queries + matching vendor names). Hooks into the existing AI semantic search backend at submit time.
4. **Submit orb** = circular ink-fill button (44px) using the locked button hover treatment (-1px lift + shadow + slight darken). Submits → navigates to `/vendors` with URL params (`?date=YYYY-MM-DD&category=photography&q=Bollywood+DJ`).
5. **Two variants of the same component**:
   - **`hero`**: large (64px segment height), centered, max-width 720px, `elevation.one` shadow. Lives in the homepage hero.
   - **`sticky-header`**: smaller (52px segment height), full-width inside `/vendors` page container, sticks to top of viewport on scroll (no shadow until scrolled).
6. **Mobile**: collapses to a single tappable "Search Chicago weddings" bar → opens a Vaul bottom sheet with the 3 segments stacked vertically + sticky ink "Search" button at the bottom. Tap any segment to expand its picker inline within the sheet.
7. **URL-param sync**: when landing on `/vendors?date=…&category=…&q=…`, the pill pre-fills with those values. Submitting updates URL params without a full reload (Next.js `router.push` with shallow routing).
8. **Backwards compat**: the existing API surface (`<SearchBar />` with no required props) must still work — both current consumer files (`page.tsx`, `vendors/page.tsx`) keep working without code changes, just rendering the new pill instead of a single input.
9. **Accessibility**: full keyboard navigation (Tab between segments, Enter to activate, arrow keys within pickers, Esc to close), visible focus rings (indigo per locked button), `aria-expanded` on segment triggers, `aria-controls` linking to panel IDs, `prefers-reduced-motion` honored.

### Acceptance criteria

- Couple lands on homepage, sees the large pill in the hero. Clicks "When", picks Oct 17 2026 from the docked calendar. The pill now shows "Oct 17 2026" in the When segment. Clicks "Category", picks Photography. Clicks "What", types "Bollywood DJ wedding." Clicks the ink orb. Routed to `/vendors?date=2026-10-17&category=photography&q=Bollywood+DJ+wedding` with the smaller sticky pill at the top pre-filled with the same values.
- Same flow on a 375px-wide phone: tap "Search Chicago weddings" → Vaul sheet opens → tap "When" → calendar expands inline → pick date → tap "Category" → pick → tap "What" → type → tap "Search" → routed.
- Old `<SearchBar />` consumers render without code changes.

### Out of scope (deferred)

| Area                                                                         | Disposition                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Date-range selection (multi-day venues that need setup days)                 | Out — single date Day 1. Range mode is a `<WhenPicker mode="range" />` future prop.                              |
| Multi-category select                                                        | Out — single category. Power users can re-search.                                                                |
| Saved searches / recent searches                                             | Out — no auth dependency yet.                                                                                    |
| Voice search                                                                 | Out.                                                                                                             |
| Map-based "where" filter                                                     | Out — Chicago-only at launch (the segment was dropped per brainstorm).                                           |
| Server-side typeahead suggestions API                                        | Out — Day 1 uses a static `POPULAR_QUERIES` list. Hooking up to a `/api/search/suggest` endpoint is a follow-up. |
| Real-time inline search results (search-as-you-type)                         | Out — submit triggers nav to `/vendors`.                                                                         |
| AI query parsing in the URL (e.g., LLM extracting date from "next Saturday") | Out — date stays as ISO YYYY-MM-DD in URL. AI happens at the `/api/ai/search` layer on the `/vendors` page.      |
| Persistent navbar mini-search                                                | Out. Pill lives in hero + `/vendors` header only.                                                                |

## 2. Component API

### Props

```ts
type SearchBarVariant = 'hero' | 'sticky-header';

interface SearchBarProps {
  /** Visual size variant. 'hero' = large 64px segments; 'sticky-header' = smaller 52px segments. */
  variant?: SearchBarVariant; // default: 'hero'
  /** Optional initial values (used by /vendors page to pre-fill from URL params). */
  initialDate?: string; // ISO YYYY-MM-DD
  initialCategory?: string; // slug, e.g. 'photography'
  initialQuery?: string;
  /** Optional className override (the outer pill wrapper). */
  className?: string;
}
```

### Default render

`<SearchBar />` renders the hero variant with empty state — matches the current homepage usage.

### URL contract

| Param      | Format                       | Example                                             |
| ---------- | ---------------------------- | --------------------------------------------------- |
| `date`     | ISO YYYY-MM-DD               | `?date=2026-10-17`                                  |
| `category` | slug (lowercase, hyphenated) | `?category=photography` or `?category=mehndi-henna` |
| `q`        | URL-encoded free text        | `?q=Bollywood+DJ+wedding`                           |

All three params are optional. The `/vendors` page reads them via `useSearchParams()` and passes to the search service.

## 3. Anatomy

```
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────┬───────────────┬─────────────────────────────┬─┐  │
│  │ WHEN         │ CATEGORY      │ WHAT                        │ │  │
│  │ Pick a date  │ All vendors   │ "Bollywood DJ" or ...       │●│  │
│  └──────────────┴───────────────┴─────────────────────────────┴─┘  │
│        ↓                                                            │
│  [docked picker panel — only when a segment is active]              │
└────────────────────────────────────────────────────────────────────┘
```

- **Pill container**: `inline-flex`, `rounded-full` (9999px), `bg-cream`, `border border-hairline`, subtle shadow.
- **Segment**: vertical flex, label on top (`text-[10px] font-bold tracking-[0.12em] uppercase text-ink`), value below (`text-[13px] text-ink-muted`).
- **Segment separator**: 1px hairline vertical line. Disappears around an active segment (the active segment's ring overrides borders).
- **Active segment**: `box-shadow: inset 0 0 0 2px var(--ink)` + `bg-cream` + `0 4px 12px rgba(27,20,20,0.10)` lift shadow. `border-radius: 9999px` so the active inset ring is fully rounded.
- **Submit orb**: 44px circle, `bg-ink text-cream`, magnifying-glass icon (`lucide-react Search`), margin to inset slightly from pill edge. Hover: `-translate-y-[1px]` + shadow.
- **Panel**: `position: absolute`, top `+12px` below pill, `rounded-lg` (10px), `bg-cream`, `border border-hairline`, `elevation.one` shadow. Width per segment (see §5).

## 4. Per-segment specs

### `When` segment

- **Label**: "When"
- **Empty value**: "Pick a date"
- **Filled value**: localized short date, e.g. "Oct 17 2026" (use `Intl.DateTimeFormat` with `{ month: 'short', day: 'numeric', year: 'numeric' }`)
- **Panel**: 320px wide, contains a styled `react-day-picker` instance
- **Picker behavior**: single date select, `disabled={{ before: new Date() }}` (no past dates), `weekStartsOn: 0` (Sunday — US convention), month nav with prev/next chevron buttons
- **Styling**: cells use M+ tokens — selected cell = `bg-ink text-cream`, hover = `bg-cream-soft`, today = subtle haldi underline, disabled past dates = `opacity-30`
- **On select**: close panel, update pill value, advance focus to next empty segment

### `Category` segment

- **Label**: "Category"
- **Empty value**: "All vendors"
- **Filled value**: the category label (e.g. "Photography")
- **Panel**: 260px wide, vertical scrollable list of categories with icons
- **Category list** (static for Day 1):
  ```ts
  const CATEGORIES = [
    { slug: 'all', label: 'All vendors', icon: Grid },
    { slug: 'photography', label: 'Photography', icon: Camera },
    { slug: 'videography', label: 'Videography', icon: Video },
    { slug: 'mehndi-henna', label: 'Mehndi / Henna', icon: Sparkles },
    { slug: 'hair-makeup', label: 'Hair & Makeup', icon: Scissors },
    { slug: 'dj-music', label: 'DJ & Music', icon: Music },
    { slug: 'photo-booth', label: 'Photo Booth', icon: Camera },
    { slug: 'catering', label: 'Catering', icon: ChefHat },
    { slug: 'venue', label: 'Venue', icon: Building2 },
    { slug: 'decor-floral', label: 'Decor & Floral', icon: Flower2 },
    { slug: 'invitations', label: 'Invitations', icon: Mail },
  ];
  ```
- **Item layout**: icon (28×28 with cream-soft tile + ink stroke) + label, 10px padding, 6px gap. Hover: `bg-cream-soft`. Selected: `bg-cream-soft` + `font-medium`.
- **On select**: close panel, update pill, advance focus to next segment

**Source of truth for categories**: this list duplicates whatever the backend `vendor_profiles.category` enum allows. If the enum drifts, this list drifts. Worth a follow-up to derive from a single shared constant (e.g. `src/lib/constants/categories.ts`) but not blocking for Day 1.

### `What` segment

- **Label**: "What"
- **Empty value**: italic placeholder `"Bollywood DJ" or "Mehndi artist near downtown"`
- **Filled value**: the typed query, ink color, non-italic
- **Panel**: 340px wide, contains:
  1. Free-text `<input>` at the top (mounted with `autoFocus`)
  2. Section label "Popular" + ~5 static popular queries
  3. (Future) Section label "By vendor" + dynamic vendor-name matches
- **Static popular queries** (Day 1):
  ```ts
  const POPULAR_QUERIES = [
    'South Asian wedding photographer',
    'Bollywood DJ in Chicago',
    'Mehndi artist near downtown',
    'Hindu wedding venue with mandap',
    'Halal catering for 200 guests',
  ];
  ```
- **Typing behavior**: live filter the static `POPULAR_QUERIES` list as user types (`.filter(q => q.toLowerCase().includes(input.toLowerCase()))`). Show 0-5 matches.
- **On select** (click suggestion OR Enter): close panel, update pill, focus orb
- **On Enter without selection**: take the raw typed value, close panel, focus orb

## 5. Interaction model — desktop

- **Default state**: pill visible, no active segment, no panel.
- **Click segment**: that segment becomes `active` (ink-inset ring + cream-soft + shadow). Adjacent separators fade to `transparent`. Picker panel slides in below over `200ms` (`opacity 0 → 1` + `translateY(-4px) → 0`).
- **While active**: clicking inside the panel does NOT close it. Clicking outside the pill+panel cluster closes the active segment. `Esc` also closes.
- **Switch segments**: clicking a different segment seamlessly transfers active state (no close-then-open flash).
- **Tab navigation**: Tab moves between segments. Inside an active panel, Tab moves through its focusable elements. Shift+Tab works in reverse.
- **Submit**: clicking the orb OR pressing Enter while a segment is active and panel is closeable submits. Builds URL params from current state (omitting empty ones) and `router.push('/vendors?…')`.

## 6. Mobile — Vaul bottom sheet

- **Collapsed**: instead of the pill, render a single tappable bar styled like a primary outline button (`bg-cream border border-hairline rounded-full px-5 py-3 text-ink-muted`) with text "Search Chicago weddings" and a Search icon on the left. Full-width within the container.
- **On tap**: opens a Vaul `Drawer` from the bottom. Drawer height: ~75vh, draggable to close.
- **Sheet content**:
  - Drag handle at top (Vaul default)
  - Section: "When" — label + tap-to-expand inline date picker (collapsed by default if empty)
  - Section: "Category" — label + tap-to-expand inline category list (collapsed by default if empty)
  - Section: "What" — label + always-visible text input + suggestions below
  - Sticky footer: full-width ink `<Button variant="primary">Search</Button>` (uses our locked button component)
- **On submit**: dismiss sheet, navigate as desktop.

### Vaul integration

- Install `vaul` (~14KB gzipped). Wrap in a thin `<MobileSheet>` internal component so the search bar doesn't directly depend on Vaul's API surface.
- Use Vaul's `shouldScaleBackground` for the iOS-style background scale effect — matches the editorial-commerce premium feel.

## 7. Variants

### `hero` variant (default)

- Segments: 64px tall (`h-16`)
- Pill: max-width 720px, centered (`mx-auto`)
- Shadow: `elevation.one` always
- Used in: `src/app/(marketplace)/page.tsx`

### `sticky-header` variant

- Segments: 52px tall (`h-[52px]`)
- Pill: full-width within `/vendors` page container (`max-w-7xl`), but pill itself can be `max-w-2xl` centered or full-width — design call. **Default: pill stays the same max-width-720 centered look, just shorter**.
- Sticky: `position: sticky; top: var(--navbar-height, 64px); z-index: 30`
- Shadow: none by default, `elevation.one` once `scrollY > 100` (toggle via IntersectionObserver or scroll listener)
- Used in: `src/app/(marketplace)/vendors/page.tsx` (replacing the current `<SearchBar />` mount)

## 8. Tokens used

All from DESIGN.md / Tailwind config — no magic numbers.

| Token                   | Used by                                                 |
| ----------------------- | ------------------------------------------------------- |
| `colors.cream`          | pill bg, panel bg, orb text, mobile sheet bg            |
| `colors.cream-soft`     | active segment fill, hover state, picker cell hover     |
| `colors.ink`            | label text, orb fill, picker selected cell, active ring |
| `colors.ink-muted`      | empty values, secondary text inside panels              |
| `colors.ink-soft`       | placeholder italic in What segment                      |
| `colors.hairline`       | pill border, separators, panel border                   |
| `colors.hairline-soft`  | category icon tile bg                                   |
| `colors.indigo`         | focus rings on inputs + segments                        |
| `colors.haldi`          | "today" date marker (subtle 1px underline)              |
| `radii.full` (9999px)   | pill rounding, active segment ring, orb                 |
| `radii.lg` (10px)       | panel rounding, mobile sheet rounding                   |
| `radii.sm` (4px)        | date picker cells, category list items                  |
| `motion.fast` (200ms)   | panel open/close fade                                   |
| `motion.medium` (320ms) | sheet open/close                                        |
| `motion.ease-out`       | every transition                                        |
| `elevation.one`         | hero pill, panel, scrolled sticky header                |

## 9. Implementation approach

### File structure

| File                                                      | Action                 | Responsibility                                                                                                                               |
| --------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/SearchBar.tsx`                | **Rewrite**            | The pill orchestrator. Owns active-segment state, URL-param sync, submit. Renders desktop pill OR mobile bar based on viewport.              |
| `src/components/marketplace/search/SegmentButton.tsx`     | **Create**             | The clickable segment trigger (label + value + active state). Pure presentational.                                                           |
| `src/components/marketplace/search/WhenPicker.tsx`        | **Create**             | Date picker (react-day-picker wrapped + M+ styled).                                                                                          |
| `src/components/marketplace/search/CategoryPicker.tsx`    | **Create**             | Category list panel.                                                                                                                         |
| `src/components/marketplace/search/WhatPicker.tsx`        | **Create**             | Free-text + suggestions panel.                                                                                                               |
| `src/components/marketplace/search/MobileSearchSheet.tsx` | **Create**             | Vaul-based bottom sheet. Renders the 3 pickers stacked.                                                                                      |
| `src/components/marketplace/search/categories.ts`         | **Create**             | The static `CATEGORIES` constant + the `POPULAR_QUERIES` constant. Single source of truth used by both desktop pickers and the mobile sheet. |
| `src/components/marketplace/search/use-search-state.ts`   | **Create**             | Custom hook: holds `{ date, category, query, activeSegment }` state + `submit()` + URL-param read/write.                                     |
| `package.json` + `package-lock.json`                      | **Modified**           | Adds `vaul` dep.                                                                                                                             |
| `DESIGN.md`                                               | **Modify frontmatter** | Add `search-bar` entry to `components` block.                                                                                                |

### Key dependencies

| Dep                       | Status                          | Why                                                                                                                                                           |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-day-picker`        | ✅ already installed (^10.0.1)  | When picker                                                                                                                                                   |
| `lucide-react`            | ✅ already installed (^0.564.0) | Icons for categories + orb                                                                                                                                    |
| `next/navigation`         | ✅ built-in                     | `useRouter`, `useSearchParams`, `usePathname`                                                                                                                 |
| `vaul`                    | ❌ install                      | Mobile bottom sheet                                                                                                                                           |
| `@radix-ui/react-popover` | ❓ optional                     | Could use for desktop panels, but custom click-outside + absolute positioning is simpler. **Decision: skip Radix Popover, hand-build the panel positioning.** |

### Click-outside handling

Hand-built via `useEffect` + `mousedown` listener on `document`. Standard pattern; no extra dep needed.

### URL-param sync

In `use-search-state.ts`:

```ts
const router = useRouter();
const searchParams = useSearchParams();
const pathname = usePathname();

const submit = (state: SearchState) => {
  const params = new URLSearchParams();
  if (state.date) params.set('date', state.date);
  if (state.category && state.category !== 'all') params.set('category', state.category);
  if (state.query) params.set('q', state.query);
  const target = `/vendors${params.toString() ? `?${params.toString()}` : ''}`;
  router.push(target);
};

// On mount (sticky-header variant only), read params:
const initial = {
  date: searchParams.get('date') ?? '',
  category: searchParams.get('category') ?? '',
  query: searchParams.get('q') ?? '',
};
```

The `pathname` check (`pathname === '/vendors'`) determines whether to use shallow routing (already on /vendors → shallow update + re-fetch) or full nav (on homepage → real push).

## 10. Migration from existing SearchBar

The current `<SearchBar />` is used in two places:

- `src/app/(marketplace)/page.tsx` — homepage hero
- `src/app/(marketplace)/vendors/page.tsx` — `/vendors` page top

Both render with no required props. The new component preserves that — `<SearchBar />` defaults to `variant="hero"`. The `/vendors` mount should be updated to `<SearchBar variant="sticky-header" />` for the smaller sticky behavior. That's a 1-line change in `vendors/page.tsx`.

**Existing test selectors** (`data-testid="search-input"` and `search-button`) — preserve where reasonable:

- `data-testid="search-bar"` on the pill root
- `data-testid="search-orb"` on the submit button
- `data-testid="search-input-what"` on the What segment's input
- Drop the original IDs if no test depends on them; check `grep -r "search-input\|search-button" src/__tests__` before removing.

## 11. Accessibility

- **Pill role**: implicit (container of buttons + inputs)
- **Segment role**: `<button>` with `aria-expanded={isActive}` and `aria-controls="panel-when"` (or `-category` / `-what`)
- **Panel role**: `role="dialog"` with `aria-modal="false"` (it's a docked panel, not a modal), `id="panel-when"` etc.
- **Orb role**: `<button type="submit" aria-label="Search">` inside a `<form>`
- **Keyboard**:
  - Tab/Shift+Tab between segments
  - Enter or Space on segment opens its panel + focuses first focusable inside
  - Tab inside panel cycles its focusables; Shift+Tab on first focusable closes panel + returns focus to segment trigger
  - Esc closes active panel + returns focus to segment trigger
  - Arrow keys: in WhenPicker, native react-day-picker handles them; in CategoryPicker, Up/Down to navigate items, Enter to select
- **Focus rings**: indigo 2px outline at 2px offset (matches button focus pattern)
- **Screen reader announcements**:
  - On segment activate: panel content reads aloud
  - On selection: live region announces "Selected: Oct 17 2026" / "Selected: Photography" / etc.
- **`prefers-reduced-motion`**: panel open/close = instant show/hide (no fade or translate). Sheet open = no scale background effect.
- **Color contrast**: all states verified against WCAG AA (ink-on-cream 14.5:1, cream-on-ink same, ink-on-cream-soft ~12:1).

## 12. DESIGN.md updates

Add to `components:` block in frontmatter:

```yaml
search-bar:
  pattern: 'Segmented pill — When / Category / What + ink submit orb'
  interaction: 'Click segment → active state (ink-inset ring + cream-soft fill) + docked panel below. Click outside or Esc to close.'
  pickers: 'When = react-day-picker, Category = vertical list with icons, What = free-text + typeahead popular queries'
  variants: 'hero (64px segments, hero placement) and sticky-header (52px segments, sticky on /vendors)'
  mobile: "Collapses to single 'Search Chicago weddings' bar → Vaul bottom sheet with stacked sections + sticky ink Search button"
  submit: 'Always navigates to /vendors with URL params (?date=, ?category=, ?q=)'
  motion: '200ms panel fade-in, 320ms sheet open. -1px lift on orb hover (lighter than button -3px since orb is smaller)'
  accessibility: 'Full keyboard nav, aria-expanded + aria-controls on segments, role=dialog on panels, prefers-reduced-motion honored'
```

## 13. Testing

Per the codebase convention (no React component test infra yet), validation = TypeScript compile + lint + Playwright visual screenshots:

- Screenshot `/` (homepage hero with large pill, default state)
- Screenshot `/` with "When" hovered/clicked (calendar visible)
- Screenshot `/vendors` (sticky-header smaller pill, default state)
- Screenshot `/vendors?date=2026-10-17&category=photography&q=Bollywood+DJ` (URL pre-fill state — pill should show all three)
- Mobile viewport (375px) screenshot of the collapsed bar + opened sheet

Future (when React test infra exists): unit tests for `use-search-state.ts` (URL serialization round-trip), `SegmentButton` (active state classes), category picker (selection), what picker (typeahead filter).

## 14. Out of scope (deferred — same as Goals)

See §1 Out of Scope. Notable:

- Date range mode (single date Day 1)
- Server-side typeahead API
- Persistent navbar mini-search
- Real-time inline results

## 15. Related

- [`DESIGN.md`](../../../DESIGN.md) — palette M+, motion tokens, button pattern this composes on top of
- [`Button design spec`](./2026-05-23-baazar-button-design.md) — the submit orb uses the locked primary button hover treatment
- Sub-project G calendar — already added `react-day-picker` dep + has styling precedent
- Sub-project E vendor CRM — uses `/vendors` page; the sticky-header variant will be visible there
- Brainstorm files: `search-segments.html`, `search-interaction.html` in `.superpowers/brainstorm/55066-1779426490/content/`
