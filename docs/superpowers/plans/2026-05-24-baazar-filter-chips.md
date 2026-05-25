# Baazar Filter Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/vendors` left-rail `FilterSidebar` with the Baazar M+ chip primitive + chip row + "All filters" side-drawer (Vaul) per [`2026-05-24-baazar-filter-chips-design.md`](../specs/2026-05-24-baazar-filter-chips-design.md). Add 3 vendor-profile fields (`languages`, `years_in_business`, `response_sla_hours`) via DB migration + a combined "Profile details" onboarding wizard step + an existing-vendor backfill banner.

**Architecture:** Chip primitive component (5 variants) + composing surface files (chip row, sheet, sections) + URL-state hook + shared filter→Supabase query function used by both the page and a new `/api/vendors/count` route (for the sheet's live "Show N vendors" footer). One combined onboarding wizard step adds all 3 new fields. Existing vendors get a dismissable backfill banner that links into a backfill-mode of the same step. Sidebar deleted; grid goes full-width.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind 3.4, `vaul` (already installed from PR #18), `lucide-react`, `@radix-ui/react-tooltip` (locked), Supabase (Postgres) for migrations. Builds on the locked button + tooltip + search bar primitives.

**Branch:** `feat/baazar-filter-chips` (already created, spec committed at `a5ee55f`).

**Plan deviation from spec literal text:** Spec says "3 onboarding wizard step additions"; this plan combines them into ONE step (`/dashboard/profile/setup/details`) with all three fields on a single screen. Same outcome, fewer click-throughs, less wizard fatigue.

---

## File Structure

| File                                                                      | Action                 | Responsibility                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/00036_vendor_profile_filter_fields.sql`              | **Create**             | 3 new `vendor_profiles` columns + 1 `users.profile_backfill_dismissed_at` column + indices                              |
| `src/components/marketplace/filters/constants.ts`                         | **Create**             | LANGUAGES, EVENT_TYPES, RESPONSE_SLA_OPTIONS, YEARS_OPTIONS, PRICE_BANDS                                                |
| `src/components/marketplace/filters/use-filter-state.ts`                  | **Create**             | URL-state hook for filter values + active-dropdown + sheet-open state                                                   |
| `src/lib/vendor-filters.ts`                                               | **Create**             | Shared Supabase query builder — used by `/vendors/page.tsx` AND `/api/vendors/count/route.ts`                           |
| `src/app/api/vendors/count/route.ts`                                      | **Create**             | GET endpoint returning `{ count: number }` for live-count footer                                                        |
| `src/components/marketplace/filters/Chip.tsx`                             | **Create**             | Chip primitive (5 variants)                                                                                             |
| `src/components/marketplace/filters/PriceDropdown.tsx`                    | **Create**             | Price-band dropdown panel + 4 chip-row buttons                                                                          |
| `src/components/marketplace/filters/LanguagesDropdown.tsx`                | **Create**             | Multi-select languages dropdown panel                                                                                   |
| `src/components/marketplace/filters/FilterChipRow.tsx`                    | **Create**             | The chip row orchestrator: composes Chip + dropdowns + click-outside + Esc handling                                     |
| `src/components/marketplace/filters/AllFiltersSheet.tsx`                  | **Create**             | Vaul drawer + sticky footer with debounced live count                                                                   |
| `src/components/marketplace/filters/sections/TrustSection.tsx`            | **Create**             | Verified · Responds · Cash-friendly toggle rows in sheet                                                                |
| `src/components/marketplace/filters/sections/PriceSection.tsx`            | **Create**             | Band chips + min/max inputs                                                                                             |
| `src/components/marketplace/filters/sections/LanguagesSection.tsx`        | **Create**             | Multi-select chip group                                                                                                 |
| `src/components/marketplace/filters/sections/ExperienceSection.tsx`       | **Create**             | Years dropdown                                                                                                          |
| `src/components/marketplace/filters/sections/EventTypesSection.tsx`       | **Create**             | Multi-select chip group (UI placeholder, no backing this PR)                                                            |
| `src/components/marketplace/filters/sections/CategorySpecificSection.tsx` | **Create**             | Conditional renderer (UI placeholder per category, no backing this PR)                                                  |
| `src/components/marketplace/FilterSidebar.tsx`                            | **Delete**             | Replaced by chip row                                                                                                    |
| `src/app/(marketplace)/vendors/page.tsx`                                  | **Modify**             | Remove sidebar layout, add chip row inside sticky band, full-width grid, pass all filter params via `vendor-filters.ts` |
| `src/components/onboarding/StepDetails.tsx`                               | **Create**             | Combined "Profile details" step (Languages + Years + Response SLA)                                                      |
| `src/app/dashboard/profile/setup/details/page.tsx`                        | **Create**             | Route for the new step                                                                                                  |
| `src/components/onboarding/WizardStepper.tsx`                             | **Modify**             | Add `'details'` to STEPS array after `'online'`                                                                         |
| `src/lib/onboarding/resume.ts`                                            | **Modify**             | Update `nextIncompleteStep` to check the 3 new fields for completion                                                    |
| `src/components/dashboard/BackfillBanner.tsx`                             | **Create**             | Banner shown on dashboard when vendor has any of the 3 new fields NULL + not dismissed                                  |
| `src/app/dashboard/page.tsx` (or vendor dashboard root)                   | **Modify**             | Mount BackfillBanner when applicable                                                                                    |
| `src/app/api/users/me/dismiss-backfill/route.ts`                          | **Create**             | POST endpoint that sets `users.profile_backfill_dismissed_at = now()`                                                   |
| `DESIGN.md`                                                               | **Modify frontmatter** | Add `filter-chip` + `filter-sheet` entries                                                                              |

---

## Task 1: DB migration + constants file

**Files:**

- Create: `supabase/migrations/00036_vendor_profile_filter_fields.sql`
- Create: `src/components/marketplace/filters/constants.ts`

- [ ] **Step 1: Write the migration**

Write to `supabase/migrations/00036_vendor_profile_filter_fields.sql`:

```sql
-- 00036_vendor_profile_filter_fields.sql
-- Adds 3 vendor-profile fields for the Day-1 filter chip system + 1 user-side
-- dismissal flag for the backfill banner.
--
-- All vendor fields are NULL-able. NULL means "not provided yet" and is excluded
-- from filter matches (e.g. ?lang=hindi will not match a vendor with NULL languages).
-- Existing vendors keep NULL until they complete the backfill flow.

ALTER TABLE vendor_profiles
  ADD COLUMN languages text[] DEFAULT NULL,
  ADD COLUMN years_in_business int CHECK (years_in_business >= 0 AND years_in_business <= 99),
  ADD COLUMN response_sla_hours int CHECK (response_sla_hours IN (1, 4, 24, 48, 72));

-- GIN index for efficient "?lang=hindi,urdu" filters (array-overlap queries).
CREATE INDEX idx_vendor_profiles_languages
  ON vendor_profiles USING GIN (languages);

-- B-tree for "?respondsIn=24" filters (response_sla_hours <= 24).
CREATE INDEX idx_vendor_profiles_response_sla
  ON vendor_profiles (response_sla_hours);

-- B-tree for "?years=5" filters (years_in_business >= 5).
CREATE INDEX idx_vendor_profiles_years_in_business
  ON vendor_profiles (years_in_business);

-- One-time dismissal marker for the backfill banner shown to existing vendors.
ALTER TABLE users
  ADD COLUMN profile_backfill_dismissed_at timestamptz DEFAULT NULL;
```

- [ ] **Step 2: Apply the migration to local dev DB**

Run via psql per `migration_apply_policy.md` (Claude applies dev migrations directly):

```bash
psql "$DEV_DATABASE_URL" -f supabase/migrations/00036_vendor_profile_filter_fields.sql
```

Expected: `ALTER TABLE`, `CREATE INDEX × 3`, `ALTER TABLE` — five success lines.

If you don't have `DEV_DATABASE_URL` set, read `memory/supabase_prod_connection.md` for the dev DB connection pattern (it documents the prod pattern — adapt to dev).

- [ ] **Step 3: Write the constants file**

Write to `src/components/marketplace/filters/constants.ts`:

```ts
/**
 * Shared constants for the filter chip system + onboarding wizard.
 * Sourced of truth: this file. Both the chip UI and the onboarding wizard's
 * Languages/Years/Response-SLA inputs reference the same lists.
 */

export interface LanguageOption {
  slug: string;
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { slug: 'hindi', label: 'Hindi' },
  { slug: 'urdu', label: 'Urdu' },
  { slug: 'punjabi', label: 'Punjabi' },
  { slug: 'bengali', label: 'Bengali' },
  { slug: 'gujarati', label: 'Gujarati' },
  { slug: 'tamil', label: 'Tamil' },
  { slug: 'telugu', label: 'Telugu' },
  { slug: 'marathi', label: 'Marathi' },
  { slug: 'arabic', label: 'Arabic' },
  { slug: 'english', label: 'English' },
];

export type PriceBand = 'budget' | 'mid' | 'premium' | 'luxury';

export interface PriceBandOption {
  slug: PriceBand;
  label: string;
  /** Display shorthand for chip UI. */
  shorthand: string;
  /** Derived range in cents — used as placeholder in min/max inputs. */
  minCents: number;
  maxCents: number | null;
}

export const PRICE_BANDS: PriceBandOption[] = [
  { slug: 'budget', label: 'Budget', shorthand: '$', minCents: 0, maxCents: 100_000 },
  { slug: 'mid', label: 'Mid', shorthand: '$$', minCents: 100_000, maxCents: 500_000 },
  { slug: 'premium', label: 'Premium', shorthand: '$$$', minCents: 500_000, maxCents: 1_500_000 },
  { slug: 'luxury', label: 'Luxury', shorthand: '$$$$', minCents: 1_500_000, maxCents: null },
];

export const RESPONSE_SLA_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Within 1 hour' },
  { value: 4, label: 'Within 4 hours' },
  { value: 24, label: 'Within 24 hours' },
  { value: 48, label: 'Within 48 hours' },
  { value: 72, label: 'Within 72 hours' },
];

export const YEARS_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1+ years' },
  { value: 3, label: '3+ years' },
  { value: 5, label: '5+ years' },
  { value: 10, label: '10+ years' },
];

export const EVENT_TYPES: { slug: string; label: string }[] = [
  { slug: 'wedding', label: 'Wedding ceremony' },
  { slug: 'reception', label: 'Reception' },
  { slug: 'sangeet', label: 'Sangeet' },
  { slug: 'mehndi', label: 'Mehndi' },
  { slug: 'baraat', label: 'Baraat' },
  { slug: 'engagement', label: 'Engagement' },
];
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: only pre-existing `.next/types/.../setup/layout.ts` error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00036_vendor_profile_filter_fields.sql \
  src/components/marketplace/filters/constants.ts && \
git commit -m "feat(filters): migration + constants — languages, years, response SLA"
```

---

## Task 2: `use-filter-state.ts` hook

**Files:**

- Create: `src/components/marketplace/filters/use-filter-state.ts`

- [ ] **Step 1: Write the hook**

Write to `src/components/marketplace/filters/use-filter-state.ts`:

```ts
'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { PriceBand } from './constants';

export type FilterDropdown = 'price' | 'languages' | null;

export interface FilterState {
  verified: boolean;
  /** Hours int (1, 4, 24, 48, 72) — vendor matches if response_sla_hours <= this. 0 = unset. */
  respondsIn: number;
  cashFriendly: boolean;
  priceBand: PriceBand | null;
  priceMin: number | null; // cents
  priceMax: number | null; // cents
  languages: string[]; // sorted slugs
  years: number; // years_in_business >= this. 0 = unset.
  events: string[]; // sorted slugs
}

const EMPTY_STATE: FilterState = {
  verified: false,
  respondsIn: 0,
  cashFriendly: false,
  priceBand: null,
  priceMin: null,
  priceMax: null,
  languages: [],
  years: 0,
  events: [],
};

/**
 * Read FilterState from URLSearchParams. Pure function — exported for use by the
 * count API route as well as the hook.
 */
export function readFilterState(params: URLSearchParams): FilterState {
  const get = (k: string) => params.get(k);
  const parseList = (k: string): string[] => {
    const raw = get(k);
    if (!raw) return [];
    return raw.split(',').filter(Boolean).sort();
  };
  const parseInt0 = (k: string): number => {
    const raw = get(k);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const parseCents = (k: string): number | null => {
    const raw = get(k);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return {
    verified: get('verified') === '1',
    respondsIn: parseInt0('respondsIn'),
    cashFriendly: get('cashFriendly') === '1',
    priceBand: (get('priceBand') as PriceBand | null) ?? null,
    priceMin: parseCents('priceMin'),
    priceMax: parseCents('priceMax'),
    languages: parseList('lang'),
    years: parseInt0('years'),
    events: parseList('events'),
  };
}

/**
 * Serialize FilterState to URLSearchParams (omitting empty values).
 */
export function serializeFilterState(state: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.verified) p.set('verified', '1');
  if (state.respondsIn > 0) p.set('respondsIn', String(state.respondsIn));
  if (state.cashFriendly) p.set('cashFriendly', '1');
  if (state.priceBand) p.set('priceBand', state.priceBand);
  if (state.priceMin !== null) p.set('priceMin', String(state.priceMin));
  if (state.priceMax !== null) p.set('priceMax', String(state.priceMax));
  if (state.languages.length > 0) p.set('lang', state.languages.join(','));
  if (state.years > 0) p.set('years', String(state.years));
  if (state.events.length > 0) p.set('events', state.events.join(','));
  return p;
}

export interface UseFilterStateReturn {
  state: FilterState;
  patch: (changes: Partial<FilterState>) => void;
  reset: () => void;
  /** Currently open dropdown chip ('price' / 'languages' / null). */
  activeDropdown: FilterDropdown;
  setActiveDropdown: (d: FilterDropdown) => void;
  /** Whether the "All filters" sheet is open. */
  sheetOpen: boolean;
  setSheetOpen: (b: boolean) => void;
  /** Push the current state to the URL. Triggers server-side re-fetch. */
  apply: (overrides?: Partial<FilterState>) => void;
}

/**
 * Filter state + URL serialization hook. Mirrors useSearchState from the search bar
 * (PR #18) but for the filter chip surface.
 */
export function useFilterState(): UseFilterStateReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [state, setState] = useState<FilterState>(() =>
    readFilterState(new URLSearchParams(searchParams.toString()))
  );
  const [activeDropdown, setActiveDropdown] = useState<FilterDropdown>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const patch = useCallback(
    (changes: Partial<FilterState>) => setState((s) => ({ ...s, ...changes })),
    []
  );

  const reset = useCallback(() => setState(EMPTY_STATE), []);

  const apply = useCallback(
    (overrides?: Partial<FilterState>) => {
      const next: FilterState = { ...state, ...(overrides ?? {}) };
      const params = serializeFilterState(next);
      // Preserve category from search bar (managed by search-state hook) by
      // copying it over if present on the current URL.
      const currentCategory = searchParams.get('category');
      if (currentCategory) params.set('category', currentCategory);
      const qs = params.toString();
      const target = pathname + (qs ? `?${qs}` : '');
      router.push(target);
    },
    [router, pathname, searchParams, state]
  );

  return {
    state,
    patch,
    reset,
    activeDropdown,
    setActiveDropdown,
    sheetOpen,
    setSheetOpen,
    apply,
  };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: only pre-existing error.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/filters/use-filter-state.ts && \
git commit -m "feat(filters): use-filter-state hook + URL serialization"
```

---

## Task 3: Shared vendor-filters query function

**Files:**

- Create: `src/lib/vendor-filters.ts`

- [ ] **Step 1: Write the query builder**

Write to `src/lib/vendor-filters.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRICE_BANDS, type PriceBand } from '@/components/marketplace/filters/constants';

export interface VendorFilterParams {
  category?: string;
  verified?: boolean;
  respondsIn?: number;
  cashFriendly?: boolean;
  priceBand?: PriceBand;
  priceMin?: number; // cents
  priceMax?: number; // cents
  languages?: string[];
  years?: number;
  // events + style + cuisine etc — placeholder; not backed yet.
}

/**
 * Parse VendorFilterParams from URLSearchParams (server-side).
 * Mirrors readFilterState in use-filter-state.ts but returns the trimmed
 * server-friendly shape (only fields with a value).
 */
export function parseVendorFilterParams(
  params: Record<string, string | string[] | undefined>
): VendorFilterParams {
  const get = (k: string): string | undefined => {
    const v = params[k];
    return typeof v === 'string' ? v : undefined;
  };
  const out: VendorFilterParams = {};

  const category = get('category');
  if (category) out.category = category;
  if (get('verified') === '1') out.verified = true;
  if (get('cashFriendly') === '1') out.cashFriendly = true;

  const respondsIn = Number(get('respondsIn'));
  if (Number.isFinite(respondsIn) && respondsIn > 0) out.respondsIn = respondsIn;

  const priceBand = get('priceBand') as PriceBand | undefined;
  if (priceBand && PRICE_BANDS.some((b) => b.slug === priceBand)) out.priceBand = priceBand;

  const priceMin = Number(get('priceMin'));
  if (Number.isFinite(priceMin) && priceMin > 0) out.priceMin = priceMin;

  const priceMax = Number(get('priceMax'));
  if (Number.isFinite(priceMax) && priceMax > 0) out.priceMax = priceMax;

  const lang = get('lang');
  if (lang) out.languages = lang.split(',').filter(Boolean);

  const years = Number(get('years'));
  if (Number.isFinite(years) && years > 0) out.years = years;

  return out;
}

/**
 * Apply filter params to a Supabase vendor_profiles query.
 * Returns the chained query so the caller can add ordering + range + count modes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyVendorFilters<Q extends { eq: any; gte: any; lte: any; contains: any }>(
  query: Q,
  filters: VendorFilterParams
): Q {
  let q = query;
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.verified) q = q.eq('verified', true);
  if (filters.cashFriendly) q = q.eq('payment_mode', 'cash');
  if (filters.respondsIn) q = q.lte('response_sla_hours', filters.respondsIn);
  if (filters.years) q = q.gte('years_in_business', filters.years);

  // Price band → derived min/max range. priceMin/priceMax (explicit) override band.
  let minCents = filters.priceMin;
  let maxCents = filters.priceMax;
  if (filters.priceBand && minCents === undefined && maxCents === undefined) {
    const band = PRICE_BANDS.find((b) => b.slug === filters.priceBand);
    if (band) {
      minCents = band.minCents;
      if (band.maxCents !== null) maxCents = band.maxCents;
    }
  }
  if (minCents !== undefined) {
    // Joined table vendor_packages_price_band — filter via inner-join semantics
    // requires using or(); here we filter the band relation's max_price_cents >= minCents.
    // (Adjust to match actual relation if needed at implementation time.)
    q = q.gte('vendor_packages_price_band.max_price_cents', minCents);
  }
  if (maxCents !== undefined) {
    q = q.lte('vendor_packages_price_band.min_price_cents', maxCents);
  }

  if (filters.languages && filters.languages.length > 0) {
    q = q.contains('languages', filters.languages);
  }

  return q;
}

/**
 * Count vendors matching the given filters. Used by /api/vendors/count.
 */
export async function countFilteredVendors(
  supabase: SupabaseClient,
  filters: VendorFilterParams
): Promise<number> {
  let query = supabase
    .from('vendor_profiles')
    .select(
      'id, vendor_packages_price_band!vendor_packages_price_band_vendor_profile_id_fkey(id)',
      {
        count: 'exact',
        head: true,
      }
    )
    .eq('is_active', true)
    .eq('onboarding_complete', true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query = applyVendorFilters(query as any, filters);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: only pre-existing error. (The `eslint-disable-next-line @typescript-eslint/no-explicit-any` annotations are intentional — Supabase's chained query types are complex enough that a single generic any-cast at the integration boundary is cleaner than the alternative; we may revisit when Supabase types tighten.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendor-filters.ts && \
git commit -m "feat(filters): shared vendor-filters query builder"
```

---

## Task 4: `/api/vendors/count` route

**Files:**

- Create: `src/app/api/vendors/count/route.ts`

- [ ] **Step 1: Write the route**

Write to `src/app/api/vendors/count/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { countFilteredVendors, parseVendorFilterParams } from '@/lib/vendor-filters';

/**
 * GET /api/vendors/count?<filter-params>
 * Returns { count: number } of vendors matching the filters.
 * Used by the AllFiltersSheet's sticky "Show N vendors" footer (debounced 300ms).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    const filters = parseVendorFilterParams(params);

    const supabase = await createServerSupabaseClient();
    const count = await countFilteredVendors(supabase, filters);
    return NextResponse.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[GET /api/vendors/count] error:', err);
    return NextResponse.json({ count: 0, error: 'count-failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the route serves**

Run: `curl -s "http://localhost:3000/api/vendors/count?verified=1" | head -c 200`
Expected: `{"count":<number>}` JSON response. Number may be 0 if dev DB has no verified vendors.

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint && \
git add src/app/api/vendors/count/route.ts && \
git commit -m "feat(filters): /api/vendors/count route for live footer"
```

---

## Task 5: Chip primitive component

**Files:**

- Create: `src/components/marketplace/filters/Chip.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/filters/Chip.tsx`:

```tsx
'use client';

import * as React from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ChipVariant = 'toggle' | 'dropdown' | 'applied' | 'all-filters';

export interface ChipProps {
  /** Visual + interaction variant. */
  variant?: ChipVariant;
  /** Active state (ink-filled). Toggle = "on"; Dropdown = "panel open OR value set". */
  isActive?: boolean;
  /** Optional count badge (indigo on default, cream on active). */
  count?: number;
  /** Inner label content. */
  children: React.ReactNode;
  /** Click handler — toggle flip / dropdown open / sheet open / applied tap. */
  onClick?: () => void;
  /** Called when × clicked (applied variant only). */
  onRemove?: () => void;
  /** Panel ID for aria-controls (dropdown variant). */
  panelId?: string;
  /** Optional className override. */
  className?: string;
}

/**
 * Baazar M+ filter chip primitive. 5 variants share the same 32px pill shape;
 * variant changes affordance + interaction.
 */
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  (
    {
      variant = 'toggle',
      isActive = false,
      count,
      children,
      onClick,
      onRemove,
      panelId,
      className,
    },
    ref
  ) => {
    const baseClasses = cn(
      'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full',
      'font-sans text-[12px] font-medium leading-none whitespace-nowrap',
      'transition-all duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
      'disabled:opacity-40 disabled:pointer-events-none',
      // Variant-specific
      variant === 'toggle' && [
        'border bg-cream text-ink',
        isActive ? 'border-ink bg-ink text-cream' : 'border-hairline hover:border-ink',
      ],
      variant === 'dropdown' && [
        'border bg-cream text-ink',
        isActive ? 'border-ink bg-ink text-cream' : 'border-hairline hover:border-ink',
      ],
      variant === 'applied' && ['border border-ink bg-cream-soft text-ink pr-1'],
      variant === 'all-filters' && [
        'border border-ink bg-cream text-ink font-semibold hover:bg-cream-soft',
      ],
      className
    );

    const ariaProps =
      variant === 'toggle'
        ? { 'aria-pressed': isActive }
        : variant === 'dropdown'
          ? { 'aria-expanded': isActive, 'aria-controls': panelId }
          : {};

    return (
      <button ref={ref} type="button" onClick={onClick} className={baseClasses} {...ariaProps}>
        {variant === 'all-filters' && <SlidersHorizontal className="size-3.5" strokeWidth={2} />}
        {children}
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1',
              'text-[10px] font-bold leading-none',
              isActive ? 'bg-cream text-ink' : 'bg-indigo text-cream'
            )}
          >
            {count}
          </span>
        )}
        {variant === 'dropdown' && (
          <svg
            className="ml-0.5 size-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        )}
        {variant === 'applied' && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Remove filter"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onRemove?.();
              }
            }}
            className={cn(
              'ml-1 inline-flex size-4 items-center justify-center rounded-full',
              'text-ink-muted transition-colors hover:bg-ink hover:text-cream',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo'
            )}
          >
            <X className="size-3" strokeWidth={2.5} />
          </span>
        )}
      </button>
    );
  }
);
Chip.displayName = 'Chip';
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: only pre-existing error.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/filters/Chip.tsx && \
git commit -m "feat(filters): Chip primitive — 5 variants"
```

---

## Task 6: PriceDropdown + LanguagesDropdown panel components

**Files:**

- Create: `src/components/marketplace/filters/PriceDropdown.tsx`
- Create: `src/components/marketplace/filters/LanguagesDropdown.tsx`

- [ ] **Step 1: Write PriceDropdown**

Write to `src/components/marketplace/filters/PriceDropdown.tsx`:

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { PRICE_BANDS, type PriceBand } from './constants';

export interface PriceDropdownProps {
  /** Currently selected band, or null for unset. */
  selected: PriceBand | null;
  /** Called when user picks a band. */
  onSelect: (band: PriceBand | null) => void;
}

/**
 * Price-band picker panel that docks below the Price chip in the chip row.
 * Single-select (clicking the active band clears the selection).
 */
export function PriceDropdown({ selected, onSelect }: PriceDropdownProps) {
  return (
    <ul role="listbox" aria-label="Price band" className="min-w-[200px] py-1">
      {PRICE_BANDS.map((band) => {
        const isSelected = selected === band.slug;
        return (
          <li key={band.slug}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(isSelected ? null : band.slug)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left',
                'text-[13px] text-ink transition-colors',
                'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo',
                isSelected && 'bg-cream-soft font-medium'
              )}
            >
              <span>{band.label}</span>
              <span className="font-mono text-[12px] text-ink-muted">{band.shorthand}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Write LanguagesDropdown**

Write to `src/components/marketplace/filters/LanguagesDropdown.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGUAGES } from './constants';

export interface LanguagesDropdownProps {
  /** Currently selected slugs (sorted). */
  selected: string[];
  /** Called when user toggles a language. Receives the next sorted array. */
  onChange: (next: string[]) => void;
}

/**
 * Multi-select languages picker panel that docks below the Languages chip.
 * Click toggles; chip row shows the count badge separately.
 */
export function LanguagesDropdown({ selected, onChange }: LanguagesDropdownProps) {
  const toggle = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug].sort();
    onChange(next);
  };

  return (
    <ul
      role="listbox"
      aria-multiselectable
      aria-label="Languages spoken"
      className="max-h-80 min-w-[220px] overflow-y-auto py-1"
    >
      {LANGUAGES.map((lang) => {
        const isSelected = selected.includes(lang.slug);
        return (
          <li key={lang.slug}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => toggle(lang.slug)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left',
                'text-[13px] text-ink transition-colors',
                'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo',
                isSelected && 'bg-cream-soft font-medium'
              )}
            >
              <span>{lang.label}</span>
              {isSelected && <Check className="size-3.5 stroke-ink" strokeWidth={2.5} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint && \
git add src/components/marketplace/filters/PriceDropdown.tsx \
  src/components/marketplace/filters/LanguagesDropdown.tsx && \
git commit -m "feat(filters): Price + Languages dropdown panels"
```

---

## Task 7: FilterChipRow orchestrator

**Files:**

- Create: `src/components/marketplace/filters/FilterChipRow.tsx`

- [ ] **Step 1: Write the chip row**

Write to `src/components/marketplace/filters/FilterChipRow.tsx`:

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Chip } from './Chip';
import { PriceDropdown } from './PriceDropdown';
import { LanguagesDropdown } from './LanguagesDropdown';
import { PRICE_BANDS } from './constants';
import { useFilterState, type FilterDropdown } from './use-filter-state';

export interface FilterChipRowProps {
  /** Optional className override on the row wrapper. */
  className?: string;
  /** Called when user clicks "All filters" chip — parent opens the sheet. */
  onOpenSheet: () => void;
}

/**
 * The horizontal chip row that lives in the sticky band on /vendors, immediately
 * below the search pill. Owns active-dropdown state + dispatches filter changes
 * (via the use-filter-state hook) which trigger URL updates + page re-fetch.
 */
export function FilterChipRow({ className, onOpenSheet }: FilterChipRowProps) {
  const { state, patch, activeDropdown, setActiveDropdown, apply } = useFilterState();
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Click-outside closes active dropdown.
  React.useEffect(() => {
    if (!activeDropdown) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activeDropdown, setActiveDropdown]);

  // Esc closes active dropdown.
  React.useEffect(() => {
    if (!activeDropdown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveDropdown(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeDropdown, setActiveDropdown]);

  const toggleDropdown = (d: FilterDropdown) => setActiveDropdown(activeDropdown === d ? null : d);

  // Commit pending language changes to URL when the Languages dropdown closes.
  // (Languages is multi-select; toggling chips uses patch() during the dropdown
  // session to avoid re-fetching after every click. On close, push to URL.)
  const prevDropdownRef = React.useRef<FilterDropdown>(null);
  React.useEffect(() => {
    if (prevDropdownRef.current === 'languages' && activeDropdown === null) {
      apply();
    }
    prevDropdownRef.current = activeDropdown;
  }, [activeDropdown, apply]);

  const priceBandLabel = state.priceBand
    ? `Price · ${PRICE_BANDS.find((b) => b.slug === state.priceBand)?.shorthand ?? ''}`
    : 'Price';

  return (
    <div
      ref={containerRef}
      className={cn('relative flex items-center gap-2 overflow-x-auto py-1', className)}
      role="toolbar"
      aria-label="Filter vendors"
    >
      {/* Verified */}
      <Chip
        variant="toggle"
        isActive={state.verified}
        onClick={() => apply({ verified: !state.verified })}
      >
        Verified
      </Chip>

      {/* Responds < 24h */}
      <Chip
        variant="toggle"
        isActive={state.respondsIn === 24}
        onClick={() => apply({ respondsIn: state.respondsIn === 24 ? 0 : 24 })}
      >
        Responds &lt; 24h
      </Chip>

      {/* Price */}
      <div className="relative">
        <Chip
          variant="dropdown"
          isActive={activeDropdown === 'price' || !!state.priceBand}
          panelId="filter-panel-price"
          onClick={() => toggleDropdown('price')}
        >
          {priceBandLabel}
        </Chip>
        {activeDropdown === 'price' && (
          <Panel id="filter-panel-price">
            <PriceDropdown
              selected={state.priceBand}
              onSelect={(b) => {
                apply({ priceBand: b });
                setActiveDropdown(null);
              }}
            />
          </Panel>
        )}
      </div>

      {/* Cash-friendly */}
      <Chip
        variant="toggle"
        isActive={state.cashFriendly}
        onClick={() => apply({ cashFriendly: !state.cashFriendly })}
      >
        Cash-friendly
      </Chip>

      {/* Languages */}
      <div className="relative">
        <Chip
          variant="dropdown"
          isActive={activeDropdown === 'languages' || state.languages.length > 0}
          count={state.languages.length}
          panelId="filter-panel-languages"
          onClick={() => toggleDropdown('languages')}
        >
          Languages
        </Chip>
        {activeDropdown === 'languages' && (
          <Panel id="filter-panel-languages">
            <LanguagesDropdown
              selected={state.languages}
              onChange={(next) => patch({ languages: next })}
            />
          </Panel>
        )}
      </div>

      {/* All filters trigger */}
      <Chip variant="all-filters" onClick={onOpenSheet}>
        All filters
      </Chip>
    </div>
  );
}

interface PanelProps {
  id: string;
  children: React.ReactNode;
}

function Panel({ id, children }: PanelProps) {
  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      className={cn(
        'absolute left-0 top-[calc(100%+8px)] z-30',
        'rounded-lg border border-hairline bg-cream p-2',
        'shadow-[0_12px_28px_rgba(27,20,20,0.10),_0_4px_8px_rgba(27,20,20,0.06)]',
        'duration-200 animate-in fade-in-0 motion-reduce:animate-none'
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint && \
git add src/components/marketplace/filters/FilterChipRow.tsx && \
git commit -m "feat(filters): FilterChipRow orchestrator + click-outside + Esc"
```

---

## Task 8: AllFiltersSheet + section components

**Files:**

- Create: `src/components/marketplace/filters/AllFiltersSheet.tsx`
- Create: `src/components/marketplace/filters/sections/TrustSection.tsx`
- Create: `src/components/marketplace/filters/sections/PriceSection.tsx`
- Create: `src/components/marketplace/filters/sections/LanguagesSection.tsx`
- Create: `src/components/marketplace/filters/sections/ExperienceSection.tsx`
- Create: `src/components/marketplace/filters/sections/EventTypesSection.tsx`
- Create: `src/components/marketplace/filters/sections/CategorySpecificSection.tsx`

- [ ] **Step 1: Write all 6 section components**

These are small + similar. Writing them in one step:

`src/components/marketplace/filters/sections/TrustSection.tsx`:

```tsx
'use client';
import * as React from 'react';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function TrustSection({ state, patch }: Props) {
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Trust &amp; responsiveness
      </h5>
      <ToggleRow
        label="Verified vendors only"
        on={state.verified}
        onChange={(v) => patch({ verified: v })}
      />
      <ToggleRow
        label="Responds within 24 hours"
        on={state.respondsIn === 24}
        onChange={(v) => patch({ respondsIn: v ? 24 : 0 })}
      />
      <ToggleRow
        label="Cash-friendly payments"
        on={state.cashFriendly}
        onChange={(v) => patch({ cashFriendly: v })}
      />
    </section>
  );
}

interface ToggleRowProps {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}
function ToggleRow({ label, on, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-sm py-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
    >
      <span>{label}</span>
      <span
        className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? 'bg-ink' : 'bg-hairline'}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-cream transition-transform ${on ? 'translate-x-4' : ''}`}
        />
      </span>
    </button>
  );
}
```

`src/components/marketplace/filters/sections/PriceSection.tsx`:

```tsx
'use client';
import * as React from 'react';
import { PRICE_BANDS, type PriceBand } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function PriceSection({ state, patch }: Props) {
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Price
      </h5>
      <p className="mb-3 text-[11px] text-ink-soft">Pick a band, or set a custom range below.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRICE_BANDS.map((b) => {
          const on = state.priceBand === b.slug;
          return (
            <button
              key={b.slug}
              type="button"
              onClick={() =>
                patch({
                  priceBand: on ? null : (b.slug as PriceBand),
                  priceMin: null,
                  priceMax: null,
                })
              }
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {b.shorthand} {b.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2.5">
        <input
          type="number"
          inputMode="numeric"
          placeholder="Min $"
          value={state.priceMin !== null ? Math.round(state.priceMin / 100) : ''}
          onChange={(e) =>
            patch({
              priceBand: null,
              priceMin: e.target.value ? Number(e.target.value) * 100 : null,
            })
          }
          className="flex-1 rounded-sm border border-hairline bg-cream px-2.5 py-2 font-mono text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
        />
        <input
          type="number"
          inputMode="numeric"
          placeholder="Max $"
          value={state.priceMax !== null ? Math.round(state.priceMax / 100) : ''}
          onChange={(e) =>
            patch({
              priceBand: null,
              priceMax: e.target.value ? Number(e.target.value) * 100 : null,
            })
          }
          className="flex-1 rounded-sm border border-hairline bg-cream px-2.5 py-2 font-mono text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
        />
      </div>
    </section>
  );
}
```

`src/components/marketplace/filters/sections/LanguagesSection.tsx`:

```tsx
'use client';
import * as React from 'react';
import { LANGUAGES } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function LanguagesSection({ state, patch }: Props) {
  const toggle = (slug: string) => {
    const next = state.languages.includes(slug)
      ? state.languages.filter((s) => s !== slug)
      : [...state.languages, slug].sort();
    patch({ languages: next });
  };
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Languages spoken
      </h5>
      <p className="mb-3 text-[11px] text-ink-soft">Vendor team can communicate in any of these.</p>
      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((l) => {
          const on = state.languages.includes(l.slug);
          return (
            <button
              key={l.slug}
              type="button"
              onClick={() => toggle(l.slug)}
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

`src/components/marketplace/filters/sections/ExperienceSection.tsx`:

```tsx
'use client';
import * as React from 'react';
import { YEARS_OPTIONS } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function ExperienceSection({ state, patch }: Props) {
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Experience
      </h5>
      <div className="flex flex-wrap gap-1.5">
        {YEARS_OPTIONS.map((o) => {
          const on = state.years === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => patch({ years: on ? 0 : o.value })}
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

`src/components/marketplace/filters/sections/EventTypesSection.tsx`:

```tsx
'use client';
import * as React from 'react';
import { EVENT_TYPES } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

/**
 * UI-only placeholder this PR — `vendor_profiles.event_types` doesn't exist yet.
 * Selecting events updates URL params but the server-side filter is a no-op until
 * a follow-up PR adds the backing column + vendor onboarding question.
 */
export function EventTypesSection({ state, patch }: Props) {
  const toggle = (slug: string) => {
    const next = state.events.includes(slug)
      ? state.events.filter((s) => s !== slug)
      : [...state.events, slug].sort();
    patch({ events: next });
  };
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Event types served
      </h5>
      <p className="mb-3 text-[11px] text-ink-soft">
        Coming soon — vendor data backing in a follow-up PR.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_TYPES.map((e) => {
          const on = state.events.includes(e.slug);
          return (
            <button
              key={e.slug}
              type="button"
              onClick={() => toggle(e.slug)}
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {e.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

`src/components/marketplace/filters/sections/CategorySpecificSection.tsx`:

```tsx
'use client';
import * as React from 'react';

interface Props {
  category: string | null;
}

/**
 * Conditional section — only renders when search pill has a Category set.
 * UI placeholder for Day-1; per-category content (Photography style, Mehndi style,
 * etc.) ships as follow-up PRs as backing data lands.
 */
export function CategorySpecificSection({ category }: Props) {
  if (!category || category === 'all') return null;
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        More about {category}
      </h5>
      <p className="text-[11px] text-ink-soft">
        Style, dietary options, music genres, and other category-specific filters coming soon.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Write AllFiltersSheet**

Write to `src/components/marketplace/filters/AllFiltersSheet.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFilterState, serializeFilterState } from './use-filter-state';
import { TrustSection } from './sections/TrustSection';
import { PriceSection } from './sections/PriceSection';
import { LanguagesSection } from './sections/LanguagesSection';
import { ExperienceSection } from './sections/ExperienceSection';
import { EventTypesSection } from './sections/EventTypesSection';
import { CategorySpecificSection } from './sections/CategorySpecificSection';

interface AllFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Side-drawer sheet (Vaul) containing all filter sections + sticky live-count footer.
 * Right edge on desktop, bottom on mobile (Vaul handles direction via prop).
 */
export function AllFiltersSheet({ open, onOpenChange }: AllFiltersSheetProps) {
  const { state, patch, reset, apply } = useFilterState();
  const searchParams = useSearchParams();
  const category = searchParams.get('category');

  const [count, setCount] = React.useState<number | null>(null);
  const [countLoading, setCountLoading] = React.useState(false);

  // Debounced live count — 300ms after last change.
  React.useEffect(() => {
    if (!open) return;
    setCountLoading(true);
    const t = setTimeout(async () => {
      const params = serializeFilterState(state);
      if (category) params.set('category', category);
      try {
        const res = await fetch(`/api/vendors/count?${params.toString()}`, { cache: 'no-store' });
        const data = (await res.json()) as { count?: number };
        setCount(data.count ?? 0);
      } catch {
        setCount(null);
      } finally {
        setCountLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [state, open, category]);

  const handleApply = () => {
    apply();
    onOpenChange(false);
  };

  const handleClear = () => {
    reset();
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 right-0 top-0 z-50 w-full bg-cream sm:w-[480px]',
            'flex flex-col border-l border-hairline shadow-[-12px_0_28px_rgba(27,20,20,0.10)]'
          )}
        >
          <Drawer.Title className="sr-only">All filters</Drawer.Title>
          <Drawer.Description className="sr-only">
            Refine vendor results by trust, price, languages, experience, event types, and
            category-specific options.
          </Drawer.Description>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-hairline px-7 py-5">
            <h4 className="font-display text-[22px] font-bold tracking-[-0.012em] text-ink">
              All filters
            </h4>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close filters"
              className="inline-flex size-8 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:border-ink"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <TrustSection state={state} patch={patch} />
            <PriceSection state={state} patch={patch} />
            <LanguagesSection state={state} patch={patch} />
            <ExperienceSection state={state} patch={patch} />
            <EventTypesSection state={state} patch={patch} />
            <CategorySpecificSection category={category} />
          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-between border-t border-hairline bg-cream px-7 py-4">
            <button
              type="button"
              onClick={handleClear}
              className="text-[13px] text-ink underline underline-offset-2 hover:text-ink-muted"
            >
              Clear all
            </button>
            <Button
              variant="primary"
              size="md"
              isLoading={countLoading}
              showTextWhileLoading={false}
              onClick={handleApply}
              disabled={count === 0}
              aria-live="polite"
            >
              {countLoading
                ? 'Counting…'
                : count === 0
                  ? 'No matches'
                  : `Show ${count ?? '—'} vendors`}
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint && \
git add src/components/marketplace/filters/AllFiltersSheet.tsx \
  src/components/marketplace/filters/sections/ && \
git commit -m "feat(filters): AllFiltersSheet + 6 section components"
```

---

## Task 9: `/vendors` page rewrite + sidebar delete

**Files:**

- Modify: `src/app/(marketplace)/vendors/page.tsx`
- Delete: `src/components/marketplace/FilterSidebar.tsx`

- [ ] **Step 1: Read the current vendors page**

Run: `cat src/app/\(marketplace\)/vendors/page.tsx | head -80`

You'll see it imports `FilterSidebar` and `VendorGrid`, builds a Supabase query, and renders a `grid-cols-[240px,1fr]` two-column layout with the sidebar on the left.

- [ ] **Step 2: Rewrite the page**

Open `src/app/(marketplace)/vendors/page.tsx` and apply these changes:

1. Replace the imports:

   ```tsx
   // Remove:
   import { FilterSidebar } from '@/components/marketplace/FilterSidebar';

   // Add:
   import { FilterShell } from '@/components/marketplace/filters/FilterShell';
   import { parseVendorFilterParams, applyVendorFilters } from '@/lib/vendor-filters';
   ```

2. Replace the supabase query construction (the section that does `let query = supabase.from('vendor_profiles')…`) with the same pattern but threading through `applyVendorFilters`. Concretely, after `params = await searchParams;` add:

   ```ts
   const filters = parseVendorFilterParams(params);
   ```

   And replace the chained `query.eq(...)` filter section with:

   ```ts
   query = applyVendorFilters(query, filters);
   ```

   Keep the existing `.order()` and `.range()` chained AFTER `applyVendorFilters`.

3. Replace the JSX. Find the `<div className="grid grid-cols-[240px,1fr] gap-8">` (or the actual className — read the file) block and replace it with:
   ```tsx
   <FilterShell />
   <VendorGrid vendors={vendors ?? []} count={count ?? 0} currentPage={page} pageSize={limit} />
   ```

Adjust to match the exact existing structure — the file may differ slightly from what's described. Goal: ZERO sidebar, full-width grid, chip row in a sticky band.

- [ ] **Step 3: Create FilterShell wrapper**

The sticky band that contains the SearchBar (`variant="sticky-header"`) AND the chip row needs a shared client wrapper because the chip row needs the sheet's open state. Create `src/components/marketplace/filters/FilterShell.tsx`:

```tsx
'use client';

import * as React from 'react';
import { SearchBar } from '../SearchBar';
import { FilterChipRow } from './FilterChipRow';
import { AllFiltersSheet } from './AllFiltersSheet';

interface FilterShellProps {
  initialCategory?: string;
}

/**
 * Sticky band on /vendors holding the SearchBar (sticky-header variant) AND the
 * FilterChipRow. Manages the AllFiltersSheet open state.
 */
export function FilterShell({ initialCategory }: FilterShellProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 mb-6 space-y-3 border-b border-hairline bg-cream/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-cream/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SearchBar variant="sticky-header" initialCategory={initialCategory} />
        <FilterChipRow onOpenSheet={() => setSheetOpen(true)} />
      </div>
      <AllFiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
```

Then update the page.tsx to use `<FilterShell initialCategory={category} />` in place of both the original `<SearchBar ... />` and `<FilterSidebar />`.

- [ ] **Step 4: Delete FilterSidebar**

```bash
git rm src/components/marketplace/FilterSidebar.tsx
```

- [ ] **Step 5: Verify the page compiles**

Run: `curl -sI http://localhost:3000/vendors | head -1`
Expected: `HTTP/1.1 200 OK`. If not, tail `/tmp/baazar-dev.log`.

- [ ] **Step 6: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint && \
git add src/app/\(marketplace\)/vendors/page.tsx \
  src/components/marketplace/filters/FilterShell.tsx && \
git commit -m "feat(filters): /vendors rewrite — chip row + sheet, delete sidebar"
```

---

## Task 10: Onboarding wizard "Profile details" step

**Files:**

- Create: `src/components/onboarding/StepDetails.tsx`
- Create: `src/app/dashboard/profile/setup/details/page.tsx`
- Modify: `src/components/onboarding/WizardStepper.tsx`
- Modify: `src/lib/onboarding/resume.ts`
- Modify: `src/app/api/vendor-profile/setup/route.ts` (or wherever the setup write path is — read first)

- [ ] **Step 1: Read existing step pattern**

Run: `cat src/components/onboarding/StepBasics.tsx | head -60`

Observe the component structure: form with controlled inputs, submit handler that PATCHes the vendor_profile, navigation to next step on success.

- [ ] **Step 2: Write StepDetails**

Write to `src/components/onboarding/StepDetails.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LANGUAGES, RESPONSE_SLA_OPTIONS } from '@/components/marketplace/filters/constants';

interface ProfileShape {
  languages: string[] | null;
  years_in_business: number | null;
  response_sla_hours: number | null;
}

interface Props {
  profile: ProfileShape;
  /** When true, the step is being shown via the backfill flow (existing vendor catching up). */
  isBackfill?: boolean;
}

export function StepDetails({ profile, isBackfill = false }: Props) {
  const router = useRouter();
  const [languages, setLanguages] = React.useState<string[]>(profile.languages ?? []);
  const [years, setYears] = React.useState<number | ''>(profile.years_in_business ?? '');
  const [sla, setSla] = React.useState<number | null>(profile.response_sla_hours ?? null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggleLang = (slug: string) => {
    setLanguages((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug].sort()
    );
  };

  const isValid = languages.length > 0 && typeof years === 'number' && years >= 0 && sla !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor-profile/setup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'details',
          languages,
          years_in_business: years,
          response_sla_hours: sla,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save profile details');
      }
      router.push(isBackfill ? '/dashboard' : '/dashboard/profile/setup/portfolio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Profile details</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Three quick questions to help couples find you.
        </p>
      </header>

      {/* Languages */}
      <div className="space-y-3">
        <Label className="font-display text-base font-semibold">Languages your team speaks</Label>
        <p className="text-xs text-ink-soft">Pick all that apply.</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const on = languages.includes(lang.slug);
            return (
              <button
                key={lang.slug}
                type="button"
                onClick={() => toggleLang(lang.slug)}
                className={`inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors ${
                  on
                    ? 'border-ink bg-ink text-cream'
                    : 'border-hairline bg-cream text-ink hover:border-ink'
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Years in business */}
      <div className="space-y-2">
        <Label htmlFor="years" className="font-display text-base font-semibold">
          Years in business
        </Label>
        <p className="text-xs text-ink-soft">
          Approximate is fine. Counts real-world wedding experience.
        </p>
        <input
          id="years"
          type="number"
          min={0}
          max={99}
          value={years}
          onChange={(e) => setYears(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-32 rounded-md border border-hairline bg-cream px-3 py-2 font-mono text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
        />
      </div>

      {/* Response SLA */}
      <div className="space-y-3">
        <Label className="font-display text-base font-semibold">How quickly do you respond?</Label>
        <p className="text-xs text-ink-soft">
          Couples filter for fast-responding vendors — pick what you can honestly commit to.
        </p>
        <div className="flex flex-col gap-2">
          {RESPONSE_SLA_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="response-sla"
                value={opt.value}
                checked={sla === opt.value}
                onChange={() => setSla(opt.value)}
                className="size-4 accent-ink"
              />
              <span className="text-sm text-ink">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
        <Button type="submit" disabled={!isValid} isLoading={submitting}>
          {isBackfill ? 'Save' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the route page**

Write to `src/app/dashboard/profile/setup/details/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StepDetails } from '@/components/onboarding/StepDetails';

interface PageProps {
  searchParams: Promise<{ backfill?: string }>;
}

export default async function DetailsStepPage({ searchParams }: PageProps) {
  const { backfill } = await searchParams;
  const isBackfill = backfill === 'true';

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('languages, years_in_business, response_sla_hours')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <StepDetails
      profile={{
        languages: profile?.languages ?? null,
        years_in_business: profile?.years_in_business ?? null,
        response_sla_hours: profile?.response_sla_hours ?? null,
      }}
      isBackfill={isBackfill}
    />
  );
}
```

- [ ] **Step 4: Update WizardStepper STEPS array**

Edit `src/components/onboarding/WizardStepper.tsx`. Find the `STEPS` constant and add `details` between `online` and `portfolio`:

```ts
const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'location', label: 'Location' },
  { key: 'online', label: 'Online presence' },
  { key: 'details', label: 'Profile details' }, // ← new
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'payment-mode', label: 'Payment mode' },
  { key: 'review', label: 'Review & publish' },
];
```

- [ ] **Step 5: Update WizardStep type + nextIncompleteStep**

Edit `src/lib/onboarding/resume.ts`. Find the `WizardStep` type and add `'details'` to the union. Find `nextIncompleteStep` and add a check between online and portfolio:

```ts
// After the online check, before the portfolio check, add:
if (
  !profile.languages ||
  profile.languages.length === 0 ||
  profile.years_in_business === null ||
  profile.response_sla_hours === null
) {
  return 'details';
}
```

The exact line depends on the existing structure — read the file and slot it in.

- [ ] **Step 6: Update API route to handle the new step's PATCH payload**

Edit `src/app/api/vendor-profile/setup/route.ts` (or wherever the PATCH handler is — find via `grep -rn "vendor-profile/setup" src/app/api`). Add a case for `step === 'details'` that validates and writes the 3 new fields. The exact code depends on the existing handler shape — preserve its validation style (likely Zod).

If Zod is used, add a `detailsSchema`:

```ts
import { z } from 'zod';
import { LANGUAGES, RESPONSE_SLA_OPTIONS } from '@/components/marketplace/filters/constants';

const detailsSchema = z.object({
  step: z.literal('details'),
  languages: z
    .array(z.string())
    .min(1)
    .refine(
      (arr) => arr.every((s) => LANGUAGES.some((l) => l.slug === s)),
      'Invalid language slug'
    ),
  years_in_business: z.number().int().min(0).max(99),
  response_sla_hours: z
    .number()
    .refine((n) => RESPONSE_SLA_OPTIONS.some((o) => o.value === n), 'Invalid SLA value'),
});
```

And in the switch/conditional that handles each step's PATCH, add the `details` branch that calls `supabase.from('vendor_profiles').update({ languages, years_in_business, response_sla_hours }).eq('user_id', user.id)`.

- [ ] **Step 7: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint && \
git add src/components/onboarding/StepDetails.tsx \
  src/app/dashboard/profile/setup/details \
  src/components/onboarding/WizardStepper.tsx \
  src/lib/onboarding/resume.ts \
  src/app/api/vendor-profile/setup/route.ts && \
git commit -m "feat(onboarding): combined Profile details step — languages, years, SLA"
```

---

## Task 11: Existing-vendor backfill banner + dismissal route

**Files:**

- Create: `src/components/dashboard/BackfillBanner.tsx`
- Create: `src/app/api/users/me/dismiss-backfill/route.ts`
- Modify: `src/app/dashboard/page.tsx` (or wherever the vendor dashboard root is — read first)

- [ ] **Step 1: Create the dismissal API route**

Write to `src/app/api/users/me/dismiss-backfill/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/users/me/dismiss-backfill
 * Sets users.profile_backfill_dismissed_at = now() for the current user.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('users')
    .update({ profile_backfill_dismissed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('[POST /api/users/me/dismiss-backfill] error:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create the banner component**

Write to `src/components/dashboard/BackfillBanner.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { X, SlidersHorizontal } from 'lucide-react';

interface BackfillBannerProps {
  /** Whether the user's profile is missing any of the 3 new fields. */
  show: boolean;
}

/**
 * One-time banner shown to existing vendors who haven't filled in the 3 new
 * profile fields (languages, years_in_business, response_sla_hours). Dismissable;
 * dismissal POSTs to /api/users/me/dismiss-backfill.
 */
export function BackfillBanner({ show: initialShow }: BackfillBannerProps) {
  const [visible, setVisible] = React.useState(initialShow);

  if (!visible) return null;

  const dismiss = async () => {
    setVisible(false); // optimistic
    try {
      await fetch('/api/users/me/dismiss-backfill', { method: 'POST' });
    } catch {
      // silent — banner stays dismissed on this page load even if save failed
    }
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-hairline bg-cream-soft px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-9 flex-shrink-0 items-center justify-center rounded-full border border-hairline bg-cream">
          <SlidersHorizontal className="size-4 stroke-ink" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Complete your profile</p>
          <p className="text-xs text-ink-muted">
            Add languages, years in business, and response time so couples can find you.
          </p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Link
          href="/dashboard/profile/setup/details?backfill=true"
          className="hover:bg-ink-light inline-flex h-9 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-cream transition-colors"
        >
          Add details
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="inline-flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-cream hover:text-ink"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount banner in vendor dashboard**

Read the vendor dashboard root: `src/app/dashboard/page.tsx` (or similar — find via `find src/app/dashboard -name "page.tsx" -maxdepth 2`).

In the server component, query the user's profile to determine `show`:

```ts
const supabase = await createServerSupabaseClient();
const {
  data: { user },
} = await supabase.auth.getUser();
const [{ data: profile }, { data: userRow }] = await Promise.all([
  supabase
    .from('vendor_profiles')
    .select('languages, years_in_business, response_sla_hours')
    .eq('user_id', user.id)
    .maybeSingle(),
  supabase.from('users').select('profile_backfill_dismissed_at, role').eq('id', user.id).single(),
]);
const isMissingFields =
  !profile?.languages ||
  profile.languages.length === 0 ||
  profile.years_in_business === null ||
  profile.response_sla_hours === null;
const showBackfill =
  userRow?.role === 'vendor' && isMissingFields && !userRow?.profile_backfill_dismissed_at;
```

Render at the top of the dashboard body:

```tsx
<BackfillBanner show={showBackfill} />
```

Adjust to match the existing dashboard structure exactly.

- [ ] **Step 4: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint && \
git add src/app/api/users/me/dismiss-backfill/route.ts \
  src/components/dashboard/BackfillBanner.tsx \
  src/app/dashboard/page.tsx && \
git commit -m "feat(backfill): banner + dismissal route for existing vendors"
```

---

## Task 12: Visual verification

**Files:** none modified — Playwright screenshots only.

- [ ] **Step 1: Dev server healthy**

`curl -sI http://localhost:3000/ | head -1` → 200 OK.

- [ ] **Step 2: /vendors hero chip row**

```bash
node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/vendors /tmp/baazar-filter-row.png
```

Read `/tmp/baazar-filter-row.png`. Verify:

- Sticky band at top has search pill + chip row below
- 6 chips visible: Verified · Responds < 24h · Price · Cash-friendly · Languages · All filters
- Cream pills with hairline borders; "All filters" has ink border
- Vendor grid below is full-width (no sidebar)

- [ ] **Step 3: Click a toggle chip + URL update**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/vendors', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Verified' }).click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/baazar-filter-verified-on.png', fullPage: false });
  console.log('URL after click:', page.url());
  await browser.close();
})();
"
```

Read screenshot — Verified chip should be ink-filled. Console should print URL containing `?verified=1`.

- [ ] **Step 4: All-filters sheet**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/vendors', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'All filters' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/baazar-filter-sheet.png', fullPage: false });
  await browser.close();
})();
"
```

Read screenshot — sheet docks from right (480px), 6 sections visible (Trust, Price, Languages, Experience, Event types, Category-specific only if category set), sticky footer with Clear all + Show N vendors.

- [ ] **Step 5: Onboarding details step**

```bash
node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/dashboard/profile/setup/details /tmp/baazar-onboard-details.png
```

(May redirect to login if no session — that's OK, just verify the screenshot shows the login redirect renders fine.)

- [ ] **Step 6: If anything's broken**

Common fixes:

- Sheet doesn't open: `useFilterState` may be sharing state incorrectly — each `useFilterState()` call returns INDEPENDENT state. Either lift to context or pass state down from FilterShell.

  **IMPORTANT**: this is a real issue with the current design. Both `FilterChipRow` and `AllFiltersSheet` call `useFilterState()` independently — they don't share state. The hook re-reads URL params on each mount, so they SEE the same URL state, but their in-memory `state` between URL updates can diverge. Specifically: opening the sheet won't see uncommitted chip-row patches.

  **Fix**: lift `useFilterState()` to `FilterShell` and pass `state` + `patch` + `apply` + `reset` down to BOTH children as props. Update the hook call signature in both consumer files.

- Sheet right-side mobile fix: ensure Vaul handles `direction="right"` on desktop AND falls back to bottom on mobile via a media query OR conditionally pass direction based on viewport width.

---

## Task 13: Update DESIGN.md

**File:** `DESIGN.md` frontmatter — add `filter-chip` + `filter-sheet` entries to `components:` block, after the existing `search-bar:` entry.

- [ ] **Step 1: Apply the yaml additions**

Append after `search-bar:` block in DESIGN.md frontmatter:

```yaml
filter-chip:
  pattern: '5 variants — toggle, dropdown, with-count, applied-removable, all-filters trigger'
  surface: '32px tall, pill-shaped (radii.full), ink fill on active, cream-soft fill on applied'
  interaction: 'Toggle = aria-pressed click flip. Dropdown = aria-expanded + docked panel. Applied = nested × button removes filter.'
  motion: '180ms hover bg, 200ms panel fade-in (motion.fast)'
  accessibility: 'WCAG AA on all variant×state combos. Sheet uses focus trap; chip row keyboard-navigable.'
filter-sheet:
  pattern: 'Vaul side drawer (right desktop, bottom mobile) with sectioned filters + live-count footer CTA'
  sections: 'Trust · Price · Languages · Experience · Event types · Category-specific (conditional)'
  footer: "Sticky — Clear-all link left, ink primary 'Show N vendors' CTA right with debounced live count"
  motion: '320ms slide-in/out (motion.medium)'
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md && git commit -m "docs(design): add filter-chip + filter-sheet to M+ frontmatter"
```

---

## Task 14: Push branch + open PR

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npm run lint && npm run test
```

Expected: typecheck only pre-existing error; lint exit 0; tests 320 passed.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/baazar-filter-chips
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(filters): Baazar filter chips + All filters sheet" --body "$(cat <<'EOF'
## Summary
- Chip primitive (5 variants) + chip row on /vendors (Verified, Responds <24h, Price, Cash-friendly, Languages, All filters)
- Vaul side-drawer "All filters" sheet with sectioned filters + sticky live "Show N vendors" footer
- 3 new vendor_profiles fields (languages, years_in_business, response_sla_hours) + combined onboarding "Profile details" step
- Existing-vendor backfill banner on dashboard linking into details?backfill=true
- FilterSidebar removed; /vendors grid full-width
- New /api/vendors/count route powers the live count

Per spec [`2026-05-24-baazar-filter-chips-design.md`](docs/superpowers/specs/2026-05-24-baazar-filter-chips-design.md).

## Out of scope (deferred)
- Event types backing data — UI placeholder this PR; vendor_profiles.event_types follow-up
- Category-specific filter content (Photography style, Mehndi style, etc.) — UI shell only
- Service area filter — dropped per brainstorm (Illinois vendors travel metro-wide)
- Computed actual response time — Day-1 is vendor-declared SLA only

## Test plan
- [ ] Hit /vendors — chip row visible below search pill
- [ ] Click Verified chip — URL contains ?verified=1, grid re-fetches
- [ ] Click Price chip — dropdown panel opens, pick Premium → URL ?priceBand=premium
- [ ] Click "All filters" — sheet slides from right, sections rendered, footer count updates as filters change
- [ ] On mobile (375px viewport) — chip row scrolls horizontally, sheet docks from bottom
- [ ] New vendor running through onboarding sees "Profile details" step between Online and Portfolio
- [ ] Existing vendor missing the 3 new fields sees backfill banner; click dismiss → persists across reload

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL.

---

## Out of scope (deferred to follow-up PRs)

- Event types real backing — vendor_profiles.event_types column + onboarding question + filter query
- Category-specific section content (Photography style, Mehndi style, DJ genres, Catering dietary, Venue capacity) — each ships as a separate PR with its backing data
- Service area / coverage filter
- Computed actual response time vs declared SLA mismatch dashboard
- Sort chip (most-booked / newest / price asc/desc)
- React component test infra — when added, unit-test use-filter-state URL round-trip, applyVendorFilters with fixture queries, and Chip variant rendering
