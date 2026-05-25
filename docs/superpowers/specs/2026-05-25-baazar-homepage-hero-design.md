# Baazar Homepage Hero + Category HoverExpand Design Spec

**Date:** 2026-05-25
**Component:** Homepage redesign — V2 asymmetric hero + `CategoryHoverExpand` strip (replaces `CategoryGrid`). First real production page using all locked foundation tokens.
**Status:** Approved direction; ready for implementation plan
**Branch:** `feat/baazar-homepage-hero`

---

## Goal

Replace the current `src/app/(marketplace)/page.tsx` hero + `CategoryGrid` block with the locked Direction V2 editorial layout (asymmetric type stack on the left + brand panel with Devanagari wordmark on the right) and a new `CategoryHoverExpand` component (adapted from Skiper UI's HoverExpand_001 pattern) that renders the 11 locked vendor categories as a horizontal expanding strip. Update the canonical vendor-category list to add 3 new categories (`bridal_wear`, `live_music`, `carts`) and add migration support so `vendor_profiles.category` CHECK constraint allows them. Leave `photobooth` and `invitations` in the DB (so existing rows survive) but exclude them from the featured homepage strip. **Bridal Wear, Decor, and Venue tiles all render with a "Coming Soon" treatment Day 1** — they're flagged as flat-fee directory categories (vendors have multi-SKU inventory or high-touch consultative sales models that don't fit commission), with that flat-fee listing infrastructure shipping in a future sub-project.

## Non-goals

- **The "Why Couples Trust Us" trust-signals section** (3 generic cards with lucide icons) — leave for a separate cleanup PR or eventual deletion. This PR is scoped to hero + category surface only.
- **The flat-fee business model for Bridal Wear + Decor + Venue** — flagged for a separate sub-project. Day 1, those three tiles say "Coming Soon." All three share the same business reason for flat-fee: multi-SKU inventory (Bridal Wear) or high-touch consultative sales (Decor, Venue) that don't translate to per-booking Stripe Connect commission.
- **Photo curation for the HoverExpand tiles** — Day 1 uses Unsplash stand-ins. Licensed/vendor-supplied photography lands in a follow-up PR.
- **Animated wordmark cycle in the hero right panel** — the footer carries the page's one animated cycle. The hero's right panel renders the wordmark static (Devanagari) with the 4-script glyph row below as a passive cultural signature. One brand-moment animation per page is enough.
- **CategoryGrid removal as a code surface** — we delete it because the homepage was its only call site. If a future page wants a category grid, it should consume the same `CATEGORIES_FEATURED` list as the HoverExpand.
- **`framer-motion` adoption beyond the HoverExpand** — adding it as a dependency is justified by this one component; we don't go retrofit other animations to use it in this PR.
- **Mobile redesign of the HoverExpand** — pattern doesn't translate cleanly to small screens. Mobile falls back to a simpler 2-col grid (per category, photo + name + count + tap-to-navigate).
- **Vendor-side migration of any existing `photobooth` or `invitations` vendors** — we leave the CHECK constraint permissive. Migration ADDS new values, never REMOVES.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Navbar (existing, unchanged)                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HERO — V2 asymmetric                                       │
│  ┌─────────────────────────────┬─────────────────────────┐  │
│  │ LEFT (1.5fr)                │ RIGHT (1fr)             │  │
│  │  - kicker                   │  (border-left hairline) │  │
│  │  - Spectral headline        │  - tagline              │  │
│  │    "All your vendors.       │  - Devanagari wordmark  │  │
│  │     One bazaar."            │    (static)             │  │
│  │  - subhead (Cultural haldi) │  - 4-script glyph row   │  │
│  │  - SearchBar (hero variant) │                         │  │
│  │  - dual CTAs                │                         │  │
│  └─────────────────────────────┴─────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  SECTION HEADER                                             │
│  "Browse by category" kicker                                │
│  "Every vendor your celebration needs." (display-sm)        │
│  subhead                                                    │
├─────────────────────────────────────────────────────────────┤
│  CATEGORYHOVEREXPAND                                        │
│  [tile][tile][tile][tile][tile][tile][tile][tile][tile][tile][tile]
│   ↑ all 11 categories, hover/click any to expand            │
│   ↑ Decor + Venue have "Coming Soon" treatment              │
├─────────────────────────────────────────────────────────────┤
│  Skiper UI attribution (small caption)                      │
├─────────────────────────────────────────────────────────────┤
│  Footer (shipped PR #21, unchanged)                         │
└─────────────────────────────────────────────────────────────┘
```

### Component decomposition

| File                                                       | Action     | Responsibility                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(marketplace)/page.tsx`                           | **Modify** | Rewrite hero section + replace `<CategoryGrid />` with `<CategoryHoverExpand />`. Trust-signals section stays for now. Vendor-count fetch added.                                                                                                                           |
| `src/components/marketplace/HomepageHero.tsx`              | **Create** | Server component. The V2 asymmetric hero composition. Wraps the existing `<SearchBar />` (no SearchBar changes).                                                                                                                                                           |
| `src/components/marketplace/HomepageWordmarkPanel.tsx`     | **Create** | Server component. Renders the right-side brand panel (tagline + static Devanagari wordmark + 4-script glyph row).                                                                                                                                                          |
| `src/components/marketplace/CategoryHoverExpand.tsx`       | **Create** | Client component. Wraps `framer-motion` for the 11-tile expanding strip. Accepts `categories: FeaturedCategory[]` prop.                                                                                                                                                    |
| `src/components/marketplace/CategoryHoverExpandMobile.tsx` | **Create** | Client component. Mobile fallback (2-col grid, no animation). Same data shape. Renders below `sm:` breakpoint.                                                                                                                                                             |
| `src/lib/vendor-categories/featured.ts`                    | **Create** | Exports `CATEGORIES_FEATURED` (the 11-category locked list with order + display labels + photo URLs + "coming soon" flags).                                                                                                                                                |
| `src/lib/vendor-categories/queries.ts`                     | **Create** | Server-only helper: `getCategoryVendorCounts(supabase)` returns `Record<slug, number>` of active vendors per featured category.                                                                                                                                            |
| `src/lib/utils.ts`                                         | **Modify** | Add `bridal_wear`, `live_music`, `carts` to `VENDOR_CATEGORIES`. Update `VENDOR_CATEGORY_LABELS` (drop none, add 3 new + rename "Videography" → "Videography & Content", rename "DJ & Music" → "DJ", "Decor & Floral" → "Decor", "Photo Booth" → "Photo Booth" unchanged). |
| `supabase/migrations/00042_vendor_categories_expand.sql`   | **Create** | Drop + recreate `vendor_profiles.category` CHECK to ADD `bridal_wear`, `live_music`, `carts`. Existing 10 stay (including `photobooth` + `invitations`).                                                                                                                   |
| `src/types/database.types.ts`                              | **Modify** | If `vendor_profiles.category` has a generated union type, append the 3 new values.                                                                                                                                                                                         |
| `src/components/marketplace/CategoryGrid.tsx`              | **Delete** | Only call site was homepage. Replaced by `<CategoryHoverExpand />`.                                                                                                                                                                                                        |
| `package.json`                                             | **Modify** | Add `framer-motion` as a dependency (`^11` or whatever current major is).                                                                                                                                                                                                  |
| `DESIGN.md`                                                | **Modify** | Add `homepage-hero:` and `category-hover-expand:` entries to `components:` block. Update locked headline from "Loud weddings. Quiet chaos." to "All your vendors. One bazaar." Update example for `display-md` token line.                                                 |

---

## Hero — V2 asymmetric

`HomepageHero.tsx` renders the top fold. Layout: `grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-18` (gap = 72px at desktop, vertical stack on mobile).

### Left column

- Padding: `px-14 pt-24 pb-22` desktop; `px-6 pt-16 pb-16` mobile
- **Kicker**: `Baazar · Chicago weddings` — token `kicker` (11px / 600 / uppercase / 0.14em / `text-indigo`)
- **Headline**: `All your vendors. <br/> <em>One bazaar.</em>` — token `display-md`. `<em>` renders Spectral italic 500 in `text-hot-pink`. **Locked copy** per brand-locked decision; DESIGN.md line 291 ("Homepage hero") gets updated to this copy.
- **Subhead**: `Chicago's marketplace for <span class="haldi">Cultural</span> wedding vendors. Discover, compare, and book with confidence.` — token `body-lg` (18px / `text-ink-muted`). The `<span>` uses haldi highlighter background (`bg-haldi text-ink box-decoration-clone px-2 pb-1`). "Cultural" replaces the old "South Asian" framing.
- **SearchBar**: existing `<SearchBar />` component (PR #18), `variant="hero"`. No SearchBar changes in this PR.
- **CTAs**: two side-by-side
  - Primary: ink `Browse all vendors` → `/vendors`
  - Secondary: outline-ink `List your business` → `/signup` (shown only when current user is not a couple — keep the existing `showVendorCta` gate)

### Right column

`HomepageWordmarkPanel.tsx` — server component. Padding: `pl-16` (border-left hairline). Hidden under `lg:` (the hero is a single column on mobile).

- **Tagline**: `MADE IN <span class="text-haldi">CHICAGO</span>` — token `micro` (10px / 600 / uppercase / 0.14em / `text-ink-soft`). The "Chicago" word is haldi. This is one of the at-most-two haldi appearances per page (the other is "Cultural" in the subhead). Per DESIGN.md palette rule.
- **Wordmark**: `<h2 class="font-wordmark-deva" aria-label="Baazar">बाज़ार<span class="text-hot-pink">.</span></h2>` — `font-size: clamp(72px, 9vw, 130px)`, line-height 0.85, letter-spacing -0.03em, color ink, weight 400. Static (no cycle). The hot-pink dot is the wordmark accent (per DESIGN.md row).
- **Glyph row**: 4 static script glyphs below the wordmark — `बाज़ार` (Devanagari, active = ink + 600 weight + 16px) / `بازار` (Nastaliq / 12px) / `بازار` (Naskh / 14px) / `بازار` (Persian / 16px). Other 3 are ink-soft. `title=` attrs per glyph (`"Hindi"`, `"Urdu"`, `"Arabic"`, `"Persian"`). Mirrors the locked footer LangDots component but standalone here. Same wrapper with `aria-label="Scripts"`.

### Two haldi appearances on this page

Per DESIGN.md palette rule (haldi appears max twice per page):

1. "Cultural" in hero subhead
2. "CHICAGO" in hero tagline

If we add a third haldi accent anywhere (e.g., a "Coming Soon" tile badge), we need to demote one.

---

## Section header

Lives between the hero and the HoverExpand. Centered. Padding: `pt-12 pb-8 px-14`.

- **Kicker**: `Browse by category` — token `kicker` (indigo)
- **Headline**: `Every vendor your celebration needs.` — token `display-sm` (clamp 28–44px, weight 700). Declarative, no italic accent (the hero already established that pattern for the page; multiple italic moments per page would dilute). Locked copy.
- **Subhead**: `Photography, mehndi, catering, and eight more. Hover to peek; click to browse.` — token `body` (16px / `text-ink-muted`). Mention the breadth, instruct the interaction.

---

## CategoryHoverExpand

`src/components/marketplace/CategoryHoverExpand.tsx` — `'use client'`. Adapts the Skiper UI HoverExpand_001 pattern (Framer Motion based) for our 11-category strip.

### Data input

Receives `categories: FeaturedCategory[]` from `CATEGORIES_FEATURED` (sourced from `src/lib/vendor-categories/featured.ts`) and a `counts: Record<slug, number>` map of active vendor counts per category (server-fetched from `vendor_profiles WHERE is_active = true GROUP BY category`).

### Visual states

| State                              | Width                      | Visual                                                                                                                                                                                                                               | Click behavior                                                                              |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Collapsed (inactive)**           | `4rem` (64px)              | Background photo + dark wash (`bg-ink/45`) + rotated 90° label centered (cream, kicker token)                                                                                                                                        | Click expands                                                                               |
| **Active (expanded, has vendors)** | `flex: 1 1 26rem` (~416px) | Background photo + bottom gradient (`from-transparent to-ink/78`) + content overlay (kicker / Spectral category name / vendor count / "Browse {category} →" pill CTA)                                                                | Click navigates to `/vendors?category={slug}`                                               |
| **Active (expanded, Coming Soon)** | Same as active             | Same photo but heavier scrim (`bg-ink/60`) + content overlay differs: kicker says "COMING SOON" in haldi + category name + "Vendors joining the platform" body + "Get notified" link that scrolls to footer newsletter (or opens it) | Click navigates to `/vendors?category={slug}` which shows an empty-state with subscribe CTA |

### Tile sizing math

11 tiles total. When one is active:

- 10 collapsed × 4rem = 40rem (640px)
- 1 active × ~26rem (416px)
- 10 gaps × 6px = 60px
- Total: ~1116px

`max-width: 1280px` on the wrapper accommodates this with horizontal gutter padding. On viewports narrower than 1180px (between `md` and `lg` breakpoints), the component switches to the mobile fallback.

### Transitions

- Width transition: `320ms cubic-bezier(.22, 1, .36, 1)` (motion token `medium` + ease-out-quart)
- Scrim opacity: `320ms` matching the width
- Content fade-in: `320ms` with `100ms` delay (so content appears after the tile finishes expanding)
- Collapsed label fade: `200ms` (faster than width transition so it disappears before the new content appears)

### Interaction

- Both `onMouseEnter` and `onClick` set the active tile
- A second click on the already-active tile navigates (the tile is wrapped in a `Link` so the click bubbles; the first click sets `activeIndex` via state, the second commits navigation because the click target IS the link)
- Equivalent on mobile: first tap expands, second tap commits (the mobile component handles this via a separate touch path)
- Default `activeIndex = 0` (Photography is the first tile and the most universally familiar)

### Accessibility

- The outer wrapper: `<div role="region" aria-label="Browse vendors by category">`
- Each tile: `<Link>` rendering with `aria-current={isActive ? 'true' : undefined}` and a visually-hidden `<span class="sr-only">{categoryName} category</span>` so screen readers can navigate the strip even when collapsed labels are rotated
- Keyboard: tab through the tiles, Enter activates/navigates, arrow keys move active state (left/right)
- `prefers-reduced-motion`: no width transition; instant snap between states

---

## Mobile fallback — `CategoryHoverExpandMobile`

Rendered when viewport < `lg` breakpoint (1024px). The HoverExpand pattern doesn't translate cleanly to narrow screens (active tile would dominate, collapsed tiles would be unreadable at <4rem).

Mobile renders a **2-col grid of square cards**:

- 2 columns at `sm` (≥640px), 1 column at `xs` (<640px)
- Each card: aspect-square, background photo, dark scrim, content overlay always visible (no expand interaction needed)
- Same content shape as the active state of the desktop tiles (kicker + name + count + CTA)
- Click navigates directly
- "Coming Soon" cards get the same treatment as desktop active-coming-soon variant

---

## Featured category list — locked

`src/lib/vendor-categories/featured.ts` exports a typed constant:

```ts
export interface FeaturedCategory {
  slug: string; // matches vendor_profiles.category
  label: string; // display name
  kicker: string; // grouping label shown above category name in active tile
  photoUrl: string; // hero photo for the tile (Day 1: Unsplash; Day 2+: vendor-curated)
  alt: string; // alt text for the photo
  comingSoon: boolean; // Day 1 true for decor + venue; false for the other 9
}
```

### The list (display order, left → right)

| #   | slug          | label                    | kicker        | comingSoon |
| --- | ------------- | ------------------------ | ------------- | ---------- |
| 1   | `photography` | Photography              | Visual        | false      |
| 2   | `videography` | Videography & Content    | Visual        | false      |
| 3   | `hair_makeup` | Hair & Makeup            | Beauty        | false      |
| 4   | `bridal_wear` | Bridal Wear              | Beauty        | false      |
| 5   | `mehndi`      | Mehndi / Henna           | Tradition     | false      |
| 6   | `catering`    | Catering                 | Food          | false      |
| 7   | `carts`       | Carts                    | Food          | false      |
| 8   | `dj`          | DJ                       | Entertainment | false      |
| 9   | `live_music`  | Live Music & Performance | Entertainment | false      |
| 10  | `decor`       | Decor & Floral           | Atmosphere    | **true**   |
| 11  | `venue`       | Venue                    | Space         | **true**   |

**Photo URLs** (Day 1 stand-ins, all from Unsplash with explicit query params for size):

| slug          | photoUrl                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| `photography` | `https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=1200&q=85` |
| `videography` | `https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&q=85` |
| `hair_makeup` | `https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=1200&q=85` |
| `bridal_wear` | `https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1200&q=85` |
| `mehndi`      | `https://images.unsplash.com/photo-1604423466938-c63b29b9c5e9?w=1200&q=85` |
| `catering`    | `https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=85` |
| `carts`       | `https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=85`    |
| `dj`          | `https://images.unsplash.com/photo-1571266028253-6c1d4040d6cc?w=1200&q=85` |
| `live_music`  | `https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=1200&q=85` |
| `decor`       | `https://images.unsplash.com/photo-1561128290-006dc4827214?w=1200&q=85`    |
| `venue`       | `https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=85` |

Implementer should verify each URL returns 200 during implementation (some Unsplash IDs may have been removed). For any that 404, swap with the next plausible Unsplash result for the keyword. The `alt` text should describe the photo in 5-12 words.

---

## Vendor-count derivation

Server-side fetch in `src/app/(marketplace)/page.tsx`:

```sql
SELECT category, COUNT(*)::int AS vendor_count
FROM vendor_profiles
WHERE is_active = true
GROUP BY category
```

(Note: `is_active` column status TBD by implementer — the PENDING_ISSUES doc flags it as schema drift. If the column doesn't exist, the query just counts all `vendor_profiles` per category. Acceptable Day 1.)

Returned as a `Record<slug, number>`. Passed to `<CategoryHoverExpand counts={counts} />` and `<CategoryHoverExpandMobile counts={counts} />`.

If a category has `comingSoon: true` OR `count === 0`, the tile renders the Coming Soon variant. Otherwise it shows `{count} {pluralize(label)} in Chicago`.

---

## Coming Soon treatment

For tiles where `comingSoon: true` (always: bridal_wear + decor + venue Day 1) OR `counts[slug] === 0`:

- **Active state copy**:
  - Kicker: `COMING SOON` (haldi color — but this is page haldi #3 if added, breaks the rule — so kicker stays indigo and "Coming Soon" appears as a small badge instead. **Use indigo kicker with text "COMING SOON" + an inline pill badge `bg-ink-soft/20 text-ink-soft` reading "Joining soon"**)
  - Category name: same as normal
  - Body: `Vendors are joining the platform.`
  - CTA: `Get notified` (text-link style, indigo, opens an in-page anchor `#newsletter` or scrolls to footer's newsletter form)
- **Click behavior**: still navigates to `/vendors?category={slug}` — that page should render an empty state with a "Subscribe to be notified when {category} vendors are live" form. (Empty-state design for `/vendors` is out of scope for this PR — flag in PENDING_ISSUES.)

---

## Migration `00042_vendor_categories_expand.sql`

```sql
-- Adds 3 new vendor categories: bridal_wear, live_music, carts.
-- Preserves all existing categories (no removals — photobooth + invitations
-- stay valid in the DB so existing rows survive; they're just not featured
-- on the homepage strip).

ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_category_check;
ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_category_check
  CHECK (category = ANY (ARRAY[
    'photography'::text,
    'videography'::text,
    'mehndi'::text,
    'hair_makeup'::text,
    'dj'::text,
    'photobooth'::text,
    'catering'::text,
    'venue'::text,
    'decor'::text,
    'invitations'::text,
    'bridal_wear'::text,
    'live_music'::text,
    'carts'::text
  ]));
```

Implementer verifies the actual constraint name first (could be `vendor_profiles_category_check` or a generic auto-name like `vendor_profiles_category_check1`).

After apply, regenerate `src/types/database.types.ts` (or hand-edit the category union type if regen requires auth).

---

## Updates to `src/lib/utils.ts`

Replace the existing `VENDOR_CATEGORIES` and `VENDOR_CATEGORY_LABELS` exports with:

```ts
// All categories valid in the DB (vendor_profiles.category CHECK).
// Some are not featured on the homepage but are kept for existing-row compatibility.
export const VENDOR_CATEGORIES = [
  'photography',
  'videography',
  'mehndi',
  'hair_makeup',
  'dj',
  'photobooth',
  'catering',
  'venue',
  'decor',
  'invitations',
  'bridal_wear',
  'live_music',
  'carts',
] as const;

export const VENDOR_CATEGORY_LABELS: Record<string, string> = {
  photography: 'Photography',
  videography: 'Videography & Content',
  mehndi: 'Mehndi / Henna',
  hair_makeup: 'Hair & Makeup',
  dj: 'DJ',
  photobooth: 'Photo Booth',
  catering: 'Catering',
  venue: 'Venue',
  decor: 'Decor & Floral',
  invitations: 'Invitations',
  bridal_wear: 'Bridal Wear',
  live_music: 'Live Music & Performance',
  carts: 'Carts',
};
```

The featured-on-homepage subset lives separately in `src/lib/vendor-categories/featured.ts` so the two concerns are decoupled (DB validity vs marketing surface).

---

## Skiper UI attribution

Per Skiper's free-tier license, attribution is required. The implementer adds:

1. **Source comment block** at the top of `CategoryHoverExpand.tsx`:
   ```ts
   /**
    * HoverExpand pattern adapted from Skiper UI 52 HoverExpand_001 (https://skiper-ui.com).
    * Original by @gurvinder-singh02 / @Gur__vi.
    * Adapted to M+ design tokens + Baazar vendor categories.
    */
   ```
2. **In-page attribution caption** (rendered between the HoverExpand and the footer in `page.tsx`):
   ```tsx
   <p className="px-14 py-6 text-center text-[10px] text-ink-soft">
     Category browser pattern by{' '}
     <a href="https://skiper-ui.com" target="_blank" rel="noopener" className="hover:text-ink">
       Skiper UI
     </a>{' '}
     · Original by{' '}
     <a href="https://x.com/Gur__vi" target="_blank" rel="noopener" className="hover:text-ink">
       @Gur__vi
     </a>
   </p>
   ```

---

## Animation + accessibility

- All transitions use motion token easing (`cubic-bezier(.22, 1, .36, 1)`)
- `framer-motion` respects `prefers-reduced-motion` natively via its `useReducedMotion()` hook — wire this into the HoverExpand so the width transition becomes instant under reduce-motion
- All interactive elements (tiles, CTAs, hero buttons) have `focus-visible` rings (2px indigo, 2px offset, cream-tinted on dark surfaces)
- The hero's right-column wordmark + glyph row are decorative; the wordmark has `aria-label="Baazar"` and the glyph row has `aria-hidden="true"` on the individual glyphs (the wrapper carries `aria-label="Scripts"` for context)

---

## Out of scope (deferred)

- **Resend integration for the "Get notified" link on Coming Soon tiles** — uses the existing footer newsletter for now (scroll target). Per-category notification preferences are a future enhancement.
- **Flat-fee listing model for Bridal Wear + Decor + Venue** — separate sub-project. Includes: `vendor_profiles.business_model` column (`'commission' | 'flat_fee'`), Stripe Billing surface, vendor-facing "manage your listing" dashboard, admin reconciliation for both models. The 3 flat-fee categories share the same reason for opting out of commission (multi-SKU inventory or consultative sales).
- **Empty-state design for `/vendors?category={slug}` when 0 vendors exist** — flag in PENDING_ISSUES.md. Day 1 the existing empty state (whatever it shows) is acceptable.
- **Vendor-curated category photos** — Day 1 uses Unsplash stand-ins. Future: each category gets a vendor-supplied or licensed hero shot.
- **The "Why Couples Trust Us" section refresh** — leave as-is for now. Will get its own M+ port or full replacement in a separate PR.
- **Sticky-on-scroll search bar** — once the user scrolls past the hero, the SearchBar disappears. A sticky variant (`variant="sticky-header"` exists per DESIGN.md but not wired on this page) is a follow-up.
- **Locale-aware copy** — "Cultural" works universally for now; future localization is its own sub-project.
- **Removal of `photobooth` + `invitations` categories from the DB** — kept permissively so existing rows survive. If they get true zero usage over time, drop in a future migration.

---

## Visual references

- Brainstorm mockups archived at `.superpowers/brainstorm/55066-1779426490/content/`:
  - `hero-directions.html` — original A/B/C direction comparison
  - `hero-variations-v2.html` — V1/V2/V3/V4 layout variations (V2 picked)
  - `headline-candidates.html` — A/B/C/D/E headline copy comparison (B picked)
  - `homepage-full.html` — full-page final preview (locked direction, used as the reference for implementation)
- Skiper UI source pattern: https://skiper-ui.com (Skiper52 / HoverExpand_001)

---

## Open questions

None blocking. Implementer should verify:

1. Each Unsplash photo URL still resolves; swap any 404s with the nearest keyword match.
2. `vendor_profiles.category` CHECK constraint name (may have a numeric suffix).
3. Whether `is_active` column exists on `vendor_profiles` for the count query — if not, fall back to counting all rows per category (per PENDING_ISSUES known schema drift).
