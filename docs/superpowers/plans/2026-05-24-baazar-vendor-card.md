# Baazar Vendor Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `src/components/marketplace/VendorCard.tsx` per [`2026-05-24-baazar-vendor-card-design.md`](../specs/2026-05-24-baazar-vendor-card-design.md) — editorial 4:5 portrait card with indigo kicker + Spectral name + enriched meta (response time + wedding count) + conditional haldi "Available {date}" pill + HV-B hover (locked) + save heart (UI only, no persistence). Add derived `confirmed_wedding_count` and `is_available_for_date` to the `/vendors` page query.

**Architecture:** Pure presentational card component takes `vendor + searchDate + isSaved + onSaveToggle` props. `VendorGrid` orchestrates save state (local `Set` per session) + threads `searchDate` from `useSearchParams()`. Vendor list query gets two new derived columns via LATERAL subqueries against `bookings` (wedding count) and `vendor_calendar_holds` (availability). Save persistence + vendor-selected thumbnail UX are deferred to follow-up PRs.

**Tech Stack:** Next.js 14 App Router · React 18 · TypeScript · Tailwind 3.4 · `next/image` · Supabase Postgres (existing `bookings` + `vendor_calendar_holds` tables — no new migrations).

**Branch:** `feat/baazar-vendor-card` (already created, spec committed at `097bb2e`).

**Out of scope (deferred):** Save persistence (saved_vendors table + API), vendor-selected thumbnail UX (build-time req captured), star ratings + reviews, capacity-aware availability, curation badges, mini portfolio thumbnails.

---

## File Structure

| File                                                | Action                 | Responsibility                                                                                                                                           |
| --------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/VendorCard.tsx`         | **Rewrite**            | Pure presentational card: photo + pills + body + HV-B hover wiring. Takes vendor + searchDate + isSaved + onSaveToggle.                                  |
| `src/components/marketplace/VendorGrid.tsx`         | **Modify**             | Threads `searchDate` from search params. Owns local saved-set state (no persistence). Passes save handler to each card.                                  |
| `src/components/marketplace/vendor-card-helpers.ts` | **Create**             | Pure helpers: `formatShortDate`, `formatWeddingCount` (returns null if <10), `formatPriceFromCents`.                                                     |
| `src/lib/vendor-filters.ts`                         | **Modify**             | Add LATERAL subqueries to the vendor list query for `confirmed_wedding_count` + `is_available_for_date` (the latter only when `searchDate` is provided). |
| `src/app/(marketplace)/vendors/page.tsx`            | **Modify**             | Read `?date=` URL param, pass to filter-query function and to `<VendorGrid searchDate=…>`.                                                               |
| `DESIGN.md`                                         | **Modify frontmatter** | Add `vendor-card` entry to `components:` block.                                                                                                          |

No new migrations. Uses existing `bookings.status` enum (Sub-project A) + `vendor_calendar_holds` table (Sub-project G).

---

## Task 1: Helper functions — `vendor-card-helpers.ts`

**Files:**

- Create: `src/components/marketplace/vendor-card-helpers.ts`

- [ ] **Step 1: Write the helpers**

Write to `src/components/marketplace/vendor-card-helpers.ts`:

```ts
/**
 * Pure helpers used by VendorCard. Extracted so the card stays presentational
 * and so the threshold/format rules are testable in isolation.
 */

/**
 * Format an ISO YYYY-MM-DD date as a short label for the "Available {date}" pill.
 * Example: '2026-10-17' → 'Oct 17'
 */
export function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format the wedding count for the meta row. Returns null when count < 10 —
 * the card omits the segment entirely rather than show "0 weddings" or
 * "3 weddings", which hurt trust more than they help.
 */
export function formatWeddingCount(count: number | null | undefined): string | null {
  if (!count || count < 10) return null;
  // Round down to nearest 10 to avoid implying precision ("100+" / "150+" / etc.)
  const bucketed = Math.floor(count / 10) * 10;
  return `${bucketed}+ weddings`;
}

/**
 * Format cents → "$X,XXX" (no trailing zeros for whole-dollar amounts).
 * Pure copy of the existing src/lib/utils.ts:formatPrice with a stable name.
 */
export function formatPriceFromCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString('en-US')}`;
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: only the pre-existing `.next/types/.../setup/layout.ts` error.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/vendor-card-helpers.ts && \
git commit -m "feat(vendor-card): helpers — short date, wedding count, price"
```

---

## Task 2: Rewrite `VendorCard.tsx`

**Files:**

- Rewrite: `src/components/marketplace/VendorCard.tsx`

- [ ] **Step 1: Replace the file**

Write to `src/components/marketplace/VendorCard.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ArrowRight, Camera } from 'lucide-react';
import { cn, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { formatShortDate, formatWeddingCount, formatPriceFromCents } from './vendor-card-helpers';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

export interface VendorCardProps {
  vendor: VendorRow & {
    vendor_packages_price_band?: {
      min_price_cents: number | null;
      max_price_cents: number | null;
    } | null;
    /** Derived: count of confirmed bookings for this vendor. */
    confirmed_wedding_count?: number | null;
    /** Derived: true when the user's ?date= search matches a date this vendor has open. */
    is_available_for_date?: boolean | null;
  };
  /** ISO YYYY-MM-DD — set when user has ?date= in search. Drives the haldi pill. */
  searchDate?: string;
  /** Locally-tracked save state. No persistence in Day-1. */
  isSaved?: boolean;
  /** Save toggle handler. Parent decides what to do with it. */
  onSaveToggle?: (next: boolean) => void;
}

export function VendorCard({ vendor, searchDate, isSaved = false, onSaveToggle }: VendorCardProps) {
  const heroImage = vendor.portfolio_images?.[0];
  const categoryLabel =
    VENDOR_CATEGORY_LABELS[vendor.category as keyof typeof VENDOR_CATEGORY_LABELS] ??
    vendor.category;
  const neighborhood = vendor.base_city ?? vendor.service_area?.[0] ?? 'Chicago';
  const respondsIn = vendor.response_sla_hours ? `Responds in ${vendor.response_sla_hours}h` : null;
  const weddingCount = formatWeddingCount(vendor.confirmed_wedding_count);
  const minPrice = formatPriceFromCents(vendor.vendor_packages_price_band?.min_price_cents);
  const showAvailablePill = !!searchDate && vendor.is_available_for_date === true;

  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSaveToggle?.(!isSaved);
  };

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      className={cn(
        'group relative block overflow-hidden rounded-lg border border-hairline bg-cream',
        'duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] transition-all',
        // HV-B hover (md+ only — touch devices skip)
        'md:hover:-translate-y-[3px] md:hover:border-transparent',
        'md:hover:shadow-[rgba(27,20,20,0.02)_0_0_0_1px,rgba(27,20,20,0.04)_0_2px_6px_0,rgba(27,20,20,0.10)_0_4px_8px_0]',
        'motion-reduce:md:hover:transform-none'
      )}
    >
      {/* Photo */}
      <div className="relative aspect-[4/5] overflow-hidden bg-cream-soft">
        {heroImage ? (
          <Image
            src={heroImage}
            alt={`${vendor.business_name} — ${categoryLabel}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className={cn(
              'duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] object-cover transition-transform',
              'md:group-hover:scale-[1.04] motion-reduce:md:group-hover:scale-100'
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted">
            <Camera className="size-8 stroke-current" strokeWidth={1.5} />
            <span className="text-xs">Photo coming soon</span>
          </div>
        )}

        {/* Verified pill */}
        {vendor.verified && (
          <span
            aria-label="Verified vendor"
            className={cn(
              'absolute left-3 top-3 inline-flex items-center gap-1.5',
              'rounded-full border border-ink/10 bg-cream/95 px-2.5 py-1 backdrop-blur',
              'text-[11px] font-semibold tracking-wide text-ink'
            )}
          >
            <span aria-hidden="true" className="size-[7px] rounded-full bg-indigo" />
            Verified
          </span>
        )}

        {/* "Available {date}" haldi pill — conditional */}
        {showAvailablePill && searchDate && (
          <span
            className={cn(
              'absolute left-3 top-[46px] inline-flex items-center gap-1.5',
              'rounded-full bg-haldi px-2.5 py-1',
              'text-[11px] font-bold tracking-wide text-ink',
              'shadow-[0_2px_6px_rgba(27,20,20,0.12)]'
            )}
          >
            <span aria-hidden="true" className="size-[7px] rounded-full bg-ink" />
            Available {formatShortDate(searchDate)}
          </span>
        )}

        {/* Save heart */}
        <button
          type="button"
          onClick={handleSaveClick}
          aria-label={isSaved ? 'Unsave vendor' : 'Save vendor'}
          aria-pressed={isSaved}
          className={cn(
            'absolute right-3 top-3 inline-flex size-[34px] items-center justify-center rounded-full',
            'border border-ink/10 bg-cream/95 backdrop-blur',
            'transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
            isSaved ? 'text-hot-pink' : 'hover:text-ink-light text-ink'
          )}
        >
          <Heart className={cn('size-4', isSaved ? 'fill-current' : 'fill-none')} strokeWidth={2} />
        </button>

        {/* HV-B arrow orb — hover only */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-3.5 right-3.5 inline-flex size-10 items-center justify-center rounded-full',
            'bg-indigo text-cream',
            'duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] -translate-x-2 opacity-0 transition-all',
            'md:group-hover:translate-x-0 md:group-hover:opacity-100',
            'motion-reduce:md:group-hover:translate-x-0'
          )}
        >
          <ArrowRight className="size-[18px] stroke-current" strokeWidth={2} />
        </span>
      </div>

      {/* Body */}
      <div className="px-[18px] py-4 pb-5">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo">
          {categoryLabel}
        </div>
        <h3 className="mb-2 font-display text-[21px] font-bold leading-[1.18] tracking-[-0.014em] text-ink">
          {vendor.business_name}
        </h3>
        <div
          className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-muted"
          aria-label={[neighborhood, respondsIn, weddingCount].filter(Boolean).join(', ')}
        >
          <span>{neighborhood}</span>
          {respondsIn && (
            <>
              <span aria-hidden="true" className="text-ink-soft">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <span aria-hidden="true" className="size-[6px] rounded-full bg-indigo" />
                {respondsIn}
              </span>
            </>
          )}
          {weddingCount && (
            <>
              <span aria-hidden="true" className="text-ink-soft">
                ·
              </span>
              <span>{weddingCount}</span>
            </>
          )}
        </div>
        {minPrice && (
          <p className="mt-3 text-[14px] font-semibold text-ink">
            <span className="text-[12px] font-normal text-ink-muted">From </span>
            {minPrice}
          </p>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: only pre-existing error.

```bash
curl -sI http://localhost:3000/vendors | head -1
```

Expected: HTTP 200. If 500, tail `/tmp/baazar-dev.log` — likely a missing `confirmed_wedding_count` or `is_available_for_date` field on existing vendor rows (added by Task 4; until then those are just `undefined` which is handled).

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/VendorCard.tsx && \
git commit -m "feat(vendor-card): editorial 4:5 card — kicker + Spectral name + enriched meta + HV-B"
```

---

## Task 3: Update `VendorGrid.tsx` — save state + searchDate threading

**Files:**

- Modify: `src/components/marketplace/VendorGrid.tsx`

- [ ] **Step 1: Replace the file content**

Write to `src/components/marketplace/VendorGrid.tsx`:

```tsx
'use client';

import * as React from 'react';
import { VendorCard, type VendorCardProps } from './VendorCard';
import { Skeleton } from '@/components/ui/skeleton';

type VendorWithEnrichments = VendorCardProps['vendor'];

interface VendorGridProps {
  vendors: VendorWithEnrichments[];
  /** Optional — passed through from /vendors page when ?date= is in URL. */
  searchDate?: string;
}

export function VendorGrid({ vendors, searchDate }: VendorGridProps) {
  // Local save-state Set keyed by vendor.id. Lost on page navigation.
  // Follow-up PR will replace with persisted state from /api/users/me/saved.
  const [savedSet, setSavedSet] = React.useState<Set<string>>(new Set());

  const toggleSave = React.useCallback((vendorId: string, next: boolean) => {
    setSavedSet((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(vendorId);
      else updated.delete(vendorId);
      return updated;
    });
  }, []);

  if (vendors.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium text-ink">No vendors found</p>
        <p className="mt-1 text-sm text-ink-muted">Try adjusting your filters or search terms.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {vendors.map((vendor) => (
        <VendorCard
          key={vendor.id}
          vendor={vendor}
          searchDate={searchDate}
          isSaved={savedSet.has(vendor.id)}
          onSaveToggle={(next) => toggleSave(vendor.id, next)}
        />
      ))}
    </div>
  );
}

export function VendorGridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-hairline bg-cream">
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="space-y-2 p-[18px]">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

Key changes from the current version:

- Adds `'use client'` (now stateful)
- Vendor type now includes the derived fields (`VendorCardProps['vendor']`)
- New `searchDate` optional prop
- Local `savedSet` `useState<Set<string>>` + `toggleSave` callback
- Grid breakpoints widened to support 4-col at xl (portrait cards = more density)
- Skeleton matches the new 4:5 aspect + body shape
- Empty state copy uses M+ tokens (`text-ink`, `text-ink-muted`) instead of `text-muted-foreground`

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: only pre-existing error.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/VendorGrid.tsx && \
git commit -m "feat(vendor-card): VendorGrid — local save state, searchDate threading, 4-col xl"
```

---

## Task 4: Backend query — add derived `confirmed_wedding_count` + `is_available_for_date`

**Files:**

- Modify: `src/lib/vendor-filters.ts`

- [ ] **Step 1: Inspect the existing query shape**

Run: `grep -n "vendor_packages_price_band" src/lib/vendor-filters.ts src/app/\(marketplace\)/vendors/page.tsx`

You'll see the existing `select(...)` strings use Supabase's PostgREST embedded-relation syntax. The new derived fields can't use the same simple syntax — they require LATERAL subqueries that PostgREST doesn't expose directly.

**Two options:**

- **(a) RPC function** (recommended): Create a Postgres function `vendor_list_with_enrichments(category, search_date)` that returns vendor_profiles rows + the two derived columns. Call it via `supabase.rpc(...)`. Cleaner, atomic, no client-side joining.
- **(b) Two separate queries + client-side merge**: fetch vendors as today; then fetch wedding counts + availability separately keyed by vendor.id; merge in TypeScript. Avoids new DB function but doubles round-trips.

**Pick (a)** — write a small RPC. Migration adds a Postgres function (read-only, no schema changes).

- [ ] **Step 2: Create the RPC migration**

Write to `supabase/migrations/00037_vendor_list_enrichments_rpc.sql`:

```sql
-- 00037_vendor_list_enrichments_rpc.sql
-- Read-only RPC returning the vendor_profiles join + derived enrichments used by
-- the marketplace card (confirmed wedding count + date availability).
--
-- Idempotent (CREATE OR REPLACE). No schema changes, just a function.

CREATE OR REPLACE FUNCTION vendor_list_enrichments(p_search_date date DEFAULT NULL)
RETURNS TABLE (
  vendor_profile_id uuid,
  confirmed_wedding_count int,
  is_available_for_date boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    vp.id AS vendor_profile_id,
    COALESCE((
      SELECT COUNT(*)::int
      FROM bookings b
      WHERE b.vendor_profile_id = vp.id
        AND b.status = 'confirmed'
    ), 0) AS confirmed_wedding_count,
    CASE
      WHEN p_search_date IS NULL THEN NULL
      ELSE NOT EXISTS (
        SELECT 1 FROM vendor_calendar_holds vch
        WHERE vch.vendor_profile_id = vp.id
          AND vch.hold_range @> (p_search_date::timestamptz)
      )
    END AS is_available_for_date
  FROM vendor_profiles vp;
$$;

-- Allow anon + authenticated to call this RPC (read-only).
GRANT EXECUTE ON FUNCTION vendor_list_enrichments(date) TO anon, authenticated;
```

Note: `bookings.status = 'confirmed'` — verify the exact enum value in `00018_add_booking_columns_and_statuses.sql` or `00028_drop_legacy_columns.sql`. If the value is `'confirmed_paid'` or similar, adjust. Run:

```bash
grep -A6 "bookings_status_check" supabase/migrations/*.sql | head -20
```

Find the CHECK constraint; pick the status value(s) that represent "wedding done / confirmed booking" semantically. If multiple statuses qualify (e.g. `confirmed` + `completed`), use `b.status IN ('confirmed', 'completed')`.

- [ ] **Step 3: Apply the migration to dev DB**

```bash
PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' .env.local | cut -d= -f2- | tr -d '\"')" psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00037_vendor_list_enrichments_rpc.sql
```

Expected: `CREATE FUNCTION` then `GRANT` success lines.

If `SUPABASE_DB_PASSWORD` isn't in `.env.local`, check for `DATABASE_URL` or use the connection string from `supabase_prod_connection.md` memory.

If the migration fails with `column "vendor_profile_id" does not exist on bookings`, the column may be named differently — adjust based on the actual `bookings` schema (run `\d bookings` via psql to check).

- [ ] **Step 4: Update the page query to use the RPC**

Edit `src/app/(marketplace)/vendors/page.tsx`. Add this AFTER the existing vendor list fetch but BEFORE returning the page JSX:

```ts
// Fetch enrichments via RPC and merge by vendor id.
const searchDateParam =
  typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;

const { data: enrichments } = await supabase.rpc('vendor_list_enrichments', {
  p_search_date: searchDateParam,
});

const enrichmentMap = new Map<
  string,
  {
    confirmed_wedding_count: number;
    is_available_for_date: boolean | null;
  }
>();
(enrichments ?? []).forEach((row) => {
  enrichmentMap.set(row.vendor_profile_id, {
    confirmed_wedding_count: row.confirmed_wedding_count,
    is_available_for_date: row.is_available_for_date,
  });
});

const enrichedVendors = (vendors ?? []).map((v) => ({
  ...v,
  ...(enrichmentMap.get(v.id) ?? {
    confirmed_wedding_count: 0,
    is_available_for_date: null,
  }),
}));
```

Then change the existing `<VendorGrid vendors={vendors ?? []} />` mount to:

```tsx
<VendorGrid vendors={enrichedVendors} searchDate={searchDateParam ?? undefined} />
```

- [ ] **Step 5: Add Supabase types for the RPC** (if database.types.ts is strict)

If `npm run typecheck` complains about `supabase.rpc('vendor_list_enrichments', ...)`, you have two options:

- (a) Regenerate types: `npx supabase gen types typescript --project-id lquvhjedlzubqusnfaak > src/types/database.types.ts` (requires CLI auth)
- (b) Manual extension: open `src/types/database.types.ts`, find the `Functions` interface (likely empty or has a few entries), add:
  ```ts
  vendor_list_enrichments: {
    Args: { p_search_date?: string | null };
    Returns: {
      vendor_profile_id: string;
      confirmed_wedding_count: number;
      is_available_for_date: boolean | null;
    }[];
  };
  ```

Pick whichever is faster.

- [ ] **Step 6: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: only pre-existing error.

```bash
curl -sI http://localhost:3000/vendors | head -1
```

Expected: HTTP 200. If 500, tail `/tmp/baazar-dev.log` and diagnose (likely the RPC name doesn't match the function created, or status enum value differs).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00037_vendor_list_enrichments_rpc.sql \
  src/lib/vendor-filters.ts \
  "src/app/(marketplace)/vendors/page.tsx" \
  src/types/database.types.ts && \
git commit -m "feat(vendor-card): RPC for derived wedding count + date availability"
```

(Adjust file list to match what you actually changed; `vendor-filters.ts` may not have needed changes if you put the merge logic in `page.tsx`.)

---

## Task 5: Visual verification (Playwright)

**Files:** none modified — screenshots only.

- [ ] **Step 1: Dev server healthy + browse the page**

```bash
curl -sI http://localhost:3000/vendors | head -1
```

Expected: HTTP 200.

- [ ] **Step 2: Default state screenshot**

```bash
node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/vendors /tmp/baazar-vcard-default.png
```

Read `/tmp/baazar-vcard-default.png`. Verify:

- Grid of portrait (4:5) cards, 3 or 4 columns depending on viewport
- Each card has indigo kicker (category), Spectral name, meta row, price
- Verified pill (top-left) on verified vendors
- Save heart (top-right) outline
- No haldi pill (no date in URL)

- [ ] **Step 3: Date-in-URL screenshot**

```bash
node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs "http://localhost:3000/vendors?date=2026-10-17" /tmp/baazar-vcard-with-date.png
```

Read it. Verify:

- Haldi "Available Oct 17" pill appears on AT LEAST ONE card (vendors with no calendar block on that date)
- Pill sits below verified pill, has haldi yellow bg with ink dot + ink text
- Some cards may NOT have the pill (those vendors are blocked) — that's expected and correct

- [ ] **Step 4: Hover state screenshot (interactive)**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/vendors', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('a[href^=\"/vendors/\"]').first().hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/baazar-vcard-hover.png', fullPage: false });
  await browser.close();
})();
"
```

Read `/tmp/baazar-vcard-hover.png`. Verify:

- First card lifted (-3px), shadow visible
- Indigo arrow orb visible bottom-right of photo
- Photo subtly scaled (1.04)
- Border faded to transparent (or matches the shadow's faint ring)

- [ ] **Step 5: Save click**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/vendors', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Click the first card's save heart (button inside the link)
  await page.locator('button[aria-label=\"Save vendor\"]').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/baazar-vcard-saved.png', fullPage: false });
  // Verify URL did NOT navigate (save shouldn't trigger Link)
  console.log('URL after save click:', page.url());
  await browser.close();
})();
"
```

Read `/tmp/baazar-vcard-saved.png`. Verify:

- Heart on first card is filled hot-pink
- URL output is still `/vendors` (not `/vendors/[slug]`) — proves the save click's `preventDefault()` worked

- [ ] **Step 6: Mobile screenshot**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/vendors', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/baazar-vcard-mobile.png', fullPage: false });
  await browser.close();
})();
"
```

Read `/tmp/baazar-vcard-mobile.png`. Verify:

- 1-column stack
- Cards fill viewport width with portrait photo
- Verified pill + save heart still positioned at corners
- Body text readable at mobile width
- No arrow orb visible (hover is desktop-only)

- [ ] **Step 7: If anything's broken**

Common issues + fixes:

- **Haldi pill never appears** → RPC returned NULL for all `is_available_for_date`; check `vendor_calendar_holds` actually has rows in dev, OR check the date param parsing in step 4 of Task 4
- **Wedding count never appears** → vendors don't have ≥10 confirmed bookings in dev DB; expected behavior. Confirm by setting `formatWeddingCount` threshold to 1 temporarily and re-checking; revert to 10 after.
- **Cards look wrong shape** → check `aspect-[4/5]` is applied; Tailwind needs the class compiled (restart dev server if needed)
- **Hover orb doesn't appear** → check `md:group-hover:opacity-100` — needs `group` class on outer `<Link>` AND `md:` breakpoint matched

If you fix anything, commit as its own small commit.

---

## Task 6: Update DESIGN.md

**Files:**

- Modify: `DESIGN.md` frontmatter `components:` block

- [ ] **Step 1: Find the vendor-card-hover entry**

```bash
grep -n "vendor-card-hover:" DESIGN.md
```

The vendor-card-hover entry already exists from earlier brand work. The new `vendor-card` entry should sit IMMEDIATELY AFTER `vendor-card-hover:` (the component pairs with its hover pattern).

- [ ] **Step 2: Insert the `vendor-card` entry**

Edit `DESIGN.md`. Add this YAML immediately after the `vendor-card-hover:` block's last key (likely `requires:`):

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

Match the existing 2-space indent (component name) + 4-space indent (keys).

- [ ] **Step 3: Verify YAML still parses**

```bash
head -200 DESIGN.md | grep -cE '^---$'
```

Expected: 2 (opening + closing).

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md && \
git commit -m "docs(design): add vendor-card component to M+ frontmatter"
```

---

## Task 7: Push branch + open PR

- [ ] **Step 1: Commit the plan doc**

```bash
git add docs/superpowers/plans/2026-05-24-baazar-vendor-card.md && \
git commit -m "docs(plan): Baazar vendor card implementation plan"
```

If already tracked, skip.

- [ ] **Step 2: Final verification**

```bash
npm run typecheck && npm run lint && npm run test
```

Expected: typecheck only pre-existing error; lint exit 0; tests pass.

- [ ] **Step 3: Inspect branch commit log**

```bash
git log --oneline main..HEAD
```

Expected: ~8-10 commits under `feat(vendor-card):` / `docs(spec):` / `docs(plan):` / `docs(design):`.

- [ ] **Step 4: Push**

```bash
git push -u origin feat/baazar-vendor-card
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat(vendor-card): Baazar editorial 4:5 vendor card + derived enrichments" --body "$(cat <<'EOF'
## Summary

Replaces the current shadcn-baseline `VendorCard` with the locked Direction B editorial layout (4:5 portrait + indigo kicker + Spectral name) + 3 conversion-driving signals (response time text, wedding count, "Available {date}" haldi pill). Composes the already-locked HV-B hover (lift + indigo orb + photo scale + shadow). Adds derived `confirmed_wedding_count` + `is_available_for_date` via a new read-only RPC.

Per [the spec](docs/superpowers/specs/2026-05-24-baazar-vendor-card-design.md).

## What's in this PR

- **Card UI rewrite** — `VendorCard.tsx` becomes pure presentational, takes `searchDate + isSaved + onSaveToggle` props alongside vendor row
- **Save heart UI** — local-state only (Set in VendorGrid), no persistence Day-1
- **`vendor-card-helpers.ts`** — pure formatters (short date, wedding count bucketing + threshold, price)
- **Migration 00037** — read-only `vendor_list_enrichments(date)` RPC returning per-vendor wedding count + date availability
- **`VendorGrid.tsx`** — threads searchDate, owns local save Set, 4-col xl grid
- **`/vendors/page.tsx`** — reads `?date=`, calls the RPC, merges enrichments into vendor rows, passes searchDate down
- **DESIGN.md** — adds `vendor-card` component entry

## Out of scope (deferred to follow-up)

- Save persistence (`saved_vendors` table + auth-gated API)
- Vendor-selected thumbnail UX (build-time req captured for onboarding wizard + CRM)
- Star rating + review count (no reviews infrastructure yet)
- Capacity-aware availability (Day-1 check is binary "has block / no block")
- Curation badges ("Featured", "Top in category")

## Test plan

- [ ] Hit `/vendors` — see 4:5 portrait cards in 4-col grid (lg), 2-col (md), 1-col (sm)
- [ ] Each card: indigo kicker · Spectral name · meta with response time + wedding count (when ≥10) · From $X
- [ ] Hover a card — lift, shadow, orb slide-in, photo scale
- [ ] Click save heart — fills hot-pink, doesn't navigate
- [ ] Click card body — navigates to profile
- [ ] `/vendors?date=2026-10-17` — haldi "Available Oct 17" pill on vendors with no block; omitted on blocked vendors
- [ ] New vendor (<10 weddings) — wedding count segment omitted from meta
- [ ] Mobile (375px) — 1-col, no orb, finger-tappable heart

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL from output and report it.

## Out of scope (deferred to follow-up PRs)

- Save-heart persistence (`saved_vendors` table + `POST/DELETE /api/users/me/saved/:vendorId` + optimistic UI with rollback)
- Vendor-selected thumbnail UX (onboarding wizard step + CRM action) + `vendor_profiles.active_thumbnail_photo_id` column
- Star rating + review count (reviews table + collection flow + booking-volume-seeded display)
- Capacity-aware availability (multi-team vendor support per Sub-project G)
- Curation badges ("Featured", "Top in {category}", "New this month")
- Recent-activity signals ("Booked 3x this week") — defer until real volume
- React component test infra — `vendor-card-helpers.ts` would unit-test cleanly when the infra lands
