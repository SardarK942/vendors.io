# Baazar Homepage Hero + CategoryHoverExpand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement [the homepage hero spec](../specs/2026-05-25-baazar-homepage-hero-design.md) — rewrite `src/app/(marketplace)/page.tsx` hero block to the V2 asymmetric layout with locked headline "All your vendors. _One bazaar._" + "Cultural" subhead. Replace `CategoryGrid` with new `CategoryHoverExpand` (framer-motion-based, 11 featured vendor categories with Skiper UI's hover-expand interaction). Add migration 00042 to extend `vendor_profiles.category` CHECK with 3 new categories (`bridal_wear`, `live_music`, `carts`). Flag Bridal Wear + Decor + Venue as Coming Soon Day 1.

**Architecture:** Server component (`HomepageHero`) composes left type stack + right brand panel (`HomepageWordmarkPanel`). Client component (`CategoryHoverExpand`) wraps framer-motion for the 11-tile expanding strip; mobile falls back to a separate `CategoryHoverExpandMobile` simpler grid (no animation). Pure data lives in `src/lib/vendor-categories/featured.ts` (locked category list with photos + Coming Soon flags); per-category vendor counts derived server-side via `getCategoryVendorCounts()` and passed down. Migration adds 3 new categories to the existing text + CHECK constraint pattern (no enum changes); existing `photobooth` + `invitations` categories stay valid in DB even though they're not featured on the homepage.

**Tech Stack:** Next.js 14 App Router · React 18 · TypeScript · Tailwind 3.4 · Supabase Postgres · **framer-motion (NEW)** · vitest.

**Branch:** `feat/baazar-homepage-hero` (already created, spec committed at `bdd8d12`).

**Out of scope (deferred):** Flat-fee business model infrastructure for Bridal Wear + Decor + Venue, licensed/curated category photography (Unsplash stand-ins Day 1), empty-state design for `/vendors?category=X`, sticky search bar, removal of `photobooth`/`invitations` from DB, "Why Couples Trust Us" trust-signals section refresh, AI search prompt structural rewrite (just adds the 3 new category names).

---

## File Structure

| File                                                       | Action     | Responsibility                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/00042_vendor_categories_expand.sql`   | **Create** | Drop + recreate `vendor_profiles.category` CHECK to add `bridal_wear`, `live_music`, `carts`. Preserves all 10 existing values.                                                                                                                                                          |
| `src/types/database.types.ts`                              | **Modify** | Append 3 new values to the `vendor_profiles.category` union type.                                                                                                                                                                                                                        |
| `src/lib/utils.ts`                                         | **Modify** | Extend `VENDOR_CATEGORIES` (13 total) + `VENDOR_CATEGORY_LABELS` (3 new + 1 renamed label).                                                                                                                                                                                              |
| `src/lib/ai/search.ts`                                     | **Modify** | Update line 31 prompt to list all 13 categories so AI search can classify queries into the new ones.                                                                                                                                                                                     |
| `src/lib/vendor-categories/featured.ts`                    | **Create** | Pure data: `FeaturedCategory` type + `CATEGORIES_FEATURED` constant (the 11-tile homepage strip in locked order with photos + Coming Soon flags).                                                                                                                                        |
| `src/__tests__/lib/vendor-categories/featured.test.ts`     | **Create** | TDD tests: length, slug validity, Coming Soon set, ordering invariants.                                                                                                                                                                                                                  |
| `src/lib/vendor-categories/queries.ts`                     | **Create** | Server-only helper `getCategoryVendorCounts(supabase)` → `Record<slug, number>` of vendors per featured category.                                                                                                                                                                        |
| `src/__tests__/lib/vendor-categories/queries.test.ts`      | **Create** | TDD tests for the helper (returns zero map when no vendors, sums per category, filters to featured slugs only).                                                                                                                                                                          |
| `src/components/marketplace/HomepageWordmarkPanel.tsx`     | **Create** | Server component. Tagline + static Devanagari wordmark + 4-script glyph row.                                                                                                                                                                                                             |
| `src/components/marketplace/HomepageHero.tsx`              | **Create** | Server component. V2 asymmetric grid. Composes left type stack (kicker + headline + subhead + SearchBar + dual CTAs) + right panel.                                                                                                                                                      |
| `src/components/marketplace/CategoryHoverExpand.tsx`       | **Create** | Client component, `'use client'`. Wraps framer-motion for 11-tile expanding strip. Desktop only (renders nothing under `lg:`).                                                                                                                                                           |
| `src/components/marketplace/CategoryHoverExpandMobile.tsx` | **Create** | Client component, `'use client'`. Mobile fallback grid. Renders only under `lg:`.                                                                                                                                                                                                        |
| `src/app/(marketplace)/page.tsx`                           | **Modify** | Replace hero JSX with `<HomepageHero />`. Replace `<CategoryGrid />` block with `<CategoryHoverExpand />` + `<CategoryHoverExpandMobile />` + attribution caption. Add count fetch.                                                                                                      |
| `src/components/marketplace/CategoryGrid.tsx`              | **Delete** | Only call site was homepage. Replaced.                                                                                                                                                                                                                                                   |
| `package.json`                                             | **Modify** | Add `framer-motion` as a dependency (latest stable major).                                                                                                                                                                                                                               |
| `DESIGN.md`                                                | **Modify** | Update 4 spots that reference the old headline: line 205 (hot-pink description), line 218 (italic accent example), line 291 (display-md homepage hero example), line 306 (italic accent rule example). Add `homepage-hero:` and `category-hover-expand:` entries to `components:` block. |

---

## Task 1: Migration 00042 + apply to dev

**Files:**

- Create: `supabase/migrations/00042_vendor_categories_expand.sql`

- [ ] **Step 1: Verify existing constraint name**

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT conname FROM pg_constraint WHERE conrelid = 'vendor_profiles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%category%';"
```

Expected: `vendor_profiles_category_check` (or similar — note the exact name; reuse it in the migration's DROP statement).

- [ ] **Step 2: Write the migration**

Write to `supabase/migrations/00042_vendor_categories_expand.sql`:

```sql
-- Adds 3 new vendor categories: bridal_wear, live_music, carts.
-- Preserves all 10 existing categories (no removals — photobooth + invitations
-- stay valid in the DB so existing vendor rows survive; they're just no longer
-- featured on the homepage strip).
--
-- Bridal Wear ships as "Coming Soon" Day 1; future flat-fee listing sub-project
-- will onboard real vendors via a different business model (vendors pay a yearly
-- listing fee rather than per-booking commission).

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

If Step 1 returned a different constraint name, substitute it in the DROP line.

- [ ] **Step 3: Apply to dev DB**

Dev DB password for this session: `$uperLocked$300` (sensitive — pass via inline `PGPASSWORD=` only, never echo/persist to any file).

```bash
PGPASSWORD='$uperLocked$300' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00042_vendor_categories_expand.sql
```

Expected: 2 × `ALTER TABLE`.

- [ ] **Step 4: Sanity check**

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'vendor_profiles_category_check';"
```

Expected: definition includes all 13 categories (10 originals + bridal_wear + live_music + carts).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00042_vendor_categories_expand.sql
git commit -m "feat(homepage): vendor_profiles category CHECK + bridal_wear/live_music/carts"
```

---

## Task 2: Sync database.types.ts + extend utils.ts

**Files:**

- Modify: `src/types/database.types.ts`
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Find the category union type in database.types.ts**

```bash
grep -n "photography.*videography\|videography.*mehndi" src/types/database.types.ts | head -5
```

There may be multiple matches (Row, Insert, Update, Relationships). Identify the union type for `vendor_profiles.category`.

- [ ] **Step 2: Append the 3 new category values to each union**

For each location where the union appears, append `| 'bridal_wear' | 'live_music' | 'carts'`. The union should expand from the existing 10 values to 13.

If the union appears like:

```ts
category: 'photography' |
  'videography' |
  'mehndi' |
  'hair_makeup' |
  'dj' |
  'photobooth' |
  'catering' |
  'venue' |
  'decor' |
  'invitations';
```

Change to:

```ts
category: 'photography' |
  'videography' |
  'mehndi' |
  'hair_makeup' |
  'dj' |
  'photobooth' |
  'catering' |
  'venue' |
  'decor' |
  'invitations' |
  'bridal_wear' |
  'live_music' |
  'carts';
```

Update Row, Insert, and Update entries if all three exist with the union.

- [ ] **Step 3: Update `VENDOR_CATEGORIES` and `VENDOR_CATEGORY_LABELS` in `src/lib/utils.ts`**

Find the existing exports (around the top of the file). Replace them with:

```ts
// All categories valid in the DB (vendor_profiles.category CHECK).
// Some are not featured on the homepage but are kept for existing-row compatibility
// (photobooth + invitations) or land Day 1 as "Coming Soon" (bridal_wear + decor + venue).
// Featured-on-homepage subset is exported separately from src/lib/vendor-categories/featured.ts.
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

Note the 4 label changes from the previous version:

- `videography`: "Videography" → "Videography & Content"
- `dj`: "DJ & Music" → "DJ"
- Three NEW labels added.

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean. Other consumers of `VENDOR_CATEGORIES`/`VENDOR_CATEGORY_LABELS` (VendorProfileForm, VendorProfile, etc.) auto-pick up the new values because they iterate the constant.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.types.ts src/lib/utils.ts
git commit -m "feat(homepage): extend vendor categories + sync types"
```

---

## Task 3: Update AI search prompt

**Files:**

- Modify: `src/lib/ai/search.ts`

- [ ] **Step 1: Update the category enumeration**

Read `src/lib/ai/search.ts` around line 31. Find the line:

```
- category: one of photography,videography,mehndi,hair_makeup,dj,photobooth,catering,venue,decor,invitations (or null)
```

Replace with:

```
- category: one of photography,videography,mehndi,hair_makeup,dj,photobooth,catering,venue,decor,invitations,bridal_wear,live_music,carts (or null)
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/search.ts
git commit -m "feat(homepage): include new categories in AI search prompt"
```

---

## Task 4: Featured category list + tests (TDD)

**Files:**

- Create: `src/lib/vendor-categories/featured.ts`
- Create: `src/__tests__/lib/vendor-categories/featured.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/vendor-categories/featured.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CATEGORIES_FEATURED, type FeaturedCategory } from '@/lib/vendor-categories/featured';
import { VENDOR_CATEGORIES } from '@/lib/utils';

describe('CATEGORIES_FEATURED', () => {
  it('has exactly 11 entries', () => {
    expect(CATEGORIES_FEATURED).toHaveLength(11);
  });

  it('matches the locked bride-journey order', () => {
    expect(CATEGORIES_FEATURED.map((c) => c.slug)).toEqual([
      'photography',
      'videography',
      'hair_makeup',
      'bridal_wear',
      'mehndi',
      'catering',
      'carts',
      'dj',
      'live_music',
      'decor',
      'venue',
    ]);
  });

  it('marks bridal_wear, decor, and venue as comingSoon: true Day 1', () => {
    const comingSoonSlugs = CATEGORIES_FEATURED.filter((c) => c.comingSoon).map((c) => c.slug);
    expect(comingSoonSlugs).toEqual(['bridal_wear', 'decor', 'venue']);
  });

  it('every slug exists in the canonical VENDOR_CATEGORIES constant', () => {
    for (const c of CATEGORIES_FEATURED) {
      expect(VENDOR_CATEGORIES).toContain(c.slug);
    }
  });

  it('every entry has a non-empty photoUrl and alt text', () => {
    for (const c of CATEGORIES_FEATURED) {
      expect(c.photoUrl).toMatch(/^https?:\/\//);
      expect(c.alt.length).toBeGreaterThan(4);
    }
  });

  it('every entry has a kicker label and display label', () => {
    for (const c of CATEGORIES_FEATURED) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.kicker.length).toBeGreaterThan(0);
    }
  });

  it('exports the FeaturedCategory type', () => {
    const sample: FeaturedCategory = {
      slug: 'photography',
      label: 'Photography',
      kicker: 'Visual',
      photoUrl: 'https://example.com/x.jpg',
      alt: 'A photographer at work',
      comingSoon: false,
    };
    expect(sample.slug).toBe('photography');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/lib/vendor-categories/featured.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/vendor-categories/featured'`.

- [ ] **Step 3: Write the featured constant**

Write to `src/lib/vendor-categories/featured.ts`:

```ts
/**
 * The 11 vendor categories featured on the homepage HoverExpand strip.
 * Locked order (bride-journey first) and Coming Soon flags per the spec
 * at docs/superpowers/specs/2026-05-25-baazar-homepage-hero-design.md.
 *
 * The full DB-valid category list (13) lives in src/lib/utils.ts as
 * VENDOR_CATEGORIES. This file is the marketing-surface subset.
 */

export interface FeaturedCategory {
  /** Matches vendor_profiles.category in the DB. */
  slug: string;
  /** Display name on the active tile. */
  label: string;
  /** Grouping kicker shown above the label (e.g. "Visual", "Beauty"). */
  kicker: string;
  /** Hero photo for the tile. Day 1 = Unsplash stand-ins; future = curated. */
  photoUrl: string;
  /** Photo alt text. */
  alt: string;
  /** When true, tile shows the "Coming Soon" treatment regardless of vendor count. */
  comingSoon: boolean;
}

export const CATEGORIES_FEATURED: readonly FeaturedCategory[] = [
  {
    slug: 'photography',
    label: 'Photography',
    kicker: 'Visual',
    photoUrl: 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=1200&q=85',
    alt: 'South Asian wedding couple under a mandap',
    comingSoon: false,
  },
  {
    slug: 'videography',
    label: 'Videography & Content',
    kicker: 'Visual',
    photoUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&q=85',
    alt: 'Videographer shooting an event with a cinema camera',
    comingSoon: false,
  },
  {
    slug: 'hair_makeup',
    label: 'Hair & Makeup',
    kicker: 'Beauty',
    photoUrl: 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=1200&q=85',
    alt: 'Bride having her makeup applied by an artist',
    comingSoon: false,
  },
  {
    slug: 'bridal_wear',
    label: 'Bridal Wear',
    kicker: 'Beauty',
    photoUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1200&q=85',
    alt: 'Bridal lehenga detail on a hanger',
    comingSoon: true,
  },
  {
    slug: 'mehndi',
    label: 'Mehndi / Henna',
    kicker: 'Tradition',
    photoUrl: 'https://images.unsplash.com/photo-1604423466938-c63b29b9c5e9?w=1200&q=85',
    alt: 'Hands decorated with intricate mehndi henna designs',
    comingSoon: false,
  },
  {
    slug: 'catering',
    label: 'Catering',
    kicker: 'Food',
    photoUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=85',
    alt: 'South Asian wedding catering buffet spread',
    comingSoon: false,
  },
  {
    slug: 'carts',
    label: 'Carts',
    kicker: 'Food',
    photoUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=85',
    alt: 'Chai cart with steaming cups at a wedding',
    comingSoon: false,
  },
  {
    slug: 'dj',
    label: 'DJ',
    kicker: 'Entertainment',
    photoUrl: 'https://images.unsplash.com/photo-1571266028253-6c1d4040d6cc?w=1200&q=85',
    alt: 'DJ at the turntables with festival lighting',
    comingSoon: false,
  },
  {
    slug: 'live_music',
    label: 'Live Music & Performance',
    kicker: 'Entertainment',
    photoUrl: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=1200&q=85',
    alt: 'Dhol drummer performing at a wedding baraat',
    comingSoon: false,
  },
  {
    slug: 'decor',
    label: 'Decor & Floral',
    kicker: 'Atmosphere',
    photoUrl: 'https://images.unsplash.com/photo-1561128290-006dc4827214?w=1200&q=85',
    alt: 'Floral installation at a wedding mandap',
    comingSoon: true,
  },
  {
    slug: 'venue',
    label: 'Venue',
    kicker: 'Space',
    photoUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=85',
    alt: 'Wedding venue ballroom set for a reception',
    comingSoon: true,
  },
];
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/lib/vendor-categories/featured.test.ts
```

Expected: 7/7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendor-categories/featured.ts src/__tests__/lib/vendor-categories/featured.test.ts
git commit -m "feat(homepage): CATEGORIES_FEATURED locked list + tests"
```

---

## Task 5: getCategoryVendorCounts helper + tests (TDD)

**Files:**

- Create: `src/lib/vendor-categories/queries.ts`
- Create: `src/__tests__/lib/vendor-categories/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/vendor-categories/queries.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCategoryVendorCounts } from '@/lib/vendor-categories/queries';

function buildSupabase(rows: Array<{ category: string }>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: rows, error: null }),
    })),
  } as never;
}

describe('getCategoryVendorCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a record with counts per category', async () => {
    const sb = buildSupabase([
      { category: 'photography' },
      { category: 'photography' },
      { category: 'mehndi' },
      { category: 'carts' },
    ]);
    const result = await getCategoryVendorCounts(sb);
    expect(result.photography).toBe(2);
    expect(result.mehndi).toBe(1);
    expect(result.carts).toBe(1);
  });

  it('returns 0 for featured categories with no vendors', async () => {
    const sb = buildSupabase([{ category: 'photography' }]);
    const result = await getCategoryVendorCounts(sb);
    expect(result.mehndi).toBe(0);
    expect(result.bridal_wear).toBe(0);
    expect(result.venue).toBe(0);
  });

  it('ignores categories not in CATEGORIES_FEATURED (e.g., photobooth, invitations)', async () => {
    const sb = buildSupabase([
      { category: 'photography' },
      { category: 'photobooth' },
      { category: 'invitations' },
    ]);
    const result = await getCategoryVendorCounts(sb);
    expect(result.photography).toBe(1);
    expect(result).not.toHaveProperty('photobooth');
    expect(result).not.toHaveProperty('invitations');
  });

  it('returns all-zero map when query errors', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
      })),
    } as never;
    const result = await getCategoryVendorCounts(sb);
    expect(result.photography).toBe(0);
    expect(result.venue).toBe(0);
  });

  it('returns a key for every featured slug', async () => {
    const sb = buildSupabase([]);
    const result = await getCategoryVendorCounts(sb);
    expect(Object.keys(result).sort()).toEqual(
      [
        'bridal_wear',
        'carts',
        'catering',
        'decor',
        'dj',
        'hair_makeup',
        'live_music',
        'mehndi',
        'photography',
        'venue',
        'videography',
      ].sort()
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/lib/vendor-categories/queries.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/vendor-categories/queries'`.

- [ ] **Step 3: Write the helper**

Write to `src/lib/vendor-categories/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { CATEGORIES_FEATURED } from './featured';

type Sb = SupabaseClient<Database>;

/**
 * Returns a count of vendor_profiles per featured homepage category.
 * Always returns an entry for every slug in CATEGORIES_FEATURED (zero
 * if no vendors). Non-featured categories (photobooth, invitations)
 * are excluded from the result.
 *
 * Failures are non-fatal: returns all-zero map and the caller renders
 * tiles with "Coming Soon" treatment for slugs with count 0.
 */
export async function getCategoryVendorCounts(supabase: Sb): Promise<Record<string, number>> {
  const featuredSlugs = new Set(CATEGORIES_FEATURED.map((c) => c.slug));

  const initial = Object.fromEntries(CATEGORIES_FEATURED.map((c) => [c.slug, 0])) as Record<
    string,
    number
  >;

  const { data, error } = await supabase.from('vendor_profiles').select('category');

  if (error || !data) {
    return initial;
  }

  for (const row of data) {
    const cat = (row as { category: string }).category;
    if (featuredSlugs.has(cat)) {
      initial[cat] += 1;
    }
  }

  return initial;
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/lib/vendor-categories/queries.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendor-categories/queries.ts src/__tests__/lib/vendor-categories/queries.test.ts
git commit -m "feat(homepage): getCategoryVendorCounts helper + tests"
```

---

## Task 6: Add framer-motion dependency

**Files:**

- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install framer-motion**

```bash
npm install framer-motion
```

Expected: `framer-motion` added to `dependencies` in `package.json` (latest stable, likely ^11 or ^12). `package-lock.json` updated.

- [ ] **Step 2: Verify install**

```bash
grep "framer-motion" package.json
```

Expected: one line showing `"framer-motion": "^X.Y.Z"`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(homepage): add framer-motion for CategoryHoverExpand animation"
```

---

## Task 7: HomepageWordmarkPanel server component

**Files:**

- Create: `src/components/marketplace/HomepageWordmarkPanel.tsx`

No tests (DOM-heavy server component with static markup; visual verification in Task 13 covers it).

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/HomepageWordmarkPanel.tsx`:

```tsx
/**
 * Right-side brand panel of the V2 asymmetric homepage hero.
 * Tagline + static Devanagari wordmark + 4-script glyph row.
 * No animation — the footer carries the page's one cycling wordmark moment.
 */
export function HomepageWordmarkPanel() {
  return (
    <div className="relative hidden border-l border-hairline pl-16 lg:block">
      <p className="m-0 mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        MADE IN <span className="text-haldi">CHICAGO</span>
      </p>

      <h2
        aria-label="Baazar"
        className="m-0 leading-[0.85] tracking-[-0.03em] text-ink"
        style={{
          fontFamily: 'var(--font-wordmark-deva), serif',
          fontSize: 'clamp(72px, 9vw, 130px)',
          fontWeight: 400,
        }}
      >
        <span aria-hidden="true">बाज़ार</span>
        <span aria-hidden="true" className="text-hot-pink">
          .
        </span>
      </h2>

      <div className="mt-5 flex items-baseline gap-4" aria-label="Scripts">
        <span
          title="Hindi"
          className="text-base font-semibold leading-none text-ink"
          style={{ fontFamily: 'var(--font-wordmark-deva), serif' }}
        >
          बाज़ार
        </span>
        <span
          title="Urdu"
          className="text-xs leading-none text-ink-soft"
          style={{ fontFamily: 'var(--font-wordmark-nastaliq), serif' }}
        >
          بازار
        </span>
        <span
          title="Arabic"
          className="text-sm leading-none text-ink-soft"
          style={{ fontFamily: 'var(--font-wordmark-naskh), serif' }}
        >
          بازار
        </span>
        <span
          title="Persian"
          className="text-base leading-none text-ink-soft"
          style={{ fontFamily: 'var(--font-wordmark-persian), serif' }}
        >
          بازار
        </span>
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
git add src/components/marketplace/HomepageWordmarkPanel.tsx
git commit -m "feat(homepage): HomepageWordmarkPanel right-side brand panel"
```

---

## Task 8: HomepageHero server component

**Files:**

- Create: `src/components/marketplace/HomepageHero.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/HomepageHero.tsx`:

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/marketplace/SearchBar';
import { HomepageWordmarkPanel } from '@/components/marketplace/HomepageWordmarkPanel';

export interface HomepageHeroProps {
  /** When true, render the "List your business" secondary CTA. */
  showVendorCta: boolean;
}

/**
 * V2 asymmetric homepage hero: left = type stack (kicker + headline + subhead +
 * SearchBar + dual CTAs), right = brand panel (static Devanagari wordmark + 4-
 * script glyph row). Stacks to single-column under lg: breakpoint (the right
 * panel hides on mobile per HomepageWordmarkPanel's `hidden lg:block` class).
 *
 * Locked copy per docs/superpowers/specs/2026-05-25-baazar-homepage-hero-design.md.
 */
export function HomepageHero({ showVendorCta }: HomepageHeroProps) {
  return (
    <section className="pb-22 lg:gap-18 grid grid-cols-1 gap-10 px-6 pt-16 lg:grid-cols-[1.5fr_1fr] lg:px-14 lg:pb-24 lg:pt-24">
      <div className="text-left">
        <p className="m-0 mb-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Baazar · Chicago weddings
        </p>

        <h1
          className="m-0 mb-7 font-serif font-extrabold leading-[0.92] tracking-[-0.025em] text-ink"
          style={{ fontSize: 'clamp(44px, 6vw, 76px)' }}
        >
          All your vendors.
          <br />
          <em className="font-medium italic text-hot-pink">One bazaar.</em>
        </h1>

        <p className="m-0 mb-8 max-w-[520px] text-lg leading-[1.55] text-ink-muted">
          Chicago&rsquo;s marketplace for{' '}
          <span className="bg-haldi box-decoration-clone px-2 pb-1 pt-0 text-ink">Cultural</span>{' '}
          wedding vendors. Discover, compare, and book with confidence.
        </p>

        <div className="mb-4">
          <SearchBar />
        </div>

        <div className="flex gap-3">
          <Button size="lg" asChild>
            <Link href="/vendors">Browse all vendors</Link>
          </Button>
          {showVendorCta && (
            <Button size="lg" variant="outline" asChild>
              <Link href="/signup">List your business</Link>
            </Button>
          )}
        </div>
      </div>

      <HomepageWordmarkPanel />
    </section>
  );
}
```

The `<em>` element is browser-default italic; `font-medium italic text-hot-pink` ensures weight 500 + hot-pink color (italic is reinforced but redundant — safer than not specifying it).

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/HomepageHero.tsx
git commit -m "feat(homepage): HomepageHero V2 asymmetric + locked copy"
```

---

## Task 9: CategoryHoverExpand client component

**Files:**

- Create: `src/components/marketplace/CategoryHoverExpand.tsx`

No tests for the React/DOM body; visual verification in Task 13 covers behavior.

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/CategoryHoverExpand.tsx`:

```tsx
'use client';

/**
 * HoverExpand pattern adapted from Skiper UI 52 HoverExpand_001 (https://skiper-ui.com).
 * Original by @gurvinder-singh02 / @Gur__vi.
 * Adapted to M+ design tokens + Baazar's 11 featured vendor categories.
 *
 * Renders only at lg: breakpoint and up. Mobile uses CategoryHoverExpandMobile.
 */

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { FeaturedCategory } from '@/lib/vendor-categories/featured';

export interface CategoryHoverExpandProps {
  categories: readonly FeaturedCategory[];
  /** Vendor counts per slug — server-provided. Zero counts trigger "Coming Soon". */
  counts: Record<string, number>;
}

function plural(label: string): string {
  if (label.endsWith('y')) return label.slice(0, -1) + 'ies';
  return label + 's';
}

export function CategoryHoverExpand({ categories, counts }: CategoryHoverExpandProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const reducedMotion = useReducedMotion();

  return (
    <div
      role="region"
      aria-label="Browse vendors by category"
      className="mx-auto hidden w-full max-w-[1280px] gap-1.5 px-6 py-12 lg:flex"
    >
      {categories.map((cat, i) => {
        const isActive = i === activeIndex;
        const count = counts[cat.slug] ?? 0;
        const isComingSoon = cat.comingSoon || count === 0;
        const href = `/vendors?category=${cat.slug}`;
        const motionTransition = reducedMotion
          ? { duration: 0 }
          : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

        return (
          <motion.div
            key={cat.slug}
            initial={false}
            animate={{
              flex: isActive ? '1 1 26rem' : '0 0 4rem',
            }}
            transition={motionTransition}
            className="relative h-[26rem] overflow-hidden rounded-lg"
            onMouseEnter={() => setActiveIndex(i)}
          >
            <Link
              href={href}
              aria-current={isActive ? 'true' : undefined}
              aria-label={`${cat.label} category`}
              className="absolute inset-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              onClick={(e) => {
                // First interaction on a collapsed tile = expand only; don't navigate.
                // Click on the already-active tile = navigate.
                if (!isActive) {
                  e.preventDefault();
                  setActiveIndex(i);
                }
              }}
            >
              <Image
                src={cat.photoUrl}
                alt={cat.alt}
                fill
                sizes="(min-width: 1024px) 26rem, 100vw"
                className="object-cover"
                priority={i < 3}
              />

              {/* Dark wash when inactive (drops on active) */}
              <div
                className={`duration-[320ms] absolute inset-0 bg-ink/45 transition-opacity ${
                  isActive ? 'opacity-0' : 'opacity-100'
                }`}
              />

              {/* Bottom gradient when active (for content readability) */}
              <div
                className={`duration-[320ms] absolute inset-0 bg-gradient-to-t from-ink/[0.78] to-transparent transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Collapsed-state rotated label */}
              <span
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-cream transition-opacity duration-200 ${
                  isActive ? 'opacity-0' : 'opacity-100'
                }`}
              >
                {cat.label}
              </span>

              {/* Active-state content overlay */}
              <div
                className={`duration-[320ms] absolute bottom-0 left-0 right-0 p-6 text-cream transition-opacity delay-100 ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {isComingSoon ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                        {cat.kicker}
                      </span>
                      <span className="rounded-full bg-ink-soft/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cream">
                        Joining soon
                      </span>
                    </div>
                    <h3 className="m-0 mb-1 font-serif text-[28px] font-bold leading-tight tracking-[-0.012em]">
                      {cat.label}
                    </h3>
                    <p className="m-0 mb-3 text-sm text-cream/85">
                      Vendors are joining the platform.
                    </p>
                    <a
                      href="#newsletter"
                      className="inline-flex items-center gap-2 rounded-full bg-cream/[0.16] px-3.5 py-2 text-sm font-semibold text-cream backdrop-blur-sm hover:bg-cream/25"
                      onClick={(e) => {
                        e.preventDefault();
                        document.querySelector('footer')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      Get notified <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </>
                ) : (
                  <>
                    <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-haldi">
                      {cat.kicker}
                    </p>
                    <h3 className="m-0 mb-1 font-serif text-[28px] font-bold leading-tight tracking-[-0.012em]">
                      {cat.label}
                    </h3>
                    <p className="m-0 mb-3 text-sm text-cream/85">
                      {count} {plural(cat.label.toLowerCase())} in Chicago
                    </p>
                    <span className="inline-flex items-center gap-2 rounded-full bg-cream/[0.16] px-3.5 py-2 text-sm font-semibold text-cream backdrop-blur-sm">
                      Browse {cat.label.toLowerCase()}{' '}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </>
                )}
              </div>
            </Link>
          </motion.div>
        );
      })}
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
git add src/components/marketplace/CategoryHoverExpand.tsx
git commit -m "feat(homepage): CategoryHoverExpand framer-motion strip"
```

---

## Task 10: CategoryHoverExpandMobile client component

**Files:**

- Create: `src/components/marketplace/CategoryHoverExpandMobile.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/CategoryHoverExpandMobile.tsx`:

```tsx
'use client';

/**
 * Mobile fallback for CategoryHoverExpand. Renders below lg: breakpoint.
 * 2-col grid of square cards (no animation). Same data shape.
 */

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { FeaturedCategory } from '@/lib/vendor-categories/featured';

export interface CategoryHoverExpandMobileProps {
  categories: readonly FeaturedCategory[];
  counts: Record<string, number>;
}

function plural(label: string): string {
  if (label.endsWith('y')) return label.slice(0, -1) + 'ies';
  return label + 's';
}

export function CategoryHoverExpandMobile({ categories, counts }: CategoryHoverExpandMobileProps) {
  return (
    <div
      role="region"
      aria-label="Browse vendors by category"
      className="mx-auto grid w-full max-w-[640px] grid-cols-1 gap-3 px-6 py-8 sm:grid-cols-2 lg:hidden"
    >
      {categories.map((cat) => {
        const count = counts[cat.slug] ?? 0;
        const isComingSoon = cat.comingSoon || count === 0;
        const href = `/vendors?category=${cat.slug}`;

        return (
          <Link
            key={cat.slug}
            href={href}
            aria-label={`${cat.label} category`}
            className="group relative block aspect-square overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            <Image
              src={cat.photoUrl}
              alt={cat.alt}
              fill
              sizes="(max-width: 640px) 100vw, 320px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/[0.78] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 text-cream">
              {isComingSoon ? (
                <>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="rounded-full bg-ink-soft/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]">
                      Joining soon
                    </span>
                  </div>
                  <h3 className="m-0 font-serif text-lg font-bold leading-tight tracking-[-0.012em]">
                    {cat.label}
                  </h3>
                </>
              ) : (
                <>
                  <p className="m-0 mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-haldi">
                    {cat.kicker}
                  </p>
                  <h3 className="m-0 mb-0.5 font-serif text-lg font-bold leading-tight tracking-[-0.012em]">
                    {cat.label}
                  </h3>
                  <p className="m-0 mb-2 text-xs text-cream/85">{count} in Chicago</p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold">
                    Browse <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </>
              )}
            </div>
          </Link>
        );
      })}
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
git add src/components/marketplace/CategoryHoverExpandMobile.tsx
git commit -m "feat(homepage): CategoryHoverExpandMobile fallback grid"
```

---

## Task 11: Wire homepage page.tsx + delete CategoryGrid

**Files:**

- Modify: `src/app/(marketplace)/page.tsx`
- Delete: `src/components/marketplace/CategoryGrid.tsx`

- [ ] **Step 1: Replace page.tsx**

Read the existing `src/app/(marketplace)/page.tsx`. The current file (~100 lines) renders inline hero JSX + `<CategoryGrid />` + trust signals. Replace the entire file with:

```tsx
import { CheckCircle, Shield, Clock } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HomepageHero } from '@/components/marketplace/HomepageHero';
import { CategoryHoverExpand } from '@/components/marketplace/CategoryHoverExpand';
import { CategoryHoverExpandMobile } from '@/components/marketplace/CategoryHoverExpandMobile';
import { CATEGORIES_FEATURED } from '@/lib/vendor-categories/featured';
import { getCategoryVendorCounts } from '@/lib/vendor-categories/queries';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();

  // Determine whether to show the "List your business" CTA (hide for couples).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    role = profile?.role ?? null;
  }
  const showVendorCta = role !== 'couple';

  // Per-category vendor counts for the HoverExpand tiles.
  const counts = await getCategoryVendorCounts(supabase);

  return (
    <div>
      {/* Hero — V2 asymmetric */}
      <HomepageHero showVendorCta={showVendorCta} />

      {/* Section header */}
      <header className="mx-auto max-w-[1280px] px-6 pb-2 pt-12 text-center lg:px-14">
        <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Browse by category
        </p>
        <h2
          className="m-0 mb-2 font-serif font-bold leading-[0.96] tracking-[-0.020em] text-ink"
          style={{ fontSize: 'clamp(28px, 3.5vw, 44px)' }}
        >
          Every vendor your celebration needs.
        </h2>
        <p className="m-0 mx-auto max-w-[540px] text-base text-ink-muted">
          Photography, mehndi, catering, and eight more. Hover to peek; click to browse.
        </p>
      </header>

      {/* HoverExpand — desktop */}
      <CategoryHoverExpand categories={CATEGORIES_FEATURED} counts={counts} />

      {/* Mobile fallback */}
      <CategoryHoverExpandMobile categories={CATEGORIES_FEATURED} counts={counts} />

      {/* Skiper UI attribution */}
      <p className="mx-auto max-w-[1280px] px-6 pb-8 text-center text-[10px] text-ink-soft lg:px-14">
        Category browser pattern adapted from{' '}
        <a href="https://skiper-ui.com" target="_blank" rel="noopener" className="hover:text-ink">
          Skiper UI
        </a>{' '}
        · Original by{' '}
        <a href="https://x.com/Gur__vi" target="_blank" rel="noopener" className="hover:text-ink">
          @Gur__vi
        </a>
      </p>

      {/* Trust Signals — pre-M+, deferred refresh per spec */}
      <section className="mx-auto max-w-[1280px] rounded-xl bg-muted/50 px-6 py-12 lg:px-14">
        <h2 className="mb-8 text-center text-2xl font-bold">Why Couples Trust Us</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Verified Vendors</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Every vendor is verified. Real businesses, real portfolios, real pricing.
            </p>
          </div>
          <div className="text-center">
            <Shield className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Secure Deposits</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Small hold deposits powered by Stripe. Full refund if vendor doesn&apos;t confirm.
            </p>
          </div>
          <div className="text-center">
            <Clock className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Fast Response</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Vendors must respond within 72 hours. No more waiting weeks for quotes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
```

The trust-signals section is kept intentionally (per spec, refreshing it is out of scope). The `space-y-16 py-8` outer wrapper from the original is dropped because each section now manages its own padding.

- [ ] **Step 2: Delete CategoryGrid**

Verify no other call sites first:

```bash
grep -rn "CategoryGrid" src/ --include="*.tsx" --include="*.ts"
```

Expected: only matches inside `src/components/marketplace/CategoryGrid.tsx` itself (the export). If anything else references it, STOP and report.

Then delete:

```bash
git rm src/components/marketplace/CategoryGrid.tsx
```

- [ ] **Step 3: Verify typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(marketplace)/page.tsx'
git commit -m "feat(homepage): wire V2 hero + CategoryHoverExpand, remove CategoryGrid"
```

---

## Task 12: DESIGN.md updates

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Update headline references**

Read `DESIGN.md`. Apply the following 4 changes:

**Change 1 (line ~205)** — the `hot-pink` color description:

- Find: `Italic display accent ("Quiet chaos")`
- Replace: `Italic display accent ("One bazaar")`

**Change 2 (line ~218)** — the brand voice section:

- Find: `(e.g., "Loud weddings. _Quiet chaos_.")`
- Replace: `(e.g., "All your vendors. _One bazaar_.")`

**Change 3 (line ~291)** — the typography scale `display-md` entry:

- Find: `Homepage hero ("Loud weddings…")`
- Replace: `Homepage hero ("All your vendors…")`

**Change 4 (line ~306)** — the italic accents rule:

- Find: `(e.g., "Loud weddings. _Quiet chaos_.")`
- Replace: `(e.g., "All your vendors. _One bazaar_.")`

If the surrounding text in any of these doesn't match exactly (e.g., the file has been reflowed), use `grep -n "Loud weddings\|Quiet chaos" DESIGN.md` to find the actual line and update the matching context.

- [ ] **Step 2: Add components entries**

Find the `components:` block in `DESIGN.md` frontmatter. Append (after the last existing entry, matching indent):

```yaml
homepage-hero:
  pattern: 'V2 asymmetric editorial. Left = type stack (kicker + Spectral headline + haldi-highlighted subhead + SearchBar + dual CTAs). Right = brand panel (hairline-separated, static Devanagari wordmark + 4-script glyph row). Stacks to single-column under lg:.'
  headline: "'All your vendors. <em>One bazaar.</em>' — display-md (clamp 36-60px). Italic hot-pink accent on 'One bazaar.' Locked copy."
  subhead: "'Chicago's marketplace for <Cultural> wedding vendors. Discover, compare, and book with confidence.' — body-lg / ink-muted. Haldi highlighter on 'Cultural'. Locked copy."
  haldi-budget: "Two haldi appearances per page: 'Cultural' in subhead + 'CHICAGO' in right-panel tagline. Per palette rule, no third."
  right-panel: "Hidden under lg: breakpoint (hero stacks to single-column on mobile). Tagline 'MADE IN CHICAGO' (haldi) + static Devanagari 'बाज़ार.' (hot-pink dot) + 4-script glyph row (Devanagari active = ink+600, others = ink-soft). No animation (footer carries the page's one cycling wordmark)."
category-hover-expand:
  pattern: 'Horizontal strip of 11 vendor-category tiles (Skiper UI HoverExpand_001 pattern, framer-motion-driven). Hover or click expands a tile to ~26rem; others collapse to ~4rem. Click expanded tile navigates to /vendors?category={slug}.'
  tokens: "Tiles use radii.lg (10px) — overrides Skiper's rounded-3xl. Active state: bottom gradient (from-transparent to-ink/78) + content overlay (haldi kicker + Spectral category name + count + cream/16 pill CTA). Inactive: bg-ink/45 wash + rotated cream label."
  motion: "320ms width transition, cubic-bezier(.22,1,.36,1) (motion.medium + ease-out-quart). Content fade-in delayed 100ms after width. Respects prefers-reduced-motion via framer's useReducedMotion (snap-instant)."
  coming-soon: "Tiles with comingSoon: true OR vendor count = 0 render with 'Joining soon' pill (ink-soft/20 bg) + 'Get notified' link that scrolls to footer newsletter. Click still navigates to /vendors?category={slug} (will show empty state)."
  mobile: 'lg:-and-up only. Mobile renders CategoryHoverExpandMobile — 2-col grid of square cards, no animation, content always visible.'
  attribution: 'Pattern adapted from Skiper UI (https://skiper-ui.com); original by @Gur__vi. Required attribution caption rendered between component and footer.'
```

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): update homepage hero locked copy + add component entries"
```

---

## Task 13: Visual verification (manual)

**Files:** none (browser-only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Wait for `Ready in <time>`. Visit `http://localhost:3000`.

- [ ] **Step 2: Verify hero (desktop)**

At full width (≥1024px):

1. Hero has 2 columns. Left = kicker (indigo, uppercase) + big Spectral headline "All your vendors." with hot-pink italic "One bazaar." on the next line + haldi-highlighted "Cultural" in subhead + SearchBar + dual ink/outline CTAs.
2. Right column = hairline-separated brand panel with "MADE IN CHICAGO" (CHICAGO in haldi) at top + giant Devanagari "बाज़ार" (with hot-pink dot) below + 4-script glyph row at the bottom (Devanagari = ink + bold, others = ink-soft).
3. Resize browser. At <1024px, the right panel disappears and the left stack becomes full-width.

- [ ] **Step 3: Verify CategoryHoverExpand**

1. Below the hero, see the "Browse by category" kicker + "Every vendor your celebration needs." display + subhead "Photography, mehndi, catering, and eight more. Hover to peek; click to browse."
2. 11 tiles in a row. First tile (Photography) is expanded by default; others are 4rem wide with a rotated label visible through the dark wash.
3. Hover any tile. It smoothly expands (320ms); previously-active tile collapses. Active tile shows haldi kicker + Spectral category name + count + "Browse {category}" pill.
4. Click the active tile (after it's expanded). Navigates to `/vendors?category={slug}`.
5. Click a collapsed tile. First click expands (doesn't navigate). Second click navigates.
6. Hover the Bridal Wear, Decor, or Venue tiles. Coming-Soon variant: "Joining soon" pill + "Vendors are joining the platform." + "Get notified" link. Click "Get notified" — scrolls smoothly to footer.

- [ ] **Step 4: Verify mobile fallback**

Resize browser to <1024px (e.g., 375px). Confirm:

- Hero stacks to single column (no right panel)
- HoverExpand disappears, replaced by 2-col grid (or 1-col under sm:)
- Each grid card shows the photo + kicker + category name + count + Browse link
- Coming-Soon cards show the "Joining soon" pill + bigger label

- [ ] **Step 5: Verify reduced-motion**

In Chrome DevTools → Rendering tab → "Emulate CSS media feature prefers-reduced-motion" → "reduce". Reload `/`. The HoverExpand width transitions should be instant (no animation). Hover/click still works.

- [ ] **Step 6: Verify DB-driven counts**

Run:

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT category, COUNT(*) FROM vendor_profiles GROUP BY category ORDER BY category;"
```

Counts shown on each tile should match this query (for the 9 commission categories; Coming-Soon tiles always show the Joining-soon treatment regardless of count).

- [ ] **Step 7: Verify dev server logs**

Check `npm run dev` output. No errors related to:

- Missing framer-motion exports
- Image domain not configured (Unsplash should already be allowed; if not, add `next.config.js` remotePatterns entry — note as a discovery item if it errors)
- Hydration mismatches between server-rendered hero and client-rendered HoverExpand

If anything fails, fix the underlying issue, re-verify. No commit for this task.

---

## Task 14: Plan doc commit + push + PR

**Files:** none — git operations only.

- [ ] **Step 1: Commit the plan doc**

```bash
git status --short docs/superpowers/plans/2026-05-25-baazar-homepage-hero.md
```

If listed as untracked (`??`):

```bash
git add docs/superpowers/plans/2026-05-25-baazar-homepage-hero.md
git commit -m "docs(plan): Baazar homepage hero implementation plan"
```

- [ ] **Step 2: Final verification**

```bash
npm run typecheck
npm run lint
npm test
```

Expected:

- typecheck: clean (pre-existing `.next/types/.../setup/layout.ts` error if present is OK)
- lint: clean (pre-existing warnings OK)
- test: all new tests (Task 4 = 7 tests, Task 5 = 5 tests = 12 new) plus existing suite. The 3 pre-existing failures (`vendor-profile-publish` ×2 + `publishGateSchema` ×1) unchanged.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/baazar-homepage-hero
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(homepage): Baazar V2 asymmetric hero + CategoryHoverExpand + 3 new vendor categories" --body "$(cat <<'EOF'
## Summary

Implements [the homepage hero spec](docs/superpowers/specs/2026-05-25-baazar-homepage-hero-design.md) — the first real production page using all locked foundation tokens.

### What's in this PR

- **Hero rewrite** — V2 asymmetric layout via new `HomepageHero` + `HomepageWordmarkPanel` components. Locked headline "All your vendors. _One bazaar._" with hot-pink italic accent. Haldi-highlighted "Cultural" subhead (replaces "South Asian" framing per the broader cultural marketplace positioning).
- **`CategoryHoverExpand`** — new framer-motion-based 11-tile expanding strip (Skiper UI pattern adapted to M+ tokens). Click expanded tile → navigate to `/vendors?category={slug}`.
- **`CategoryHoverExpandMobile`** — separate 2-col grid fallback under `lg:` breakpoint (HoverExpand pattern doesn't translate to mobile).
- **3 new vendor categories** — `bridal_wear`, `live_music`, `carts`. Migration 00042 extends the CHECK constraint (preserves all 10 existing values including `photobooth` + `invitations`).
- **Coming Soon tiles** — Bridal Wear, Decor, Venue all flagged `comingSoon: true` Day 1. Future flat-fee listing sub-project will onboard them via different business model (multi-SKU/consultative sales don't fit per-booking commission).
- **`CategoryGrid` deleted** — only call site was the homepage.
- **`framer-motion` added** as a dependency.
- **DESIGN.md updated** — 4 spots referencing the old "Loud weddings / Quiet chaos" copy updated to "All your vendors / One bazaar"; new `homepage-hero:` and `category-hover-expand:` component entries added.

## Out of scope (deferred per spec)

- Flat-fee business model infrastructure for Bridal Wear + Decor + Venue (separate sub-project)
- Licensed/curated category photography (Day 1 = Unsplash stand-ins)
- Empty-state design for `/vendors?category=X` when 0 vendors
- "Why Couples Trust Us" trust-signals section refresh (left as-is)
- Sticky search bar

## Test plan

- [ ] `/` renders the V2 hero at desktop width: left type stack + right brand panel
- [ ] Headline reads "All your vendors. _One bazaar._" with the italic accent in hot-pink
- [ ] Subhead has "Cultural" highlighted in haldi
- [ ] Right panel shows "MADE IN CHICAGO" (CHICAGO in haldi) + giant Devanagari wordmark + 4-script glyph row
- [ ] Hero stacks to single-column under lg: (right panel hides)
- [ ] Below the hero, "Browse by category" section header + HoverExpand strip with 11 tiles
- [ ] First tile (Photography) is expanded by default; hovering any other expands it smoothly (320ms)
- [ ] Click expanded tile → navigates to /vendors?category={slug}
- [ ] Click collapsed tile → expands only (doesn't navigate); second click commits
- [ ] Bridal Wear / Decor / Venue tiles show "Joining soon" pill + "Get notified" link
- [ ] "Get notified" link scrolls to footer newsletter
- [ ] Mobile (375px width): 2-col grid replaces the HoverExpand
- [ ] `prefers-reduced-motion: reduce` → no width animation, snap-instant
- [ ] Vendor counts shown on each non-Coming-Soon tile match DB query

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL.

- [ ] **Step 5: Report**

Report DONE | DONE_WITH_CONCERNS | BLOCKED with:

- Final test results
- PR URL
- Any concerns (e.g., Unsplash image URL 404s that needed swapping)
