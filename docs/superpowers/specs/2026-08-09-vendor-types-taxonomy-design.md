# Vendor multi-service model + taxonomy expansion — Design

**Date:** 2026-08-09
**Branch:** `explore/vendor-types-taxonomy`
**Status:** Approved design, ready for implementation plan

## Problem

The vendor taxonomy forces every vendor into **exactly one** `category`. Reviewing the ~130 real
vendors we're marketing to (Chicago cultural-wedding market) surfaced three failures:

1. **Photo/video/content overlap is unrepresentable.** Real studios (`theashraedit`,
   `saistudio__`, `momentslane.chi`, `SixPathMedia`, `Bilal`, `Juan Alvarado`) appear in _both_ the
   photography and videography lists — they shoot photo **and** video **and** social content. A
   single-category model cannot say "this vendor does all three."
2. **No way to distinguish sub-flavors within a service.** A vendor who only does couple/portrait
   shoots _outside_ the wedding day looks identical to a full wedding-day photographer.
3. **Whole vendor types have no home:** standalone gift vendors (`LavishDates`, `maryamskorner`,
   `inkandembercandle`), cake makers (`cakesbymuniba`), dessert tables (`farahsdesserttable`),
   grazing boards (`little.boards.bites`, `saycheese.chi`).

Additionally, `content_creation` already exists in the DB CHECK constraint (migration 00045) but was
never wired into the app layer — an un-selectable, unlabeled orphan.

## Current state (as-is)

- **App-layer categories (13):** `src/lib/utils.ts:51` `VENDOR_CATEGORIES` —
  photography, videography, mehndi, hair_makeup, dj, photobooth, catering, venue, decor, invitations,
  bridal_wear, live_music, carts. Labels at `src/lib/utils.ts:67`.
- **DB CHECK allows 14:** the 13 above **plus `content_creation`** (migration `00045`). Present in
  `src/types/database.types.ts` but absent from the TS list → orphan.
- **Subcategories:** generic `vendor_profiles.subcategories text[]` (migration `00065`, GIN index).
  Only `carts` has a taxonomy today: dessert / beverage / appetizer / favor_gift
  (`src/lib/vendor-subcategories.ts`). Extending to new categories is **app-layer only, no
  migration** — flows automatically into onboarding chips, validation, and filters.
- **Onboarding:** Step 1 "Basics" — `src/components/onboarding/StepBasics.tsx` (category `Select` +
  conditional subtype chips via `SubcategoryMultiSelect`).
- **Homepage tiles (13):** `src/lib/vendor-categories/featured.ts` `CATEGORIES_FEATURED` (4 are
  Coming Soon: bridal_wear, decor, venue, invitations).
- **Filtering:** `src/lib/vendor-filters.ts` — category via `.eq('category', …)`, subcategories via
  `.contains('subcategories', …)`.

## Decisions (locked with product owner)

1. **Vendor model → multi-service select.** Vendor picks ONE primary category (for card label +
   default tile + count attribution) and checks any additional services offered. A photo+video+reels
   studio shows in Photography, Videography, and Content browse.
2. **Photography gets subtypes** (occasion-based): wedding-day coverage / couple & engagement shoots
   / portrait & studio / other events & parties.
3. **Videography: no subtypes** — represented as a service only.
4. **`content_creation` becomes a first-class category/service** ("Content Creation / Reels") — wires
   up the existing DB orphan. **Gets its own homepage tile.**
5. **New category `gifts`** ("Gifts & Favors") — generic, no subtypes.
6. **Catering gets subtypes:** full-service / cakes / dessert tables & sweets / grazing & charcuterie.
   (Cakes/desserts/grazing are folded here rather than becoming top-level categories.)
7. **Decor stays flat** — no subtypes; signage/misc vendors live under `decor` as-is.
8. **Subtype chips render for the PRIMARY category only** — keeps onboarding clean and avoids mixing
   subtypes from different parents in one `subcategories[]` array.
9. **NO hard-merge of photography + videography.** They stay separate categories. Multi-service is the
   non-destructive "soft merge": a studio stands in both lanes at once while pure specialists keep a
   clean single lane. (Considered and rejected a combined "Photo & Video" category — lossy for the
   common "wants only one" couple, lumps specialists, needs a destructive data migration, and fights
   the content-creator distinction.)
10. **Onboarding surfaces the visual cluster explicitly.** When primary is `photography`,
    `videography`, or `content_creation`, the "also offers" prompt names the cluster directly
    ("Do you also shoot video? Create content / reels?") — that's where ~95% of real multi-service is.
11. **Couples get a "Photo + Video — one vendor" filter** (AND-membership: `services @>
{photography, videography}`) so a couple can shortlist a single vendor for all camera needs. This
    is distinct from the per-category filters, which are OR-membership.
12. **Packages need NO changes.** The `packages` table has no category/type coupling
    (`00015_create_packages_and_addons.sql`) — a dual studio already lists free-form "Photo only /
    Video only / Photo + Video" packages today. Multi-service only affects browse discoverability, not
    packages.

## Target taxonomy

### Categories / services (15)

`photography` · `videography` · **`content_creation`** ("Content Creation / Reels") · `mehndi` ·
`hair_makeup` · `dj` · `photobooth` · `catering` · `venue` · `decor` · `invitations` · `bridal_wear` ·
`live_music` · `carts` · **`gifts`** ("Gifts & Favors")

Additions vs. today: `content_creation` (un-orphaned) and `gifts` (new).

### Subtypes (app-layer `subcategories text[]`, no migration)

| Category              | Subtypes (slug → label)                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `carts` _(existing)_  | dessert → Dessert cart · beverage → Beverage cart · appetizer → Appetizer cart · favor_gift → Favor / gift cart                                                            |
| `photography` _(new)_ | wedding_day → Wedding-day coverage · couple_engagement → Couple & engagement shoots · portrait_studio → Portrait & studio sessions · other_events → Other events & parties |
| `catering` _(new)_    | full_service → Full-service catering · cakes → Cakes · dessert_tables → Dessert tables & sweets · grazing_charcuterie → Grazing & charcuterie                              |
| all others            | none                                                                                                                                                                       |

`SUBCATEGORY_SECTION_LABEL`: `photography → "Photography type"`, `catering → "Catering type"`
(alongside existing `carts → "Cart type"`).

## Architecture / components to change

### Data layer (migration required)

New migration (next number after 00072) does two things:

1. `ALTER TABLE vendor_profiles ADD COLUMN services text[] DEFAULT NULL;` + backfill
   `UPDATE vendor_profiles SET services = ARRAY[category] WHERE services IS NULL;` + GIN index
   `vendor_profiles_services_gin`.
2. Extend the category CHECK constraint to add `gifts` (drop + recreate the 14-value constraint from
   00045 as a 15-value constraint).

Hand-patch `src/types/database.types.ts` to add the `services` column + `gifts` to the category union
(per the standing "regen breaks the codebase" memo — do NOT run a clean `supabase gen types`).

**`services` semantics:** always includes the primary `category`. `category` remains the single
source of truth for the primary label / default tile / count attribution. `services` is the set used
for browse membership.

### App layer

- **`src/lib/utils.ts`** — add `content_creation` and `gifts` to `VENDOR_CATEGORIES` + labels.
- **`src/lib/vendor-subcategories.ts`** — add `photography` and `catering` entries to
  `SUBCATEGORIES_BY_CATEGORY` + `SUBCATEGORY_SECTION_LABEL`. (No migration.)
- **`src/app/api/vendor-profile/setup/[step]/route.ts`** — persist `services[]`; validate against the
  category union; keep the existing subcategory persistence (primary-category-scoped).
- **`src/lib/onboarding/validation.ts`** — `basicsSchema`: validate `services[]` against the category
  list; keep subtype `.refine` scoped to the primary category.

### Onboarding UI

- **`src/components/onboarding/StepBasics.tsx`** —
  - Primary category `Select` (now 15 options).
  - New **"Other services you offer"** multi-select (reuse `SubcategoryMultiSelect`), pre-checks the
    primary, writes `services[]`.
  - **Visual-cluster prompt:** when the primary is `photography`, `videography`, or
    `content_creation`, the "also offers" section leads with the visual cluster and explicit copy —
    e.g. "Do you also shoot video? Create content / reels?" — so dual studios opt into both lanes at
    the moment it's most natural. For non-visual primaries the multi-select still exists but stays
    quiet (no cluster framing). Copy lives near the component, not hard-coded per category.
  - Subtype chips render conditionally for the **primary category only** (unchanged pattern; now also
    fires for `photography` and `catering`).

### Browse / filter / cards

- **`src/lib/vendor-filters.ts`** (`applyVendorFilters`, `countFilteredVendors`) — category filter
  moves from `.eq('category', X)` to array-overlap membership on `services`
  (`services && ARRAY[X]`), with fallback for rows where `services` is null → treat `category` as the
  single-element set (the backfill removes this case, but keep defensive).
- **`src/lib/vendor-categories/queries.ts`** (`getCategoryVendorCounts`) — count by `services`
  membership so a multi-service vendor counts toward each of its service tiles.
- **"Photo + Video — one vendor" filter** — a dedicated filter affordance (not a real category value)
  that AND-matches both services: `services @> ARRAY['photography','videography']`. Surfaces in the
  filter UI (`use-filter-state.ts` gains a boolean flag, e.g. `photoVideoCombo`; `vendor-filters.ts`
  applies the `@>` when set). Shown in the filter panel near the category picker with copy like
  "One vendor for photo + video". Scope is photo+video only (couples' "all camera needs"); content
  creation stays a separate lane.
- **Vendor card** — optionally render a compact secondary-services hint (e.g. "+ Video, Content")
  beyond the primary label. (Polish; can defer.)

### Homepage tiles

- **`src/lib/vendor-categories/featured.ts`** `CATEGORIES_FEATURED` — add **Gifts & Favors** tile
  (live) and **Content Creation / Reels** tile (live). Net 15 tiles. Need `photoUrl`/`alt`/`kicker`
  for the two new tiles (source hero images).

## Testing

- Extend `src/__tests__/lib/vendor-subcategories.test.ts` — photography + catering subtype
  vocab/validation.
- Extend `src/__tests__/lib/vendor-filters.test.ts` — array-overlap category membership; a
  multi-service vendor appears under each of its services; null-`services` fallback.
- Add coverage for `services[]` persistence + validation in the setup route.
- Onboarding component test — "Other services" multi-select pre-checks primary; subtype chips fire
  for photography/catering primary.
- E2E: a vendor onboarding with primary=photography + services={photography,videography,
  content_creation} appears under all three browse filters.
- `vendor-filters.test.ts` — the "Photo + Video — one vendor" combo filter (`@>`) returns only
  vendors with BOTH services; excludes photo-only and video-only vendors.

## Out of scope

- No migration of existing production vendors beyond the mechanical `services = {category}` backfill.
- No decor/gifts subtypes.
- Grazing/cakes as standalone top-level categories (folded into catering subtypes).
- Price-band filtering (already deferred/no-op in `vendor-filters.ts`).
- Vendor-card secondary-services hint is optional polish, not required for the feature.

## Open items / risks

- **Two migrations already share number 00065** (a prior collision). Use the next free number after
  00072 and verify no new collision.
- **Card real-estate:** showing secondary services shouldn't clutter the card — keep to a short
  "+N more" or 1–2 named services.
- **Count double-attribution:** a multi-service vendor now counts toward multiple tiles; tile counts
  will sum higher than the distinct vendor count. This is intended (it reflects browse membership) but
  worth confirming it doesn't read as inflated.
