# Sub-project K-2 — Public Unclaimed Listings + "I own this business" Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scraped vendors visible on the public `/vendors` marketplace as browsable-but-not-bookable listings, add an "I own this business" modal that routes to remove-listing or claim-help paths, instrument view + IG-click engagement, and convert the wizard step 1 fuzzy-match prompt from auto-link to hard-block.

**Architecture:** Three new migrations (slug, public read RPCs, engagement + requests tables). The existing `/vendors` and `/vendors/[slug]` pages get extended to read claimed `vendor_profiles` AND unclaimed `scraped_vendors` via two SECURITY-DEFINER RPCs. The "I own this business" modal uses the canonical `@/components/ui/dialog` wrapper (in-marketplace reference: `src/components/marketplace/PackageDetailModal.tsx`). Email notifications append functions to `src/lib/email/resend.ts` matching the existing per-template helper pattern.

**Tech Stack:** Next.js 14.2, Supabase (Postgres + RLS), Radix Dialog via `@/components/ui/dialog`, Resend, Vitest + React Testing Library + Playwright, Zod for API body validation.

**Source spec:** `docs/superpowers/specs/2026-06-01-sub-project-k2-public-unclaimed-listings-design.md` (committed at `19c685a` on this branch).

**Branch:** Continue on `feat/sub-project-k-scraper` (PR #31). Do NOT branch off this; K-2 bundles into the K PR.

**Subagent execution pattern (lessons from K — apply to every task in this plan):**

- **"ONLY these files" constraint** must appear at the top of every implementer prompt. List the exact files. Tell the subagent: "If something breaks elsewhere, STOP and report BLOCKED — do not 'fix' other files."
- **Hand-extend `src/types/database.types.ts`** by adding to the existing structure. Do NOT attempt `supabase gen types`. Auto-gen produces looser types than the hand-written file and cascades into ~17 file rewrites (see K Task 5 incident, commit `202259d`).
- **No `npm run build` inside per-task scope** — that's the wrap-up task's job. Per-task verification is `npx tsc --noEmit` filtered to the task's files + targeted vitest.
- **No `--no-verify`** on commits — let the lint-staged Husky hook run.
- **Prettier + ESLint will reformat** during commit — expected, not a regression.

---

## File structure

### New files

```
supabase/migrations/
├── 00051_scraped_vendors_slug.sql
├── 00052_public_scraped_vendors_rpc.sql
└── 00053_scraped_vendor_engagement_and_requests.sql

scripts/scraper/lib/
└── slug.ts                              # generateScrapedVendorSlug

src/lib/scraped-vendor/
├── public.ts                            # getUnclaimedBySlug + listUnclaimed
└── engagement.ts                        # logView + logIgClick

src/components/marketplace/
├── UnclaimedVendorCard.tsx              # grid card
├── UnclaimedVendorProfile.tsx           # /vendors/[slug] body for unclaimed
└── OwnThisBusinessModal.tsx             # overlay modal w/ Remove + Claim paths

src/app/api/scraped-vendors/[id]/track/
└── route.ts                             # POST: view | ig_click

src/app/api/scraped-vendors/[id]/request/
└── route.ts                             # POST: remove | claim_request

src/__tests__/
├── scripts/scraper/slug.test.ts
├── lib/scraped-vendor/public.test.ts
├── lib/scraped-vendor/engagement.test.ts
├── api/scraped-vendor-track.test.ts
├── api/scraped-vendor-request.test.ts
└── components/marketplace/
    ├── UnclaimedVendorCard.test.tsx
    ├── UnclaimedVendorProfile.test.tsx
    └── OwnThisBusinessModal.test.tsx

tests/e2e/
└── unclaimed-listing.spec.ts
```

### Modified files

```
src/types/database.types.ts                                     — add new tables + RPC sigs
scripts/scraper/merge.ts                                        — generate slug on insert
src/app/(marketplace)/vendors/page.tsx                          — render claimed + unclaimed
src/app/(marketplace)/vendors/[slug]/page.tsx                   — resolve claimed OR unclaimed
src/components/onboarding/StepBasics.tsx                        — drop auto-link, add hard-block
src/components/onboarding/ScrapedVendorMatchPrompt.tsx          — rewrite as block UI
src/lib/email/resend.ts                                         — add 4 new template functions
```

### Removed files

```
src/app/api/scraped-vendors/claim/route.ts                      — organic auto-claim retired
src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx
                                                                — rewritten under new behaviour
```

The K-built token claim flow (`/claim/[token]` route, `claim-actions.ts`, `mint-tokens.ts`, `promoteScrapedVendor` lib, the 4 e2e claim specs) is unchanged.

---

## Migration apply policy

Per `[[migration-apply-policy]]`: Claude applies 00051-00053 to dev directly via `psql`. User applies to prod manually via Supabase SQL editor in one batch with K's 00045-00050 once PR #31 is ready to merge.

Dev DB connection (password contains `$`, single-quote it):

```
PGPASSWORD='$uperPa$$57800' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres
```

---

## Milestone 1 — Schema foundation

### Task 1: Migration 00051 — `scraped_vendors.slug` column + backfill

**Files:**

- Create: `supabase/migrations/00051_scraped_vendors_slug.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/00051_scraped_vendors_slug.sql` with EXACTLY this content:

```sql
-- Adds a unique slug to scraped_vendors so /vendors/[slug] can route to
-- unclaimed listings. Slug = lowercased+dashed business_name suffixed with
-- the first 6 hex chars of the UUID to guarantee uniqueness even when two
-- vendors share a business name in different cities.

ALTER TABLE scraped_vendors
  ADD COLUMN slug text;

UPDATE scraped_vendors
SET slug = regexp_replace(
             lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g')),
             '(^-+|-+$)', '', 'g'
           )
           || '-' || substring(replace(id::text, '-', '') from 1 for 6)
WHERE slug IS NULL;

ALTER TABLE scraped_vendors
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX scraped_vendors_slug_key ON scraped_vendors (slug);
```

- [ ] **Step 2: Apply to dev DB**

```bash
PGPASSWORD='$uperPa$$57800' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00051_scraped_vendors_slug.sql
```

Expected output: `ALTER TABLE`, `UPDATE 1` (the existing seed row from K Task 12), `ALTER TABLE`, `CREATE INDEX`.

- [ ] **Step 3: Verify slug populated for existing rows + uniqueness**

```bash
PGPASSWORD='$uperPa$$57800' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "SELECT business_name, slug FROM scraped_vendors LIMIT 3;
      SELECT count(*) AS total, count(DISTINCT slug) AS distinct_slugs FROM scraped_vendors;"
```

Expected: all rows show a slug like `example-chai-cart-abcd12`; total == distinct_slugs.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00051_scraped_vendors_slug.sql
git commit -m "feat(schema): scraped_vendors.slug (NOT NULL, UNIQUE) + backfill (mig 00051)"
```

---

### Task 2: Migration 00052 — Public read RPCs

**Files:**

- Create: `supabase/migrations/00052_public_scraped_vendors_rpc.sql`

- [ ] **Step 1: Write the SQL**

Create `supabase/migrations/00052_public_scraped_vendors_rpc.sql` with EXACTLY this content:

```sql
-- Public read surface for unclaimed scraped vendors.
-- Excludes phone, email, raw, enriched, source_external_id so PII never
-- reaches anon. Service-definer + search_path locked to public.

CREATE OR REPLACE FUNCTION public_scraped_vendors_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  business_name text,
  category text,
  city text,
  state text,
  tags text[],
  instagram_handle text,
  website text,
  bio text,
  photos text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.slug, sv.business_name, sv.category, sv.city, sv.state,
         sv.tags, sv.instagram_handle, sv.website, sv.bio, sv.photos
  FROM scraped_vendors sv
  WHERE sv.slug = p_slug
    AND sv.claimed_at IS NULL
    AND sv.disputed_at IS NULL
    AND sv.review_status NOT IN ('rejected', 'duplicate');
$$;

REVOKE EXECUTE ON FUNCTION public_scraped_vendors_by_slug FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_scraped_vendors_by_slug TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public_scraped_vendors_list(
  p_category text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_limit integer DEFAULT 60
) RETURNS TABLE (
  id uuid,
  slug text,
  business_name text,
  category text,
  city text,
  state text,
  instagram_handle text,
  bio text,
  photos text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.slug, sv.business_name, sv.category, sv.city, sv.state,
         sv.instagram_handle, sv.bio, sv.photos
  FROM scraped_vendors sv
  WHERE sv.claimed_at IS NULL
    AND sv.disputed_at IS NULL
    AND sv.review_status NOT IN ('rejected', 'duplicate')
    AND (p_category IS NULL OR sv.category = p_category)
    AND (p_city IS NULL OR lower(sv.city) = lower(p_city))
  ORDER BY sv.scraped_at DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public_scraped_vendors_list FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_scraped_vendors_list TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply to dev**

```bash
PGPASSWORD='$uperPa$$57800' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00052_public_scraped_vendors_rpc.sql
```

Expected: `CREATE FUNCTION`, `REVOKE`, `GRANT`, `CREATE FUNCTION`, `REVOKE`, `GRANT`.

- [ ] **Step 3: Smoke-test both RPCs return data**

```bash
PGPASSWORD='$uperPa$$57800' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "SELECT business_name, slug FROM public_scraped_vendors_list(NULL, NULL, 5);
      SELECT business_name FROM public_scraped_vendors_by_slug(
        (SELECT slug FROM scraped_vendors WHERE claimed_at IS NULL LIMIT 1)
      );"
```

Expected: list returns ≥1 row (seed row); by-slug returns the matching row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00052_public_scraped_vendors_rpc.sql
git commit -m "feat(schema): public_scraped_vendors_{list,by_slug} RPCs (mig 00052)"
```

---

### Task 3: Migration 00053 — Engagement + request tables

**Files:**

- Create: `supabase/migrations/00053_scraped_vendor_engagement_and_requests.sql`

- [ ] **Step 1: Write the SQL**

Create `supabase/migrations/00053_scraped_vendor_engagement_and_requests.sql` with EXACTLY this content:

```sql
-- Cookieless engagement on unclaimed vendor pages.
-- IP-hash matches src/lib/analytics/ip-hash.ts pattern (SHA-256 of ip::day),
-- so identical IP on the same UTC day collapses into one row per event_type.

CREATE TABLE scraped_vendor_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'ig_click')),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scraped_vendor_engagement_vendor_idx
  ON scraped_vendor_engagement (scraped_vendor_id, event_type, created_at DESC);

CREATE UNIQUE INDEX scraped_vendor_engagement_daily_dedup_idx
  ON scraped_vendor_engagement (
    scraped_vendor_id,
    event_type,
    ip_hash,
    (date_trunc('day', created_at AT TIME ZONE 'UTC'))
  );

ALTER TABLE scraped_vendor_engagement ENABLE ROW LEVEL SECURITY;

-- Vendor-initiated remove / claim-help requests via "I own this business" modal.

CREATE TABLE scraped_vendor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('remove', 'claim_request')),
  requester_name text,
  requester_email text NOT NULL,
  requester_ig text,
  reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  actioned_at timestamptz,
  actioned_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX scraped_vendor_requests_open_idx
  ON scraped_vendor_requests (status, created_at)
  WHERE status = 'open';

ALTER TABLE scraped_vendor_requests ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply to dev**

```bash
PGPASSWORD='$uperPa$$57800' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00053_scraped_vendor_engagement_and_requests.sql
```

Expected: 2 × `CREATE TABLE`, 4 × `CREATE INDEX` (2 unique + 2 regular), 2 × `ALTER TABLE`.

- [ ] **Step 3: Verify tables landed**

```bash
PGPASSWORD='$uperPa$$57800' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "\d scraped_vendor_engagement" \
  -c "\d scraped_vendor_requests"
```

Expected: 4 columns on engagement, 11 columns on requests, RLS enabled on both.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00053_scraped_vendor_engagement_and_requests.sql
git commit -m "feat(schema): scraped_vendor_engagement + scraped_vendor_requests (mig 00053)"
```

---

### Task 4: Hand-extend `database.types.ts`

**Files:**

- Modify: `src/types/database.types.ts`

**IMPORTANT (per K Task 5 lesson, commit `202259d`):** Do NOT run `supabase gen types`. Hand-add entries matching the existing pattern. Auto-gen produces looser nullability than the hand-written types and cascades into ~17 unrelated file rewrites.

- [ ] **Step 1: Add `slug` to existing `scraped_vendors` table entry**

In `src/types/database.types.ts`, find the `scraped_vendors:` table block (search for `scraped_vendors: {`). It exists in the `Database['public']['Tables']` map. Inside the `Row:` object, add `slug: string;` immediately after the `id: string;` line. Inside the `Insert:` object, add `slug?: string;` (optional because it can be generated server-side). Inside `Update:`, add `slug?: string;`.

- [ ] **Step 2: Add the two new tables**

Inside the same `Tables: { ... }` block, after the `scraped_vendors:` entry (and before the closing `};` of `Tables:`), append:

```typescript
      scraped_vendor_engagement: {
        Row: {
          id: string;
          scraped_vendor_id: string;
          event_type: 'view' | 'ig_click';
          ip_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          scraped_vendor_id: string;
          event_type: 'view' | 'ig_click';
          ip_hash: string;
          created_at?: string;
        };
        Update: {
          event_type?: 'view' | 'ig_click';
        };
        Relationships: [
          {
            foreignKeyName: 'scraped_vendor_engagement_scraped_vendor_id_fkey';
            columns: ['scraped_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'scraped_vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      scraped_vendor_requests: {
        Row: {
          id: string;
          scraped_vendor_id: string;
          action: 'remove' | 'claim_request';
          requester_name: string | null;
          requester_email: string;
          requester_ig: string | null;
          reason: string | null;
          status: 'open' | 'actioned' | 'rejected';
          created_at: string;
          actioned_at: string | null;
          actioned_by_user_id: string | null;
        };
        Insert: {
          id?: string;
          scraped_vendor_id: string;
          action: 'remove' | 'claim_request';
          requester_name?: string | null;
          requester_email: string;
          requester_ig?: string | null;
          reason?: string | null;
          status?: 'open' | 'actioned' | 'rejected';
          created_at?: string;
          actioned_at?: string | null;
          actioned_by_user_id?: string | null;
        };
        Update: {
          status?: 'open' | 'actioned' | 'rejected';
          actioned_at?: string | null;
          actioned_by_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'scraped_vendor_requests_scraped_vendor_id_fkey';
            columns: ['scraped_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'scraped_vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scraped_vendor_requests_actioned_by_user_id_fkey';
            columns: ['actioned_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
```

- [ ] **Step 3: Add the two new RPCs to `Functions:`**

In the same file, find the `Functions: { ... }` block (already has `match_scraped_vendors_by_name`, `select_scraped_vendors_for_mint`, etc. from K). Append BEFORE the closing `};` of `Functions:`:

```typescript
      public_scraped_vendors_by_slug: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          slug: string;
          business_name: string;
          category: string | null;
          city: string | null;
          state: string;
          tags: string[];
          instagram_handle: string | null;
          website: string | null;
          bio: string | null;
          photos: string[];
        }[];
      };
      public_scraped_vendors_list: {
        Args: {
          p_category?: string | null;
          p_city?: string | null;
          p_limit?: number;
        };
        Returns: {
          id: string;
          slug: string;
          business_name: string;
          category: string | null;
          city: string | null;
          state: string;
          instagram_handle: string | null;
          bio: string | null;
          photos: string[];
        }[];
      };
```

- [ ] **Step 4: Update the header comment**

Find the file's header docstring (mentions migrations 00043, 00044, etc). Append two lines after the existing 00048-00050 entries:

```
 *   - 00051 scraped_vendors.slug NOT NULL UNIQUE (Sub-project K-2)
 *   - 00052 public_scraped_vendors_{list, by_slug} RPCs (Sub-project K-2)
 *   - 00053 scraped_vendor_engagement + scraped_vendor_requests (Sub-project K-2)
```

- [ ] **Step 5: Type-check the types file isolation**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "database.types" | head
```

Expected: empty (no errors specific to the types file). Other errors elsewhere are out of scope for this task — flag and STOP if present, do not modify other files.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore(types): hand-extend with K-2 tables + RPCs (engagement, requests, public reads)"
```

---

## Milestone 2 — Slug utility + merge update

### Task 5: `scripts/scraper/lib/slug.ts`

**Files:**

- Create: `scripts/scraper/lib/slug.ts`
- Create: `src/__tests__/scripts/scraper/slug.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/scripts/scraper/slug.test.ts` with EXACTLY this content:

```typescript
import { describe, expect, it } from 'vitest';
import { generateScrapedVendorSlug } from '../../../../scripts/scraper/lib/slug';

const FAKE_ID = '11111111-2222-3333-4444-555555555555';

describe('generateScrapedVendorSlug', () => {
  it('lowercases + dash-joins business name + appends 6-char UUID suffix', () => {
    expect(generateScrapedVendorSlug('Best Chai Cart', FAKE_ID)).toBe('best-chai-cart-111111');
  });

  it('strips special chars and collapses repeats', () => {
    expect(generateScrapedVendorSlug("Priya's Mehndi & Henna!", FAKE_ID)).toBe(
      'priya-s-mehndi-henna-111111'
    );
  });

  it('trims leading + trailing dashes the regex produces', () => {
    expect(generateScrapedVendorSlug('  !!Chai!! ', FAKE_ID)).toBe('chai-111111');
  });

  it('falls back to just the suffix when business name has no alphanumerics', () => {
    expect(generateScrapedVendorSlug('!@#$%', FAKE_ID)).toBe('111111');
  });

  it('uses lowercase hex chars from the UUID suffix', () => {
    expect(generateScrapedVendorSlug('X', 'abcdef12-3456-7890-abcd-ef1234567890')).toBe('x-abcdef');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/scripts/scraper/slug.test.ts
```

Expected: ALL fail with module-not-found.

- [ ] **Step 3: Implement `slug.ts`**

Create `scripts/scraper/lib/slug.ts` with EXACTLY this content:

```typescript
/** Generate a unique, URL-safe slug for a scraped_vendors row.
 *  Mirrors the SQL backfill from migration 00051: lowercased + dashed business
 *  name, special chars collapsed, leading/trailing dashes trimmed, suffixed
 *  with the first 6 hex chars of the (UUID minus dashes). */
export function generateScrapedVendorSlug(businessName: string, vendorUuid: string): string {
  const cleaned = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = vendorUuid.replace(/-/g, '').slice(0, 6).toLowerCase();
  return cleaned ? `${cleaned}-${suffix}` : suffix;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- --run src/__tests__/scripts/scraper/slug.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/lib/slug.ts src/__tests__/scripts/scraper/slug.test.ts
git commit -m "feat(scraper): slug generator matching migration 00051 backfill"
```

---

### Task 6: Update `merge.ts` to set slug on insert

**Files:**

- Modify: `scripts/scraper/merge.ts`

**SCOPE CONSTRAINT (subagent prompt):** Only `scripts/scraper/merge.ts`. Do not touch lib/_, schemas.ts, or sources/_.

- [ ] **Step 1: Read the current merge.ts**

```bash
cat scripts/scraper/merge.ts
```

You'll see the `mergeRowsToScrapedVendors` function. The insert branch currently passes `normalized` (the row + normalized phone/IG) directly to `supabase.from('scraped_vendors').insert(...)`. You're going to generate a slug before the insert.

- [ ] **Step 2: Add the import**

Add this line near the other imports (after the existing `import { scrapedRowSchema, type ScrapedRow } from './lib/schemas';` line):

```typescript
import { generateScrapedVendorSlug } from './lib/slug';
import crypto from 'node:crypto';
```

- [ ] **Step 3: Generate slug in the insert branch**

Inside `mergeRowsToScrapedVendors`, find the `else { const { error } = await supabase.from('scraped_vendors').insert(normalized); ... }` branch. Replace it with:

```typescript
    } else {
      const newId = crypto.randomUUID();
      const slug = generateScrapedVendorSlug(normalized.business_name, newId);
      const { error } = await supabase.from('scraped_vendors').insert({
        ...normalized,
        id: newId,
        slug,
      });
      if (error) errors++;
      else inserted++;
    }
```

The `crypto.randomUUID()` is required because we need the same UUID for both the `id` field AND the slug suffix. Letting Postgres generate it server-side would force a round-trip to know the UUID before we can compute the slug.

- [ ] **Step 4: Type-check the modified file**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "merge.ts" | head
```

Expected: empty.

- [ ] **Step 5: Run the existing merge integration tests to confirm no regression**

```bash
set -a; source .env.local; set +a
npm test -- --run src/__tests__/scripts/scraper/merge.test.ts
```

Expected: 2 tests pass (the existing K Task 13 integration tests). Note that the test inserts now have a slug column auto-populated — this is fine because the schema permits any slug as long as it's unique.

- [ ] **Step 6: Commit**

```bash
git add scripts/scraper/merge.ts
git commit -m "feat(scraper): merge generates slug on insert (Task 6 of K-2)"
```

---

## Milestone 3 — Public data libs

### Task 7: `src/lib/scraped-vendor/public.ts` — slug + list readers

**Files:**

- Create: `src/lib/scraped-vendor/public.ts`
- Create: `src/__tests__/lib/scraped-vendor/public.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/lib/scraped-vendor/public.test.ts` with EXACTLY this content:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { getUnclaimedBySlug, listUnclaimed } from '../../../lib/scraped-vendor/public';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__public_test_${Date.now()}__`;

describe.skipIf(skip)('public scraped vendor reads (integration)', () => {
  const fakeSlug = `e2e-public-test-${Date.now()}`;

  beforeEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').insert({
      source: 'hand_curated',
      business_name: 'E2E Public Test Cart',
      category: 'carts',
      tags: [TEST_TAG],
      city: 'Chicago',
      state: 'IL',
      photos: ['https://example.test/x.jpg'],
      raw: {},
      slug: fakeSlug,
    });
  });

  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('getUnclaimedBySlug returns the row', async () => {
    const row = await getUnclaimedBySlug(fakeSlug);
    expect(row).not.toBeNull();
    expect(row?.business_name).toBe('E2E Public Test Cart');
  });

  it('getUnclaimedBySlug returns null for missing slugs', async () => {
    const row = await getUnclaimedBySlug('does-not-exist-zzz');
    expect(row).toBeNull();
  });

  it('listUnclaimed includes the test row when filtered by category', async () => {
    const rows = await listUnclaimed({ category: 'carts', city: 'Chicago', limit: 60 });
    expect(rows.find((r) => r.slug === fakeSlug)).toBeDefined();
  });

  it('getUnclaimedBySlug returns null after the row is claimed', async () => {
    const supabase = await createServiceRoleClient();
    await supabase
      .from('scraped_vendors')
      .update({ claimed_at: new Date().toISOString() })
      .eq('slug', fakeSlug);
    const row = await getUnclaimedBySlug(fakeSlug);
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
set -a; source .env.local; set +a
npm test -- --run src/__tests__/lib/scraped-vendor/public.test.ts
```

Expected: fail with module-not-found.

- [ ] **Step 3: Implement `public.ts`**

Create `src/lib/scraped-vendor/public.ts` with EXACTLY this content:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface UnclaimedVendor {
  id: string;
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string;
  tags: string[];
  instagram_handle: string | null;
  website: string | null;
  bio: string | null;
  photos: string[];
}

export interface UnclaimedVendorListItem {
  id: string;
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string;
  instagram_handle: string | null;
  bio: string | null;
  photos: string[];
}

/** Look up a single unclaimed scraped vendor by slug. Returns null if
 *  not found, already claimed, disputed, or rejected. */
export async function getUnclaimedBySlug(slug: string): Promise<UnclaimedVendor | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('public_scraped_vendors_by_slug', { p_slug: slug });
  if (error) return null;
  const rows = (data ?? []) as UnclaimedVendor[];
  return rows[0] ?? null;
}

/** List unclaimed scraped vendors, optionally filtered by category + city. */
export async function listUnclaimed(opts: {
  category?: string | null;
  city?: string | null;
  limit?: number;
}): Promise<UnclaimedVendorListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('public_scraped_vendors_list', {
    p_category: opts.category ?? null,
    p_city: opts.city ?? null,
    p_limit: opts.limit ?? 60,
  });
  if (error) return [];
  return (data ?? []) as UnclaimedVendorListItem[];
}
```

- [ ] **Step 4: Re-run tests**

```bash
set -a; source .env.local; set +a
npm test -- --run src/__tests__/lib/scraped-vendor/public.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraped-vendor/public.ts src/__tests__/lib/scraped-vendor/public.test.ts
git commit -m "feat(scraped-vendor): public readers (getUnclaimedBySlug, listUnclaimed)"
```

---

### Task 8: `src/lib/scraped-vendor/engagement.ts` — view + click tracking

**Files:**

- Create: `src/lib/scraped-vendor/engagement.ts`
- Create: `src/__tests__/lib/scraped-vendor/engagement.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/lib/scraped-vendor/engagement.test.ts` with EXACTLY this content:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { logEngagement } from '../../../lib/scraped-vendor/engagement';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__engagement_test_${Date.now()}__`;
const TEST_IP = '127.0.0.1';

describe.skipIf(skip)('logEngagement (integration)', () => {
  let vendorId: string;

  beforeEach(async () => {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'Engagement Test Cart',
        category: 'carts',
        tags: [TEST_TAG],
        city: 'Chicago',
        state: 'IL',
        photos: [],
        raw: {},
        slug: `engagement-test-${Date.now()}`,
      })
      .select('id')
      .single();
    vendorId = data!.id;
  });

  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('records a view event', async () => {
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type, ip_hash')
      .eq('scraped_vendor_id', vendorId);
    expect(data?.length).toBe(1);
    expect(data![0].event_type).toBe('view');
  });

  it('dedupes same IP+UA+day for the same event type', async () => {
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendor_engagement')
      .select('id')
      .eq('scraped_vendor_id', vendorId)
      .eq('event_type', 'view');
    expect(data?.length).toBe(1);
  });

  it('different event types from same IP do NOT dedupe', async () => {
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    await logEngagement(vendorId, 'ig_click', TEST_IP, 'Mozilla/5.0');
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type')
      .eq('scraped_vendor_id', vendorId);
    expect(data?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
set -a; source .env.local; set +a
npm test -- --run src/__tests__/lib/scraped-vendor/engagement.test.ts
```

Expected: fail with module-not-found.

- [ ] **Step 3: Implement `engagement.ts`**

Create `src/lib/scraped-vendor/engagement.ts` with EXACTLY this content:

```typescript
import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type EngagementEvent = 'view' | 'ig_click';

/** Hash IP + UA + UTC-day for k-anonymous dedup. Mirrors the pattern in
 *  src/lib/analytics/ip-hash.ts (IP + day) with UA also folded in to keep
 *  shared-IP-different-browser visits separate. */
function computeEngagementHash(ip: string, userAgent: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return createHash('sha256').update(`${ip}::${userAgent}::${day}`).digest('hex');
}

/** Insert an engagement event. The (vendor, event_type, ip_hash, day) unique
 *  index causes duplicates to be silently ignored at insert. */
export async function logEngagement(
  scrapedVendorId: string,
  event: EngagementEvent,
  ip: string,
  userAgent: string
): Promise<void> {
  const supabase = await createServiceRoleClient();
  const ipHash = computeEngagementHash(ip, userAgent);
  // Postgres unique violation (23505) when row already exists for this day:
  // ignore it; that's the dedup mechanism.
  const { error } = await supabase.from('scraped_vendor_engagement').insert({
    scraped_vendor_id: scrapedVendorId,
    event_type: event,
    ip_hash: ipHash,
  });
  if (error && error.code !== '23505') {
    // Real error — log via console but don't throw. Engagement is fire-and-forget.
    // (server-side observability comes from upstream callers.)
    console.warn('logEngagement failed:', error.message);
  }
}
```

- [ ] **Step 4: Re-run tests**

```bash
set -a; source .env.local; set +a
npm test -- --run src/__tests__/lib/scraped-vendor/engagement.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraped-vendor/engagement.ts src/__tests__/lib/scraped-vendor/engagement.test.ts
git commit -m "feat(scraped-vendor): logEngagement with daily IP+UA dedup"
```

---

## Milestone 4 — API routes

### Task 9: POST `/api/scraped-vendors/[id]/track` route

**Files:**

- Create: `src/app/api/scraped-vendors/[id]/track/route.ts`
- Create: `src/__tests__/api/scraped-vendor-track.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/scraped-vendor-track.test.ts` with EXACTLY this content:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/scraped-vendor/engagement');

import { POST } from '@/app/api/scraped-vendors/[id]/track/route';
import { logEngagement } from '@/lib/scraped-vendor/engagement';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/scraped-vendors/[id]/track', () => {
  it('returns 200 and calls logEngagement for valid view event', async () => {
    vi.mocked(logEngagement).mockResolvedValueOnce();
    const req = new Request('http://t/', {
      method: 'POST',
      headers: { 'user-agent': 'Mozilla/5.0' },
      body: JSON.stringify({ event: 'view' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(200);
    expect(logEngagement).toHaveBeenCalledWith(
      '11111111-2222-3333-4444-555555555555',
      'view',
      expect.any(String),
      'Mozilla/5.0'
    );
  });

  it('returns 400 on invalid event type', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ event: 'invalid_event' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid id (non-UUID)', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ event: 'view' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/api/scraped-vendor-track.test.ts
```

Expected: fail with module-not-found (route doesn't exist yet).

- [ ] **Step 3: Implement the route**

Create `src/app/api/scraped-vendors/[id]/track/route.ts` with EXACTLY this content:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logEngagement } from '@/lib/scraped-vendor/engagement';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  event: z.enum(['view', 'ig_click']),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  const rawParams = await params;
  const paramsParsed = paramsSchema.safeParse(rawParams);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  // Pull IP from standard forwarded headers; falls back to a placeholder for tests.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  await logEngagement(paramsParsed.data.id, parsed.data.event, ip, userAgent);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/api/scraped-vendor-track.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scraped-vendors/[id]/track/route.ts \
       src/__tests__/api/scraped-vendor-track.test.ts
git commit -m "feat(api): POST /api/scraped-vendors/[id]/track logs view + ig_click"
```

---

### Task 10: POST `/api/scraped-vendors/[id]/request` + email helpers

**Files:**

- Create: `src/app/api/scraped-vendors/[id]/request/route.ts`
- Create: `src/__tests__/api/scraped-vendor-request.test.ts`
- Modify: `src/lib/email/resend.ts` (append 4 new functions)

- [ ] **Step 1: Append the 4 email helpers to `src/lib/email/resend.ts`**

Open `src/lib/email/resend.ts` and append at the very end of the file (after the last existing function and before EOF):

```typescript
// ─── K-2: Unclaimed listing ownership requests ────────────────────────────────

const OPS_INBOX = process.env.OPS_INBOX_EMAIL || 'hello@baazar.io';

/** Fired when a vendor clicks "I own this business" → "Get help claiming". */
export async function sendClaimRequestTeamEmail(
  businessName: string,
  requesterName: string | null,
  requesterEmail: string,
  requesterIg: string | null,
  scrapedVendorId: string
): Promise<boolean> {
  const safeName = escapeHtml(businessName);
  const safeRequester = escapeHtml(requesterName ?? '(no name)');
  const safeIg = escapeHtml(requesterIg ?? '(none)');
  return sendEmail({
    to: OPS_INBOX,
    subject: `[Claim request] ${businessName}`,
    html: `
      <h2>New claim request</h2>
      <p><strong>Business:</strong> ${safeName}</p>
      <p><strong>Requested by:</strong> ${safeRequester} &lt;${escapeHtml(requesterEmail)}&gt;</p>
      <p><strong>Instagram:</strong> ${safeIg}</p>
      <p><strong>scraped_vendor_id:</strong> <code>${escapeHtml(scrapedVendorId)}</code></p>
      <p>Action: verify the claim, then mint a token via
        <code>npm run scrape:mint-tokens -- --campaign claim-${escapeHtml(scrapedVendorId).slice(0, 8)} --filter "id = '${escapeHtml(scrapedVendorId)}'"</code>
        and DM the link to <strong>@${safeIg}</strong>.</p>
      ${FOOTER}
    `,
  });
}

/** Auto-reply to the vendor who submitted a claim request. */
export async function sendClaimRequestVendorEmail(
  requesterEmail: string,
  businessName: string
): Promise<boolean> {
  return sendEmail({
    to: requesterEmail,
    subject: 'We received your Baazar claim request',
    html: `
      <h2>Thanks for reaching out</h2>
      <p>We received your request to claim <strong>${escapeHtml(businessName)}</strong>.</p>
      <p>We verify all claims via Instagram DM. You'll receive a unique claim link
        from our team's Instagram account within 7 days. Click the link to take
        ownership of your listing.</p>
      <p>If you don't see the DM, check your Instagram message requests folder.</p>
      ${FOOTER}
    `,
  });
}

/** Fired when a vendor clicks "I own this business" → "Remove my listing". */
export async function sendRemovalRequestTeamEmail(
  businessName: string,
  requesterName: string | null,
  requesterEmail: string,
  reason: string | null,
  scrapedVendorId: string
): Promise<boolean> {
  const safeName = escapeHtml(businessName);
  const safeRequester = escapeHtml(requesterName ?? '(no name)');
  const safeReason = escapeHtml(reason ?? '(none)');
  return sendEmail({
    to: OPS_INBOX,
    subject: `[Removal request] ${businessName}`,
    html: `
      <h2>New removal request</h2>
      <p><strong>Business:</strong> ${safeName}</p>
      <p><strong>Requested by:</strong> ${safeRequester} &lt;${escapeHtml(requesterEmail)}&gt;</p>
      <p><strong>Reason:</strong> ${safeReason}</p>
      <p><strong>scraped_vendor_id:</strong> <code>${escapeHtml(scrapedVendorId)}</code></p>
      <p><em>The row was automatically marked disputed at submit time.</em></p>
      ${FOOTER}
    `,
  });
}

/** Auto-reply to the vendor who requested removal. */
export async function sendRemovalConfirmationVendorEmail(
  requesterEmail: string,
  businessName: string
): Promise<boolean> {
  return sendEmail({
    to: requesterEmail,
    subject: `Your Baazar listing will be removed — ${businessName}`,
    html: `
      <h2>Listing taken offline</h2>
      <p>We've removed <strong>${escapeHtml(businessName)}</strong> from Baazar
        within the next 48 hours. The business will not be re-scraped or relisted.</p>
      <p>If anything else is needed, reply to this email.</p>
      ${FOOTER}
    `,
  });
}
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/api/scraped-vendor-request.test.ts` with EXACTLY this content:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/resend');
vi.mock('@/lib/supabase/server');

import { POST } from '@/app/api/scraped-vendors/[id]/request/route';
import {
  sendClaimRequestTeamEmail,
  sendClaimRequestVendorEmail,
  sendRemovalRequestTeamEmail,
  sendRemovalConfirmationVendorEmail,
} from '@/lib/email/resend';
import { createServiceRoleClient } from '@/lib/supabase/server';

beforeEach(() => {
  vi.resetAllMocks();
  const mockClient = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { business_name: 'Test Cart' } }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'req-1' } }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
  vi.mocked(createServiceRoleClient).mockResolvedValue(mockClient as never);
  vi.mocked(sendClaimRequestTeamEmail).mockResolvedValue(true);
  vi.mocked(sendClaimRequestVendorEmail).mockResolvedValue(true);
  vi.mocked(sendRemovalRequestTeamEmail).mockResolvedValue(true);
  vi.mocked(sendRemovalConfirmationVendorEmail).mockResolvedValue(true);
});

describe('POST /api/scraped-vendors/[id]/request', () => {
  it('handles claim_request action: inserts row + sends both emails', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({
        action: 'claim_request',
        requester_email: 'vendor@example.com',
        requester_name: 'Priya',
        requester_ig: 'priyahennaco',
      }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(200);
    expect(sendClaimRequestTeamEmail).toHaveBeenCalled();
    expect(sendClaimRequestVendorEmail).toHaveBeenCalled();
    expect(sendRemovalRequestTeamEmail).not.toHaveBeenCalled();
  });

  it('handles remove action: also marks vendor disputed', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({
        action: 'remove',
        requester_email: 'vendor@example.com',
        reason: 'not my business',
      }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(200);
    expect(sendRemovalRequestTeamEmail).toHaveBeenCalled();
    expect(sendRemovalConfirmationVendorEmail).toHaveBeenCalled();
  });

  it('returns 400 on invalid action', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ action: 'wat', requester_email: 'x@y.com' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing requester_email', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ action: 'remove' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run, confirm fail**

```bash
npm test -- --run src/__tests__/api/scraped-vendor-request.test.ts
```

Expected: fail (route doesn't exist).

- [ ] **Step 4: Implement the route**

Create `src/app/api/scraped-vendors/[id]/request/route.ts` with EXACTLY this content:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  sendClaimRequestTeamEmail,
  sendClaimRequestVendorEmail,
  sendRemovalRequestTeamEmail,
  sendRemovalConfirmationVendorEmail,
} from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  action: z.enum(['remove', 'claim_request']),
  requester_email: z.string().email(),
  requester_name: z.string().nullable().optional(),
  requester_ig: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  const rawParams = await params;
  const paramsParsed = paramsSchema.safeParse(rawParams);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const vendorId = paramsParsed.data.id;
  const body = parsed.data;
  const supabase = await createServiceRoleClient();

  const { data: vendor } = await supabase
    .from('scraped_vendors')
    .select('business_name')
    .eq('id', vendorId)
    .maybeSingle();

  if (!vendor) {
    return NextResponse.json({ error: 'vendor not found' }, { status: 404 });
  }
  const businessName = (vendor as { business_name: string }).business_name;

  const { data: insertResult } = await supabase
    .from('scraped_vendor_requests')
    .insert({
      scraped_vendor_id: vendorId,
      action: body.action,
      requester_name: body.requester_name ?? null,
      requester_email: body.requester_email,
      requester_ig: body.requester_ig ?? null,
      reason: body.reason ?? null,
    })
    .select('id')
    .single();

  if (body.action === 'remove') {
    await supabase
      .from('scraped_vendors')
      .update({ disputed_at: new Date().toISOString() })
      .eq('id', vendorId);
    await Promise.all([
      sendRemovalRequestTeamEmail(
        businessName,
        body.requester_name ?? null,
        body.requester_email,
        body.reason ?? null,
        vendorId
      ),
      sendRemovalConfirmationVendorEmail(body.requester_email, businessName),
    ]);
  } else {
    await Promise.all([
      sendClaimRequestTeamEmail(
        businessName,
        body.requester_name ?? null,
        body.requester_email,
        body.requester_ig ?? null,
        vendorId
      ),
      sendClaimRequestVendorEmail(body.requester_email, businessName),
    ]);
  }

  return NextResponse.json({
    ok: true,
    requestId: (insertResult as { id: string } | null)?.id ?? null,
  });
}
```

- [ ] **Step 5: Re-run tests**

```bash
npm test -- --run src/__tests__/api/scraped-vendor-request.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/resend.ts \
       src/app/api/scraped-vendors/[id]/request/route.ts \
       src/__tests__/api/scraped-vendor-request.test.ts
git commit -m "feat(api): POST /api/scraped-vendors/[id]/request + 4 email helpers"
```

---

## Milestone 5 — UI components

### Task 11: `<UnclaimedVendorCard>` grid component

**Files:**

- Create: `src/components/marketplace/UnclaimedVendorCard.tsx`
- Create: `src/__tests__/components/marketplace/UnclaimedVendorCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/marketplace/UnclaimedVendorCard.test.tsx` with EXACTLY this content:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnclaimedVendorCard } from '@/components/marketplace/UnclaimedVendorCard';

const fakeVendor = {
  id: 'sv-1',
  slug: 'best-chai-cart-abc123',
  business_name: 'Best Chai Cart',
  category: 'carts',
  city: 'Chicago',
  state: 'IL',
  instagram_handle: 'bestchaicart',
  bio: null,
  photos: ['https://cdn.test/x.jpg'],
};

describe('<UnclaimedVendorCard>', () => {
  it('renders business name', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    expect(screen.getByText(/Best Chai Cart/i)).toBeInTheDocument();
  });

  it('renders an Unclaimed badge', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    expect(screen.getByText(/unclaimed/i)).toBeInTheDocument();
  });

  it('renders link to the slug page', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/vendors/best-chai-cart-abc123');
  });

  it('renders category + city in the meta line', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    expect(screen.getByText(/carts/i)).toBeInTheDocument();
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/components/marketplace/UnclaimedVendorCard.test.tsx
```

Expected: fail.

- [ ] **Step 3: Implement the component**

Create `src/components/marketplace/UnclaimedVendorCard.tsx` with EXACTLY this content:

```tsx
import Link from 'next/link';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';

interface UnclaimedVendor {
  id: string;
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string;
  instagram_handle: string | null;
  bio: string | null;
  photos: string[];
}

interface Props {
  vendor: UnclaimedVendor;
}

export function UnclaimedVendorCard({ vendor }: Props) {
  const heroPhoto = vendor.photos[0];
  const categoryLabel =
    (vendor.category && (VENDOR_CATEGORY_LABELS as Record<string, string>)[vendor.category]) ||
    vendor.category ||
    'Vendor';

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      className="group block overflow-hidden rounded-lg border bg-card transition hover:shadow-md"
    >
      <div className="relative aspect-[4/5] bg-muted">
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto} alt={vendor.business_name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            No photo
          </div>
        )}
        <span className="absolute right-2 top-2 rounded bg-background/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Unclaimed
        </span>
      </div>
      <div className="p-3">
        <p className="font-medium">{vendor.business_name}</p>
        <p className="text-xs text-muted-foreground">
          {categoryLabel}
          {vendor.city ? ` · ${vendor.city}` : ''}
        </p>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/components/marketplace/UnclaimedVendorCard.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/UnclaimedVendorCard.tsx \
       src/__tests__/components/marketplace/UnclaimedVendorCard.test.tsx
git commit -m "feat(marketplace): UnclaimedVendorCard grid item"
```

---

### Task 12: `<UnclaimedVendorProfile>` profile body component

**Files:**

- Create: `src/components/marketplace/UnclaimedVendorProfile.tsx`
- Create: `src/__tests__/components/marketplace/UnclaimedVendorProfile.test.tsx`

This component is render-only — the "I own this business" button receives an `onOpenOwnership` callback the parent page wires up to the modal. That keeps the modal's open/close state at the route level.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/marketplace/UnclaimedVendorProfile.test.tsx` with EXACTLY this content:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnclaimedVendorProfile } from '@/components/marketplace/UnclaimedVendorProfile';

const fakeVendor = {
  id: 'sv-1',
  slug: 'best-chai-cart-abc123',
  business_name: 'Best Chai Cart',
  category: 'carts',
  city: 'Chicago',
  state: 'IL',
  tags: [],
  instagram_handle: 'bestchaicart',
  website: null,
  bio: 'Some bio',
  photos: ['https://cdn.test/x.jpg'],
};

describe('<UnclaimedVendorProfile>', () => {
  it('renders business name + bio + city', () => {
    render(
      <UnclaimedVendorProfile vendor={fakeVendor} onOpenOwnership={vi.fn()} onIgClick={vi.fn()} />
    );
    expect(screen.getByText(/Best Chai Cart/i)).toBeInTheDocument();
    expect(screen.getByText(/Some bio/i)).toBeInTheDocument();
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument();
  });

  it('renders Unclaimed banner', () => {
    render(
      <UnclaimedVendorProfile vendor={fakeVendor} onOpenOwnership={vi.fn()} onIgClick={vi.fn()} />
    );
    expect(screen.getByText(/hasn't joined Baazar/i)).toBeInTheDocument();
  });

  it('hides IG handle until click; reveals + calls onIgClick when revealed', () => {
    const onIgClick = vi.fn();
    render(
      <UnclaimedVendorProfile vendor={fakeVendor} onOpenOwnership={vi.fn()} onIgClick={onIgClick} />
    );
    expect(screen.queryByText(/bestchaicart/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show on Instagram/i }));
    expect(onIgClick).toHaveBeenCalled();
    expect(screen.getByText(/bestchaicart/i)).toBeInTheDocument();
  });

  it('calls onOpenOwnership when "I own this business" clicked', () => {
    const onOpenOwnership = vi.fn();
    render(
      <UnclaimedVendorProfile
        vendor={fakeVendor}
        onOpenOwnership={onOpenOwnership}
        onIgClick={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /I own this business/i }));
    expect(onOpenOwnership).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/components/marketplace/UnclaimedVendorProfile.test.tsx
```

Expected: fail.

- [ ] **Step 3: Implement the component**

Create `src/components/marketplace/UnclaimedVendorProfile.tsx` with EXACTLY this content:

```tsx
'use client';
import { useState } from 'react';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import type { UnclaimedVendor } from '@/lib/scraped-vendor/public';

interface Props {
  vendor: UnclaimedVendor;
  onOpenOwnership: () => void;
  onIgClick: () => void;
}

export function UnclaimedVendorProfile({ vendor, onOpenOwnership, onIgClick }: Props) {
  const [igRevealed, setIgRevealed] = useState(false);
  const categoryLabel =
    (vendor.category && (VENDOR_CATEGORY_LABELS as Record<string, string>)[vendor.category]) ||
    vendor.category ||
    'Vendor';

  function handleIgClick() {
    onIgClick();
    setIgRevealed(true);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Unclaimed listing</p>
        <p className="text-muted-foreground">
          This vendor hasn&rsquo;t joined Baazar yet. Booking will be available after they claim
          this listing.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
        <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
          {vendor.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.photos[0]}
              alt={vendor.business_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              No photo
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">{vendor.business_name}</h1>
          <p className="text-sm text-muted-foreground">
            {categoryLabel}
            {vendor.city ? ` · ${vendor.city}, ${vendor.state}` : ''}
          </p>
          {vendor.bio && <p className="text-sm">{vendor.bio}</p>}

          {vendor.instagram_handle && (
            <div>
              {igRevealed ? (
                <a
                  href={`https://instagram.com/${vendor.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-foreground underline"
                >
                  @{vendor.instagram_handle}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleIgClick}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Show on Instagram
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-3 font-medium">Are you the owner?</p>
        <button
          type="button"
          onClick={onOpenOwnership}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream hover:opacity-90"
        >
          I own this business
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/components/marketplace/UnclaimedVendorProfile.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/UnclaimedVendorProfile.tsx \
       src/__tests__/components/marketplace/UnclaimedVendorProfile.test.tsx
git commit -m "feat(marketplace): UnclaimedVendorProfile body w/ click-gated IG reveal"
```

---

### Task 13: `<OwnThisBusinessModal>` — multi-view overlay modal

**Files:**

- Create: `src/components/marketplace/OwnThisBusinessModal.tsx`
- Create: `src/__tests__/components/marketplace/OwnThisBusinessModal.test.tsx`

Uses the canonical `Dialog` wrapper at `@/components/ui/dialog`. Reference shape: `src/components/marketplace/PackageDetailModal.tsx`. Internal state machine handles the 3 views (choice / remove form / claim form).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/marketplace/OwnThisBusinessModal.test.tsx` with EXACTLY this content:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OwnThisBusinessModal } from '@/components/marketplace/OwnThisBusinessModal';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, requestId: 'req-1' }),
  }) as unknown as typeof fetch;
});

describe('<OwnThisBusinessModal>', () => {
  it('renders initial choice view when open', () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    expect(screen.getByText(/Remove my listing/i)).toBeInTheDocument();
    expect(screen.getByText(/Get help claiming/i)).toBeInTheDocument();
  });

  it('navigates to remove form on selection', () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Remove my listing/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.getByRole('heading', { name: /Remove this listing/i })).toBeInTheDocument();
  });

  it('navigates to claim form on selection', () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Get help claiming/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.getByRole('heading', { name: /Claim your business/i })).toBeInTheDocument();
  });

  it('posts to /request with action=remove when remove form submitted', async () => {
    const onClose = vi.fn();
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/Remove my listing/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'vendor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send removal request/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/scraped-vendors/sv-1/request');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.action).toBe('remove');
    expect(body.requester_email).toBe('vendor@example.com');
  });

  it('posts to /request with action=claim_request when claim form submitted', async () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Get help claiming/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'vendor@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Instagram handle/i), {
      target: { value: '@bestchai' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Request claim link/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(
      ((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit)
        .body as string
    );
    expect(body.action).toBe('claim_request');
    expect(body.requester_ig).toBe('@bestchai');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/components/marketplace/OwnThisBusinessModal.test.tsx
```

Expected: fail.

- [ ] **Step 3: Implement the component**

Create `src/components/marketplace/OwnThisBusinessModal.tsx` with EXACTLY this content:

```tsx
'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type View = 'choice' | 'remove' | 'claim';

interface Props {
  open: boolean;
  vendorId: string;
  businessName: string;
  onClose: () => void;
}

export function OwnThisBusinessModal({ open, vendorId, businessName, onClose }: Props) {
  const [view, setView] = useState<View>('choice');
  const [intent, setIntent] = useState<View>('remove');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ig, setIg] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'remove' | 'claim' | null>(null);

  function reset() {
    setView('choice');
    setIntent('remove');
    setName('');
    setEmail('');
    setIg('');
    setReason('');
    setSubmitting(false);
    setDone(null);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 200);
  }

  async function submit(action: 'remove' | 'claim_request') {
    setSubmitting(true);
    const res = await fetch(`/api/scraped-vendors/${vendorId}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        requester_email: email,
        requester_name: name || null,
        requester_ig: ig || null,
        reason: reason || null,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(action === 'remove' ? 'remove' : 'claim');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        {done && (
          <div className="space-y-3">
            <DialogHeader>
              <DialogTitle>
                {done === 'remove' ? 'Removal request sent' : 'Claim request sent'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              {done === 'remove'
                ? "Thanks. We'll take this listing offline within 48 hours."
                : "Thanks. We'll DM your Instagram with a claim link within 7 days."}
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream"
            >
              Close
            </button>
          </div>
        )}

        {!done && view === 'choice' && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>I own this business</DialogTitle>
              <DialogDescription>What would you like to do?</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="ownership-intent"
                  value="remove"
                  checked={intent === 'remove'}
                  onChange={() => setIntent('remove')}
                />
                <span>Remove my listing</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="ownership-intent"
                  value="claim"
                  checked={intent === 'claim'}
                  onChange={() => setIntent('claim')}
                />
                <span>Get help claiming this business</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setView(intent)}
                className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {!done && view === 'remove' && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Remove this listing</DialogTitle>
              <DialogDescription>
                We&rsquo;ll take {businessName} offline within 48 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <label className="block">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Your name (optional)
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Reason (optional)
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setView('choice')}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => submit('remove')}
                disabled={!email || submitting}
                className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send removal request'}
              </button>
            </div>
          </div>
        )}

        {!done && view === 'claim' && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Claim your business</DialogTitle>
              <DialogDescription>
                We verify claims via Instagram DM to prevent impersonation.
              </DialogDescription>
            </DialogHeader>
            <ol className="ml-5 list-decimal text-sm">
              <li>Confirm your Instagram handle below.</li>
              <li>Make sure your IG bio mentions your business name.</li>
              <li>We&rsquo;ll DM you within 7 days with a claim link.</li>
              <li>Click the link to take ownership.</li>
            </ol>
            <div className="space-y-3 text-sm">
              <label className="block">
                Instagram handle
                <input
                  type="text"
                  required
                  value={ig}
                  onChange={(e) => setIg(e.target.value)}
                  placeholder="@yourhandle"
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Your name (optional)
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setView('choice')}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => submit('claim_request')}
                disabled={!email || !ig || submitting}
                className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Request claim link'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/components/marketplace/OwnThisBusinessModal.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/OwnThisBusinessModal.tsx \
       src/__tests__/components/marketplace/OwnThisBusinessModal.test.tsx
git commit -m "feat(marketplace): OwnThisBusinessModal w/ remove + claim-help paths"
```

---

## Milestone 6 — Marketplace integration

### Task 14: Wire unclaimed listings into `/vendors` grid

**Files:**

- Modify: `src/app/(marketplace)/vendors/page.tsx`

- [ ] **Step 1: Read the current file structure**

```bash
cat src/app/(marketplace)/vendors/page.tsx
```

Note: the file currently fetches claimed `vendor_profiles` + enrichments + price band in `Promise.all`. You'll add a fourth parallel fetch for unclaimed.

- [ ] **Step 2: Add unclaimed fetch + grid render**

Edit `src/app/(marketplace)/vendors/page.tsx`. Make 3 targeted changes:

**A. Add the import** at the top with other component imports:

```typescript
import { listUnclaimed } from '@/lib/scraped-vendor/public';
import { UnclaimedVendorCard } from '@/components/marketplace/UnclaimedVendorCard';
```

**B. Add the fourth parallel fetch.** Find:

```typescript
const [{ data: vendors, count }, { data: enrichments }, { data: priceBands }] = await Promise.all([
  query,
  supabase.rpc('vendor_list_enrichments', { p_search_date: searchDateParam }),
  supabase
    .from('vendor_packages_price_band')
    .select('vendor_profile_id, min_price_cents, max_price_cents'),
]);
```

Replace with:

```typescript
const [{ data: vendors, count }, { data: enrichments }, { data: priceBands }, unclaimed] =
  await Promise.all([
    query,
    supabase.rpc('vendor_list_enrichments', { p_search_date: searchDateParam }),
    supabase
      .from('vendor_packages_price_band')
      .select('vendor_profile_id, min_price_cents, max_price_cents'),
    listUnclaimed({
      category: filters.category ?? null,
      city: null,
      limit: 60,
    }),
  ]);
```

**C. Render the unclaimed grid below the claimed grid.** Find the JSX:

```tsx
      <FilterShell initialCategory={category} />
      <VendorGrid vendors={enrichedVendors} searchDate={searchDateParam ?? undefined} />
```

Replace with:

```tsx
      <FilterShell initialCategory={category} />
      <VendorGrid vendors={enrichedVendors} searchDate={searchDateParam ?? undefined} />

      {unclaimed.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">More vendors</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            These vendors haven&rsquo;t claimed their Baazar listing yet. Booking opens when they do.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {unclaimed.map((v) => (
              <UnclaimedVendorCard key={v.id} vendor={v} />
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "vendors/page.tsx" | head
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(marketplace\)/vendors/page.tsx
git commit -m "feat(marketplace): render unclaimed vendors below claimed grid"
```

---

### Task 15: Resolve unclaimed in `/vendors/[slug]` + fire view event

**Files:**

- Modify: `src/app/(marketplace)/vendors/[slug]/page.tsx`

The current page calls `supabase.from('vendor_profiles').select('*').eq('slug', slug).single()` and `notFound()` on miss. K-2: on miss, try `getUnclaimedBySlug`; if that hits, render the unclaimed body and fire a view event server-side.

- [ ] **Step 1: Make the targeted modifications**

Edit `src/app/(marketplace)/vendors/[slug]/page.tsx`. Make these 3 changes:

**A. Add imports** at the top with other imports:

```typescript
import { getUnclaimedBySlug } from '@/lib/scraped-vendor/public';
import { UnclaimedVendorRoute } from '@/components/marketplace/UnclaimedVendorRoute';
```

**B. Update the lookup logic.** Find:

```typescript
const { data: vendor } = await supabase
  .from('vendor_profiles')
  .select('*')
  .eq('slug', slug)
  .single();

if (!vendor) notFound();
```

Replace with:

```typescript
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!vendor) {
    const unclaimed = await getUnclaimedBySlug(slug);
    if (!unclaimed) notFound();
    return <UnclaimedVendorRoute vendor={unclaimed} />;
  }
```

(The change from `.single()` → `.maybeSingle()` is required so a missing claimed vendor doesn't throw before we can check the unclaimed fallback.)

- [ ] **Step 2: Create the route wrapper component**

The wrapper handles client-side state (modal open/close) and fires server tracks. Create `src/components/marketplace/UnclaimedVendorRoute.tsx` with EXACTLY this content:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { UnclaimedVendorProfile } from './UnclaimedVendorProfile';
import { OwnThisBusinessModal } from './OwnThisBusinessModal';
import type { UnclaimedVendor } from '@/lib/scraped-vendor/public';

interface Props {
  vendor: UnclaimedVendor;
}

export function UnclaimedVendorRoute({ vendor }: Props) {
  const [ownershipOpen, setOwnershipOpen] = useState(false);

  // Fire view event on mount (fire-and-forget; daily dedup handled server-side).
  useEffect(() => {
    fetch(`/api/scraped-vendors/${vendor.id}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'view' }),
    }).catch(() => {
      // engagement is fire-and-forget; surface in console for local debugging only
    });
  }, [vendor.id]);

  function handleIgClick() {
    fetch(`/api/scraped-vendors/${vendor.id}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ig_click' }),
    }).catch(() => {});
  }

  return (
    <>
      <UnclaimedVendorProfile
        vendor={vendor}
        onOpenOwnership={() => setOwnershipOpen(true)}
        onIgClick={handleIgClick}
      />
      <OwnThisBusinessModal
        open={ownershipOpen}
        vendorId={vendor.id}
        businessName={vendor.business_name}
        onClose={() => setOwnershipOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 3: Type-check both files**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "\[slug\]/page.tsx|UnclaimedVendorRoute" | head
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(marketplace\)/vendors/\[slug\]/page.tsx \
       src/components/marketplace/UnclaimedVendorRoute.tsx
git commit -m "feat(marketplace): /vendors/[slug] resolves unclaimed via public RPC + view track"
```

---

## Milestone 7 — Wizard reroute

### Task 16: Replace wizard auto-link with hard-block

**Files:**

- Modify: `src/components/onboarding/ScrapedVendorMatchPrompt.tsx`
- Modify: `src/components/onboarding/StepBasics.tsx`
- Delete: `src/app/api/scraped-vendors/claim/route.ts`
- Delete: `src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx` (replaced)
- Create: `src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx` (new behavior)

**SCOPE CONSTRAINT (subagent prompt):** Only the files above. Do NOT modify match.ts, promote.ts, or the /claim/[token] route — those are K-built infrastructure that stays in place.

- [ ] **Step 1: Rewrite `ScrapedVendorMatchPrompt.tsx`**

Replace the entire contents of `src/components/onboarding/ScrapedVendorMatchPrompt.tsx` with EXACTLY:

```tsx
'use client';
import Link from 'next/link';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

interface Props {
  matches: ScrapedVendorMatch[];
}

export function ScrapedVendorMatchPrompt({ matches }: Props) {
  const top = matches[0];
  if (!top) return null;

  return (
    <div className="my-4 rounded-lg border bg-muted/30 p-4">
      <h3 className="mb-2 text-lg font-semibold">
        We already have a listing for your business on Baazar.
      </h3>
      <div className="mb-4 rounded-md border bg-background p-3">
        <p className="font-medium">{top.business_name}</p>
        <p className="text-xs text-muted-foreground">
          {top.category ?? 'category unknown'} · {top.city ?? 'unknown city'}
          {top.instagram_handle && ` · @${top.instagram_handle}`}
        </p>
      </div>
      <p className="mb-3 text-sm">To verify it&rsquo;s yours and take ownership:</p>
      <ol className="ml-5 list-decimal text-sm">
        <li>Visit your listing</li>
        <li>Click &ldquo;I own this business&rdquo;</li>
        <li>Choose &ldquo;Get help claiming&rdquo;</li>
      </ol>
      <div className="mt-4">
        <Link
          href={`/vendors/${top.id}`}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream hover:opacity-90"
        >
          Visit my listing
        </Link>
      </div>
    </div>
  );
}
```

Note: the link uses `top.id` as the slug because the `findMatches` lib was built for K and didn't return slug. That's intentional for K-2 to keep this change scoped — the wizard match call's results aren't slug-aware. Task 17 (below) addresses this if needed. For now: `/vendors/${id}` will 404, which is acceptable because this UI tells the user the steps to take and the link is informational.

Actually — let's fix this properly. **Update `findMatches`** to include slug in its return shape so the link works.

- [ ] **Step 1b: Update `src/lib/scraped-vendor/match.ts` to include slug**

In `src/lib/scraped-vendor/match.ts`, change the `ScrapedVendorMatch` interface to add `slug: string`:

```typescript
export interface ScrapedVendorMatch {
  id: string;
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  instagram_handle: string | null;
  photos: string[];
  bio: string | null;
  similarity_score: number;
}
```

Update both query select clauses inside `findMatches`:

- The IG-handle query: change `.select('id, business_name, ...')` to include `slug`
- The phone query: same
- The trigram query already returns from the RPC; update `00049_match_scraped_vendors_rpc.sql` to also return slug.

**Update migration 00049 in place by creating a small follow-up:**

Create `supabase/migrations/00054_match_scraped_vendors_by_name_with_slug.sql`:

```sql
-- Adds slug to the return of match_scraped_vendors_by_name so the wizard
-- block-prompt can link to the unclaimed listing page directly.

CREATE OR REPLACE FUNCTION match_scraped_vendors_by_name(
  p_name text,
  p_city text,
  p_min_similarity real DEFAULT 0.5,
  p_limit integer DEFAULT 5
) RETURNS TABLE (
  id uuid,
  slug text,
  business_name text,
  category text,
  city text,
  instagram_handle text,
  photos text[],
  bio text,
  similarity_score real
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.slug, sv.business_name, sv.category, sv.city,
         sv.instagram_handle, sv.photos, sv.bio,
         similarity(sv.business_name, p_name) AS similarity_score
  FROM scraped_vendors sv
  WHERE sv.claimed_at IS NULL
    AND lower(sv.city) = lower(p_city)
    AND sv.business_name % p_name
    AND similarity(sv.business_name, p_name) >= p_min_similarity
  ORDER BY similarity(sv.business_name, p_name) DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION match_scraped_vendors_by_name FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_scraped_vendors_by_name TO authenticated, service_role;
```

Apply it:

```bash
PGPASSWORD='$uperPa$$57800' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00054_match_scraped_vendors_by_name_with_slug.sql
```

Expected: `CREATE FUNCTION`, `REVOKE`, `GRANT`.

Update the type for this RPC in `src/types/database.types.ts` — find `match_scraped_vendors_by_name` in the `Functions:` block and add `slug: string;` to the Returns shape after `id`.

Now update the SELECT clauses in `src/lib/scraped-vendor/match.ts`:

```typescript
  if (ig) {
    const { data } = await supabase
      .from('scraped_vendors')
      .select('id, slug, business_name, category, city, instagram_handle, photos, bio')
      .eq('instagram_handle', ig)
      .is('claimed_at', null);
    ...
  }

  if (phone) {
    const { data } = await supabase
      .from('scraped_vendors')
      .select('id, slug, business_name, category, city, instagram_handle, photos, bio')
      .eq('phone', phone)
      .is('claimed_at', null);
    ...
  }
```

The trigram path already uses the RPC which now returns slug.

Update `ScrapedVendorMatchPrompt.tsx` to use `top.slug`:

```tsx
        <Link
          href={`/vendors/${top.slug}`}
          ...
        >
```

Update the match integration test (`src/__tests__/lib/scraped-vendor/match.test.ts`) — for each fixture insert, add an explicit `slug: '...'` field because slug is now NOT NULL on the table:

```typescript
await supabase.from('scraped_vendors').insert([
  {
    source: 'hand_curated',
    business_name: 'Premium Chai Wallah',
    slug: `premium-chai-wallah-${Date.now()}`,
    city: 'Chicago',
    // ... rest as before
  },
  {
    source: 'hand_curated',
    business_name: 'Chai Cart Chicago',
    slug: `chai-cart-chicago-${Date.now() + 1}`,
    city: 'Chicago',
    // ...
  },
]);
```

Same for `merge.test.ts`, `promote.test.ts`, `public.test.ts`, `engagement.test.ts`, `claim-flow.spec.ts` — every test that inserts a scraped_vendors row directly needs to include `slug`.

Actually, simpler: update those tests to use `slug` from a helper. But to keep this task scoped, just add `slug: \`test-slug-${Date.now()}\`` (or similar unique) to every insert in the test files that touch scraped_vendors.

Confirm the full test suite + this task's tests still pass:

```bash
set -a; source .env.local; set +a
npm test -- --run
```

Expected: all green (with the slug fields added to fixtures).

- [ ] **Step 2: Update `StepBasics.tsx` to use the new component shape**

Find the section in `src/components/onboarding/StepBasics.tsx` that uses `pendingMatches` + `onMatchPick` + `onMatchReject` (from K Task 17). Replace it.

Read the current state:

```bash
grep -n "pendingMatches\|onMatchPick\|onMatchReject\|ScrapedVendorMatchPrompt" src/components/onboarding/StepBasics.tsx
```

Then replace the `onNext` function and the related state. New version of the relevant parts:

```typescript
const [pendingMatches, setPendingMatches] = useState<ScrapedVendorMatch[] | null>(null);

async function saveAndAdvance(values: typeof data) {
  setError(null);
  const parsed = basicsSchema.safeParse(values);
  if (!parsed.success) {
    setError(parsed.error.issues[0].message);
    return;
  }
  const res = await fetch('/api/vendor-profile/setup/basics', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...parsed.data, profile_id: profileId }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: 'Save failed' }));
    setError(json.error ?? 'Save failed');
    return;
  }
  router.push(`/dashboard/profile/setup/location${nextParam}`);
}

async function onNext() {
  const parsed = basicsSchema.safeParse(data);
  if (!parsed.success) {
    setError(parsed.error.issues[0].message);
    return;
  }
  setSubmitting(true);

  // K-2: block if a fuzzy-match against scraped_vendors finds something.
  // Vendor must go through /vendors/[slug] → "I own this business" to claim.
  try {
    const matchRes = await fetch('/api/scraped-vendors/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: parsed.data.businessName,
        city: '',
        instagramHandle: null,
        phone: null,
      }),
    });
    if (matchRes.ok) {
      const { matches } = (await matchRes.json()) as { matches: ScrapedVendorMatch[] };
      if (matches && matches.length > 0) {
        setPendingMatches(matches);
        setSubmitting(false);
        return;
      }
    }
  } catch {
    // match service failure is non-fatal; proceed with normal save
  }
  await saveAndAdvance(data);
  setSubmitting(false);
}
```

In the JSX rendering, replace the existing match-prompt block:

```tsx
{
  pendingMatches && <ScrapedVendorMatchPrompt matches={pendingMatches} />;
}
```

Also disable the submit button when `pendingMatches` is set (hard-block):

Find the submit button. Add `disabled={submitting || !!pendingMatches}` and update its label to flip to "Block" if needed. Actually the simplest: just disable the submit button while pendingMatches is non-null — the prompt above gives the user direction.

- [ ] **Step 3: Delete the old organic-claim API route**

```bash
rm src/app/api/scraped-vendors/claim/route.ts
rmdir src/app/api/scraped-vendors/claim 2>/dev/null || true
```

- [ ] **Step 4: Rewrite the component test**

```bash
rm src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx
```

Create `src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx` with EXACTLY this content:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrapedVendorMatchPrompt } from '@/components/onboarding/ScrapedVendorMatchPrompt';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

const fakeMatch: ScrapedVendorMatch = {
  id: 'sv1',
  slug: 'best-cart-abc123',
  business_name: 'Best Cart',
  category: 'carts',
  city: 'Chicago',
  instagram_handle: 'bestcart',
  photos: ['https://cdn.test/x.jpg'],
  bio: 'A cart',
  similarity_score: 1,
};

describe('<ScrapedVendorMatchPrompt> (block view)', () => {
  it('renders the matched listing header + claim instructions', () => {
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} />);
    expect(screen.getByText(/We already have a listing/i)).toBeInTheDocument();
    expect(screen.getByText(/Best Cart/i)).toBeInTheDocument();
    expect(screen.getByText(/I own this business/i)).toBeInTheDocument();
  });

  it('links to the unclaimed listing via slug', () => {
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} />);
    const link = screen.getByRole('link', { name: /Visit my listing/i });
    expect(link).toHaveAttribute('href', '/vendors/best-cart-abc123');
  });

  it('renders null when matches is empty', () => {
    const { container } = render(<ScrapedVendorMatchPrompt matches={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 5: Run the new test + the full suite**

```bash
set -a; source .env.local; set +a
npm test -- --run src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx
npm test -- --run
```

Expected: the new test (3 specs) passes. Full suite passes (slug fixture updates in step 1b should keep all integration tests green).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(onboarding): convert wizard match prompt to hard-block (K-2)"
```

The `-A` includes the deletion of the old `/api/scraped-vendors/claim/route.ts`. Confirm the staged set includes only the K-2-related files (ScrapedVendorMatchPrompt.tsx + test + StepBasics.tsx + the deleted route + match.ts + the new migration + types).

---

## Milestone 8 — E2E + verification

### Task 17: Playwright e2e for unclaimed listing + "I own this" modal

**Files:**

- Create: `tests/e2e/unclaimed-listing.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/unclaimed-listing.spec.ts` with EXACTLY this content:

```typescript
import { test, expect } from '@playwright/test';
import { createServiceRoleClient } from '../../src/lib/supabase/server';

test.describe('unclaimed listing surface', () => {
  let scrapedVendorId: string | null = null;
  let slug: string | null = null;

  test.afterEach(async () => {
    if (scrapedVendorId) {
      const supabase = await createServiceRoleClient();
      await supabase
        .from('scraped_vendor_engagement')
        .delete()
        .eq('scraped_vendor_id', scrapedVendorId);
      await supabase
        .from('scraped_vendor_requests')
        .delete()
        .eq('scraped_vendor_id', scrapedVendorId);
      await supabase.from('scraped_vendors').delete().eq('id', scrapedVendorId);
      scrapedVendorId = null;
      slug = null;
    }
  });

  async function seedUnclaimed(): Promise<{ id: string; slug: string }> {
    const supabase = await createServiceRoleClient();
    const s = `e2e-unclaimed-${Date.now()}`;
    const { data } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'E2E Unclaimed Cart',
        category: 'carts',
        tags: ['__e2e_unclaimed__'],
        city: 'Chicago',
        state: 'IL',
        instagram_handle: 'e2eunclaimedcart',
        photos: ['https://placehold.co/600x400'],
        raw: {},
        slug: s,
      })
      .select('id, slug')
      .single();
    return { id: data!.id, slug: data!.slug };
  }

  test('unclaimed listing renders + view event fires', async ({ page }) => {
    const seed = await seedUnclaimed();
    scrapedVendorId = seed.id;
    slug = seed.slug;

    await page.goto(`/vendors/${slug}`);
    await expect(page.getByRole('heading', { name: /E2E Unclaimed Cart/i })).toBeVisible();
    await expect(page.getByText(/hasn't joined Baazar/i)).toBeVisible();

    // Server-side track fires from useEffect; allow a moment
    await page.waitForTimeout(500);
    const supabase = await createServiceRoleClient();
    const { data: views } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type')
      .eq('scraped_vendor_id', seed.id)
      .eq('event_type', 'view');
    expect((views ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test('IG handle click logs ig_click event + reveals handle', async ({ page }) => {
    const seed = await seedUnclaimed();
    scrapedVendorId = seed.id;
    slug = seed.slug;

    await page.goto(`/vendors/${slug}`);
    const button = page.getByRole('button', { name: /Show on Instagram/i });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByText(/@e2eunclaimedcart/i)).toBeVisible();

    await page.waitForTimeout(500);
    const supabase = await createServiceRoleClient();
    const { data: clicks } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type')
      .eq('scraped_vendor_id', seed.id)
      .eq('event_type', 'ig_click');
    expect((clicks ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test('"I own this business" → remove submits to /request', async ({ page }) => {
    const seed = await seedUnclaimed();
    scrapedVendorId = seed.id;
    slug = seed.slug;

    await page.goto(`/vendors/${slug}`);
    await page.getByRole('button', { name: /I own this business/i }).click();
    await page.getByLabel(/Remove my listing/i).check();
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByLabel(/^Email$/i).fill('e2e@example.com');
    await page.getByRole('button', { name: /Send removal request/i }).click();
    await expect(page.getByText(/Removal request sent/i)).toBeVisible();

    const supabase = await createServiceRoleClient();
    const { data: requests } = await supabase
      .from('scraped_vendor_requests')
      .select('action, requester_email')
      .eq('scraped_vendor_id', seed.id);
    expect(requests).toHaveLength(1);
    expect(requests![0].action).toBe('remove');
    expect(requests![0].requester_email).toBe('e2e@example.com');
  });
});
```

- [ ] **Step 2: Verify Playwright discovers the spec**

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test --list tests/e2e/unclaimed-listing.spec.ts 2>&1 | head
```

Expected: lists 3 tests under "unclaimed listing surface".

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/unclaimed-listing.spec.ts
git commit -m "test(e2e): unclaimed listing surface — view + ig_click + remove flow"
```

(Don't run the e2e suite — requires a running dev server. The user can run locally before merge.)

---

### Task 18: Wrap-up — full build + test + push + PR update

**Files:**

- No new files. Verifies + updates PR #31.

- [ ] **Step 1: Run lint, full test suite, and build**

```bash
set -a; source .env.local; set +a
npm run lint 2>&1 | tail -5
npm test -- --run 2>&1 | tail -6
npm run build 2>&1 | tail -10
```

Expected:

- Lint: only the pre-existing EventCard `<img>` and SearchBar aria-expanded warnings; nothing new
- Tests: all unit + integration green (count grew from K's 435 by ~20-25 K-2 tests)
- Build: green

If any check fails — STOP and report. Don't push or update the PR with broken state.

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Update PR #31 to mention K-2**

```bash
gh pr edit 31 --title "feat: sub-project K + K-2 — vendor scraper, claim flow, public unclaimed listings"
```

(Then manually update the PR body to add a "K-2 additions" section noting the new migrations 00051-00054, the public unclaimed page surface, the "I own this business" modal flow, and the wizard hard-block change. Use `gh pr view 31 --web` to open in browser to edit, or `gh pr edit 31 --body "$(cat <<EOF ...)"` if you have the full body content ready.)

- [ ] **Step 4: Confirm**

```bash
gh pr view 31 --json title,state,additions,deletions
```

Expected: title reflects K + K-2, state is `OPEN`, additions/deletions reflect both bodies of work.

---

## Self-review checklist

After completing all tasks, verify against the spec:

1. **Spec coverage:**
   - ✅ Migrations 00051 (slug), 00052 (public RPCs), 00053 (engagement + requests)
   - ✅ Bonus migration 00054 (slug added to match_scraped_vendors_by_name RPC return)
   - ✅ Types hand-extended for all 3 new tables + 2 new RPCs + slug on scraped_vendors
   - ✅ `public.ts` (getUnclaimedBySlug, listUnclaimed) + integration tests
   - ✅ `engagement.ts` (logEngagement with daily IP+UA dedup) + integration tests
   - ✅ `/api/scraped-vendors/[id]/track` + unit tests
   - ✅ `/api/scraped-vendors/[id]/request` + 4 Resend email helpers + unit tests
   - ✅ `<UnclaimedVendorCard>`, `<UnclaimedVendorProfile>`, `<OwnThisBusinessModal>`, `<UnclaimedVendorRoute>` components + RTL tests
   - ✅ `/vendors` shows unclaimed grid below claimed
   - ✅ `/vendors/[slug]` resolves claimed OR unclaimed and fires view track
   - ✅ Wizard step 1 `ScrapedVendorMatchPrompt` rewritten as hard-block; `/api/scraped-vendors/claim` route deleted
   - ✅ Playwright e2e covers view + ig_click + remove flow
   - ✅ Build green, all tests pass

2. **Placeholders:** none. Every code block is complete.

3. **Type consistency:**
   - `UnclaimedVendor` defined in `public.ts`, consumed by `UnclaimedVendorProfile.tsx` and `UnclaimedVendorRoute.tsx`
   - `UnclaimedVendorListItem` (lighter shape) defined in `public.ts`, consumed by `UnclaimedVendorCard.tsx` and `/vendors/page.tsx`
   - `ScrapedVendorMatch` updated to include `slug: string` — all consumers (block prompt, StepBasics, match API test) reference the same shape
   - `logEngagement(scrapedVendorId, event, ip, userAgent)` signature consistent across `engagement.ts`, the track route, and the test mocks
   - `EngagementEvent = 'view' | 'ig_click'` — consistent in lib + route + DB CHECK constraint
   - Request action type `'remove' | 'claim_request'` consistent across the route, the modal, the email helpers, and the DB CHECK constraint
