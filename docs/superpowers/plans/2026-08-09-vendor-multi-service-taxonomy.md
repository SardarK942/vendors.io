# Vendor Multi-Service Model + Taxonomy Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor offer multiple services from one profile (fixing the photo/video/content overlap), add `content_creation` + `gifts` categories, add photography + catering subtypes, and give couples a "Photo + Video — one vendor" filter.

**Architecture:** Keep `vendor_profiles.category` as the single **primary** (card label, count attribution). Add `vendor_profiles.services text[]` (always includes the primary) as the browse-membership set; category filters switch from exact-match (`.eq`) to array-overlap (`.overlaps`). Subtypes keep using the existing generic `subcategories text[]` column (the carts pattern) — no new column. One migration; everything else is app-layer.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + PostgREST), Zod, Vitest, Tailwind.

## Global Constraints

- **Git workflow:** feature branch → PR → squash-merge. Never commit to `main`. (Current branch: `explore/vendor-types-taxonomy`.)
- **DB types:** never run a clean `supabase gen types` — hand-patch `src/types/database.types.ts` (custom aliases get wiped otherwise).
- **Migrations:** Claude applies **dev** migrations via psql; the **user** applies prod manually. Next free migration number is **00073** (00072 is the latest on disk).
- **Category vocabulary (15, verbatim):** `photography` · `videography` · `content_creation` · `mehndi` · `hair_makeup` · `dj` · `photobooth` · `catering` · `venue` · `decor` · `invitations` · `bridal_wear` · `live_music` · `carts` · `gifts`.
- **Category labels (verbatim):** content_creation → `Content Creation / Reels`; gifts → `Gifts & Favors`. (Others unchanged; `videography` stays `Videography & Content`.)
- **`services` invariant:** every persisted `services[]` includes the row's primary `category`.
- **Combo filter scope:** photo+video only (`services @> {photography, videography}`). Content is NOT part of the combo.
- **Commit after every task.** Run `npm run lint && npx tsc --noEmit && npm test` before each commit.

---

## File map

**Created:**

- `supabase/migrations/00073_vendor_profiles_services_and_gifts.sql` — services column + backfill + GIN index + gifts CHECK.
- `src/components/onboarding/ServicesMultiSelect.tsx` — generic multi-select over categories for "other services you offer".
- `src/components/marketplace/filters/sections/PhotoVideoComboSection.tsx` — the "one vendor for photo + video" toggle.
- `src/__tests__/lib/vendor-categories-taxonomy.test.ts` — asserts new categories/labels/subtypes.
- `src/__tests__/components/onboarding/services-multi-select.test.tsx` — component test.

**Modified:**

- `src/types/database.types.ts` — add `services` column + `gifts` to the 3 category unions.
- `src/lib/utils.ts` — add `content_creation` + `gifts` to `VENDOR_CATEGORIES` + labels.
- `src/lib/vendor-subcategories.ts` — photography + catering subtype taxonomies.
- `src/lib/vendor-filters.ts` — services overlap + combo filter (parse/apply/count).
- `src/lib/vendor-categories/queries.ts` — count by `services` membership.
- `src/lib/vendor-categories/featured.ts` — add content_creation + gifts tiles.
- `src/components/marketplace/filters/use-filter-state.ts` — `photoVideoCombo` state + URL param.
- `src/components/marketplace/filters/AllFiltersSheet.tsx` — render the combo section.
- `src/lib/onboarding/validation.ts` — validate `services[]`.
- `src/app/api/vendor-profile/setup/[step]/route.ts` — persist `services[]` + widen category cast.
- `src/app/dashboard/profile/setup/basics/page.tsx` — select + hydrate `services`.
- `src/components/onboarding/StepBasics.tsx` — services multi-select + generalized subtype heading.
- `src/__tests__/lib/vendor-filters.test.ts` — combo + overlap coverage.
- `src/__tests__/lib/vendor-subcategories.test.ts` — photography + catering coverage.

---

## Task 1: Migration — `services` column + `gifts` category + DB types

**Files:**

- Create: `supabase/migrations/00073_vendor_profiles_services_and_gifts.sql`
- Modify: `src/types/database.types.ts:226-356` (three `category` unions + add `services`)

**Interfaces:**

- Produces: `vendor_profiles.services text[]` (nullable in DB; app always writes non-null incl. primary). `gifts` now valid in `vendor_profiles_category_check`. DB types expose `services: string[] | null` on Row/Insert/Update and `gifts` in all three category unions.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00073_vendor_profiles_services_and_gifts.sql`:

```sql
-- 00073: multi-service vendors + gifts category.
-- 1) services text[] : the full set of services a vendor offers (always includes
--    the primary `category`). Browse membership filters on this; `category`
--    stays the single primary for card label + count attribution.
-- 2) gifts : new top-level category (standalone gift/favor vendors).
-- content_creation was already added to the CHECK in 00045 — kept here.

ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS services text[];

-- Backfill: existing single-category rows become a one-element service set.
UPDATE vendor_profiles
SET services = ARRAY[category]::text[]
WHERE services IS NULL;

CREATE INDEX IF NOT EXISTS vendor_profiles_services_gin
  ON vendor_profiles USING gin (services);

-- Recreate the category CHECK with `gifts` added (15 values).
ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_category_check;
ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_category_check
  CHECK (category IN (
    'photography','videography','content_creation','mehndi','hair_makeup',
    'dj','photobooth','catering','venue','decor','invitations',
    'bridal_wear','live_music','carts','gifts'
  ));
```

- [ ] **Step 2: Apply to dev DB**

Run against the dev database (connection per the `migration_apply_policy` + `supabase_prod_connection` memos):

```bash
psql "$DEV_DATABASE_URL" -f supabase/migrations/00073_vendor_profiles_services_and_gifts.sql
```

Expected: `ALTER TABLE` / `UPDATE n` / `CREATE INDEX` / `ALTER TABLE` with no error.

- [ ] **Step 3: Verify the column + constraint applied**

Run:

```bash
psql "$DEV_DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='vendor_profiles' AND column_name='services';"
psql "$DEV_DATABASE_URL" -c "SELECT COUNT(*) FROM vendor_profiles WHERE services IS NULL;"
```

Expected: first returns `services`; second returns `0`.

- [ ] **Step 4: Hand-patch `database.types.ts` — add `gifts` to all three category unions**

In `src/types/database.types.ts`, the `vendor_profiles` `Row` (line ~226-240), `Insert` (~285-299), and `Update` (~342-356) each have a `category` union ending in `| 'content_creation'`. Append `| 'gifts'` to **each** of the three. Example for the Row union:

```ts
          category:
            | 'photography'
            | 'videography'
            | 'mehndi'
            | 'hair_makeup'
            | 'dj'
            | 'photobooth'
            | 'catering'
            | 'venue'
            | 'decor'
            | 'invitations'
            | 'bridal_wear'
            | 'live_music'
            | 'carts'
            | 'content_creation'
            | 'gifts';
```

- [ ] **Step 5: Hand-patch `database.types.ts` — add `services` to Row/Insert/Update**

The `subcategories` field appears in Row (`subcategories: string[] | null;`, ~line 278), Insert (`subcategories?: string[] | null;`, ~336), and Update. Add a sibling `services` line next to each:

- Row: `services: string[] | null;`
- Insert: `services?: string[] | null;`
- Update: `services?: string[] | null;`

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from the type edits).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00073_vendor_profiles_services_and_gifts.sql src/types/database.types.ts
git commit -m "feat(db): add vendor_profiles.services[] + gifts category (mig 00073)"
```

---

## Task 2: Category constants — `content_creation` + `gifts`

**Files:**

- Modify: `src/lib/utils.ts:51-81`
- Test: `src/__tests__/lib/vendor-categories-taxonomy.test.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `VENDOR_CATEGORIES` now 15 entries incl. `content_creation`, `gifts`; `VENDOR_CATEGORY_LABELS` has labels for both.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/vendor-categories-taxonomy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

describe('VENDOR_CATEGORIES', () => {
  it('includes content_creation and gifts', () => {
    expect(VENDOR_CATEGORIES).toContain('content_creation');
    expect(VENDOR_CATEGORIES).toContain('gifts');
    expect(VENDOR_CATEGORIES).toHaveLength(15);
  });

  it('has a label for every category', () => {
    for (const c of VENDOR_CATEGORIES) {
      expect(VENDOR_CATEGORY_LABELS[c], `missing label for ${c}`).toBeTruthy();
    }
    expect(VENDOR_CATEGORY_LABELS.content_creation).toBe('Content Creation / Reels');
    expect(VENDOR_CATEGORY_LABELS.gifts).toBe('Gifts & Favors');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/vendor-categories-taxonomy.test.ts`
Expected: FAIL (length 13, no content_creation/gifts labels).

- [ ] **Step 3: Add the categories + labels**

In `src/lib/utils.ts`, add `'content_creation'` right after `'videography'` in `VENDOR_CATEGORIES`, and `'gifts'` at the end (after `'carts'`):

```ts
export const VENDOR_CATEGORIES = [
  'photography',
  'videography',
  'content_creation',
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
  'gifts',
] as const;
```

Add the two labels to `VENDOR_CATEGORY_LABELS`:

```ts
  videography: 'Videography & Content',
  content_creation: 'Content Creation / Reels',
```

and at the end:

```ts
  carts: 'Carts',
  gifts: 'Gifts & Favors',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/vendor-categories-taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/__tests__/lib/vendor-categories-taxonomy.test.ts
git commit -m "feat(vendors): add content_creation + gifts categories"
```

---

## Task 3: Subcategory taxonomy — photography + catering

**Files:**

- Modify: `src/lib/vendor-subcategories.ts:18-30`
- Test: `src/__tests__/lib/vendor-subcategories.test.ts` (extend)

**Interfaces:**

- Consumes: nothing.
- Produces: `getSubcategoriesForCategory('photography')` → 4 subtypes; `getSubcategoriesForCategory('catering')` → 4 subtypes; `SUBCATEGORY_SECTION_LABEL` has photography + catering headings. Slugs are the source of truth for validation + filtering.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/lib/vendor-subcategories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getSubcategoriesForCategory,
  validSubcategorySlugs,
  SUBCATEGORY_SECTION_LABEL,
} from '@/lib/vendor-subcategories';

describe('photography + catering subtypes', () => {
  it('exposes photography subtypes', () => {
    const slugs = getSubcategoriesForCategory('photography').map((s) => s.slug);
    expect(slugs).toEqual(['wedding_day', 'couple_engagement', 'portrait_studio', 'other_events']);
    expect(SUBCATEGORY_SECTION_LABEL.photography).toBe('Photography type');
  });

  it('exposes catering subtypes', () => {
    const slugs = getSubcategoriesForCategory('catering').map((s) => s.slug);
    expect(slugs).toEqual(['full_service', 'cakes', 'dessert_tables', 'grazing_charcuterie']);
    expect(SUBCATEGORY_SECTION_LABEL.catering).toBe('Catering type');
  });

  it('validates slugs per category', () => {
    expect(validSubcategorySlugs('photography').has('wedding_day')).toBe(true);
    expect(validSubcategorySlugs('photography').has('cakes')).toBe(false);
    expect(validSubcategorySlugs('videography').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/vendor-subcategories.test.ts`
Expected: FAIL (photography/catering not in taxonomy).

- [ ] **Step 3: Add the taxonomies**

In `src/lib/vendor-subcategories.ts`, extend `SUBCATEGORIES_BY_CATEGORY`:

```ts
export const SUBCATEGORIES_BY_CATEGORY: Record<string, readonly Subcategory[]> = {
  carts: [
    { slug: 'dessert', label: 'Dessert cart' },
    { slug: 'beverage', label: 'Beverage cart' },
    { slug: 'appetizer', label: 'Appetizer cart' },
    { slug: 'favor_gift', label: 'Favor / gift cart' },
  ],
  photography: [
    { slug: 'wedding_day', label: 'Wedding-day coverage' },
    { slug: 'couple_engagement', label: 'Couple & engagement shoots' },
    { slug: 'portrait_studio', label: 'Portrait & studio sessions' },
    { slug: 'other_events', label: 'Other events & parties' },
  ],
  catering: [
    { slug: 'full_service', label: 'Full-service catering' },
    { slug: 'cakes', label: 'Cakes' },
    { slug: 'dessert_tables', label: 'Dessert tables & sweets' },
    { slug: 'grazing_charcuterie', label: 'Grazing & charcuterie' },
  ],
};
```

Extend `SUBCATEGORY_SECTION_LABEL`:

```ts
export const SUBCATEGORY_SECTION_LABEL: Record<string, string> = {
  carts: 'Cart type',
  photography: 'Photography type',
  catering: 'Catering type',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/vendor-subcategories.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendor-subcategories.ts src/__tests__/lib/vendor-subcategories.test.ts
git commit -m "feat(vendors): add photography + catering subtypes"
```

---

## Task 4: Server filtering — services overlap + photo/video combo + counts

**Files:**

- Modify: `src/lib/vendor-filters.ts:4-15,22-60,67-99,110-139`
- Modify: `src/lib/vendor-categories/queries.ts:16-42`
- Test: `src/__tests__/lib/vendor-filters.test.ts` (extend)

**Interfaces:**

- Consumes: `services` column (Task 1).
- Produces: `VendorFilterParams.photoVideoCombo?: boolean`; category filter matches via `services` overlap; combo matches via `services @> {photography,videography}`; `getCategoryVendorCounts` counts by `services` membership.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/lib/vendor-filters.test.ts`:

```ts
describe('parseVendorFilterParams — photoVideoCombo', () => {
  it('sets photoVideoCombo when photoVideo=1', () => {
    const out = parseVendorFilterParams({ photoVideo: '1' });
    expect(out.photoVideoCombo).toBe(true);
  });
  it('omits photoVideoCombo otherwise', () => {
    expect(parseVendorFilterParams({}).photoVideoCombo).toBeUndefined();
  });
});

describe('applyVendorFilters — services membership', () => {
  function fakeQuery(calls: Array<[string, string, unknown]>) {
    const fake: Record<string, unknown> = {};
    for (const m of ['eq', 'gte', 'lte', 'contains', 'overlaps']) {
      fake[m] = (col: string, val: unknown) => {
        calls.push([m, col, val]);
        return fake;
      };
    }
    return fake;
  }

  it('filters category via services overlap (not .eq)', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, { category: 'photography' });
    expect(calls).toContainEqual(['overlaps', 'services', ['photography']]);
    expect(calls.some(([m, col]) => m === 'eq' && col === 'category')).toBe(false);
  });

  it('combo filter requires BOTH photography and videography', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, { photoVideoCombo: true });
    expect(calls).toContainEqual(['contains', 'services', ['photography', 'videography']]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/vendor-filters.test.ts`
Expected: FAIL (`photoVideoCombo` unknown; category still uses `.eq`; `overlaps` not on fake type mismatch).

- [ ] **Step 3: Extend `VendorFilterParams` + parser**

In `src/lib/vendor-filters.ts`, add to the interface (after `subcategories?`):

```ts
  subcategories?: string[];
  years?: number;
  /** "One vendor for photo + video" — requires BOTH services. */
  photoVideoCombo?: boolean;
```

In `parseVendorFilterParams`, before `return out;`:

```ts
if (get('photoVideo') === '1') out.photoVideoCombo = true;
```

- [ ] **Step 4: Switch `applyVendorFilters` to overlap + combo**

Widen the generic constraint and replace the category line:

```ts
export function applyVendorFilters<
  Q extends { eq: any; gte: any; lte: any; contains: any; overlaps: any },
>(query: Q, filters: VendorFilterParams): Q {
  let q = query;
  if (filters.category) q = q.overlaps('services', [filters.category]);
  if (filters.photoVideoCombo) q = q.contains('services', ['photography', 'videography']);
  if (filters.verified) q = q.eq('verified', true);
  if (filters.respondsIn) q = q.lte('response_sla_hours', filters.respondsIn);
  if (filters.years) q = q.gte('years_in_business', filters.years);
  // ... (price block + languages + subcategories unchanged) ...
```

(Leave the price-deferred comment and the `languages` / `subcategories` `.contains` blocks exactly as-is.)

- [ ] **Step 5: Mirror the change in `countFilteredVendors`**

Replace `if (filters.category) query = query.eq('category', filters.category);` with:

```ts
if (filters.category) query = query.overlaps('services', [filters.category]);
if (filters.photoVideoCombo) query = query.contains('services', ['photography', 'videography']);
```

- [ ] **Step 6: Count by services membership in `getCategoryVendorCounts`**

In `src/lib/vendor-categories/queries.ts`, change the select + loop:

```ts
const { data, error } = await supabase
  .from('vendor_profiles')
  .select('category, services')
  .eq('is_active', true)
  .eq('onboarding_complete', true);

if (error || !data) {
  return initial;
}

for (const row of data) {
  const r = row as { category: string; services: string[] | null };
  // Count toward every featured service the vendor offers. Fall back to the
  // primary category for any legacy row where services wasn't backfilled.
  const offered = r.services && r.services.length > 0 ? r.services : [r.category];
  for (const slug of offered) {
    if (featuredSlugs.has(slug)) initial[slug] += 1;
  }
}

return initial;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/vendor-filters.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + commit**

Run: `npx tsc --noEmit` (Expected: PASS), then:

```bash
git add src/lib/vendor-filters.ts src/lib/vendor-categories/queries.ts src/__tests__/lib/vendor-filters.test.ts
git commit -m "feat(filters): browse by services overlap + photo/video combo filter"
```

---

## Task 5: Filter UI — `photoVideoCombo` state + toggle section

**Files:**

- Modify: `src/components/marketplace/filters/use-filter-state.ts:9-95`
- Create: `src/components/marketplace/filters/sections/PhotoVideoComboSection.tsx`
- Modify: `src/components/marketplace/filters/AllFiltersSheet.tsx:15,97-106`

**Interfaces:**

- Consumes: `FilterState`, `patch` (existing hook).
- Produces: `FilterState.photoVideoCombo: boolean`; URL param `photoVideo=1`; `<PhotoVideoComboSection state patch />`.

- [ ] **Step 1: Add `photoVideoCombo` to FilterState + serialization**

In `use-filter-state.ts`:

Add to `FilterState` (after `subcategories`):

```ts
  subcategories: string[]; // sorted slugs
  /** "One vendor for photo + video" — requires BOTH services. */
  photoVideoCombo: boolean;
```

Add to `EMPTY_STATE`:

```ts
  subcategories: [],
  photoVideoCombo: false,
};
```

Add to `readFilterState` return object:

```ts
    subcategories: parseList('subcategories'),
    photoVideoCombo: get('photoVideo') === '1',
  };
```

Add to `serializeFilterState`:

```ts
if (state.subcategories.length > 0) p.set('subcategories', state.subcategories.join(','));
if (state.photoVideoCombo) p.set('photoVideo', '1');
return p;
```

- [ ] **Step 2: Write the round-trip test**

Append to `src/__tests__/lib/vendor-filters.test.ts` (imports the pure state fns):

```ts
import {
  readFilterState,
  serializeFilterState,
} from '@/components/marketplace/filters/use-filter-state';

describe('FilterState — photoVideoCombo round-trip', () => {
  it('serializes and re-reads photoVideoCombo', () => {
    const params = serializeFilterState({
      q: '',
      category: null,
      verified: false,
      respondsIn: 0,
      priceBand: null,
      priceMin: null,
      priceMax: null,
      languages: [],
      years: 0,
      events: [],
      subcategories: [],
      photoVideoCombo: true,
    });
    expect(params.get('photoVideo')).toBe('1');
    expect(readFilterState(params).photoVideoCombo).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/vendor-filters.test.ts`
Expected: PASS (state edits already applied in Step 1).

- [ ] **Step 4: Create the toggle section**

Create `src/components/marketplace/filters/sections/PhotoVideoComboSection.tsx`:

```tsx
'use client';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

/**
 * "One vendor for photo + video" — matches vendors whose services include BOTH
 * photography and videography (AND-membership), for couples who want a single
 * studio for all camera needs. Distinct from the per-category filters, which are
 * OR-membership on services.
 */
export function PhotoVideoComboSection({ state, patch }: Props) {
  const on = state.photoVideoCombo;
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Photography &amp; video
      </h5>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => patch({ photoVideoCombo: !on })}
        className="flex w-full items-center justify-between rounded-sm py-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <span>One vendor for photo + video</span>
        <span
          className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? 'bg-ink' : 'bg-hairline'}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-cream transition-transform ${on ? 'translate-x-4' : ''}`}
          />
        </span>
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Render the section in the sheet**

In `AllFiltersSheet.tsx`, add the import beside the others (after line 15):

```ts
import { CategorySpecificSection } from './sections/CategorySpecificSection';
import { PhotoVideoComboSection } from './sections/PhotoVideoComboSection';
```

And render it in the body, right after `<CategorySection ... />` (line 97):

```tsx
            <CategorySection state={state} patch={patch} />
            <PhotoVideoComboSection state={state} patch={patch} />
```

- [ ] **Step 6: Typecheck + lint + commit**

Run: `npx tsc --noEmit && npm run lint` (Expected: PASS), then:

```bash
git add src/components/marketplace/filters/use-filter-state.ts src/components/marketplace/filters/sections/PhotoVideoComboSection.tsx src/components/marketplace/filters/AllFiltersSheet.tsx src/__tests__/lib/vendor-filters.test.ts
git commit -m "feat(filters): add 'one vendor for photo + video' toggle"
```

---

## Task 6: Onboarding — validate + persist `services[]`

**Files:**

- Modify: `src/lib/onboarding/validation.ts:1-36`
- Modify: `src/app/api/vendor-profile/setup/[step]/route.ts:79-102`
- Modify: `src/app/dashboard/profile/setup/basics/page.tsx:24-40`
- Test: `src/__tests__/lib/onboarding-validation.test.ts` (create)

**Interfaces:**

- Consumes: `VENDOR_CATEGORIES` (Task 2), `services` column (Task 1).
- Produces: `basicsSchema` accepts + validates `services: string[]`; the setup route persists `services` (deduped, primary included); the basics page hydrates `initial.services`. `BasicsInput` gains `services: string[]`.

- [ ] **Step 1: Write the failing validation test**

Create `src/__tests__/lib/onboarding-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { basicsSchema } from '@/lib/onboarding/validation';

const base = { businessName: 'Studio X', category: 'photography', bio: '' };

describe('basicsSchema — services', () => {
  it('accepts valid service slugs', () => {
    const r = basicsSchema.safeParse({
      ...base,
      services: ['photography', 'videography', 'content_creation'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown service slug', () => {
    const r = basicsSchema.safeParse({ ...base, services: ['photography', 'not_a_service'] });
    expect(r.success).toBe(false);
  });

  it('defaults services to [] when omitted', () => {
    const r = basicsSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.services).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/onboarding-validation.test.ts`
Expected: FAIL (`services` not on schema; unknown slug accepted).

- [ ] **Step 3: Add `services` to `basicsSchema`**

In `src/lib/onboarding/validation.ts`, add the import and a category set at the top (after existing imports):

```ts
import { VENDOR_CATEGORIES } from '@/lib/utils';

const VALID_CATEGORY_SLUGS = new Set<string>(VENDOR_CATEGORIES);
```

Add `services` to the object and a refine:

```ts
export const basicsSchema = z
  .object({
    businessName: z.string().min(1).max(120),
    category: z.string().min(1),
    bio: z.string().max(500, 'Bio must be 500 characters or fewer'),
    subcategories: z.array(z.string()).optional().default([]),
    services: z.array(z.string()).optional().default([]),
  })
  .refine(
    (d) => {
      if (!d.subcategories || d.subcategories.length === 0) return true;
      const valid = validSubcategorySlugs(d.category);
      if (valid.size === 0) return true;
      return d.subcategories.every((s) => valid.has(s));
    },
    { message: 'Invalid subcategory slug', path: ['subcategories'] }
  )
  .refine((d) => (d.services ?? []).every((s) => VALID_CATEGORY_SLUGS.has(s)), {
    message: 'Invalid service',
    path: ['services'],
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/onboarding-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Persist `services` in the setup route**

In `src/app/api/vendor-profile/setup/[step]/route.ts`, inside the `basics` branch, replace the `payload` object (lines ~79-102). Widen the category cast with the two new values and compute a deduped `services` that always includes the primary:

```ts
const services = Array.from(new Set([data.category, ...(data.services ?? [])]));

const payload = {
  user_id: user.id,
  business_name: data.businessName,
  category: data.category as
    | 'photography'
    | 'videography'
    | 'content_creation'
    | 'mehndi'
    | 'hair_makeup'
    | 'dj'
    | 'photobooth'
    | 'catering'
    | 'venue'
    | 'decor'
    | 'invitations'
    | 'bridal_wear'
    | 'live_music'
    | 'carts'
    | 'gifts',
  bio: data.bio,
  services,
  subcategories: validSubcategorySlugs(data.category).size > 0 ? (data.subcategories ?? []) : null,
  slug: existingSlug ?? slugWithSuffix(data.businessName),
};
```

- [ ] **Step 6: Hydrate `services` on the basics page**

In `src/app/dashboard/profile/setup/basics/page.tsx`, add `services` to the select and to the `initial` prop:

```ts
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('business_name, category, bio, subcategories, services')
    .eq('id', profileId)
    .maybeSingle();
  return (
    <StepBasics
      profileId={profileId}
      mode={mode}
      initial={{
        businessName: profile?.business_name ?? '',
        category: profile?.category ?? '',
        bio: profile?.bio ?? '',
        subcategories: (profile?.subcategories as string[] | null) ?? [],
        services:
          (profile?.services as string[] | null) ??
          (profile?.category ? [profile.category] : []),
      }}
    />
  );
```

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` (Expected: PASS — note StepBasics `initial` type is widened in Task 7; if tsc flags the `services` prop here, proceed to Task 7 which adds it, then re-run. To keep this task self-contained, apply the one-line `initial` type change from Task 7 Step 1 now.), then:

```bash
git add src/lib/onboarding/validation.ts "src/app/api/vendor-profile/setup/[step]/route.ts" src/app/dashboard/profile/setup/basics/page.tsx src/__tests__/lib/onboarding-validation.test.ts
git commit -m "feat(onboarding): validate + persist vendor services[]"
```

---

## Task 7: Onboarding UI — services multi-select + generalized subtype heading

**Files:**

- Create: `src/components/onboarding/ServicesMultiSelect.tsx`
- Modify: `src/components/onboarding/StepBasics.tsx:23-34,136-178`
- Test: `src/__tests__/components/onboarding/services-multi-select.test.tsx` (create)

**Interfaces:**

- Consumes: `VENDOR_CATEGORIES`, `VENDOR_CATEGORY_LABELS` (Task 2); `SUBCATEGORY_SECTION_LABEL` (Task 3).
- Produces: `<ServicesMultiSelect primary selected onChange />` where `selected` is the full `services[]` (incl. primary); StepBasics writes `data.services`.

- [ ] **Step 1: Widen `StepBasics` `initial` type**

In `src/components/onboarding/StepBasics.tsx`, update the `Props.initial` type (line 27):

```ts
  initial: {
    businessName: string;
    category: string;
    bio: string;
    subcategories: string[];
    services: string[];
  };
```

- [ ] **Step 2: Write the failing component test**

Create `src/__tests__/components/onboarding/services-multi-select.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServicesMultiSelect } from '@/components/onboarding/ServicesMultiSelect';

describe('ServicesMultiSelect', () => {
  it('shows the primary as a locked chip and toggles others', () => {
    const onChange = vi.fn();
    render(
      <ServicesMultiSelect primary="photography" selected={['photography']} onChange={onChange} />
    );
    // Primary label present, not a toggle button.
    expect(screen.getByText(/Photography · Primary/)).toBeInTheDocument();
    // Toggle "Videography & Content" adds it to the set (primary preserved).
    fireEvent.click(screen.getByRole('button', { name: /Videography & Content/ }));
    expect(onChange).toHaveBeenCalledWith(['photography', 'videography']);
  });

  it('does not render the primary as a toggle option', () => {
    render(
      <ServicesMultiSelect primary="photography" selected={['photography']} onChange={() => {}} />
    );
    expect(screen.queryByRole('button', { name: /^Photography$/ })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/onboarding/services-multi-select.test.tsx`
Expected: FAIL (component does not exist).

- [ ] **Step 4: Create `ServicesMultiSelect`**

Create `src/components/onboarding/ServicesMultiSelect.tsx`:

```tsx
'use client';

import { cn, VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

/** Photo/video/content mesh most — surface them first so dual studios opt in. */
const VISUAL_CLUSTER = ['photography', 'videography', 'content_creation'];

interface Props {
  /** The vendor's primary category — always included, shown locked. */
  primary: string;
  /** Full services list (includes primary). */
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

/**
 * Multi-select over the category vocabulary for "other services you offer".
 * The primary is rendered as a locked chip (can't be removed); the rest toggle.
 * `selected` / `onChange` carry the FULL services set (primary included), so the
 * invariant "services always contains the primary" holds by construction.
 */
export function ServicesMultiSelect({ primary, selected, onChange, className }: Props) {
  const rank = (slug: string) => {
    const v = VISUAL_CLUSTER.indexOf(slug);
    return v >= 0 ? v : 100 + VENDOR_CATEGORIES.indexOf(slug);
  };
  const options = VENDOR_CATEGORIES.filter((c) => c !== primary).sort((a, b) => rank(a) - rank(b));

  const toggle = (slug: string) => {
    if (selected.includes(slug)) onChange(selected.filter((s) => s !== slug));
    else onChange([...selected, slug]);
  };

  return (
    <div
      className={cn('flex flex-wrap gap-2', className)}
      role="group"
      aria-label="Services offered"
    >
      <span className="rounded-full border border-ink bg-ink px-3 py-1.5 text-sm text-cream">
        {VENDOR_CATEGORY_LABELS[primary] ?? primary} · Primary
      </span>
      {options.map((slug) => {
        const isOn = selected.includes(slug);
        return (
          <button
            type="button"
            key={slug}
            aria-pressed={isOn}
            onClick={() => toggle(slug)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              isOn
                ? 'border-ink bg-ink text-cream'
                : 'border-hairline bg-cream text-ink hover:border-ink'
            )}
          >
            {VENDOR_CATEGORY_LABELS[slug] ?? slug}
          </button>
        );
      })}
    </div>
  );
}
```

(Confirm `cn` is exported from `@/lib/utils` — it is used by `SubcategoryMultiSelect.tsx` via the same import path. If `VENDOR_CATEGORIES`/`VENDOR_CATEGORY_LABELS` are not re-exported alongside `cn`, import them from `@/lib/utils` directly — they are all in that module.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/onboarding/services-multi-select.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire `ServicesMultiSelect` + generalize subtype heading in `StepBasics`**

In `StepBasics.tsx`, extend the imports (near lines 23-24):

```ts
import { SubcategoryMultiSelect } from './SubcategoryMultiSelect';
import { ServicesMultiSelect } from './ServicesMultiSelect';
import { getSubcategoriesForCategory, SUBCATEGORY_SECTION_LABEL } from '@/lib/vendor-subcategories';
```

Make the category `Select`'s `onValueChange` keep `services` in sync (replace lines 138-141):

```ts
          onValueChange={(v) => {
            setData({
              ...data,
              category: v,
              // Drop the old primary, add the new one; keep other services.
              services: Array.from(
                new Set([v, ...data.services.filter((s) => s !== data.category)])
              ),
            });
            clearField('category');
          }}
```

Immediately after the category `</div>` block (after line 164), insert the services multi-select. When the primary is in the visual cluster, lead with the explicit prompt:

```tsx
{
  data.category && (
    <div className="space-y-2">
      <Label>
        {['photography', 'videography', 'content_creation'].includes(data.category)
          ? 'Do you also shoot video? Create content / reels?'
          : 'Other services you offer'}
      </Label>
      <p className="text-xs text-ink/60">
        Add every service you offer — you&apos;ll show up under each. You can change this later.
      </p>
      <ServicesMultiSelect
        primary={data.category}
        selected={data.services}
        onChange={(next) => setData({ ...data, services: next })}
      />
    </div>
  );
}
```

Generalize the subtype block heading (replace the hardcoded `<Label>Cart types you offer</Label>` at line 168 and its helper `<p>`):

```tsx
{
  getSubcategoriesForCategory(data.category).length > 0 && (
    <div className="space-y-2">
      <Label>{SUBCATEGORY_SECTION_LABEL[data.category] ?? 'Type'}</Label>
      <p className="text-xs text-ink/60">
        Pick the types your business offers. You can change this later.
      </p>
      <SubcategoryMultiSelect
        category={data.category}
        selected={data.subcategories}
        onChange={(next) => setData({ ...data, subcategories: next })}
      />
    </div>
  );
}
```

- [ ] **Step 7: Verify onboarding still submits services**

`saveAndAdvance` (line 48) already re-parses `data` and sends `...parsed.data`; since `basicsSchema` now includes `services` (Task 6) and `data.services` is populated, no change is needed there. Confirm by reading lines 48-65 — the body is `JSON.stringify({ ...parsed.data, profile_id: profileId })`.

- [ ] **Step 8: Typecheck + lint + full test + commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run` (Expected: PASS), then:

```bash
git add src/components/onboarding/ServicesMultiSelect.tsx src/components/onboarding/StepBasics.tsx src/__tests__/components/onboarding/services-multi-select.test.tsx
git commit -m "feat(onboarding): multi-service picker + visual-cluster prompt + generic subtype heading"
```

---

## Task 8: Homepage tiles — content_creation + gifts

**Files:**

- Modify: `src/lib/vendor-categories/featured.ts:1-8,26-131`

**Interfaces:**

- Consumes: nothing (data-only). `getCategoryVendorCounts` (Task 4) already counts by services, so the new tiles get correct counts.
- Produces: `CATEGORIES_FEATURED` now 15 entries incl. `content_creation` + `gifts`.

**Asset note (not a code placeholder):** the two new tiles need hero images. This task ships with **interim** reused UploadThing URLs (both already owned/self-hosted, so nothing breaks) and a `TODO(assets)` marker. Sourcing dedicated images is a follow-up, tracked in "Post-implementation".

- [ ] **Step 1: Update the header comment count**

In `src/lib/vendor-categories/featured.ts`, change the two "13" references in the top doc comment (lines 2 and 6) to "15".

- [ ] **Step 2: Add the `content_creation` tile**

Insert immediately after the `videography` entry (after line 42), keeping the "Visual" kicker grouping:

```ts
  {
    slug: 'content_creation',
    label: 'Content Creation / Reels',
    kicker: 'Visual',
    // TODO(assets): swap for a dedicated content-creator hero. Interim reuses the
    // videography image (owned UploadThing URL) so the tile renders correctly.
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPOFxoUEHZicD1KWg6MSjTLJnYR98myEdeAlNo',
    alt: 'Wedding content creator filming vertical video on a phone',
    comingSoon: false,
  },
```

- [ ] **Step 3: Add the `gifts` tile**

Insert at the end of the array (after the `invitations` entry, before the closing `];`):

```ts
  {
    slug: 'gifts',
    label: 'Gifts & Favors',
    kicker: 'Keepsakes',
    // TODO(assets): swap for a dedicated gifts/favors hero. Interim reuses the
    // invitations image (owned UploadThing URL) so the tile renders correctly.
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPMv9lRdmgjcGt0Y28Ud3veWMADNfQ7oKupbIC',
    alt: 'Curated wedding favor boxes and gift hampers',
    comingSoon: false,
  },
```

- [ ] **Step 4: Typecheck + build + commit**

Run: `npx tsc --noEmit && npm run build` (Expected: PASS — build exercises the homepage server component), then:

```bash
git add src/lib/vendor-categories/featured.ts
git commit -m "feat(home): add Content Creation + Gifts & Favors category tiles"
```

---

## Task 9: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Full unit/integration test run**

Run: `npx vitest run`
Expected: PASS (all suites, incl. the new taxonomy/filters/validation/component tests).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, then verify by hand:

1. Onboarding → Basics: pick **Photography**; the "Do you also shoot video? Create content / reels?" block appears; check **Videography** + **Content Creation / Reels**; the **Photography type** subtype chips appear; save.
2. Browse → All filters: the **Photography & video → "One vendor for photo + video"** toggle appears; enabling it narrows results (URL gains `photoVideo=1`).
3. The multi-service vendor from step 1 appears under **both** the Photography and Videography category filters.
4. Homepage strip shows **Content Creation / Reels** and **Gifts & Favors** tiles (15 total).

- [ ] **Step 5: Commit any smoke-test fixes, then open PR**

```bash
git push -u origin explore/vendor-types-taxonomy
gh pr create --title "feat(vendors): multi-service model + taxonomy expansion (content_creation, gifts, photo/catering subtypes, photo+video filter)" --body "Implements docs/superpowers/specs/2026-08-09-vendor-types-taxonomy-design.md and docs/superpowers/plans/2026-08-09-vendor-multi-service-taxonomy.md"
```

---

## Post-implementation (follow-ups, not blocking)

- **Prod migration:** user applies `00073_vendor_profiles_services_and_gifts.sql` to prod (per migration policy).
- **Tile art:** replace the two `TODO(assets)` interim `photoUrl`s in `featured.ts` with dedicated content-creator + gifts hero images (upload to UploadThing).
- **Vendor card secondary-services hint** (deferred polish from the spec): show "+ Video, Content" beyond the primary label on `VendorCard`.
- **Count double-attribution:** multi-service vendors now count toward multiple tiles (intended — reflects browse membership). Revisit only if it reads as inflated.
- **Existing dual-listed vendors:** if any vendor made two profiles to fake photo+video, consider an optional merge tool (out of scope here).
