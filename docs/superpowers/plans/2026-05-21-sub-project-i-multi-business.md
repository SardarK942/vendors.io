# Sub-project I — Multi-Business per Vendor Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one auth user own multiple `vendor_profiles` (e.g., a photography business + a DJ business) with a clean switching UX, treating multi-business as an edge case (~3% of vendors) so the single-business 97% sees zero UI change.

**Architecture:** Single bundled PR on branch `feat/sub-project-i-multi-business`. Migration 00035 does two changes (flip Stripe FK + add `users.active_vendor_profile_id`). A new `getActiveVendorProfile(supabase, userId)` helper centralizes the 1:1 fallback; ~15 call sites get a mechanical refactor. A `<BusinessSwitcher>` pill appears in the topbar only when `totalCount > 1`. "Add another business" link in the user-avatar dropdown reuses the B wizard via `?next=true`. Cross-business booking detail stays context-neutral with a business-name chip + post-action toast.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), Stripe Connect webhooks, Upstash rate limiting, shadcn/ui (`DropdownMenu`, `Badge`), sonner (toast), vitest, Playwright.

**Source spec:** `docs/superpowers/specs/2026-05-21-sub-project-i-multi-business-design.md` — referenced throughout as **§N**. Read it before starting.

---

## File structure (per spec §3–§9)

**New:**

- `supabase/migrations/00035_sub_project_i_multi_business.sql`
- `src/lib/vendor/active.ts`
- `src/__tests__/lib/vendor/active.test.ts`
- `src/app/api/users/me/active-business/route.ts`
- `src/__tests__/api/active-business.test.ts`
- `src/components/dashboard/BusinessSwitcher.tsx`
- `src/components/dashboard/CrossBusinessActionToast.tsx`
- `src/contexts/ActiveBusinessContext.tsx`
- `src/__tests__/integration/rls/multi-business-isolation.test.ts`
- `src/__tests__/integration/rls/stripe-account-shared.test.ts`
- `src/__tests__/integration/rls/users-active-vendor-rls.test.ts`
- `tests/e2e/multi-business-switcher.spec.ts`
- `tests/e2e/multi-business-cross-notification.spec.ts`
- `tests/e2e/multi-business-isolated-stripe.spec.ts`
- `tests/e2e/multi-business-shared-stripe.spec.ts`

**Modified:**

- `src/types/database.types.ts` — schema delta + relationships update
- `src/lib/onboarding/resume.ts` — add `getOrCreateWizardProfile` with `'first' | 'next'` modes
- `src/__tests__/lib/onboarding/resume.test.ts` — extend
- `src/components/ui/Navbar.tsx` — server-render switcher + add menu item
- `src/services/payment.service.ts` — replace every `stripe_accounts.vendor_profile_id` lookup with the reverse direction
- `src/app/api/webhooks/stripe/route.ts` — handler tests for new direction
- `src/app/api/webhooks/stripe/route.test.ts` — update fixtures
- `src/app/dashboard/page.tsx` — call `getActiveVendorProfile`
- `src/app/dashboard/bookings/page.tsx` — call `getActiveVendorProfile`
- `src/app/dashboard/profile/page.tsx` — call `getActiveVendorProfile`
- `src/app/dashboard/profile/calendar/page.tsx` — call `getActiveVendorProfile`
- `src/app/dashboard/profile/packages/page.tsx` — call `getActiveVendorProfile`
- `src/app/dashboard/profile/packages/new/page.tsx` — call `getActiveVendorProfile`
- `src/app/dashboard/money/page.tsx` — call `getActiveVendorProfile` + shared-Stripe footnote
- `src/app/dashboard/profile/setup/layout.tsx` — wizard mode + `profileId` plumbing
- `src/app/dashboard/profile/setup/page.tsx` — read `profileId` from layout
- `src/app/dashboard/profile/setup/basics/page.tsx` — read `profileId`
- `src/app/dashboard/profile/setup/location/page.tsx` — read `profileId`
- `src/app/dashboard/profile/setup/online/page.tsx` — read `profileId`
- `src/app/dashboard/profile/setup/portfolio/page.tsx` — read `profileId`
- `src/app/dashboard/profile/setup/payment-mode/page.tsx` — read `profileId` + Stripe override toggle
- `src/app/dashboard/profile/setup/review/page.tsx` — set `users.active_vendor_profile_id` on publish
- `src/app/api/vendor-profile/setup/[step]/route.ts` — accept `profile_id` body field
- `src/app/api/vendor-profile/publish/route.ts` — accept `profile_id` + share Stripe account on default
- `src/components/dashboard/BookingDetail.tsx` — business-name chip when cross-business
- `src/components/booking/VendorBookingActions.tsx` — trigger cross-business toast on success
- `src/components/dashboard/BookingActions.tsx` — same

---

## Phase I1 — Migration + types (foundation)

Single-threaded. ~30 minutes. Branch: `feat/sub-project-i-multi-business`.

### Task I1.0: Branch off main

- [ ] **Step 1: Cut the branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/sub-project-i-multi-business
```

- [ ] **Step 2: Confirm clean state**

`git status` → clean. `git log --oneline -2` → top should be the just-committed I spec.

### Task I1.1: Write migration 00035

**Files:**

- Create: `supabase/migrations/00035_sub_project_i_multi_business.sql`

- [ ] **Step 1: Discover the existing `stripe_accounts` RLS policy name**

Before writing the migration, query the dev DB to find the actual name of the existing SELECT policy on `stripe_accounts`. The spec uses `"Vendors read own stripe_accounts"` but the actual name may differ.

```bash
PGPASSWORD='<dev-db-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres -c \
  "SELECT polname FROM pg_policy WHERE polrelid = 'stripe_accounts'::regclass;"
```

Note the exact policy name(s) and use them in the `DROP POLICY IF EXISTS` lines below.

- [ ] **Step 2: Write the migration**

```sql
-- 00035_sub_project_i_multi_business.sql
-- Sub-project I — multi-business per vendor account
-- See docs/superpowers/specs/2026-05-21-sub-project-i-multi-business-design.md §4
--
-- Two additive-then-cleanup changes:
--   1. Flip the Stripe FK: stripe_accounts.vendor_profile_id → vendor_profiles.stripe_account_id
--   2. Add users.active_vendor_profile_id (nullable; NULL = single-business fallback)
--
-- Idempotent throughout. Safe to re-run after a partial-apply failure.

------------------------------------------------------------------------
-- Change 1: Flip the Stripe FK
------------------------------------------------------------------------

-- Step 1.1: Add the new column on vendor_profiles (nullable).
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id uuid REFERENCES stripe_accounts(id);

-- Step 1.2: Backfill. Each vendor_profile that has a corresponding stripe_account
-- (current direction) gets its new FK populated.
UPDATE vendor_profiles vp
  SET stripe_account_id = sa.id
  FROM stripe_accounts sa
  WHERE sa.vendor_profile_id = vp.id
    AND vp.stripe_account_id IS NULL;

-- Step 1.3: Index for joins.
CREATE INDEX IF NOT EXISTS vendor_profiles_stripe_account_idx
  ON vendor_profiles(stripe_account_id);

-- Step 1.4: Rewrite the stripe_accounts RLS SELECT policy.
-- Replace `<actual-policy-name>` with the value from Step 1.
DROP POLICY IF EXISTS "Vendors read own stripe_accounts" ON stripe_accounts;
-- If the discovery query in Step 1 returned a different name, add another line:
-- DROP POLICY IF EXISTS "<actual-policy-name>" ON stripe_accounts;

CREATE POLICY "Vendors read own stripe_accounts"
  ON stripe_accounts FOR SELECT
  USING (
    id IN (
      SELECT stripe_account_id FROM vendor_profiles
      WHERE user_id = auth.uid() AND stripe_account_id IS NOT NULL
    )
  );

-- Step 1.5: Drop the old FK column. Postgres will refuse if any policy still
-- references it — the DROP POLICY above is mandatory before this line.
ALTER TABLE stripe_accounts
  DROP COLUMN IF EXISTS vendor_profile_id;

------------------------------------------------------------------------
-- Change 2: Active vendor profile pointer on users
------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_vendor_profile_id uuid
    REFERENCES vendor_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_vendor_profile_idx
  ON users(active_vendor_profile_id);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00035_sub_project_i_multi_business.sql
git commit -m "feat(multi-biz): I1 — migration 00035 (Stripe FK flip + active_vendor_profile_id)"
```

### Task I1.2: Apply migration to dev Supabase

Per the locked policy ([[migration_apply_policy]]), Claude applies dev migrations directly via `psql`.

- [ ] **Step 1: Apply via psql**

```bash
PGPASSWORD='<dev-db-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00035_sub_project_i_multi_business.sql
```

If the dev DB password isn't already shared in this session, request it from the user before running.

- [ ] **Step 2: Run sanity-check queries**

```bash
PGPASSWORD='<dev-db-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres <<'SQL'
\echo '=== vendor_profiles.stripe_account_id column exists ==='
SELECT column_name FROM information_schema.columns
WHERE table_name = 'vendor_profiles' AND column_name = 'stripe_account_id';

\echo '=== stripe_accounts.vendor_profile_id column does NOT exist ==='
SELECT column_name FROM information_schema.columns
WHERE table_name = 'stripe_accounts' AND column_name = 'vendor_profile_id';

\echo '=== users.active_vendor_profile_id column exists ==='
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'active_vendor_profile_id';

\echo '=== indexes exist ==='
SELECT indexname FROM pg_indexes WHERE indexname IN
  ('vendor_profiles_stripe_account_idx', 'users_active_vendor_profile_idx');

\echo '=== stripe_accounts SELECT policy rewritten ==='
SELECT polname FROM pg_policy WHERE polrelid = 'stripe_accounts'::regclass;
SQL
```

Expected:
- First query: 1 row (`stripe_account_id`)
- Second query: 0 rows (column dropped)
- Third query: 1 row (`active_vendor_profile_id`)
- Fourth query: 2 rows
- Fifth query: shows current policies — verify `"Vendors read own stripe_accounts"` is present

### Task I1.3: Update `database.types.ts`

**Files:**

- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Update the header comment**

Append to the migration list comment block:
```
 *   - 00035 vendor_profiles.stripe_account_id (FK flipped from stripe_accounts.vendor_profile_id)
 *           + users.active_vendor_profile_id nullable FK (Sub-project I)
```

- [ ] **Step 2: Add `stripe_account_id` to `vendor_profiles`**

Find the `vendor_profiles` table block. Add the field to Row, Insert (optional), and Update (optional):

```ts
// In Row:
stripe_account_id: string | null;

// In Insert (optional):
stripe_account_id?: string | null;

// In Update (optional):
stripe_account_id?: string | null;
```

Also add a Relationship entry to the `vendor_profiles.Relationships` array:

```ts
{
  foreignKeyName: 'vendor_profiles_stripe_account_id_fkey';
  columns: ['stripe_account_id'];
  isOneToOne: false;
  referencedRelation: 'stripe_accounts';
  referencedColumns: ['id'];
},
```

- [ ] **Step 3: Add `active_vendor_profile_id` to `users`**

Find the `users` table block. Add to Row, Insert (optional), Update (optional):

```ts
active_vendor_profile_id: string | null;
```

Add a Relationship to `users.Relationships`:

```ts
{
  foreignKeyName: 'users_active_vendor_profile_id_fkey';
  columns: ['active_vendor_profile_id'];
  isOneToOne: false;
  referencedRelation: 'vendor_profiles';
  referencedColumns: ['id'];
},
```

- [ ] **Step 4: Remove `vendor_profile_id` from `stripe_accounts`**

Find the `stripe_accounts` table block. Remove the `vendor_profile_id` field from Row, Insert, Update. Remove the corresponding Relationship entry.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```

Expect: errors will surface in payment.service.ts and other files that reference the dropped `stripe_accounts.vendor_profile_id` field. Those are addressed in Phase I5. Don't fix them yet — they're the "loud failure" that proves the type change is wired up.

For now, capture the error list so we know what to fix later:

```bash
npm run typecheck 2>&1 | grep -E "error TS" | head -30
```

Save the output mentally (or to a scratch file) — it should mostly be `payment.service.ts` lines.

- [ ] **Step 6: Commit (types only, even with downstream errors)**

```bash
git add src/types/database.types.ts
git commit -m "chore(types): I1 — update database.types for migration 00035 (typecheck errors expected in payment.service until I5)"
```

The downstream type errors are temporarily acceptable on the feature branch — they'll be fixed in Phase I5.

---

## Phase I2 — Active vendor helper + refactor

### Task I2.1: Write `getActiveVendorProfile` tests (failing)

**Files:**

- Create: `src/__tests__/lib/vendor/active.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/vendor/active.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getActiveVendorProfile, getActiveVendorProfileId } from '@/lib/vendor/active';

// In-memory mock Supabase client. Captures queries and returns fixture data.
function makeMockSupabase(state: {
  userVendorProfiles: Array<{ id: string; user_id: string; created_at: string }>;
  activeVendorProfileId: string | null;
  ownerUserId?: string; // for the active profile lookup
}) {
  const captured: { lastUpdate: Record<string, unknown> | null } = { lastUpdate: null };

  const builder: Record<string, unknown> = {
    from(table: string) {
      this._table = table;
      return this;
    },
    select(_cols: string, _opts?: { count?: 'exact'; head?: boolean }) {
      this._opts = _opts;
      return this;
    },
    eq(col: string, val: string) {
      this._filters = { ...(this._filters as object), [col]: val };
      return this;
    },
    order(_col: string, _opts: { ascending?: boolean }) {
      return this;
    },
    limit(_n: number) {
      return this;
    },
    update(payload: Record<string, unknown>) {
      captured.lastUpdate = payload;
      return {
        eq: () => Promise.resolve({ error: null }),
      };
    },
    single() {
      if (this._table === 'users') {
        return Promise.resolve({
          data: { active_vendor_profile_id: state.activeVendorProfileId },
          error: null,
        });
      }
      if (this._table === 'vendor_profiles') {
        // Active-profile lookup
        const filters = (this._filters ?? {}) as Record<string, string>;
        const target = state.userVendorProfiles.find((p) => p.id === filters.id);
        if (!target) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        return Promise.resolve({ data: target, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() {
      return this.single!() as Promise<unknown>;
    },
    then(resolve: (v: unknown) => void) {
      // List query: from('vendor_profiles').eq('user_id', X).order(...) returns array
      if (this._table === 'vendor_profiles') {
        const filters = (this._filters ?? {}) as Record<string, string>;
        const filtered = state.userVendorProfiles.filter((p) => p.user_id === filters.user_id);
        if ((this._opts as { count?: string })?.count === 'exact') {
          resolve({ data: null, count: filtered.length, error: null });
          return;
        }
        resolve({ data: filtered, error: null });
        return;
      }
      resolve({ data: null, error: null });
    },
  };

  return Object.assign(builder, { _captured: captured }) as never;
}

describe('getActiveVendorProfile', () => {
  it('returns null + count 0 when user has no vendor_profiles', async () => {
    const supabase = makeMockSupabase({ userVendorProfiles: [], activeVendorProfileId: null });
    const result = await getActiveVendorProfile(supabase, 'user-A');
    expect(result.profile).toBeNull();
    expect(result.totalCount).toBe(0);
  });

  it('returns the only profile when user has exactly one (count=1) and active is null', async () => {
    const supabase = makeMockSupabase({
      userVendorProfiles: [
        { id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' },
      ],
      activeVendorProfileId: null,
    });
    const result = await getActiveVendorProfile(supabase, 'user-A');
    expect(result.profile?.id).toBe('vp-1');
    expect(result.totalCount).toBe(1);
  });

  it('returns the explicit active when active_vendor_profile_id is set and owned', async () => {
    const supabase = makeMockSupabase({
      userVendorProfiles: [
        { id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' },
        { id: 'vp-2', user_id: 'user-A', created_at: '2026-02-01T00:00:00Z' },
      ],
      activeVendorProfileId: 'vp-2',
    });
    const result = await getActiveVendorProfile(supabase, 'user-A');
    expect(result.profile?.id).toBe('vp-2');
    expect(result.totalCount).toBe(2);
  });

  it('falls back to first by created_at ASC when count>1 and active is null, AND persists it', async () => {
    const supabase = makeMockSupabase({
      userVendorProfiles: [
        { id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' },
        { id: 'vp-2', user_id: 'user-A', created_at: '2026-02-01T00:00:00Z' },
      ],
      activeVendorProfileId: null,
    });
    const result = await getActiveVendorProfile(supabase, 'user-A');
    expect(result.profile?.id).toBe('vp-1');
    // Persistence: update was issued
    expect((supabase as unknown as { _captured: { lastUpdate: Record<string, unknown> | null } })._captured.lastUpdate?.active_vendor_profile_id).toBe('vp-1');
  });

  it('ownership re-check: refuses to return a profile owned by a different user', async () => {
    const supabase = makeMockSupabase({
      userVendorProfiles: [
        { id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' },
      ],
      activeVendorProfileId: 'vp-99', // stale pointer to a profile NOT in user's list
    });
    const result = await getActiveVendorProfile(supabase, 'user-A');
    // Falls back to the user's own only profile, not the stale pointer
    expect(result.profile?.id).toBe('vp-1');
  });
});

describe('getActiveVendorProfileId', () => {
  it('returns the active id without fetching the full row', async () => {
    const supabase = makeMockSupabase({
      userVendorProfiles: [
        { id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' },
      ],
      activeVendorProfileId: null,
    });
    const id = await getActiveVendorProfileId(supabase, 'user-A');
    expect(id).toBe('vp-1');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- active
```

Expected: FAIL on missing module `@/lib/vendor/active`.

### Task I2.2: Implement `getActiveVendorProfile`

**Files:**

- Create: `src/lib/vendor/active.ts`

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/vendor/active.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type VendorProfileRow = Database['public']['Tables']['vendor_profiles']['Row'];

export interface ActiveVendorResult {
  profile: VendorProfileRow | null;
  totalCount: number;
}

/**
 * Resolve the user's active vendor profile.
 *
 * Resolution order:
 * 1. users.active_vendor_profile_id is set AND points to a profile owned by
 *    this user → return that profile.
 * 2. Else the user has exactly one vendor_profile → return it (single-business
 *    fallback; covers 97% of vendors with zero behavior change).
 * 3. Else the user has multiple vendor_profiles but no active set → return
 *    the first by created_at ASC AND persist it as active_vendor_profile_id
 *    so subsequent calls are cheap.
 * 4. Else (zero vendor_profiles) → return null. Caller redirects to onboarding.
 *
 * Sub-project I §5.
 */
export async function getActiveVendorProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ActiveVendorResult> {
  // 1. Read the user's active pointer.
  const { data: userRow } = await supabase
    .from('users')
    .select('active_vendor_profile_id')
    .eq('id', userId)
    .single();

  const activeId = userRow?.active_vendor_profile_id ?? null;

  // 2. Fetch ALL profiles owned by this user (ordered by created_at for
  //    deterministic fallback). One round trip; gives us totalCount + the
  //    candidate row for the explicit-pointer or fallback resolution.
  const { data: profiles } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const list = (profiles ?? []) as VendorProfileRow[];
  const totalCount = list.length;

  if (totalCount === 0) {
    return { profile: null, totalCount: 0 };
  }

  // Resolution 1: explicit pointer + ownership check (re-check via list membership).
  if (activeId) {
    const owned = list.find((p) => p.id === activeId);
    if (owned) return { profile: owned, totalCount };
    // Pointer is stale (points to a profile this user no longer owns). Fall through.
  }

  // Resolution 2: single profile.
  if (totalCount === 1) {
    return { profile: list[0], totalCount };
  }

  // Resolution 3: multiple profiles, no active set (or pointer was stale).
  // Pick the oldest, persist it so subsequent calls are cheap.
  const first = list[0];
  await supabase
    .from('users')
    .update({ active_vendor_profile_id: first.id })
    .eq('id', userId);

  return { profile: first, totalCount };
}

/**
 * Light variant when the caller only needs the active profile ID.
 * Internally calls getActiveVendorProfile.
 */
export async function getActiveVendorProfileId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { profile } = await getActiveVendorProfile(supabase, userId);
  return profile?.id ?? null;
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
npm test -- active
```

If the mock's `.then` shape doesn't quite match the real Supabase client builder's promise resolution, adjust the mock until all 6 tests pass. The real builder chains `.from().select().eq().order()` and resolves as a thenable returning `{ data, error }`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendor/active.ts src/__tests__/lib/vendor/active.test.ts
git commit -m "feat(multi-biz): I2 — getActiveVendorProfile helper + 6 unit tests"
```

### Task I2.3: Grep-audit existing 1:1 call sites

- [ ] **Step 1: Enumerate**

```bash
grep -rnE "\.from\('vendor_profiles'\)" /Users/sardarkhan/IdeaProjects/vendors.io/src \
  --include="*.ts" --include="*.tsx" \
  | grep -E "user_id|user\.id"
```

Capture this list. It should match the spec's enumeration in §5:
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/bookings/page.tsx`
- `src/app/dashboard/profile/page.tsx`
- `src/app/dashboard/profile/calendar/page.tsx`
- `src/app/dashboard/profile/setup/{layout,page,basics,location,online,portfolio,review,payment-mode}/page.tsx` (8 files)
- `src/app/dashboard/profile/packages/page.tsx`
- `src/app/dashboard/profile/packages/new/page.tsx`
- `src/app/dashboard/money/page.tsx`
- `src/app/api/vendor-profile/*.ts` (verify count)
- `src/components/ui/Navbar.tsx` (if it touches vendor_profiles directly)

- [ ] **Step 2: Save the list**

Write to a scratch file so the refactor in I2.4 has a checklist (don't commit this):

```bash
grep -rnE "\.from\('vendor_profiles'\)" /Users/sardarkhan/IdeaProjects/vendors.io/src \
  --include="*.ts" --include="*.tsx" \
  | grep -E "user_id|user\.id" \
  > /tmp/i2-call-sites.txt
cat /tmp/i2-call-sites.txt
```

The wizard pages (`profile/setup/*`) are flagged for special handling in Phase I4 — DON'T refactor them in I2.4. Refactor everything else.

### Task I2.4: Refactor non-wizard call sites mechanically

For each non-wizard call site, replace:

```ts
// Before
const { data: vendorProfile } = await supabase
  .from('vendor_profiles')
  .select('*')
  .eq('user_id', user.id)
  .single();
```

With:

```ts
// After
import { getActiveVendorProfile } from '@/lib/vendor/active';
// ...
const { profile: vendorProfile, totalCount } = await getActiveVendorProfile(supabase, user.id);
if (!vendorProfile) redirect('/dashboard/profile/setup');
```

For sites that need `totalCount` for the Navbar/switcher (Home, Bookings archive), thread it through. Pages that don't need it can ignore the second field.

**Files:**

- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/bookings/page.tsx`
- Modify: `src/app/dashboard/profile/page.tsx`
- Modify: `src/app/dashboard/profile/calendar/page.tsx`
- Modify: `src/app/dashboard/profile/packages/page.tsx`
- Modify: `src/app/dashboard/profile/packages/new/page.tsx`
- Modify: `src/app/dashboard/money/page.tsx`

- [ ] **Step 1: Refactor `src/app/dashboard/page.tsx` (vendor branch only — couple branch unchanged)**

Find the vendor branch's `.from('vendor_profiles').eq('user_id', user.id).single()` block (around line ~97 in the post-E codebase). Replace as above.

- [ ] **Step 2: Refactor `src/app/dashboard/bookings/page.tsx`**

Same pattern (around line ~78). The existing `vendorProfile.id` is used downstream for tab count queries — those keep working since the active profile's id is what we pass.

- [ ] **Step 3: Refactor `src/app/dashboard/profile/page.tsx`**

Profile editor (around line ~19). After the swap, `vendorProfile` is the active business's row.

- [ ] **Step 4: Refactor `src/app/dashboard/profile/calendar/page.tsx`**

Calendar (around line ~20). Currently uses `.maybeSingle()`. Replace with `getActiveVendorProfile` and the same null-redirect.

- [ ] **Step 5: Refactor packages pages**

`src/app/dashboard/profile/packages/page.tsx` (line ~29) and `.../packages/new/page.tsx` (line ~18). Both edit packages scoped to active business.

- [ ] **Step 6: Refactor `src/app/dashboard/money/page.tsx`**

Line ~42. Same pattern. (The shared-Stripe-account footnote logic gets added in Phase I7, not here.)

- [ ] **Step 7: Run typecheck and full test suite**

```bash
npm run typecheck
npm test
```

Typecheck on app code should be clean (the only remaining errors are in `payment.service.ts` from Phase I1.3 — those are fixed in I5). All existing service/API tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/
git commit -m "feat(multi-biz): I2 — refactor 7 dashboard call sites to use getActiveVendorProfile"
```

### Task I2.5: Refactor API routes that fetch vendor_profile by user_id

- [ ] **Step 1: Find them**

```bash
grep -rnE "\.from\('vendor_profiles'\)" /Users/sardarkhan/IdeaProjects/vendors.io/src/app/api \
  --include="*.ts" \
  | grep -E "user_id|user\.id"
```

The likely candidates are routes that mutate the user's profile (publish, setup-step, etc.) — those are deferred to Phase I4 since they need the wizard's explicit `profileId` rather than the active one.

Routes that LOOK UP a vendor profile by user_id for any other reason (read-only listings, dashboard data fetches) should be refactored here.

- [ ] **Step 2: For each non-wizard API route, apply the same refactor pattern as I2.4**

- [ ] **Step 3: Commit (if any changes)**

```bash
git add src/app/api/
git commit -m "feat(multi-biz): I2 — refactor non-wizard API routes to use getActiveVendorProfile"
```

If no changes are needed (e.g., all API routes either use the wizard's explicit profile_id or take vendor_profile_id as a body param), skip this commit.

---

## Phase I3 — Switcher + user-menu + active-business API route

### Task I3.1: Write the active-business route tests (failing)

**Files:**

- Create: `src/__tests__/api/active-business.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/api/active-business.test.ts
import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/users/me/active-business/route';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

function makeMockClient(state: {
  user: { id: string } | null;
  vendorProfile: { id: string; user_id: string } | null;
  updateError?: { message: string };
}) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user }, error: null }),
    },
    from(table: string) {
      if (table === 'vendor_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: state.vendorProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: state.updateError ?? null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function makeRequest(body: unknown): Request {
  return new Request('http://x/api/users/me/active-business', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/users/me/active-business', () => {
  it('401 when no user', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeMockClient({ user: null, vendorProfile: null }) as never
    );
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(401);
  });

  it('429 when rate limit exceeded', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeMockClient({
        user: { id: 'user-A' },
        vendorProfile: { id: 'vp-1', user_id: 'user-A' },
      }) as never
    );
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: false, message: 'Too many requests' });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(429);
  });

  it('400 when vendorProfileId is missing', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeMockClient({ user: { id: 'user-A' }, vendorProfile: null }) as never
    );
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('404 when target vendor_profile does not exist', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeMockClient({ user: { id: 'user-A' }, vendorProfile: null }) as never
    );
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('403 when target profile is not owned by caller', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeMockClient({
        user: { id: 'user-A' },
        vendorProfile: { id: 'vp-1', user_id: 'user-B' },
      }) as never
    );
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(403);
  });

  it('200 on happy path', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeMockClient({
        user: { id: 'user-A' },
        vendorProfile: { id: 'vp-1', user_id: 'user-A' },
      }) as never
    );
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- active-business
```

Expected: FAIL on missing module `@/app/api/users/me/active-business/route`.

### Task I3.2: Implement the active-business API route

**Files:**

- Create: `src/app/api/users/me/active-business/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/users/me/active-business/route.ts
//
// Sub-project I §3. POST endpoint called by <BusinessSwitcher> to update
// users.active_vendor_profile_id. Verifies the target profile is owned by
// the caller; rate-limited 30/min per user.
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const gate = await checkRateLimit(
    req,
    'active-business',
    { limit: 30, window: '1 m' },
    user.id
  );
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const vendorProfileId = (body as { vendorProfileId?: unknown }).vendorProfileId;
  if (typeof vendorProfileId !== 'string') {
    return NextResponse.json({ error: 'vendorProfileId required' }, { status: 400 });
  }

  // Ownership check
  const { data: target } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('id', vendorProfileId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (target.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('users')
    .update({ active_vendor_profile_id: vendorProfileId })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
npm test -- active-business
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/users/me/active-business/route.ts src/__tests__/api/active-business.test.ts
git commit -m "feat(multi-biz): I3 — POST /api/users/me/active-business + 6 tests"
```

### Task I3.3: Build `<BusinessSwitcher>` component

**Files:**

- Create: `src/components/dashboard/BusinessSwitcher.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/BusinessSwitcher.tsx
//
// Sub-project I §3. Topbar pill rendered conditionally when totalCount > 1.
// Clicking a non-active business updates users.active_vendor_profile_id and
// triggers a server-component refresh.
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SwitcherBusiness {
  id: string;
  businessName: string;
}

interface BusinessSwitcherProps {
  activeBusinessId: string;
  businesses: SwitcherBusiness[];
}

export function BusinessSwitcher({ activeBusinessId, businesses }: BusinessSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const active = businesses.find((b) => b.id === activeBusinessId);

  const switchTo = async (vendorProfileId: string) => {
    if (vendorProfileId === activeBusinessId) {
      setOpen(false);
      return;
    }
    const res = await fetch('/api/users/me/active-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorProfileId }),
    });
    if (!res.ok) {
      console.error('[switcher] failed to switch business', res.status);
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          disabled={isPending}
        >
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[180px] truncate">
            {active?.businessName ?? 'Switch business'}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Your businesses
        </DropdownMenuLabel>
        {businesses.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => switchTo(b.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{b.businessName}</span>
            {b.id === activeBusinessId && (
              <Check className="h-4 w-4 text-emerald-600" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile/setup?next=true">Add another business</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify shadcn `dropdown-menu` exists**

```bash
ls /Users/sardarkhan/IdeaProjects/vendors.io/src/components/ui/dropdown-menu.tsx
```

If missing, install via shadcn CLI:

```bash
npx shadcn@latest add dropdown-menu
```

(Confirmed by the existing SidebarNav and other components; should already be there.)

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/BusinessSwitcher.tsx
git commit -m "feat(multi-biz): I3 — BusinessSwitcher client component"
```

### Task I3.4: Wire `<BusinessSwitcher>` + "Add another business" into `<Navbar>`

**Files:**

- Modify: `src/components/ui/Navbar.tsx`

- [ ] **Step 1: Read the existing Navbar**

```bash
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/components/ui/Navbar.tsx | head -80
```

Confirm the existing structure — it has a user-avatar dropdown for "Sign out" and is likely a server component that takes `user`/`role` props. Note where the avatar dropdown lives so the "Add another business" item can be added next to "Sign out."

- [ ] **Step 2: Add the switcher + menu item**

Modify `<Navbar>`:

```tsx
// At the top of the file:
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { BusinessSwitcher } from '@/components/dashboard/BusinessSwitcher';

// Inside the server component, after the existing user+role fetch:
let switcherData: { activeId: string; list: { id: string; businessName: string }[] } | null = null;
if (role === 'vendor' && user) {
  const supabase = await createServerSupabaseClient();
  const { profile: active, totalCount } = await getActiveVendorProfile(supabase, user.id);
  if (active && totalCount > 1) {
    const { data: list } = await supabase
      .from('vendor_profiles')
      .select('id, business_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    switcherData = {
      activeId: active.id,
      list: (list ?? []).map((b) => ({ id: b.id, businessName: b.business_name ?? 'Untitled' })),
    };
  }
}

// In the JSX, before the user-avatar dropdown:
{switcherData && (
  <BusinessSwitcher
    activeBusinessId={switcherData.activeId}
    businesses={switcherData.list}
  />
)}

// Inside the user-avatar dropdown (find the existing <DropdownMenuItem> for Sign out;
// add this above it):
{role === 'vendor' && (
  <DropdownMenuItem asChild>
    <Link href="/dashboard/profile/setup?next=true">Add another business</Link>
  </DropdownMenuItem>
)}
```

The exact placement depends on how `<Navbar>` is currently structured. If `<Navbar>` is split into a server wrapper + a client `<NavbarUserMenu>` for the dropdown, you may need to plumb `role` to the client child and add the menu item there.

- [ ] **Step 3: Type-check + manual smoke**

```bash
npm run typecheck
npm run dev
```

Sign in as an existing single-business vendor (e.g., a seeded test vendor). Verify:
- The Navbar renders without errors
- NO switcher pill appears (since `totalCount === 1`)
- The user-avatar dropdown has "Add another business" alongside "Sign out"

Sign in as a couple (e.g., `sardarm.khan942@gmail.com` per memory). Verify:
- NO switcher pill (role !== 'vendor')
- NO "Add another business" menu item

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Navbar.tsx
git commit -m "feat(multi-biz): I3 — wire BusinessSwitcher + Add-another-business into Navbar"
```

### Task I3.5: Active-business context provider for client components

The cross-business toast (Phase I6) needs to know the caller's active business ID from action handlers in client components. Plumb it through React Context, populated by the layout.

**Files:**

- Create: `src/contexts/ActiveBusinessContext.tsx`

- [ ] **Step 1: Write the context**

```tsx
// src/contexts/ActiveBusinessContext.tsx
//
// Sub-project I §8. Client-side context that exposes the caller's active
// business id to nested client components (e.g., booking action handlers
// that need to know if a booking is cross-business).
'use client';

import { createContext, useContext } from 'react';

interface ActiveBusinessContextValue {
  activeBusinessId: string | null;
}

const ActiveBusinessContext = createContext<ActiveBusinessContextValue>({
  activeBusinessId: null,
});

export function ActiveBusinessProvider({
  children,
  activeBusinessId,
}: {
  children: React.ReactNode;
  activeBusinessId: string | null;
}) {
  return (
    <ActiveBusinessContext.Provider value={{ activeBusinessId }}>
      {children}
    </ActiveBusinessContext.Provider>
  );
}

export function useActiveBusinessId(): string | null {
  return useContext(ActiveBusinessContext).activeBusinessId;
}
```

- [ ] **Step 2: Wrap `src/app/dashboard/layout.tsx` with the provider**

Find the existing dashboard layout. After the existing role lookup, fetch the active business ID and provide it:

```tsx
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { ActiveBusinessProvider } from '@/contexts/ActiveBusinessContext';

// Inside the layout, after auth + role:
const activeBusinessId =
  role === 'vendor' && user ? await getActiveVendorProfileId(supabase, user.id) : null;

// Wrap the existing return JSX:
return (
  <ActiveBusinessProvider activeBusinessId={activeBusinessId}>
    <div className="min-h-screen bg-muted/40">
      {/* existing layout content */}
    </div>
  </ActiveBusinessProvider>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/ActiveBusinessContext.tsx src/app/dashboard/layout.tsx
git commit -m "feat(multi-biz): I3 — ActiveBusinessProvider in dashboard layout"
```

---

## Phase I4 — Add-business wizard flow

### Task I4.1: Extend `getOrCreateWizardProfile` with 'first' | 'next' modes

**Files:**

- Modify: `src/lib/onboarding/resume.ts`
- Modify: `src/__tests__/lib/onboarding/resume.test.ts`

- [ ] **Step 1: Read existing resume.ts**

```bash
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/lib/onboarding/resume.ts
```

Note the existing exports + functions. The plan adds a new export `getOrCreateWizardProfile` alongside existing helpers like `nextIncompleteStep`.

- [ ] **Step 2: Write failing tests for the new function**

Append to `src/__tests__/lib/onboarding/resume.test.ts`:

```ts
import { getOrCreateWizardProfile } from '@/lib/onboarding/resume';

// Helper: builds a mock Supabase client that returns the given profile state.
function makeResumeMockSupabase(state: {
  // Existing profiles for the user (in order; can be empty)
  existing: Array<{ id: string; onboarding_complete: boolean }>;
  // ID returned when inserting a new row
  newId: string;
}) {
  const captured: { inserted: boolean } = { inserted: false };

  return {
    from(table: string) {
      if (table !== 'vendor_profiles') throw new Error(`unexpected ${table}`);
      return {
        select: (_cols: string, opts?: { count?: 'exact'; head?: boolean }) => ({
          eq: (_a: string, _b: string) => ({
            eq: (_c: string, _d: boolean | string) => ({
              order: () => ({
                then: (resolve: (v: unknown) => void) => {
                  if (opts?.count === 'exact') {
                    const count = state.existing.filter((p) => p.onboarding_complete).length;
                    resolve({ data: null, count, error: null });
                    return;
                  }
                  resolve({
                    data: state.existing.filter((p) => !p.onboarding_complete),
                    error: null,
                  });
                },
              }),
            }),
            order: () => ({
              then: (resolve: (v: unknown) => void) => {
                resolve({ data: state.existing, error: null });
              },
            }),
            maybeSingle: () =>
              Promise.resolve({
                data: state.existing.find((p) => p.onboarding_complete) ?? null,
                error: null,
              }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () => {
              captured.inserted = true;
              return Promise.resolve({ data: { id: state.newId }, error: null });
            },
          }),
        }),
        _captured: captured,
      };
    },
    _captured: captured,
  } as never;
}

describe('getOrCreateWizardProfile', () => {
  it('first mode: finds the user existing complete profile if present', async () => {
    const supabase = makeResumeMockSupabase({
      existing: [{ id: 'vp-1', onboarding_complete: true }],
      newId: 'should-not-be-used',
    });
    const result = await getOrCreateWizardProfile(supabase, 'user-A', 'first');
    expect(result.profileId).toBe('vp-1');
    expect(result.isNew).toBe(false);
  });

  it('first mode: finds the partial profile if no complete one exists', async () => {
    const supabase = makeResumeMockSupabase({
      existing: [{ id: 'vp-partial', onboarding_complete: false }],
      newId: 'should-not-be-used',
    });
    const result = await getOrCreateWizardProfile(supabase, 'user-A', 'first');
    expect(result.profileId).toBe('vp-partial');
    expect(result.isNew).toBe(false);
  });

  it('first mode: creates new when user has none', async () => {
    const supabase = makeResumeMockSupabase({
      existing: [],
      newId: 'vp-new',
    });
    const result = await getOrCreateWizardProfile(supabase, 'user-A', 'first');
    expect(result.profileId).toBe('vp-new');
    expect(result.isNew).toBe(true);
  });

  it('next mode: creates a fresh row when user has only a complete profile', async () => {
    const supabase = makeResumeMockSupabase({
      existing: [{ id: 'vp-1', onboarding_complete: true }],
      newId: 'vp-2',
    });
    const result = await getOrCreateWizardProfile(supabase, 'user-A', 'next');
    expect(result.profileId).toBe('vp-2');
    expect(result.isNew).toBe(true);
  });

  it('next mode: resumes the partial second-business attempt', async () => {
    const supabase = makeResumeMockSupabase({
      existing: [
        { id: 'vp-1', onboarding_complete: true },
        { id: 'vp-2-partial', onboarding_complete: false },
      ],
      newId: 'should-not-be-used',
    });
    const result = await getOrCreateWizardProfile(supabase, 'user-A', 'next');
    expect(result.profileId).toBe('vp-2-partial');
    expect(result.isNew).toBe(false);
  });
});
```

Run: `npm test -- resume` → expect FAIL on missing function.

- [ ] **Step 3: Implement `getOrCreateWizardProfile`**

Append to `src/lib/onboarding/resume.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Resolve the vendor_profile that the wizard should operate on.
 *
 * 'first' mode: find the user's existing profile (any onboarding state) or create
 *   one. This is the legacy behavior — preserved verbatim for callers that hit
 *   /dashboard/profile/setup without a query param.
 *
 * 'next' mode (Sub-project I): the user is adding a second business via the
 *   "Add another business" link. If the user has exactly one in-progress
 *   (onboarding_complete=false) profile AND at least one complete profile,
 *   resume the in-progress one — this preserves the second-business attempt
 *   across abandoned sessions. Otherwise create a fresh row.
 *
 * Returns { profileId, isNew } where isNew indicates whether a new row was
 * inserted on this call (vs. resuming/finding an existing one).
 */
export async function getOrCreateWizardProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  mode: 'first' | 'next'
): Promise<{ profileId: string; isNew: boolean }> {
  if (mode === 'first') {
    // Find ANY existing profile for this user (complete or partial).
    const { data: any_existing } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (any_existing && any_existing.length > 0) {
      return { profileId: any_existing[0].id, isNew: false };
    }

    // None exists — create a fresh row.
    const { data: created } = await supabase
      .from('vendor_profiles')
      .insert({
        user_id: userId,
        business_name: '',
        slug: '',
        category: '',
        service_area: [],
        portfolio_images: [],
        onboarding_complete: false,
        is_active: false,
      })
      .select('id')
      .single();

    return { profileId: created!.id, isNew: true };
  }

  // 'next' mode: check for an abandoned partial second-business attempt.
  const { data: partials } = await supabase
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('onboarding_complete', false)
    .order('created_at', { ascending: false });

  const { count: completedCount } = await supabase
    .from('vendor_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('onboarding_complete', true);

  if (partials && partials.length === 1 && (completedCount ?? 0) > 0) {
    return { profileId: partials[0].id, isNew: false };
  }

  // Otherwise create a fresh row for the second business.
  const { data: created } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: userId,
      business_name: '',
      slug: '',
      category: '',
      service_area: [],
      portfolio_images: [],
      onboarding_complete: false,
      is_active: false,
    })
    .select('id')
    .single();

  return { profileId: created!.id, isNew: true };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- resume
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/resume.ts src/__tests__/lib/onboarding/resume.test.ts
git commit -m "feat(multi-biz): I4 — getOrCreateWizardProfile with first|next modes + 5 tests"
```

### Task I4.2: Plumb wizard profileId through the layout

**Files:**

- Modify: `src/app/dashboard/profile/setup/layout.tsx`

- [ ] **Step 1: Read existing layout**

```bash
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/app/dashboard/profile/setup/layout.tsx
```

- [ ] **Step 2: Add searchParams handling + resolve profileId via `getOrCreateWizardProfile`**

```tsx
// src/app/dashboard/profile/setup/layout.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getOrCreateWizardProfile } from '@/lib/onboarding/resume';

interface SetupLayoutProps {
  children: React.ReactNode;
  searchParams?: Promise<{ next?: string }>;
}

export default async function SetupLayout({ children, searchParams }: SetupLayoutProps) {
  // Existing auth bits — keep verbatim
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const mode: 'first' | 'next' = sp?.next === 'true' ? 'next' : 'first';

  // Resolve the wizard's target profile id once at layout level.
  // Children (step pages) receive this via the WizardProfileContext below.
  const { profileId } = await getOrCreateWizardProfile(supabase, user.id, mode);

  return (
    <WizardProfileProvider profileId={profileId} mode={mode}>
      <div className="..."> {/* existing layout chrome */}
        {/* If mode === 'next', show a different header */}
        <h1 className="text-2xl font-bold">
          {mode === 'next' ? 'Set up your next business' : 'Set up your profile'}
        </h1>
        {children}
      </div>
    </WizardProfileProvider>
  );
}
```

- [ ] **Step 3: Create the WizardProfileProvider**

Add to `src/lib/onboarding/wizard-profile-context.tsx` (new):

```tsx
'use client';

import { createContext, useContext } from 'react';

interface WizardProfileContextValue {
  profileId: string;
  mode: 'first' | 'next';
}

const WizardProfileContext = createContext<WizardProfileContextValue | null>(null);

export function WizardProfileProvider({
  children,
  profileId,
  mode,
}: {
  children: React.ReactNode;
  profileId: string;
  mode: 'first' | 'next';
}) {
  return (
    <WizardProfileContext.Provider value={{ profileId, mode }}>
      {children}
    </WizardProfileContext.Provider>
  );
}

export function useWizardProfile() {
  const ctx = useContext(WizardProfileContext);
  if (!ctx) throw new Error('useWizardProfile must be used within WizardProfileProvider');
  return ctx;
}
```

The provider is a Client Component (for `useContext`), but it accepts plain props from the server-component layout. Children can be a mix of server and client components — server components can read the props passed into the provider's children pattern OR access via the URL search params.

Actually — for server child pages, the cleaner pattern is to also pass `profileId` through searchParams or read `users.active_vendor_profile_id` is not used here; for the wizard, server pages should call `getOrCreateWizardProfile(supabase, user.id, mode)` themselves at the top of the page. This is one extra DB round trip per step page but avoids context complexity.

Pick ONE pattern at implementation time:
- **Pattern A** (recommended for simplicity): each wizard step page calls `getOrCreateWizardProfile` itself. Layout shows the header. Tests stay simple.
- **Pattern B**: layout writes the `profileId` to a server-cookie (`__wizard_profile_id`), step pages read the cookie. Avoids the duplicate DB call.

If you go with Pattern A (recommended): the WizardProfileProvider in step 3 above is not strictly needed; you can drop it.

If you go with Pattern B: implement the cookie helper + use it in each step.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/profile/setup/layout.tsx \
  src/lib/onboarding/wizard-profile-context.tsx
git commit -m "feat(multi-biz): I4 — wizard layout reads ?next= and resolves profileId via getOrCreateWizardProfile"
```

### Task I4.3: Refactor 6 wizard step pages to use the resolved profileId

**Files:**

- Modify: `src/app/dashboard/profile/setup/page.tsx`
- Modify: `src/app/dashboard/profile/setup/basics/page.tsx`
- Modify: `src/app/dashboard/profile/setup/location/page.tsx`
- Modify: `src/app/dashboard/profile/setup/online/page.tsx`
- Modify: `src/app/dashboard/profile/setup/portfolio/page.tsx`
- Modify: `src/app/dashboard/profile/setup/payment-mode/page.tsx`
- Modify: `src/app/dashboard/profile/setup/review/page.tsx`

For each step page, the existing pattern is:

```tsx
const { data: vendorProfile } = await supabase
  .from('vendor_profiles')
  .select('*')
  .eq('user_id', user.id)
  .maybeSingle();
```

Replace with (Pattern A):

```tsx
import { getOrCreateWizardProfile } from '@/lib/onboarding/resume';

// Inside the page component, after auth:
const sp = await searchParams;
const mode: 'first' | 'next' = sp?.next === 'true' ? 'next' : 'first';
const { profileId } = await getOrCreateWizardProfile(supabase, user.id, mode);

const { data: vendorProfile } = await supabase
  .from('vendor_profiles')
  .select('*')
  .eq('id', profileId)
  .single();
```

The `?next=true` query string is preserved across step navigations (already the case — wizard step links keep the URL intact). New step pages also propagate `mode` to any client components that need to know they're in second-business mode (mainly: payment-mode in I4.4, review in I4.5).

- [ ] **Step 1-6: Apply the refactor to each of the 7 step page files**

(Each is mechanical; do them one at a time, type-checking after each batch.)

- [ ] **Step 7: Type-check + smoke**

```bash
npm run typecheck
npm run dev
```

Sign in as an existing single-business vendor and re-visit `/dashboard/profile/setup` (no `?next=true`). Verify all steps still render correctly.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/profile/setup/
git commit -m "feat(multi-biz): I4 — refactor 7 wizard step pages to use getOrCreateWizardProfile"
```

### Task I4.4: Stripe override toggle in payment-mode step

**Files:**

- Modify: `src/app/dashboard/profile/setup/payment-mode/page.tsx`
- Possibly: `src/components/onboarding/StepPaymentMode.tsx` (the existing client component)

- [ ] **Step 1: Read existing payment-mode step**

```bash
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/app/dashboard/profile/setup/payment-mode/page.tsx
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/components/onboarding/StepPaymentMode.tsx
```

Understand the existing radio (stripe vs cash) shape so the new sub-radio integrates cleanly.

- [ ] **Step 2: Add a `mode` prop + Stripe override sub-radio**

In `<StepPaymentMode>` (client component):

```tsx
interface StepPaymentModeProps {
  vendorProfile: VendorProfileRow;
  mode: 'first' | 'next'; // NEW
  primaryStripeAccountId: string | null; // NEW — the user's existing shared account, if any
}

// Inside the component:
const [paymentMode, setPaymentMode] = useState<'stripe' | 'cash'>(
  (vendorProfile.payment_mode as 'stripe' | 'cash') ?? 'stripe'
);

// NEW: Stripe sub-mode (only when mode === 'next')
const [stripeMode, setStripeMode] = useState<'reuse' | 'new'>('reuse');

// Render the Stripe override block under the stripe radio, only when mode === 'next':
{paymentMode === 'stripe' && mode === 'next' && primaryStripeAccountId && (
  <div className="ml-6 mt-2 space-y-2 border-l-2 pl-4">
    <label className="flex items-center gap-2">
      <input
        type="radio"
        checked={stripeMode === 'reuse'}
        onChange={() => setStripeMode('reuse')}
      />
      <span>Use my existing Stripe account (recommended)</span>
    </label>
    <label className="flex items-center gap-2">
      <input
        type="radio"
        checked={stripeMode === 'new'}
        onChange={() => setStripeMode('new')}
      />
      <span>Set up a new Stripe account for this business</span>
    </label>
  </div>
)}
```

- [ ] **Step 3: Persist `stripeMode` in a form field**

When the user clicks "Next" on this step, the form posts (or fetches) with both `payment_mode` and `stripe_mode` (only meaningful when `mode === 'next' && payment_mode === 'stripe'`). The server-side handler stashes `stripe_mode` somewhere on the wizard profile or in a cookie until the review step processes it.

Simplest: add a `pending_stripe_mode text` column on the wizard profile? No — that adds schema for one ephemeral value. Better: put it in the URL query string or a sessionStorage value the review step reads.

Cleanest pattern: a hidden input `<input type="hidden" name="stripe_mode" value={stripeMode} />` in the wizard's form. The server action receiving the form reads it and threads it to the review/publish step via the URL.

- [ ] **Step 4: Update the page wrapper**

In `src/app/dashboard/profile/setup/payment-mode/page.tsx`:

```tsx
// After resolving profileId via getOrCreateWizardProfile (I4.3):
const sp = await searchParams;
const mode: 'first' | 'next' = sp?.next === 'true' ? 'next' : 'first';

// Find the user's primary stripe_account_id (oldest vendor_profile with one set).
let primaryStripeAccountId: string | null = null;
if (mode === 'next') {
  const { data: primary } = await supabase
    .from('vendor_profiles')
    .select('stripe_account_id')
    .eq('user_id', user.id)
    .not('stripe_account_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  primaryStripeAccountId = primary?.stripe_account_id ?? null;
}

return (
  <StepPaymentMode
    vendorProfile={vendorProfile}
    mode={mode}
    primaryStripeAccountId={primaryStripeAccountId}
  />
);
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/profile/setup/payment-mode/ \
  src/components/onboarding/StepPaymentMode.tsx
git commit -m "feat(multi-biz): I4 — Stripe override toggle in second-business payment-mode step"
```

### Task I4.5: Wizard completion sets `users.active_vendor_profile_id`

**Files:**

- Modify: `src/app/api/vendor-profile/publish/route.ts` (the existing publish handler called from the review step)

- [ ] **Step 1: Read existing publish route**

```bash
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/app/api/vendor-profile/publish/route.ts
```

- [ ] **Step 2: After the publish succeeds, set the active profile**

Within the success path of the existing handler, add:

```ts
// After marking onboarding_complete + is_active = true on the new profile:
const body = await req.json().catch(() => ({}));
const profileId = (body as { profile_id?: string }).profile_id;
const stripeMode = (body as { stripe_mode?: 'reuse' | 'new' }).stripe_mode;

// Set the new profile as active (lands the user inside it after redirect)
await supabase
  .from('users')
  .update({ active_vendor_profile_id: profileId })
  .eq('id', user.id);

// If second-business stripe-reuse mode, link the new profile to the primary stripe_account
if (stripeMode === 'reuse') {
  const { data: primary } = await supabase
    .from('vendor_profiles')
    .select('stripe_account_id')
    .eq('user_id', user.id)
    .neq('id', profileId)
    .not('stripe_account_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (primary?.stripe_account_id) {
    await supabase
      .from('vendor_profiles')
      .update({ stripe_account_id: primary.stripe_account_id })
      .eq('id', profileId);
  }
}
// If stripe_mode === 'new', the existing Stripe Connect onboarding flow runs as usual,
// creating a new stripe_account row and the existing /stripe/connect handler links it
// to the new vendor_profile.
```

- [ ] **Step 3: Update the review step's publish-button to send profile_id + stripe_mode**

In the review step (client form or server action), include the `profileId` from the wizard layout context + `stripe_mode` from sessionStorage/hidden-input in the POST body.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vendor-profile/publish/route.ts \
  src/app/dashboard/profile/setup/review/page.tsx \
  src/components/onboarding/StepReview.tsx
git commit -m "feat(multi-biz): I4 — publish sets active_vendor_profile_id + links shared Stripe account"
```

### Task I4.6: Update setup-step API route to accept profile_id

**Files:**

- Modify: `src/app/api/vendor-profile/setup/[step]/route.ts`

The existing API route currently looks up the vendor profile via `.eq('user_id', user.id)`. For multi-business, it must accept `profile_id` in the body and verify ownership.

- [ ] **Step 1: Read existing route**

```bash
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/app/api/vendor-profile/setup/[step]/route.ts
```

- [ ] **Step 2: Refactor to accept profile_id**

Replace the lookup with:

```ts
const body = await req.json();
const profileId = body.profile_id as string;
if (!profileId) {
  return NextResponse.json({ error: 'profile_id required' }, { status: 400 });
}

// Ownership check
const { data: target } = await supabase
  .from('vendor_profiles')
  .select('id, user_id')
  .eq('id', profileId)
  .maybeSingle();

if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
if (target.user_id !== user.id) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

// Now apply the step-specific update on this profile
await supabase.from('vendor_profiles').update(updatePayload).eq('id', profileId);
```

- [ ] **Step 3: Update each wizard step's form-submission code to include `profile_id`**

In each step's `StepXxx.tsx` client component, the form-submission POST already targets `/api/vendor-profile/setup/[step]`. Add `profile_id: vendorProfile.id` to the body.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vendor-profile/setup/ \
  src/components/onboarding/
git commit -m "feat(multi-biz): I4 — setup-step API accepts profile_id + ownership check"
```

---

## Phase I5 — Webhook handler + payment.service updates for FK flip

The migration in I1 dropped `stripe_accounts.vendor_profile_id`. Every code site that looked up by that column needs to switch to the reverse direction (`vendor_profiles.stripe_account_id`).

### Task I5.1: Fix payment.service.ts call sites

**Files:**

- Modify: `src/services/payment.service.ts`

- [ ] **Step 1: Enumerate the call sites to fix**

```bash
grep -nE "stripe_accounts|vendor_profile_id" /Users/sardarkhan/IdeaProjects/vendors.io/src/services/payment.service.ts \
  | head -30
```

The known offenders from the spec/grep:
- line ~41: `.from('stripe_accounts')`-style insert with vendor_profile_id
- line ~52: `.from('stripe_accounts').insert(...)` with vendor_profile_id
- line ~96: `.from('stripe_accounts')` select with vendor_profile_id filter
- line ~261: `.from('stripe_accounts')` select with vendor_profile_id
- line ~277: `.from('stripe_accounts')` update by vendor_profile_id
- line ~687, ~706: another update by vendor_profile_id
- line ~966: a JOIN reading `vp.stripe_accounts(...)` — this still works (it's the relation lookup; auto-resolves via the new FK)
- line ~1139, ~1188: more lookups by vendor_profile_id

The exact line numbers shift as edits land; use grep to find each occurrence.

- [ ] **Step 2: For each `.from('stripe_accounts').select(...).eq('vendor_profile_id', X)`, replace with the reverse:**

```ts
// Before
const { data } = await supabase
  .from('stripe_accounts')
  .select('*')
  .eq('vendor_profile_id', vendorProfileId)
  .single();

// After
const { data: vp } = await supabase
  .from('vendor_profiles')
  .select('stripe_account_id')
  .eq('id', vendorProfileId)
  .single();

const { data } = vp?.stripe_account_id
  ? await supabase
      .from('stripe_accounts')
      .select('*')
      .eq('id', vp.stripe_account_id)
      .single()
  : { data: null };
```

For UPDATE sites:

```ts
// Before
await supabase
  .from('stripe_accounts')
  .update(payload)
  .eq('vendor_profile_id', vendorProfileId);

// After
const { data: vp } = await supabase
  .from('vendor_profiles')
  .select('stripe_account_id')
  .eq('id', vendorProfileId)
  .maybeSingle();

if (vp?.stripe_account_id) {
  await supabase
    .from('stripe_accounts')
    .update(payload)
    .eq('id', vp.stripe_account_id);
}
```

For INSERT sites (when creating a new stripe_account during Connect onboarding):

```ts
// Before
const { data: newAcct } = await supabase
  .from('stripe_accounts')
  .insert({
    vendor_profile_id: vendorProfileId,
    stripe_account_id: 'acct_xxx',
    // ...
  })
  .select('id')
  .single();

// After
const { data: newAcct } = await supabase
  .from('stripe_accounts')
  .insert({
    stripe_account_id: 'acct_xxx',
    // ... (NO vendor_profile_id — it's been dropped)
  })
  .select('id')
  .single();

// Then link it to the vendor_profile via the new direction:
if (newAcct?.id) {
  await supabase
    .from('vendor_profiles')
    .update({ stripe_account_id: newAcct.id })
    .eq('id', vendorProfileId);
}
```

For the lookup at ~line 966 that already does the relation join `vp.stripe_accounts(...)`:

That syntax depends on the FK direction Supabase auto-resolves. Since we renamed the FK column, Supabase may not auto-resolve the same way. Test it during implementation; if the join breaks, replace with an explicit two-query pattern:

```ts
const { data: vp } = await supabase
  .from('vendor_profiles')
  .select('id, stripe_account_id')
  .eq('id', vendorProfileId)
  .single();

let stripeAccount = null;
if (vp?.stripe_account_id) {
  const { data: sa } = await supabase
    .from('stripe_accounts')
    .select('stripe_account_id, charges_enabled, payouts_enabled, frozen_reason, details_submitted_at')
    .eq('id', vp.stripe_account_id)
    .single();
  stripeAccount = sa;
}
```

- [ ] **Step 3: Type-check after each batch**

```bash
npm run typecheck
```

Iterate until clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/payment.service.ts
git commit -m "feat(multi-biz): I5 — payment.service uses reverse FK direction (vendor_profiles.stripe_account_id)"
```

### Task I5.2: Fix the webhook handler

**Files:**

- Modify: `src/app/api/webhooks/stripe/route.ts` (specifically the `handleAccountUpdated` lookup)

- [ ] **Step 1: Find the existing call site**

```bash
grep -n "vendor_profile_id\|stripe_account_id\|stripe_accounts" \
  /Users/sardarkhan/IdeaProjects/vendors.io/src/app/api/webhooks/stripe/route.ts
```

- [ ] **Step 2: Inside the `account.updated` handler — find the vendor_profile_id used for downstream notifications/updates**

The handler currently does something like:

```ts
const { data: sa } = await supabase
  .from('stripe_accounts')
  .select('id, vendor_profile_id')
  .eq('stripe_account_id', account.id)
  .single();
const vendorProfileId = sa?.vendor_profile_id;
```

Replace with:

```ts
const { data: sa } = await supabase
  .from('stripe_accounts')
  .select('id')
  .eq('stripe_account_id', account.id)
  .single();

// Look up the vendor_profile(s) linked to this Stripe account via the new FK direction
const { data: linkedProfiles } = await supabase
  .from('vendor_profiles')
  .select('id, user_id')
  .eq('stripe_account_id', sa?.id ?? '');

// For onboarding-complete notifications etc., loop over all linked profiles
// (under the hybrid model, one Stripe account can be linked to multiple vendor_profiles)
for (const vp of linkedProfiles ?? []) {
  // existing per-profile work (notify, etc.)
}
```

Note: this is a behavior change — previously one stripe_account had exactly one vendor_profile; now it can have multiple (shared). The handler must iterate or pick the right scope.

- [ ] **Step 3: Same treatment for `handlePayoutEvent`**

`handlePayoutEvent` (added in E §7.1) already looks up `stripe_accounts.vendor_profile_id` to attribute payouts. Same pattern: find linked vendor_profiles via the new direction, attribute to the most appropriate one (oldest/primary, since payouts are per-Stripe-account not per-business under the shared model).

- [ ] **Step 4: Update webhook tests**

```bash
grep -n "vendor_profile_id" /Users/sardarkhan/IdeaProjects/vendors.io/src/app/api/webhooks/stripe/route.test.ts
```

Update test fixtures + mocks for the new direction.

- [ ] **Step 5: Run tests**

```bash
npm test -- webhooks/stripe
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/stripe/
git commit -m "feat(multi-biz): I5 — webhook handlers updated for reverse Stripe FK direction"
```

---

## Phase I6 — Cross-business polish (chip + toast)

### Task I6.1: Business-name chip in `<BookingDetail>`

**Files:**

- Modify: `src/components/dashboard/BookingDetail.tsx`

- [ ] **Step 1: Read existing component**

Find the header block that renders the booking title + status badge. The chip goes adjacent to the badge.

- [ ] **Step 2: Add the cross-business detection + chip render**

```tsx
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { Badge } from '@/components/ui/badge';

// Inside the component, after fetching `booking` (which already has vendor_profiles
// joined via getBookingById):
const activeBusinessId = role === 'vendor' && user
  ? await getActiveVendorProfileId(supabase, user.id)
  : null;

const bookingBusinessId = booking.vendor_profile_id;
const isCrossBusiness =
  role === 'vendor' &&
  activeBusinessId !== null &&
  bookingBusinessId !== activeBusinessId;

const bookingBusinessName = isCrossBusiness
  ? // booking.vendor_profiles.business_name is already joined
    (booking.vendor_profiles as { business_name?: string } | null)?.business_name ?? null
  : null;

// In the JSX, next to the existing status Badge:
<div className="flex items-center gap-2">
  <Badge>{booking.status}</Badge>
  {isCrossBusiness && bookingBusinessName && (
    <Badge variant="outline" className="text-xs">
      {bookingBusinessName}
    </Badge>
  )}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/BookingDetail.tsx
git commit -m "feat(multi-biz): I6 — business-name chip in BookingDetail when cross-business"
```

### Task I6.2: Post-action toast component

**Files:**

- Create: `src/components/dashboard/CrossBusinessActionToast.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/CrossBusinessActionToast.tsx
//
// Sub-project I §8. Reads active business + booking's business; if cross-business,
// fires a sonner toast with action-aware text + [Switch] button.
'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useActiveBusinessId } from '@/contexts/ActiveBusinessContext';

type ActionType = 'accept' | 'adjust' | 'cancel' | 'complete';

const TOAST_PREFIXES: Record<ActionType, string> = {
  accept: 'Accepted.',
  adjust: 'Quote sent.',
  cancel: 'Cancelled.',
  complete: 'Marked complete.',
};

const TOAST_HINTS: Record<ActionType, string> = {
  accept: 'see this in your Operations view',
  adjust: 'follow up',
  cancel: 'see this in your bookings',
  complete: 'confirm',
};

/**
 * Call from a booking action handler on success. If the booking belongs to a
 * different business than the user's active context, shows a toast with a
 * [Switch] button.
 */
export function useCrossBusinessActionToast() {
  const activeBusinessId = useActiveBusinessId();
  const router = useRouter();

  return ({
    action,
    bookingBusinessId,
    bookingBusinessName,
  }: {
    action: ActionType;
    bookingBusinessId: string;
    bookingBusinessName: string;
  }) => {
    if (!activeBusinessId || activeBusinessId === bookingBusinessId) return;

    toast(`${TOAST_PREFIXES[action]} Switch to ${bookingBusinessName} to ${TOAST_HINTS[action]}.`, {
      duration: 8000,
      action: {
        label: 'Switch',
        onClick: async () => {
          await fetch('/api/users/me/active-business', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorProfileId: bookingBusinessId }),
          });
          router.refresh();
        },
      },
    });
  };
}
```

- [ ] **Step 2: Wire into the booking action components**

The existing `<VendorBookingActions>` and `<BookingActions>` already do `router.refresh()` on success. Extend each to also call the cross-business toast:

```tsx
// src/components/booking/VendorBookingActions.tsx
import { useCrossBusinessActionToast } from '@/components/dashboard/CrossBusinessActionToast';

// Pass bookingBusinessId + bookingBusinessName as props (the parent BookingDetail
// already has them — propagate down).
interface VendorBookingActionsProps {
  bookingId: string;
  status: string;
  totalPriceCents: number;
  // NEW:
  bookingBusinessId: string;
  bookingBusinessName: string;
}

// Inside the component:
const triggerCrossBusinessToast = useCrossBusinessActionToast();

const handleAccept = async () => {
  // ... existing accept logic ...
  if (success) {
    triggerCrossBusinessToast({
      action: 'accept',
      bookingBusinessId,
      bookingBusinessName,
    });
    router.refresh();
  }
};
// ... same pattern for adjust / cancel handlers
```

Then in `<BookingDetail>`, pass the two new props when rendering `<VendorBookingActions>`.

- [ ] **Step 3: Same treatment for `<BookingActions>` (couple-side)**

Couple-side actions trigger when the couple cancels/completes — but those don't have a cross-business angle (couples don't have multiple businesses). Skip for couple actions; only apply to vendor-side action components.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/CrossBusinessActionToast.tsx \
  src/components/booking/VendorBookingActions.tsx
git commit -m "feat(multi-biz): I6 — post-action toast with [Switch] for cross-business actions"
```

---

## Phase I7 — Money page shared-account footnote

### Task I7.1: Compute `isSharedStripeAccount` + render footnote

**Files:**

- Modify: `src/app/dashboard/money/page.tsx`

- [ ] **Step 1: Add the computation**

After `vendorProfileRaw` is resolved (now via `getActiveVendorProfile` from I2.4):

```ts
// Determine if the active business shares its Stripe account with other businesses
// of the same user. Only meaningful for Stripe mode + when a stripe_account_id is set.
let isSharedStripeAccount = false;
if (paymentMode === 'stripe' && vendorProfileRaw.stripe_account_id) {
  const { count } = await supabase
    .from('vendor_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('stripe_account_id', vendorProfileRaw.stripe_account_id);
  isSharedStripeAccount = (count ?? 0) > 1;
}
```

- [ ] **Step 2: Render the footnote**

Below the 3-card summary row (where `<EarningsCard>` is rendered), conditionally render:

```tsx
{isSharedStripeAccount && (
  <p className="text-xs text-muted-foreground mt-2">
    Shared Stripe account with your other businesses — these numbers include all of them.
  </p>
)}
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run typecheck
git add src/app/dashboard/money/page.tsx
git commit -m "feat(multi-biz): I7 — shared-Stripe-account footnote on Money page"
```

---

## Phase I8 — Tests (RLS + E2E)

### Task I8.1: RLS integration test — multi-business isolation

**Files:**

- Create: `src/__tests__/integration/rls/multi-business-isolation.test.ts`

- [ ] **Step 1: Write the test**

Pattern follows the E vendor-notes-view test (sentinel-based, skip without env).

```ts
// src/__tests__/integration/rls/multi-business-isolation.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const skip = !SUPABASE_URL || !SERVICE_KEY;
const suite = skip ? describe.skip : describe;

suite('multi-business isolation', () => {
  const sb = skip
    ? (null as never)
    : createClient<Database>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let testUserId: string | null = null;
  const vp1Id = `00000000-0000-0000-0000-${Date.now().toString().padStart(12, '0').slice(-12)}` as string;
  // ...

  afterAll(async () => {
    if (testUserId) {
      await sb.from('bookings').delete().eq('couple_user_id', testUserId);
      await sb.from('vendor_profiles').delete().eq('user_id', testUserId);
      await sb.from('users').delete().eq('id', testUserId);
    }
  });

  it('switching active_vendor_profile_id changes which booking is returned', async () => {
    // Seed user + 2 vendor_profiles + 1 booking per business
    // Set active_vendor_profile_id = vp1
    // Assert getBookingRequests returns only vp1's booking
    // Switch active to vp2
    // Assert getBookingRequests returns only vp2's booking
  });
});
```

Run: `npx dotenv-cli -e .env.local -- npm test -- multi-business-isolation` against dev.

- [ ] **Step 2: Commit**

```bash
git add src/__tests__/integration/rls/multi-business-isolation.test.ts
git commit -m "test(multi-biz): I8 — RLS integration test for cross-business isolation"
```

### Task I8.2: RLS integration test — shared Stripe account

**Files:**

- Create: `src/__tests__/integration/rls/stripe-account-shared.test.ts`

- [ ] **Step 1: Write the test**

Verify two vendor_profiles can share one stripe_account_id; the RLS policy returns the shared row for both vendor's "active" context.

- [ ] **Step 2: Run + commit**

```bash
npx dotenv-cli -e .env.local -- npm test -- stripe-account-shared
git add src/__tests__/integration/rls/stripe-account-shared.test.ts
git commit -m "test(multi-biz): I8 — RLS integration test for shared stripe_account"
```

### Task I8.3: RLS integration test — users.active_vendor_profile_id isolation

**Files:**

- Create: `src/__tests__/integration/rls/users-active-vendor-rls.test.ts`

- [ ] **Step 1: Write the test**

Verify user B cannot read user A's `active_vendor_profile_id`. This is mostly already enforced by the existing `users` table RLS (users can only SELECT their own row), but this is a regression guard for the new column specifically.

- [ ] **Step 2: Run + commit**

```bash
npx dotenv-cli -e .env.local -- npm test -- users-active-vendor-rls
git add src/__tests__/integration/rls/users-active-vendor-rls.test.ts
git commit -m "test(multi-biz): I8 — RLS regression guard for users.active_vendor_profile_id"
```

### Task I8.4: Playwright E2E — switcher flow

**Files:**

- Create: `tests/e2e/multi-business-switcher.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';
import { seedVendor, seedPackage, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('multi-business switcher', () => {
  let vendor: TestVendor | null = null;

  test.beforeAll(async () => {
    vendor = await seedVendor({ chargesEnabled: true });
    await seedPackage(vendor, { basePriceCents: 200_000 });
  });

  test.afterAll(async () => {
    await cleanup(vendor);
  });

  test('vendor adds a second business; switcher pill appears; swap changes Home', async ({ page }) => {
    if (!vendor) throw new Error('seed missing');
    await loginAs(page, vendor);
    await page.goto('/dashboard');

    // Open user-avatar menu → "Add another business"
    await page.getByRole('button', { name: /your avatar|account/i }).click();
    await page.getByRole('menuitem', { name: 'Add another business' }).click();

    // Wizard renders in second-business mode
    await expect(page.getByText('Set up your next business')).toBeVisible();

    // Fill out the wizard quickly (delegate to existing wizard helpers)
    // ... fill basics, location, online, portfolio, payment-mode (use existing stripe), review, publish

    // After publish, land on /dashboard with the new business active
    await expect(page).toHaveURL(/\/dashboard$/);

    // Switcher pill appears
    const switcher = page.getByRole('button', { name: /your test studio|new business/i }).first();
    await expect(switcher).toBeVisible();

    // Click pill, swap to the first business
    await switcher.click();
    await page.getByRole('menuitem', { name: /e2e test vendor/i }).click();

    // Inbox/Home rerenders with the original business's data
    await expect(page.getByText('E2E Test Vendor')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run locally + commit**

```bash
npm run test:e2e -- multi-business-switcher
git add tests/e2e/multi-business-switcher.spec.ts
git commit -m "test(multi-biz): I8 — Playwright E2E for switcher add+swap flow"
```

### Task I8.5: E2E — cross-business notification flow

**Files:**

- Create: `tests/e2e/multi-business-cross-notification.spec.ts`

- [ ] **Step 1: Write the spec**

Seed vendor with 2 businesses (via the API path to skip wizard UI). Seed a pending booking against biz A. Set vendor.active = biz B. Login as vendor. Open `/dashboard/notifications`. Click the new-booking notification. Assert:
1. Booking detail panel/page opens
2. Business chip "Khan Photography" (or whatever biz A is named) appears
3. Accepting fires the toast with `[Switch]` button
4. `active_vendor_profile_id` did NOT change without explicit click

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/multi-business-cross-notification.spec.ts
git commit -m "test(multi-biz): I8 — Playwright E2E for cross-business notification flow"
```

### Task I8.6: E2E — isolated Stripe accounts

**Files:**

- Create: `tests/e2e/multi-business-isolated-stripe.spec.ts`

- [ ] **Step 1: Write the spec**

Vendor with 2 businesses, each with its own `stripe_account` (override path). Seed both via service-role. Visit `/dashboard/money` while active = biz A; assert earnings reflect A's account. Switch to biz B; assert different earnings.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/multi-business-isolated-stripe.spec.ts
git commit -m "test(multi-biz): I8 — Playwright E2E for isolated Stripe accounts"
```

### Task I8.7: E2E — shared Stripe account + footnote

**Files:**

- Create: `tests/e2e/multi-business-shared-stripe.spec.ts`

- [ ] **Step 1: Write the spec**

Vendor with 2 businesses sharing one `stripe_account_id`. Visit `/dashboard/money` on each business; assert same earnings + footnote "Shared Stripe account with your other businesses — these numbers include all of them." present.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/multi-business-shared-stripe.spec.ts
git commit -m "test(multi-biz): I8 — Playwright E2E for shared Stripe + footnote"
```

### Task I8.8: Verify all 7 existing E E2E specs still pass

These prove success criterion #1 from the spec ("zero behavior change for single-business").

- [ ] **Step 1: Run all E2Es locally**

```bash
npx dotenv-cli -e .env.local -- npm run test:e2e
```

Expected: every E2E (the 4 new I specs + 7 existing E specs + earlier A/B/C/D/F/G specs) passes locally. CI will still fail on the missing-secrets gate — that's the known limitation per the spec §11.

- [ ] **Step 2: If any existing E spec fails, that's a regression — fix before merge**

Common failure mode: the refactor accidentally swapped a single-business behavior. Trace via the failing spec's seed data.

---

## Phase I9 — Rollout

### Task I9.1: Final local validation

- [ ] **Step 1: Run the gauntlet**

```bash
npm run lint
npm run typecheck
npm run build
npm test
npx dotenv-cli -e .env.local -- npm run test:e2e
```

All must pass (modulo the pre-existing CI E2E secrets gate).

- [ ] **Step 2: Manual smoke checklist on local dev**

- Sign in as single-business test vendor → `/dashboard` shows Inbox/Ops/Analytics as in E. **No switcher pill**.
- Open user-avatar dropdown → "Add another business" link is present.
- Click it → wizard appears with header "Set up your next business".
- Walk through wizard, default Stripe path (share account) → publish → land on `/dashboard` with new biz active.
- **Switcher pill now appears.** Switch back to original business → Inbox/Ops update.
- Visit `/dashboard/money` on both businesses → footnote "Shared Stripe account…" appears on each.
- Sign in as a couple → couple `/dashboard` unchanged; no switcher; no "Add another business" menu item.

### Task I9.2: PR + review

- [ ] **Step 1: Push + open PR**

```bash
git push -u origin feat/sub-project-i-multi-business
gh pr create --base main --head feat/sub-project-i-multi-business \
  --title "feat(multi-biz): Sub-project I — multi-business per vendor account" \
  --body "$(cat <<'EOF'
## Summary
- Let one auth user own multiple `vendor_profiles` with a clean switching UX
- Switcher pill in topbar only when count > 1; "Add another business" link in user-avatar dropdown
- Hybrid Stripe: default reuse existing account; override toggle creates a separate account per business
- Cross-business booking detail is context-neutral; business chip + post-action toast for clarity
- Per-business filtering on Inbox/Operations/Money/Bookings/Calendar; per-user for Notifications

Migration 00035: flip FK direction (stripe_accounts.vendor_profile_id → vendor_profiles.stripe_account_id) + add users.active_vendor_profile_id.

Spec: docs/superpowers/specs/2026-05-21-sub-project-i-multi-business-design.md
Plan: docs/superpowers/plans/2026-05-21-sub-project-i-multi-business.md

## Test plan
- [ ] Apply migration 00035 to PROD Supabase (obpdgihdskbxzgyctaib) via SQL editor before merging
- [ ] Verify on www.baazar.io: single-business vendor sees zero UI change
- [ ] Add a second business via the user-menu link; complete wizard with default Stripe path
- [ ] Switcher pill appears in topbar; swap businesses; Inbox + Operations + Money update per business
- [ ] Cross-business notification: click notification while active=other biz; chip appears in detail; accepting fires toast with [Switch]
- [ ] Smoke test webhook flow (account.updated on shared Stripe account propagates to both linked vendor_profiles)
- [ ] Update MEMORY.md ship record

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Address review comments** — push fixups; do NOT amend post-pre-commit failure per repo convention.

### Task I9.3: Apply migration to prod + merge

- [ ] **Step 1: User applies migration 00035 to prod via SQL editor**

(Claude does NOT apply prod migrations per [[migration_apply_policy]]. Surface this to the user in the PR description's Test plan; wait for confirmation.)

User runs the same idempotent file in the prod SQL editor (`obpdgihdskbxzgyctaib`) and shares back the sanity-check query output:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'vendor_profiles' AND column_name = 'stripe_account_id';
-- expect 1 row

SELECT column_name FROM information_schema.columns
WHERE table_name = 'stripe_accounts' AND column_name = 'vendor_profile_id';
-- expect 0 rows

SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'active_vendor_profile_id';
-- expect 1 row

SELECT polname FROM pg_policy WHERE polrelid = 'stripe_accounts'::regclass;
-- expect the rewritten policy is present
```

- [ ] **Step 2: Merge the PR** (only after user confirms prod migration applied)

```bash
gh pr merge <PR-NUMBER> --squash --delete-branch
```

Vercel auto-deploys.

### Task I9.4: Post-ship smoke + memory updates

- [ ] **Step 1: Smoke test on www.baazar.io**

Same checklist as I9.1 step 2, against prod.

- [ ] **Step 2: Update `MEMORY.md` ship record**

Create `~/.claude/projects/-Users-sardarkhan-IdeaProjects-vendors-io/memory/sub_project_i_multi_business_shipped.md` with structure matching prior ship records (E's `sub_project_e_vendor_crm_shipped.md` is a recent template). Cover: status (PR # + merge SHA + 2026-05-XX date), what shipped (schema, helper, switcher, wizard mode, Stripe hybrid, cross-business polish), privacy/isolation guarantees, tests added, what unblocks next (J + H), leftovers (if any).

Then append to `MEMORY.md` index:

```markdown
- [Sub-project I shipped](./sub_project_i_multi_business_shipped.md) — multi-business per vendor account (switcher + active_vendor_profile_id + hybrid Stripe + cross-business polish). Merged + migration 00035 applied to prod 2026-05-XX (PR #X).
```

- [ ] **Step 3: Commit memory updates** (memory files are outside the repo; commit message via git if the memory dir is itself a git repo — verify with `git -C ~/.claude/projects/-Users-sardarkhan-IdeaProjects-vendors-io/memory status`)

If the memory dir is NOT git-tracked, just save the files — no commit needed.

---

## What unblocks next

I shipping unblocks the **UI polish** phase per [[sub_project_sequencing]]: **J (homepage polish + animations)** and **H (advanced search filters)**. After J/H: **K (Playwright vendor scraper)** intentionally last.

## Self-review notes

This plan was self-reviewed against the spec on 2026-05-21:

- **Spec coverage:** every section §0–§13 maps to at least one task here. §3 (switcher + user-menu) = I3.3 + I3.4 + I3.5. §4 (migration) = I1.1 + I1.2 + I1.3. §5 (helper + refactor) = I2 entirely. §6 (wizard) = I4. §7 (E-surface adaptation) = I2.4 + I7. §8 (cross-business polish) = I6. §9 (marketplace listing) = no code work needed per spec, addressed by note in I9 smoke checklist. §10 (testing) = I8. §11 (risks) = ongoing per-phase mitigations. §12 (implementation checklist) = this plan.
- **Placeholders:** no TBDs. One "depending on the existing Navbar structure" instruction in I3.4 acknowledges that the engineer will need to read the existing file to make the right placement decision — that's not a placeholder, that's a structural reality.
- **Type consistency:** `getActiveVendorProfile` returns `{ profile, totalCount }` everywhere it's referenced. `getOrCreateWizardProfile` returns `{ profileId, isNew }` everywhere. `ActiveBusinessProvider` / `useActiveBusinessId` are used consistently. Toast `action` type is `'accept' | 'adjust' | 'cancel' | 'complete'` consistently.
- **Migration order:** I1 lands schema + types first; I5 fixes the resulting payment.service typecheck errors. The intermediate state has known typecheck errors in payment.service.ts but those don't block other phases (they're in webhook + payment service files that aren't on the critical path of UI work).
