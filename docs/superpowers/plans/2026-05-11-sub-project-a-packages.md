# Sub-project A: Packages + Booking Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the budget-driven booking flow with a package-driven model that supports multi-day Desi weddings, vendor-controlled adjustment quotes with structured reasons, and Google-Places-anchored event locations.

**Architecture:** New tables `packages`, `package_addons`, `booking_events`. Rename `booking_requests → bookings`. Booking lifecycle gains an accept-or-adjust ping-pong with 72h auto-cancel. Phased implementation: A1 schema → A2 vendor + A3 couple + A4 payment-emails in parallel → A5 cleanup. All work on umbrella branch `feat/sub-project-a-packages`.

**Tech Stack:** Next.js 14 (app router), Supabase (Postgres + Auth + RLS), Stripe Connect (deferred onboarding), Resend (email), UploadThing (image upload), Google Places Autocomplete, Tailwind CSS, Zod validation.

**Source spec:** `docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md` — referenced throughout as **§N**. Read it before starting.

---

## Pre-flight (read before any phase)

- Confirm you're on `feat/sub-project-a-packages` or a worktree branched from it: `git branch --show-current`
- Confirm spec exists: `ls docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md`
- Existing patterns to mimic:
  - **API route**: `src/app/api/bookings/request/route.ts` (`withErrorBoundary` + `requireUser` + Zod + `checkRateLimit`)
  - **Email function**: `src/lib/email/resend.ts` (use `sendEmail` helper, `FROM_EMAIL`, `fmtUsd`, `appUrl`, `FOOTER`)
  - **Migration**: `supabase/migrations/00014_fix_on_booking_completed_security_definer.sql` (header comment + SQL)
  - **Auth helper**: `src/lib/api/auth.ts` (`requireUser`)
  - **Error helper**: `src/lib/api/error-boundary.ts` (`withErrorBoundary`, `HttpError`)
  - **Zod schemas**: `src/types/index.ts`
  - **Service layer**: `src/services/booking.service.ts`, `src/services/payment.service.ts`

---

## File structure overview

### New files

```
supabase/migrations/
├── 00015_create_packages_and_addons.sql
├── 00016_create_booking_events.sql
├── 00017_rename_booking_requests_to_bookings.sql
├── 00018_add_booking_columns_and_statuses.sql
├── 00019_add_vendor_base_address.sql
├── 00020_total_price_trigger_and_view.sql
└── 00021_rls_packages_addons_booking_events.sql

src/app/api/
├── packages/
│   ├── route.ts                          # POST (create)
│   └── [id]/
│       ├── route.ts                      # PATCH (update), DELETE
│       └── is-active/
│           └── route.ts                  # PATCH (toggle is_active)
└── bookings/
    └── [id]/
        ├── accept/route.ts               # vendor accepts at base
        ├── adjust/route.ts               # vendor sends adjusted quote
        ├── accept-adjusted/route.ts      # couple accepts adjustment
        └── decline-adjusted/route.ts     # couple declines

src/app/dashboard/profile/packages/
├── page.tsx                              # list + drag-sort + add button
└── [id]/page.tsx                         # edit form

src/app/(marketplace)/vendors/[slug]/book/
└── page.tsx                              # new booking form route

src/components/forms/
├── PackageEditorForm.tsx
├── PackageAddonsEditor.tsx
├── EventRow.tsx
├── EventTypeAutocomplete.tsx
└── GooglePlacesAutocomplete.tsx

src/components/marketplace/
├── PackageGrid.tsx                       # Layout C photo-forward grid
└── PackageDetailModal.tsx                # with addon toggles

src/components/booking/
└── AdjustmentReview.tsx                  # couple's accept/decline-adjusted UI

src/services/
└── packages.service.ts                   # package CRUD + safety checks

src/lib/email/
└── (additions to resend.ts, no new files)
```

### Modified files

```
src/types/index.ts                                # add packageSchema, bookingSchema, etc.
src/services/booking.service.ts                   # update for new shape
src/services/payment.service.ts                   # createDepositCheckout reads total_price_cents
src/lib/email/resend.ts                           # 7 new fns + 2 updated fns + logger.error
src/app/api/webhooks/stripe/route.ts              # handle new statuses (pass-through mostly)
src/app/api/cron/tick/route.ts                    # sweep new statuses
src/app/api/bookings/request/route.ts             # update to new shape OR redirect to /api/bookings
src/components/forms/VendorProfileForm.tsx        # + base_address + visibility toggle
src/components/marketplace/VendorProfile.tsx      # render packages section
src/app/dashboard/page.tsx                        # onboarding gate CTA + pause toggle
src/app/dashboard/bookings/page.tsx               # vendor accept/adjust CTAs (vendor view)
src/app/dashboard/bookings/[id]/page.tsx          # status-aware rendering
```

---

# Phase A1 — Schema migrations + types (sequential, supervised)

Single-threaded. ~1–2 hours. Branch: directly on `feat/sub-project-a-packages` (no worktree needed — schema work is sequential and supervised).

## Task A1.1: Create migration for packages + package_addons

**Files:**
- Create: `supabase/migrations/00015_create_packages_and_addons.sql`

- [ ] **Step 1: Write the migration file**

Paste the SQL from spec **§2.1** (`packages` and `package_addons` table definitions verbatim), prefaced with a header comment:

```sql
-- ============================================================================
-- Sub-project A · Phase A1 · Step 1/7
-- Create packages + package_addons tables
-- ============================================================================
-- Packages are the unit a vendor offers and a couple selects. Each package has
-- a base price, included items, max guests, duration, photos, optional add-ons,
-- and events_count (default 1; supports multi-day bundles for Desi weddings).
-- Add-ons are optional toggles couples can stack on at booking time; price
-- deltas are snapshotted at booking creation in bookings.selected_addons jsonb.
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.1.

-- ... [SQL from §2.1 packages + package_addons CREATE TABLE blocks here] ...
```

- [ ] **Step 2: Verify SQL syntax locally** (optional — Supabase SQL editor will validate too)

Run: `cat supabase/migrations/00015_create_packages_and_addons.sql | head -50`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00015_create_packages_and_addons.sql
git commit -m "feat(schema): migration — packages + package_addons tables (A1.1)"
```

## Task A1.2: Create migration for booking_events

**Files:**
- Create: `supabase/migrations/00016_create_booking_events.sql`

- [ ] **Step 1: Write the migration**

Paste the SQL from spec **§2.1** (`booking_events` table) with the same header pattern. Note: the FK references `bookings(id)` — at this point `booking_requests` hasn't been renamed yet. **Use `booking_requests(id)` for the FK in THIS migration**; the next migration will rename the table and cascade the FK references via Postgres's automatic update.

Actually, to keep migrations idempotent and avoid temporal coupling, **defer the booking_events FK creation** to migration 00017 (after rename). Create the table with `booking_id uuid NOT NULL` and add the FK in 00017.

```sql
-- 00016_create_booking_events.sql
-- ... header ...
CREATE TABLE booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,  -- FK added in 00017 after table rename
  sequence integer NOT NULL CHECK (sequence >= 1),
  event_date date NOT NULL,
  event_start_time timestamptz NOT NULL,
  event_end_time timestamptz NOT NULL,
  event_type_label text NOT NULL,
  location_name text,
  address_line_1 text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  google_place_id text,
  guest_count_override integer,
  location_overridden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_end_time > event_start_time),
  UNIQUE (booking_id, sequence)
);

CREATE INDEX booking_events_booking_idx ON booking_events(booking_id);
CREATE INDEX booking_events_city_idx ON booking_events(city);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00016_create_booking_events.sql
git commit -m "feat(schema): migration — booking_events table (A1.2)"
```

## Task A1.3: Rename booking_requests → bookings + wire booking_events FK

**Files:**
- Create: `supabase/migrations/00017_rename_booking_requests_to_bookings.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Sub-project A · Phase A1 · Step 3/7
-- Rename booking_requests → bookings, then wire booking_events FK
-- ============================================================================
-- Semantic clarity: a booking is the contract once accepted, not just a request.
-- This migration also renames affected indexes and RLS policies and wires the
-- booking_events FK that was deferred from migration 00016.
-- See spec §2.2.

-- Rename the table (renames triggers automatically; indexes need explicit renames)
ALTER TABLE booking_requests RENAME TO bookings;

-- Rename indexes (find them with \di or pg_indexes — adjust below if names differ)
ALTER INDEX IF EXISTS booking_requests_pkey RENAME TO bookings_pkey;
ALTER INDEX IF EXISTS booking_requests_couple_user_id_idx RENAME TO bookings_couple_user_id_idx;
ALTER INDEX IF EXISTS booking_requests_vendor_profile_id_idx RENAME TO bookings_vendor_profile_id_idx;
ALTER INDEX IF EXISTS booking_requests_status_idx RENAME TO bookings_status_idx;
-- (Inspect existing indexes via Supabase dashboard before applying; adjust as needed.)

-- Rename RLS policies if they reference the old name
-- (Inspect existing policies; rename using DROP + CREATE if needed.)

-- Wire booking_events FK now that bookings exists with the right name
ALTER TABLE booking_events
  ADD CONSTRAINT booking_events_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
```

**IMPORTANT before applying**: open the Supabase SQL editor, run `\di booking_requests*` to list existing indexes, and adjust the rename lines above to match. Same for RLS policies (`SELECT * FROM pg_policies WHERE tablename = 'booking_requests'`).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00017_rename_booking_requests_to_bookings.sql
git commit -m "feat(schema): migration — rename booking_requests to bookings + booking_events FK (A1.3)"
```

## Task A1.4: Add booking columns + statuses

**Files:**
- Create: `supabase/migrations/00018_add_booking_columns_and_statuses.sql`

- [ ] **Step 1: Write the migration**

Paste from spec **§2.2** "Changes to `booking_requests`" block (the ALTER TABLE statements), **without** the deferred `total_price_positive` constraint (note in §2.2 says it moves to A5).

Specifically include:
- `ADD COLUMN package_id` (FK SET NULL per spec §2.2)
- `ADD COLUMN package_name_snapshot text`
- `ADD COLUMN package_base_price_cents_snapshot integer`
- `ADD COLUMN selected_addons jsonb NOT NULL DEFAULT '[]'::jsonb`
- `ADD COLUMN adjustment_amount_cents integer NOT NULL DEFAULT 0`
- `ADD COLUMN adjustment_reason text CHECK (...)`
- `ADD COLUMN adjustment_explanation text`
- `ADD COLUMN vendor_notes text`
- `ADD COLUMN total_price_cents integer NOT NULL DEFAULT 0`
- `ADD COLUMN negotiation_round_count integer NOT NULL DEFAULT 0`
- The `adjustment_explanation_when_other` check constraint
- The three new enum values: `ALTER TYPE booking_status ADD VALUE 'accepted'; ...`

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00018_add_booking_columns_and_statuses.sql
git commit -m "feat(schema): migration — booking new columns + new status values (A1.4)"
```

## Task A1.5: Add vendor base_address columns

**Files:**
- Create: `supabase/migrations/00019_add_vendor_base_address.sql`

- [ ] **Step 1: Write the migration**

Paste from spec **§2.3** (the `ALTER TABLE vendor_profiles` block adding `base_address_*` columns + `base_address_public boolean NOT NULL DEFAULT false`).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00019_add_vendor_base_address.sql
git commit -m "feat(schema): migration — vendor base_address + visibility (A1.5)"
```

## Task A1.6: total_price_cents trigger + price band view

**Files:**
- Create: `supabase/migrations/00020_total_price_trigger_and_view.sql`

- [ ] **Step 1: Write the migration**

Paste from spec **§2.4** (computed view `vendor_packages_price_band`) and **§2.5** (function `sync_booking_total_price` + trigger).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00020_total_price_trigger_and_view.sql
git commit -m "feat(schema): migration — total_price_cents trigger + vendor price band view (A1.6)"
```

## Task A1.7: RLS policies for new tables

**Files:**
- Create: `supabase/migrations/00021_rls_packages_addons_booking_events.sql`

- [ ] **Step 1: Write the migration**

Paste from spec **§2.6** (RLS for packages, package_addons, booking_events).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00021_rls_packages_addons_booking_events.sql
git commit -m "feat(schema): migration — RLS for packages, addons, booking_events (A1.7)"
```

## Task A1.8: Apply migrations to dev Supabase project

Manual step — Vercel deploys code only; Supabase migrations must be applied manually via SQL editor.

- [ ] **Step 1: Open Supabase SQL editor for the dev project**

Dev project ref: `lquvhjedlzubqusnfaak`. URL: `https://supabase.com/dashboard/project/lquvhjedlzubqusnfaak/sql/new`.

- [ ] **Step 2: Apply migrations in order: 00015 → 00016 → 00017 → 00018 → 00019 → 00020 → 00021**

For each:
1. Open the migration file: `cat supabase/migrations/00015_*.sql`
2. Paste into SQL editor
3. Run
4. Verify success (green checkmark, no errors)
5. If error: read the error message, fix the migration file (or the DB state), re-run

- [ ] **Step 3: Smoke-verify new tables exist**

In SQL editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('packages', 'package_addons', 'booking_events', 'bookings');
```
Expected: 4 rows.

Also verify the rename took:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'booking_requests';
```
Expected: 0 rows.

- [ ] **Step 4: Test the trigger manually**

```sql
-- Pick any existing test booking and verify total_price_cents column exists
SELECT id, total_price_cents, package_id, package_base_price_cents_snapshot
FROM bookings LIMIT 3;
```

## Task A1.9: Regenerate TypeScript types

**Files:**
- Modify: `src/types/supabase.ts` (or wherever Supabase types live — check `package.json` scripts)

- [ ] **Step 1: Run the type generation script**

```bash
npm run db:types
# OR if the script doesn't exist, find the Supabase CLI command:
# npx supabase gen types typescript --project-id lquvhjedlzubqusnfaak > src/types/supabase.ts
```

Check `package.json` scripts section for the right command (`grep types package.json`).

- [ ] **Step 2: Verify the generated file**

```bash
grep -l "packages" src/types/supabase.ts
grep -l "booking_events" src/types/supabase.ts
```

Expected: both grep should match. New tables are present.

- [ ] **Step 3: Run `npm run build` to confirm TS types compile**

```bash
npm run build
```

Expected: build succeeds. If TS errors anywhere referencing old columns (like `event_date`, `budget_min_cents` on `bookings`) — those are A5 cleanup work; for A1 we just need to ensure the **new** types exist. Resolve any **blocking** build errors by leaving the old columns in place (they should still exist in the schema — we kept them).

- [ ] **Step 4: Commit**

```bash
git add src/types/supabase.ts
git commit -m "feat(types): regenerate Supabase types after A1 schema migrations (A1.9)"
```

## Task A1.10: Add Zod schemas for new shapes

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add new schemas**

Append the following exports to `src/types/index.ts` (or wherever the existing `bookingRequestSchema` lives):

```typescript
import { z } from 'zod';

export const packageAddonSchema = z.object({
  name: z.string().min(1).max(80),
  price_delta_cents: z.number().int(),  // can be negative
});

export const createPackageSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  base_price_cents: z.number().int().positive(),
  included_items: z.array(z.string().max(200)).max(20).default([]),
  max_guests: z.number().int().positive(),
  duration_hours: z.number().positive(),
  events_count: z.number().int().min(1).max(5).default(1),
  featured_image_url: z.string().url(),
  gallery_image_urls: z.array(z.string().url()).max(2).default([]),
  vendor_notes_template: z.string().max(1000).optional(),
  location_mode: z.enum(['couple_provides', 'at_vendor']).default('couple_provides'),
  addons: z.array(packageAddonSchema).max(8).default([]),
});

export const updatePackageSchema = createPackageSchema.partial();

export const bookingEventInputSchema = z.object({
  sequence: z.number().int().min(1),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_start_time: z.string().datetime(),
  event_end_time: z.string().datetime(),
  event_type_label: z.string().min(1).max(80),
  location_name: z.string().max(120).optional().nullable(),
  address_line_1: z.string().min(1).max(200),
  city: z.string().min(1).max(80),
  state: z.string().min(1).max(80),
  postal_code: z.string().min(1).max(20),
  google_place_id: z.string().optional().nullable(),
  guest_count_override: z.number().int().positive().optional().nullable(),
  location_overridden: z.boolean().default(false),
});

export const selectedAddonInputSchema = z.object({
  addon_id: z.string().uuid(),
  name: z.string().min(1),
  price_delta_cents: z.number().int(),
});

export const createBookingSchema = z.object({
  vendor_profile_id: z.string().uuid(),
  package_id: z.string().uuid(),
  selected_addons: z.array(selectedAddonInputSchema).default([]),
  guest_count: z.number().int().positive(),
  special_requests: z.string().max(2000).optional(),
  couple_full_name: z.string().min(1).max(120),
  couple_contact_phone: z.string().min(1).max(40),
  events: z.array(bookingEventInputSchema).min(1).max(5),
});

export const adjustQuoteSchema = z.object({
  adjustment_amount_cents: z.number().int(),
  reason: z.enum(['travel', 'guest_count', 'peak_date', 'custom', 'setup_complexity', 'discount', 'other']),
  explanation: z.string().max(1000).optional().nullable(),
}).refine(
  (data) => data.reason !== 'other' || (data.explanation !== null && data.explanation !== undefined && data.explanation.length > 0),
  { message: "explanation is required when reason is 'other'", path: ['explanation'] }
);

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type AdjustQuoteInput = z.infer<typeof adjustQuoteSchema>;
export type BookingEventInput = z.infer<typeof bookingEventInputSchema>;
export type SelectedAddonInput = z.infer<typeof selectedAddonInputSchema>;
export type PackageAddonInput = z.infer<typeof packageAddonSchema>;
```

- [ ] **Step 2: Build to check**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): Zod schemas for packages, bookings, addons, adjustments (A1.10)"
```

## Task A1.11: Run build + existing tests + sanity check

- [ ] **Step 1: Lint**

```bash
npm run lint
```

Expected: clean (or only pre-existing warnings unrelated to A1).

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Run existing test suite**

```bash
npm test
```

Expected: pass. Old code paths (which still use `booking_requests` via old types) should still work because:
- Migration 00017 renames the table; old code referencing `booking_requests` will fail.

Wait — that's a problem. We renamed the table but old code still references it. Read the next step.

- [ ] **Step 4: Decision point — code-side rename or compatibility view**

The migration in 00017 renames `booking_requests → bookings`. Existing application code references `supabase.from('booking_requests')` in many places. After migration 00017 is applied, these queries fail.

Two options:
- **(a) Search-and-replace** all `'booking_requests'` strings in `src/` to `'bookings'`. ~30+ occurrences. Lower-risk than a compatibility view but a wider diff.
- **(b)** Create a Postgres VIEW: `CREATE VIEW booking_requests AS SELECT * FROM bookings;` (with appropriate RLS). Old queries keep working; new code uses `bookings`.

**Recommended**: (a) — search-and-replace in this same A1 commit. Compatibility views in Postgres need policies of their own and complicate writes.

```bash
# Find all references
grep -rn "'booking_requests'" src/ --include="*.ts" --include="*.tsx"
grep -rn '"booking_requests"' src/ --include="*.ts" --include="*.tsx"
grep -rn '\bbooking_requests\b' src/ --include="*.ts" --include="*.tsx"
```

For each match: replace `'booking_requests'` → `'bookings'` and `booking_requests` (in TS type names, table names, etc.) → `bookings`. **Do NOT** rename `vendor_profiles.id → bookings.vendor_profile_id` FK field — that stays. Only rename references to the table itself.

Common locations:
- `src/services/booking.service.ts`
- `src/services/payment.service.ts`
- `src/app/api/bookings/request/route.ts`
- `src/app/api/bookings/[id]/quote/route.ts`
- `src/app/api/cron/tick/route.ts`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/bookings/page.tsx`
- `src/app/dashboard/bookings/[id]/page.tsx`

- [ ] **Step 5: Re-run build + tests**

```bash
npm run lint && npm run build && npm test
```

Expected: pass.

- [ ] **Step 6: Commit the rename**

```bash
git add -A
git commit -m "feat(refactor): rename booking_requests → bookings in app code (A1.11)"
```

## Task A1.12: Final A1 push

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Tag the A1-complete commit**

```bash
git tag a1-schema-complete -m "Sub-project A · Phase A1 schema migrations complete"
git push --tags
```

Used as the base for A2/A3/A4 worktrees.

---

# Phase A2 — Vendor side (parallel agent X)

Worktree: `a2/vendor-side` branched from `feat/sub-project-a-packages` at tag `a1-schema-complete`. PR target: umbrella branch `feat/sub-project-a-packages`. ~3–4 days unattended.

## Task A2.1: Create packages service layer

**Files:**
- Create: `src/services/packages.service.ts`
- Test: `tests/services/packages.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/packages.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPackage, listPackagesForVendor, deactivatePackage, hardDeletePackage } from '@/services/packages.service';
import { createTestSupabaseClient, createTestVendor } from '@/test/fixtures';

describe('packages.service', () => {
  let supabase: ReturnType<typeof createTestSupabaseClient>;
  let vendorId: string;

  beforeEach(async () => {
    supabase = createTestSupabaseClient();
    vendorId = await createTestVendor(supabase);
  });

  describe('createPackage', () => {
    it('creates a package with addons in a single transaction', async () => {
      const result = await createPackage(supabase, vendorId, {
        name: 'Engagement Session',
        description: 'Two-hour engagement shoot',
        base_price_cents: 80000,
        included_items: ['2 hours coverage', '50 edited photos'],
        max_guests: 50,
        duration_hours: 2,
        events_count: 1,
        featured_image_url: 'https://example.com/photo.jpg',
        gallery_image_urls: [],
        location_mode: 'couple_provides',
        addons: [{ name: 'Drone footage', price_delta_cents: 30000 }],
      });

      expect(result.error).toBeNull();
      expect(result.data?.package.name).toBe('Engagement Session');
      expect(result.data?.addons).toHaveLength(1);
      expect(result.data?.addons[0].name).toBe('Drone footage');
    });
  });

  describe('deactivatePackage', () => {
    it('blocks deactivation when it would leave 0 active packages', async () => {
      const pkg = await createPackage(supabase, vendorId, /* minimal valid input */);
      const result = await deactivatePackage(supabase, pkg.data!.package.id, vendorId);
      expect(result.error?.code).toBe('LAST_ACTIVE_PACKAGE');
    });

    it('allows deactivation when ≥1 other active package remains', async () => {
      await createPackage(supabase, vendorId, /* minimal valid */);
      const pkg2 = await createPackage(supabase, vendorId, /* minimal valid */);
      const result = await deactivatePackage(supabase, pkg2.data!.package.id, vendorId);
      expect(result.error).toBeNull();
    });
  });

  describe('hardDeletePackage', () => {
    it('blocks hard delete when active bookings reference the package', async () => {
      // setup: create package + create a booking with status='pending' referencing it
      // ...
      const result = await hardDeletePackage(supabase, pkgId, vendorId);
      expect(result.error?.code).toBe('ACTIVE_BOOKINGS_EXIST');
    });

    it('allows hard delete when only historical bookings reference', async () => {
      // setup: create package + booking with status='completed'
      const result = await hardDeletePackage(supabase, pkgId, vendorId);
      expect(result.error).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run tests/services/packages.service.test.ts
```

Expected: FAIL (functions don't exist yet).

- [ ] **Step 3: Implement the service**

```typescript
// src/services/packages.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatePackageInput, UpdatePackageInput } from '@/types';

const ACTIVE_BOOKING_STATUSES = [
  'pending', 'accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid',
] as const;

interface ServiceResult<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export async function createPackage(
  supabase: SupabaseClient,
  vendorProfileId: string,
  input: CreatePackageInput
): Promise<ServiceResult<{ package: any; addons: any[] }>> {
  const { addons, ...packageData } = input;

  // Compute display_order (append at end)
  const { count } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId);

  const { data: pkg, error: pkgError } = await supabase
    .from('packages')
    .insert({ ...packageData, vendor_profile_id: vendorProfileId, display_order: count ?? 0 })
    .select('*')
    .single();

  if (pkgError) return { data: null, error: { code: 'INSERT_FAILED', message: pkgError.message } };

  let createdAddons: any[] = [];
  if (addons.length > 0) {
    const addonRows = addons.map((a, i) => ({ ...a, package_id: pkg.id, display_order: i }));
    const { data, error: addonsError } = await supabase
      .from('package_addons')
      .insert(addonRows)
      .select('*');
    if (addonsError) {
      // Rollback package creation
      await supabase.from('packages').delete().eq('id', pkg.id);
      return { data: null, error: { code: 'ADDONS_FAILED', message: addonsError.message } };
    }
    createdAddons = data ?? [];
  }

  return { data: { package: pkg, addons: createdAddons }, error: null };
}

export async function updatePackage(
  supabase: SupabaseClient,
  packageId: string,
  vendorProfileId: string,
  input: UpdatePackageInput
): Promise<ServiceResult<{ package: any; addons: any[] }>> {
  const { addons, ...packageData } = input;

  // Verify ownership
  const { data: existing } = await supabase
    .from('packages')
    .select('id, vendor_profile_id')
    .eq('id', packageId)
    .single();
  if (!existing || existing.vendor_profile_id !== vendorProfileId) {
    return { data: null, error: { code: 'NOT_FOUND_OR_FORBIDDEN', message: 'Package not found or not yours' } };
  }

  const { data: pkg, error } = await supabase
    .from('packages')
    .update({ ...packageData, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('*')
    .single();
  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };

  // Addons replace pattern: delete missing, upsert provided
  if (addons !== undefined) {
    await supabase.from('package_addons').delete().eq('package_id', packageId);
    if (addons.length > 0) {
      const addonRows = addons.map((a, i) => ({ ...a, package_id: packageId, display_order: i }));
      await supabase.from('package_addons').insert(addonRows);
    }
  }

  const { data: currentAddons } = await supabase
    .from('package_addons')
    .select('*')
    .eq('package_id', packageId)
    .order('display_order');

  return { data: { package: pkg, addons: currentAddons ?? [] }, error: null };
}

export async function deactivatePackage(
  supabase: SupabaseClient,
  packageId: string,
  vendorProfileId: string
): Promise<ServiceResult<any>> {
  // Count other active packages
  const { count } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true)
    .neq('id', packageId);

  if ((count ?? 0) === 0) {
    return {
      data: null,
      error: {
        code: 'LAST_ACTIVE_PACKAGE',
        message: 'This is your only active package. You need at least one active package to remain searchable. Add another package first, or pause your profile in settings.',
      },
    };
  }

  const { data, error } = await supabase
    .from('packages')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('*')
    .single();

  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };
  return { data, error: null };
}

export async function setPackageActiveState(
  supabase: SupabaseClient,
  packageId: string,
  vendorProfileId: string,
  isActive: boolean
): Promise<ServiceResult<any>> {
  if (!isActive) return deactivatePackage(supabase, packageId, vendorProfileId);

  const { data, error } = await supabase
    .from('packages')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId)
    .select('*')
    .single();
  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };
  return { data, error: null };
}

export async function hardDeletePackage(
  supabase: SupabaseClient,
  packageId: string,
  vendorProfileId: string
): Promise<ServiceResult<{ deleted: true }>> {
  // Check 1: would this leave 0 active packages?
  const { count: activeOthers } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true)
    .neq('id', packageId);

  if ((activeOthers ?? 0) === 0) {
    return {
      data: null,
      error: { code: 'LAST_ACTIVE_PACKAGE', message: 'You must keep at least one active package.' },
    };
  }

  // Check 2: any active bookings referencing this package?
  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('package_id', packageId)
    .in('status', ACTIVE_BOOKING_STATUSES as unknown as string[])
    .limit(1);

  if (activeBookings && activeBookings.length > 0) {
    return {
      data: null,
      error: {
        code: 'ACTIVE_BOOKINGS_EXIST',
        message: 'This package has active bookings. Deactivate it instead so it stays linked to ongoing work.',
      },
    };
  }

  // Safe to hard delete; FK on bookings is ON DELETE SET NULL, addons cascade.
  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId);

  if (error) return { data: null, error: { code: 'DELETE_FAILED', message: error.message } };
  return { data: { deleted: true }, error: null };
}

export async function listPackagesForVendor(
  supabase: SupabaseClient,
  vendorProfileId: string,
  includeInactive = false
): Promise<ServiceResult<any[]>> {
  let query = supabase
    .from('packages')
    .select('*, addons:package_addons(*)')
    .eq('vendor_profile_id', vendorProfileId)
    .order('display_order');

  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return { data: null, error: { code: 'LIST_FAILED', message: error.message } };
  return { data: data ?? [], error: null };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run tests/services/packages.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/packages.service.ts tests/services/packages.service.test.ts
git commit -m "feat(packages): packages service layer with safety checks (A2.1)"
```

## Task A2.2: POST /api/packages route

**Files:**
- Create: `src/app/api/packages/route.ts`
- Test: `tests/api/packages.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/packages.test.ts
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/packages/route';
import { createMockRequest, createAuthenticatedSession } from '@/test/api-fixtures';

describe('POST /api/packages', () => {
  it('returns 401 when not authenticated', async () => {
    const req = createMockRequest({ method: 'POST', body: { /* valid */ } });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('creates a package for authenticated vendor', async () => {
    const { req, vendorProfileId } = await createAuthenticatedSession({ role: 'vendor' });
    req.body = {
      name: 'Test',
      description: 'Test',
      base_price_cents: 100000,
      included_items: [],
      max_guests: 50,
      duration_hours: 2,
      events_count: 1,
      featured_image_url: 'https://example.com/photo.jpg',
      gallery_image_urls: [],
      location_mode: 'couple_provides',
      addons: [],
    };
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.package.name).toBe('Test');
  });

  it('returns 400 on invalid input', async () => {
    const { req } = await createAuthenticatedSession({ role: 'vendor' });
    req.body = { name: '' };  // missing required fields
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npx vitest run tests/api/packages.test.ts
```

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/packages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createPackage } from '@/services/packages.service';
import { createPackageSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  // Find vendor profile for this user
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!vendorProfile) throw new HttpError(403, 'No vendor profile found for this user');

  const body = await request.json();
  const parsed = createPackageSchema.parse(body);

  const result = await createPackage(supabase, vendorProfile.id, parsed);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
});
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/packages/route.ts tests/api/packages.test.ts
git commit -m "feat(api): POST /api/packages route (A2.2)"
```

## Task A2.3: PATCH /api/packages/[id] route

**Files:**
- Create: `src/app/api/packages/[id]/route.ts`
- Modify: `tests/api/packages.test.ts` (append PATCH cases)

- [ ] **Step 1: Append failing tests**

```typescript
describe('PATCH /api/packages/[id]', () => {
  it('updates a package owned by the authenticated vendor', async () => {
    const { req, packageId } = await createPackageAsVendor();
    req.body = { name: 'Updated Name' };
    const res = await PATCH(req, { params: { id: packageId } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.package.name).toBe('Updated Name');
  });

  it('returns 403 when trying to update another vendor\'s package', async () => {
    const { req } = await createAuthenticatedSession({ role: 'vendor' });
    req.body = { name: 'Hijack' };
    const res = await PATCH(req, { params: { id: 'other-vendor-pkg-id' } });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/app/api/packages/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { updatePackage, hardDeletePackage, deactivatePackage } from '@/services/packages.service';
import { updatePackageSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

async function getVendorProfileId(supabase: ReturnType<Awaited<ReturnType<typeof requireUser>>['supabase']>, userId: string) {
  const { data } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id ?? null;
}

export const PATCH = withErrorBoundary(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const { user, supabase } = await requireUser();
  const vendorProfileId = await getVendorProfileId(supabase, user.id);
  if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

  const body = await request.json();
  const parsed = updatePackageSchema.parse(body);

  const result = await updatePackage(supabase, params.id, vendorProfileId, parsed);
  if (result.error) {
    const status = result.error.code === 'NOT_FOUND_OR_FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
});

export const DELETE = withErrorBoundary(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const { user, supabase } = await requireUser();
  const vendorProfileId = await getVendorProfileId(supabase, user.id);
  if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

  const url = new URL(request.url);
  const hard = url.searchParams.get('hard') === 'true';

  const result = hard
    ? await hardDeletePackage(supabase, params.id, vendorProfileId)
    : await deactivatePackage(supabase, params.id, vendorProfileId);

  if (result.error) {
    const status = result.error.code === 'LAST_ACTIVE_PACKAGE' || result.error.code === 'ACTIVE_BOOKINGS_EXIST'
      ? 409
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
});
```

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/packages/[id]/route.ts tests/api/packages.test.ts
git commit -m "feat(api): PATCH + DELETE /api/packages/[id] with safety checks (A2.3)"
```

## Task A2.4: PATCH /api/packages/[id]/is-active route

**Files:**
- Create: `src/app/api/packages/[id]/is-active/route.ts`

- [ ] **Step 1: Test + implement**

Mirror the pattern from A2.3 DELETE. Body: `{ is_active: boolean }`. Use `setPackageActiveState` from the service. Return 409 on LAST_ACTIVE_PACKAGE.

```typescript
// src/app/api/packages/[id]/is-active/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setPackageActiveState } from '@/services/packages.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

const schema = z.object({ is_active: z.boolean() });

export const PATCH = withErrorBoundary(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const { user, supabase } = await requireUser();
  const { data: vendorProfile } = await supabase.from('vendor_profiles').select('id').eq('user_id', user.id).single();
  if (!vendorProfile) throw new HttpError(403, 'No vendor profile');

  const { is_active } = schema.parse(await request.json());
  const result = await setPackageActiveState(supabase, params.id, vendorProfile.id, is_active);

  if (result.error) {
    const status = result.error.code === 'LAST_ACTIVE_PACKAGE' ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
});
```

- [ ] **Step 2: Commit**

## Task A2.5: POST /api/bookings/[id]/accept route

**Files:**
- Create: `src/app/api/bookings/[id]/accept/route.ts`
- Modify: `src/services/booking.service.ts` (add `acceptBooking` function)

- [ ] **Step 1: Add service function**

```typescript
// In src/services/booking.service.ts
export async function acceptBooking(supabase: SupabaseClient, bookingId: string, vendorUserId: string) {
  // Verify caller is the vendor for this booking, status='pending'
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, vendor_profile_id, status, package_id, vendor_profiles!inner(user_id)')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: { code: 'NOT_FOUND', message: 'Booking not found' }, status: 404 };
  // @ts-ignore — vendor_profiles join shape
  if (booking.vendor_profiles.user_id !== vendorUserId) {
    return { error: { code: 'FORBIDDEN', message: 'Not your booking' }, status: 403 };
  }
  if (booking.status !== 'pending') {
    return { error: { code: 'INVALID_STATE', message: `Cannot accept from status ${booking.status}` }, status: 409 };
  }

  // Pull vendor_notes_template from package
  const { data: pkg } = await supabase
    .from('packages')
    .select('vendor_notes_template')
    .eq('id', booking.package_id)
    .single();

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'accepted',
      adjustment_amount_cents: 0,
      vendor_notes: pkg?.vendor_notes_template ?? null,
      expires_at: expiresAt,
    })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error) return { error: { code: 'UPDATE_FAILED', message: error.message }, status: 500 };
  return { data, status: 200 };
}
```

- [ ] **Step 2: Implement the route**

```typescript
// src/app/api/bookings/[id]/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { acceptBooking } from '@/services/booking.service';
import { createDepositCheckout } from '@/services/payment.service';
import { sendVendorAcceptedEmail } from '@/lib/email/resend';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const { user, supabase } = await requireUser();

  const result = await acceptBooking(supabase, params.id, user.id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  // Create Stripe deposit checkout
  const checkout = await createDepositCheckout(supabase, params.id);
  if (checkout.error) return NextResponse.json({ error: checkout.error }, { status: 500 });

  // Fire email — fire-and-forget
  supabase.from('bookings').select('couple_user_id, users:couple_user_id(email)').eq('id', params.id).single().then(({ data }) => {
    const coupleEmail = (data?.users as any)?.email;
    if (coupleEmail) sendVendorAcceptedEmail(coupleEmail, /* vendor name */ '', result.data.total_price_cents, checkout.data!.url).catch(console.error);
  });

  return NextResponse.json({ data: { booking: result.data, deposit_checkout_url: checkout.data!.url } }, { status: 200 });
});
```

- [ ] **Step 3: Tests + commit**

```bash
git add src/app/api/bookings/[id]/accept/ src/services/booking.service.ts tests/
git commit -m "feat(api): POST /api/bookings/[id]/accept route (A2.5)"
```

## Task A2.6: POST /api/bookings/[id]/adjust route

**Files:**
- Create: `src/app/api/bookings/[id]/adjust/route.ts`
- Modify: `src/services/booking.service.ts` (add `adjustBookingQuote`)

- [ ] **Step 1: Service function**

```typescript
// In src/services/booking.service.ts
import { type AdjustQuoteInput } from '@/types';

export async function adjustBookingQuote(
  supabase: SupabaseClient,
  bookingId: string,
  vendorUserId: string,
  input: AdjustQuoteInput
) {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, vendor_profile_id, status, negotiation_round_count, package_id, vendor_profiles!inner(user_id)')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: { code: 'NOT_FOUND' }, status: 404 };
  // @ts-ignore
  if (booking.vendor_profiles.user_id !== vendorUserId) return { error: { code: 'FORBIDDEN' }, status: 403 };
  if (!['pending', 'adjusted_quote_declined'].includes(booking.status)) {
    return { error: { code: 'INVALID_STATE', message: `Cannot adjust from ${booking.status}` }, status: 409 };
  }

  // Pull vendor_notes_template if not yet set
  const { data: pkg } = await supabase.from('packages').select('vendor_notes_template').eq('id', booking.package_id).single();

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'adjusted_quote_sent',
      adjustment_amount_cents: input.adjustment_amount_cents,
      adjustment_reason: input.reason,
      adjustment_explanation: input.explanation ?? null,
      negotiation_round_count: booking.negotiation_round_count + 1,
      vendor_notes: pkg?.vendor_notes_template ?? null,
      expires_at: expiresAt,
    })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error) return { error: { code: 'UPDATE_FAILED', message: error.message }, status: 500 };
  return { data, status: 200 };
}
```

- [ ] **Step 2: Route**

```typescript
// src/app/api/bookings/[id]/adjust/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adjustBookingQuote } from '@/services/booking.service';
import { adjustQuoteSchema } from '@/types';
import { sendAdjustedQuoteEmail } from '@/lib/email/resend';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const { user, supabase } = await requireUser();
  const parsed = adjustQuoteSchema.parse(await request.json());

  const result = await adjustBookingQuote(supabase, params.id, user.id, parsed);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  // Fire email
  supabase.from('bookings').select('couple_user_id, users:couple_user_id(email), vendor_profiles(business_name)').eq('id', params.id).single().then(({ data }) => {
    const coupleEmail = (data?.users as any)?.email;
    const vendorName = (data?.vendor_profiles as any)?.business_name ?? 'Vendor';
    if (coupleEmail) sendAdjustedQuoteEmail(coupleEmail, vendorName, result.data.total_price_cents, parsed.reason, parsed.explanation, params.id).catch(console.error);
  });

  return NextResponse.json({ data: result.data }, { status: 200 });
});
```

- [ ] **Step 3: Tests + commit**

```bash
git add src/app/api/bookings/[id]/adjust/ src/services/booking.service.ts
git commit -m "feat(api): POST /api/bookings/[id]/adjust route (A2.6)"
```

## Task A2.7: Package editor page (list view)

**Files:**
- Create: `src/app/dashboard/profile/packages/page.tsx`

- [ ] **Step 1: Implement**

```typescript
// src/app/dashboard/profile/packages/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { listPackagesForVendor } from '@/services/packages.service';

export const dynamic = 'force-dynamic';

export default async function PackagesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: vendorProfile } = await supabase.from('vendor_profiles').select('id').eq('user_id', user.id).single();
  if (!vendorProfile) redirect('/dashboard/profile');

  const { data: packages = [] } = await listPackagesForVendor(supabase, vendorProfile.id, /* includeInactive */ true);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Packages</h1>
          <p className="text-muted-foreground">
            Couples can only book vendors with at least one active package.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/profile/packages/new">+ Add Package</Link>
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card className="p-12 text-center">
          <h2 className="text-lg font-semibold">No packages yet</h2>
          <p className="mt-2 text-muted-foreground">Add your first package to go live in search.</p>
          <Button className="mt-6" asChild>
            <Link href="/dashboard/profile/packages/new">Add your first package</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg }: { pkg: any }) {
  return (
    <Card className={`overflow-hidden ${!pkg.is_active ? 'opacity-60' : ''}`}>
      <img src={pkg.featured_image_url} alt={pkg.name} className="h-40 w-full object-cover" />
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold">{pkg.name}</h3>
          {!pkg.is_active && <span className="text-xs uppercase text-muted-foreground">Inactive</span>}
        </div>
        <p className="text-sm text-muted-foreground">${(pkg.base_price_cents / 100).toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{pkg.duration_hours}h · up to {pkg.max_guests} guests</p>
        <div className="pt-2 flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/profile/packages/${pkg.id}`}>Edit</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/profile/packages/page.tsx
git commit -m "feat(ui): vendor packages list page (A2.7)"
```

## Task A2.8: Package edit/create form page

**Files:**
- Create: `src/app/dashboard/profile/packages/new/page.tsx`
- Create: `src/app/dashboard/profile/packages/[id]/page.tsx`
- Create: `src/components/forms/PackageEditorForm.tsx`

- [ ] **Step 1: Form component**

The form is shared between create and edit. Key fields per spec §3.1. Use react-hook-form + zod resolver (check `package.json` for `react-hook-form` and `@hookform/resolvers`). Embed `PackageAddonsEditor` (next task).

Show fields: name, description (textarea), base_price (dollar input), max_guests (number), duration_hours (number), events_count (1–5 stepper), location_mode (radio: "Couple specifies" / "At my location"), featured_image_url (UploadThing picker with portfolio reuse), gallery_image_urls (up to 2 additional), included_items (chip input — use `react-tag-input` or similar; or simple `\n`-separated textarea), vendor_notes_template (textarea, ≤1000 chars), addons list (PackageAddonsEditor).

Submit handler: POST to `/api/packages` (create) or PATCH to `/api/packages/[id]` (edit). On success: `router.push('/dashboard/profile/packages')`.

- [ ] **Step 2: New page**

```typescript
// src/app/dashboard/profile/packages/new/page.tsx
'use client';
import { PackageEditorForm } from '@/components/forms/PackageEditorForm';

export default function NewPackagePage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Add Package</h1>
      <PackageEditorForm mode="create" />
    </div>
  );
}
```

- [ ] **Step 3: Edit page**

```typescript
// src/app/dashboard/profile/packages/[id]/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { PackageEditorForm } from '@/components/forms/PackageEditorForm';

export const dynamic = 'force-dynamic';

export default async function EditPackagePage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pkg } = await supabase
    .from('packages')
    .select('*, addons:package_addons(*), vendor_profiles!inner(user_id)')
    .eq('id', params.id)
    .single();

  if (!pkg || (pkg as any).vendor_profiles.user_id !== user.id) notFound();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Edit Package</h1>
      <PackageEditorForm mode="edit" initial={pkg as any} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

## Task A2.9: PackageAddonsEditor component

**Files:**
- Create: `src/components/forms/PackageAddonsEditor.tsx`

Simple list editor. Each row: name input, price delta input, remove button. "Add add-on" button at bottom (capped at 8 rows). Returns array of `{name, price_delta_cents}` objects up to the form parent.

```typescript
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Addon { name: string; price_delta_cents: number; }

interface Props {
  initial?: Addon[];
  onChange: (addons: Addon[]) => void;
  max?: number;
}

export function PackageAddonsEditor({ initial = [], onChange, max = 8 }: Props) {
  const [addons, setAddons] = useState<Addon[]>(initial);

  function update(next: Addon[]) {
    setAddons(next);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {addons.map((a, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            className="flex-1 rounded border p-2"
            placeholder="Add-on name (e.g. Drone footage)"
            value={a.name}
            onChange={(e) => update(addons.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
          />
          <div className="flex items-center gap-1">
            <span>$</span>
            <input
              type="number"
              className="w-24 rounded border p-2"
              value={a.price_delta_cents / 100}
              onChange={(e) => update(addons.map((x, j) => j === i ? { ...x, price_delta_cents: Math.round(parseFloat(e.target.value || '0') * 100) } : x))}
            />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => update(addons.filter((_, j) => j !== i))}>×</Button>
        </div>
      ))}
      {addons.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => update([...addons, { name: '', price_delta_cents: 0 }])}>
          + Add-on
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 1: Implement + commit**

## Task A2.10: Update VendorProfileForm with base_address + visibility

**Files:**
- Modify: `src/components/forms/VendorProfileForm.tsx`

- [ ] **Step 1: Add base_address fields**

Append to the form: Google Places Autocomplete input for base address (reuses the same `GooglePlacesAutocomplete` component built in A3.10 — coordinate via spec §8 contract). On selection, fills `base_address_line_1`, `base_city`, `base_state`, `base_postal_code`, `base_google_place_id`.

Below: checkbox/toggle for `base_address_public` with copy: *"Most home-studio vendors keep this off. Your address stays private until a couple pays their deposit. Your city and state are always public."*

Submit handler: PATCH `/api/vendor-profile` with the new fields included.

- [ ] **Step 2: Commit**

## Task A2.11: Onboarding gate + pause toggle on dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Possibly: `src/components/dashboard/PauseProfileToggle.tsx` (new)

- [ ] **Step 1: Compute gate state on dashboard server-side**

After loading user/profile in `dashboard/page.tsx`, also load active package count:

```typescript
const { count: activePackageCount } = await supabase
  .from('packages')
  .select('id', { count: 'exact', head: true })
  .eq('vendor_profile_id', vendorProfile.id)
  .eq('is_active', true);
```

If `activePackageCount === 0` and role==='vendor': render a prominent banner card:

```tsx
<Card className="bg-yellow-50 border-yellow-200 p-6">
  <h2 className="font-semibold">Add a package to go live</h2>
  <p className="text-sm">Couples can only book vendors with at least one active package.</p>
  <Button asChild className="mt-4"><Link href="/dashboard/profile/packages/new">Add Package</Link></Button>
</Card>
```

If `vendor_profile.is_active === false` AND `activePackageCount >= 1`: yellow "Profile paused" banner with a one-click resume button (PATCH `/api/vendor-profile` with `is_active: true`).

- [ ] **Step 2: PauseProfileToggle in profile settings**

In the existing vendor profile settings page (find where profile is edited), add a clear toggle for "Pause profile from search" that posts `is_active: false` (or true).

- [ ] **Step 3: Commit**

## Task A2.12: Vendor bookings page accept/adjust CTAs

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`
- Modify: `src/app/dashboard/bookings/[id]/page.tsx` (or wherever the vendor reads a single booking)
- Create: `src/components/booking/VendorAdjustQuoteForm.tsx`

- [ ] **Step 1: Render accept/adjust CTAs**

For each pending booking the vendor sees, render two buttons:
- "Accept at $X" → POST `/api/bookings/[id]/accept`
- "Adjust quote" → opens a modal with `VendorAdjustQuoteForm`

For bookings in `adjusted_quote_declined`: render single CTA "Send revised quote" → same modal.

- [ ] **Step 2: VendorAdjustQuoteForm**

Form fields: `new_total` (numeric, dollars), reason dropdown (the 7 enum values), explanation (textarea — required when reason='other'). Submit: compute `adjustment_amount_cents = (new_total - base_total_cents) * 100`, POST `/api/bookings/[id]/adjust` with `{ adjustment_amount_cents, reason, explanation }`.

- [ ] **Step 3: Commit**

## Task A2.13–A2.16: Lint, build, tests, push

- [ ] Run `npm run lint && npm run build && npm test`
- [ ] Fix any errors
- [ ] Commit any straggler files
- [ ] Push branch
- [ ] Open PR from `a2/vendor-side` into umbrella `feat/sub-project-a-packages`

---

# Phase A3 — Couple side (parallel agent Y)

Worktree: `a3/couple-side` branched from `feat/sub-project-a-packages` at tag `a1-schema-complete`. ~3–4 days unattended.

## Task A3.1: POST /api/bookings route (new shape)

**Files:**
- Create: `src/app/api/bookings/route.ts`
- Modify: `src/services/booking.service.ts` (add `createBooking` with new shape)

- [ ] **Step 1: Service function**

```typescript
// In src/services/booking.service.ts
import { type CreateBookingInput } from '@/types';

export async function createBooking(
  supabase: SupabaseClient,
  coupleUserId: string,
  input: CreateBookingInput
) {
  // Fetch package + verify it's active
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, base_price_cents, events_count, is_active')
    .eq('id', input.package_id)
    .single();

  if (!pkg || !pkg.is_active) {
    return { error: { code: 'PACKAGE_UNAVAILABLE', message: 'Package not available' }, status: 400 };
  }

  if (input.events.length > pkg.events_count) {
    return { error: { code: 'TOO_MANY_EVENTS', message: `Package supports up to ${pkg.events_count} events` }, status: 400 };
  }

  // Validate addons belong to package
  if (input.selected_addons.length > 0) {
    const addonIds = input.selected_addons.map(a => a.addon_id);
    const { data: validAddons } = await supabase
      .from('package_addons')
      .select('id')
      .eq('package_id', input.package_id)
      .in('id', addonIds);
    if ((validAddons?.length ?? 0) !== addonIds.length) {
      return { error: { code: 'INVALID_ADDON', message: 'One or more add-ons do not belong to this package' }, status: 400 };
    }
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  // Insert booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      couple_user_id: coupleUserId,
      vendor_profile_id: input.vendor_profile_id,
      package_id: input.package_id,
      package_name_snapshot: pkg.name,
      package_base_price_cents_snapshot: pkg.base_price_cents,
      selected_addons: input.selected_addons,
      guest_count: input.guest_count,
      special_requests: input.special_requests ?? null,
      couple_full_name: input.couple_full_name,
      couple_contact_phone: input.couple_contact_phone,
      status: 'pending',
      expires_at: expiresAt,
      negotiation_round_count: 0,
      // trigger computes total_price_cents
    })
    .select('*')
    .single();

  if (bookingError) return { error: { code: 'INSERT_FAILED', message: bookingError.message }, status: 500 };

  // Insert booking_events
  const eventRows = input.events.map(e => ({ ...e, booking_id: booking.id }));
  const { data: events, error: eventsError } = await supabase
    .from('booking_events')
    .insert(eventRows)
    .select('*');

  if (eventsError) {
    // Rollback booking
    await supabase.from('bookings').delete().eq('id', booking.id);
    return { error: { code: 'EVENTS_FAILED', message: eventsError.message }, status: 500 };
  }

  return { data: { booking, events: events ?? [] }, status: 201 };
}
```

- [ ] **Step 2: Route**

```typescript
// src/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/services/booking.service';
import { createBookingSchema } from '@/types';
import { sendBookingRequestEmail, sendBookingReceiptEmail } from '@/lib/email/resend';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(request, 'booking:create', { limit: 10, window: '1 m' }, user.id);
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const parsed = createBookingSchema.parse(await request.json());

  const result = await createBooking(supabase, user.id, parsed);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  // Fire emails (vendor + couple receipt)
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('business_name, users:user_id(email)')
    .eq('id', parsed.vendor_profile_id)
    .single();
  const { data: couple } = await supabase.from('users').select('email').eq('id', user.id).single();

  if (vendor) {
    const vendorEmail = (vendor.users as any)?.email;
    if (vendorEmail) sendBookingRequestEmail(vendorEmail, vendor.business_name, result.data!.booking.id).catch(console.error);
  }
  if (couple?.email) {
    sendBookingReceiptEmail(couple.email, result.data!.booking.id).catch(console.error);
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
});
```

- [ ] **Step 3: Tests + commit**

## Task A3.2: POST /api/bookings/[id]/accept-adjusted

**Files:**
- Create: `src/app/api/bookings/[id]/accept-adjusted/route.ts`
- Modify: `src/services/booking.service.ts` (add `coupleAcceptAdjusted`)

- [ ] **Step 1: Service function**

```typescript
export async function coupleAcceptAdjusted(
  supabase: SupabaseClient,
  bookingId: string,
  coupleUserId: string
) {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, couple_user_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: { code: 'NOT_FOUND' }, status: 404 };
  if (booking.couple_user_id !== coupleUserId) return { error: { code: 'FORBIDDEN' }, status: 403 };
  if (booking.status !== 'adjusted_quote_sent') {
    return { error: { code: 'INVALID_STATE', message: `Cannot accept-adjusted from ${booking.status}` }, status: 409 };
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'accepted', expires_at: expiresAt })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error) return { error: { code: 'UPDATE_FAILED', message: error.message }, status: 500 };
  return { data, status: 200 };
}
```

- [ ] **Step 2: Route mirrors A2.5 pattern but uses `coupleAcceptAdjusted` + `sendCoupleAcceptedAdjustedEmail`** (fires email to vendor; sends checkout URL to couple via response).

- [ ] **Step 3: Tests + commit**

## Task A3.3: POST /api/bookings/[id]/decline-adjusted

**Files:**
- Create: `src/app/api/bookings/[id]/decline-adjusted/route.ts`
- Modify: `src/services/booking.service.ts` (add `coupleDeclineAdjusted`)

- [ ] **Step 1: Service function**

```typescript
export async function coupleDeclineAdjusted(supabase: SupabaseClient, bookingId: string, coupleUserId: string) {
  // Same validation as coupleAcceptAdjusted; only status differs in update
  // Set status='adjusted_quote_declined', reset expires_at
  // ... [same pattern]
}
```

- [ ] **Step 2: Route + email** (`sendCoupleDeclinedEmail` to vendor)

- [ ] **Step 3: Tests + commit**

## Task A3.4: Update couple-view VendorProfile to render packages

**Files:**
- Modify: `src/components/marketplace/VendorProfile.tsx`
- Create: `src/components/marketplace/PackageGrid.tsx`
- Create: `src/components/marketplace/PackageDetailModal.tsx`

- [ ] **Step 1: PackageGrid (Layout C — photo-forward)**

```typescript
// src/components/marketplace/PackageGrid.tsx
'use client';
import { useState } from 'react';
import Image from 'next/image';
import { PackageDetailModal } from './PackageDetailModal';

interface Package { id: string; name: string; description: string; base_price_cents: number; duration_hours: number; max_guests: number; events_count: number; featured_image_url: string; gallery_image_urls: string[]; included_items: string[]; addons: { id: string; name: string; price_delta_cents: number }[]; vendor_notes_template: string | null; location_mode: 'couple_provides' | 'at_vendor'; }

export function PackageGrid({ packages, vendorSlug }: { packages: Package[]; vendorSlug: string }) {
  const [selected, setSelected] = useState<Package | null>(null);

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className="text-left rounded-xl overflow-hidden border hover:shadow-lg transition group"
          >
            <div className="relative aspect-[4/3] bg-gray-100">
              <Image src={p.featured_image_url} alt={p.name} fill className="object-cover" />
            </div>
            <div className="p-4 space-y-2">
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground">
                {p.duration_hours}h · up to {p.max_guests} guests
                {p.events_count > 1 && ` · ${p.events_count} events`}
              </p>
              <div className="flex justify-between items-center pt-2">
                <span className="font-bold text-lg">${(p.base_price_cents / 100).toLocaleString()}</span>
                <span className="text-sm text-primary group-hover:underline">Select →</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <PackageDetailModal
          pkg={selected}
          vendorSlug={vendorSlug}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: PackageDetailModal**

Modal showing full description, included items, addon toggles with live total, gallery photos, vendor_notes_template preview, "Continue to booking" CTA.

```typescript
// src/components/marketplace/PackageDetailModal.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function PackageDetailModal({ pkg, vendorSlug, onClose }: { pkg: any; vendorSlug: string; onClose: () => void }) {
  const router = useRouter();
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const addonsTotal = pkg.addons.filter((a: any) => toggled.has(a.id)).reduce((sum: number, a: any) => sum + a.price_delta_cents, 0);
  const total = pkg.base_price_cents + addonsTotal;

  async function handleContinue() {
    const selected_addons = pkg.addons
      .filter((a: any) => toggled.has(a.id))
      .map((a: any) => ({ addon_id: a.id, name: a.name, price_delta_cents: a.price_delta_cents }));

    // Save selection to signed cookie via API or just localStorage for now; spec calls for signed cookie
    const res = await fetch('/api/booking-selection', {
      method: 'POST',
      body: JSON.stringify({ package_id: pkg.id, selected_addons }),
    });
    if (res.ok) router.push(`/vendors/${vendorSlug}/book`);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pkg.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <img src={pkg.featured_image_url} className="w-full rounded-lg" alt="" />
          <p className="text-sm text-muted-foreground">{pkg.description}</p>
          {pkg.included_items.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Included</h4>
              <ul className="text-sm space-y-1 list-disc list-inside">
                {pkg.included_items.map((i: string, idx: number) => <li key={idx}>{i}</li>)}
              </ul>
            </div>
          )}
          {pkg.addons.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Add-ons (optional)</h4>
              <div className="space-y-2">
                {pkg.addons.map((a: any) => (
                  <label key={a.id} className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-accent">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggled.has(a.id)}
                        onChange={(e) => {
                          const next = new Set(toggled);
                          if (e.target.checked) next.add(a.id); else next.delete(a.id);
                          setToggled(next);
                        }}
                      />
                      <span>{a.name}</span>
                    </span>
                    <span className="text-sm font-mono">
                      {a.price_delta_cents >= 0 ? '+' : ''}${(a.price_delta_cents / 100).toLocaleString()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {pkg.vendor_notes_template && (
            <div className="text-xs italic text-muted-foreground p-3 rounded bg-muted">
              <strong>After booking, vendor will send:</strong> {pkg.vendor_notes_template}
            </div>
          )}
          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-lg font-bold">Total: ${(total / 100).toLocaleString()}</span>
            <Button onClick={handleContinue}>Continue to booking</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire PackageGrid into VendorProfile component**

In `src/components/marketplace/VendorProfile.tsx`: load packages server-side (or via existing prop), render PackageGrid section replacing the old price-range UI.

- [ ] **Step 4: Booking-selection cookie endpoint**

Create `src/app/api/booking-selection/route.ts`:

```typescript
// POST: writes signed cookie. GET: returns selection.
// Use iron-session or jose for signing (check existing patterns).
```

- [ ] **Step 5: Commit**

## Task A3.5: Booking form page

**Files:**
- Create: `src/app/(marketplace)/vendors/[slug]/book/page.tsx`
- Create: `src/components/forms/BookingForm.tsx`
- Create: `src/components/forms/EventRow.tsx`
- Create: `src/components/forms/EventTypeAutocomplete.tsx`
- Create: `src/components/forms/GooglePlacesAutocomplete.tsx`

- [ ] **Step 1: Set up Google Places Autocomplete component**

Use `@googlemaps/js-api-loader` (check package.json; install if missing: `npm install @googlemaps/js-api-loader`). Required env var: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Component returns structured address parts via callback.

```typescript
// src/components/forms/GooglePlacesAutocomplete.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface PlaceData {
  location_name?: string;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
  google_place_id: string;
}

interface Props {
  value?: Partial<PlaceData>;
  onChange: (place: PlaceData) => void;
  placeholder?: string;
}

export function GooglePlacesAutocomplete({ value, onChange, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      libraries: ['places'],
    });

    loader.load().then(() => {
      if (!inputRef.current) return;
      // @ts-ignore
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;
        const get = (type: string) => place.address_components?.find(c => c.types.includes(type))?.long_name;
        onChange({
          location_name: place.name || undefined,
          address_line_1: `${get('street_number') ?? ''} ${get('route') ?? ''}`.trim(),
          city: get('locality') ?? '',
          state: get('administrative_area_level_1') ?? '',
          postal_code: get('postal_code') ?? '',
          google_place_id: place.place_id ?? '',
        });
      });
    });
  }, [onChange]);

  return (
    <input
      ref={inputRef}
      type="text"
      className="w-full rounded border p-2"
      placeholder={placeholder ?? 'Where will this event take place?'}
      defaultValue={value?.address_line_1 ?? ''}
    />
  );
}
```

- [ ] **Step 2: EventTypeAutocomplete with cultural seed list**

```typescript
// src/components/forms/EventTypeAutocomplete.tsx
'use client';
const EVENT_TYPE_SEED = [
  // South Asian / Muslim
  'Nikah', 'Mehndi', 'Henna', 'Mayoon', 'Dholki', 'Walima', 'Engagement', 'Rukhsati',
  // South Asian / Hindu
  'Sangeet', 'Haldi', 'Baraat', 'Wedding Ceremony', 'Reception', 'Roka', 'Garba', 'Dandiya',
  // Arab
  'Katb el-Kitab', 'Zaffa', 'Henna Night',
  // Western generic
  'Bridal Shower', 'Bachelorette', 'Rehearsal Dinner',
  // Life events
  'Birthday', 'Sweet 16', 'Quinceañera', 'Bar Mitzvah', 'Bat Mitzvah', 'Graduation', 'Anniversary', 'Baby Shower', 'Aqiqah',
  // Other
  'Corporate Event', 'Religious Ceremony', 'Other',
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function EventTypeAutocomplete({ value, onChange }: Props) {
  // Simple datalist-based autocomplete; HTML5 supports free-text fallback natively
  return (
    <>
      <input
        type="text"
        list="event-types"
        className="w-full rounded border p-2"
        placeholder="e.g. Mehndi, Walima, Sangeet, Birthday"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="event-types">
        {EVENT_TYPE_SEED.map(t => <option key={t} value={t} />)}
      </datalist>
    </>
  );
}
```

- [ ] **Step 3: EventRow component**

Renders one event input: date, start time, end time, event_type_label, location, optional guest_count_override. Includes the "Same as Event 1" button for rows ≥ 2. Pre-fills vendor's base_address when `package.location_mode='at_vendor'` (until couple toggles "different location").

(Implementation here ~120 lines — follow the React form patterns of the rest of the codebase.)

- [ ] **Step 4: BookingForm**

Top-level component for `/vendors/[slug]/book` page. State: `events: BookingEventInput[]` (starts with 1 row), `coupleFullName`, `couplePhone`, `guestCount`, `specialRequests`. Renders all sections per spec §4.2. Submit: POST `/api/bookings` with the full payload. Redirect to `/dashboard/bookings/[id]` on success.

- [ ] **Step 5: Page**

```typescript
// src/app/(marketplace)/vendors/[slug]/book/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { BookingForm } from '@/components/forms/BookingForm';

export const dynamic = 'force-dynamic';

export default async function BookPage({ params }: { params: { slug: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/vendors/${params.slug}/book`);

  // Load vendor + package selection from cookie
  const cookieStore = await cookies();
  const selectionCookie = cookieStore.get('booking_selection');
  if (!selectionCookie) redirect(`/vendors/${params.slug}`);

  const selection = JSON.parse(selectionCookie.value);  // {package_id, selected_addons}

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, slug, business_name, base_city, base_state, base_address_line_1, base_postal_code, base_google_place_id, base_address_public')
    .eq('slug', params.slug)
    .single();
  if (!vendor) notFound();

  const { data: pkg } = await supabase
    .from('packages')
    .select('*, addons:package_addons(*)')
    .eq('id', selection.package_id)
    .single();
  if (!pkg || !pkg.is_active) notFound();

  return <BookingForm vendor={vendor as any} pkg={pkg as any} selectedAddons={selection.selected_addons} />;
}
```

- [ ] **Step 6: Commit**

## Task A3.6: Couple booking detail page — status-aware rendering

**Files:**
- Modify: `src/app/dashboard/bookings/[id]/page.tsx`
- Create: `src/components/booking/AdjustmentReview.tsx`

- [ ] **Step 1: Adjust the page to handle each status**

Status: `pending` → show "Waiting for vendor (72h timer)" + package summary.
Status: `accepted` → show "Pay deposit" CTA with Stripe checkout URL.
Status: `adjusted_quote_sent` → render `<AdjustmentReview>` component.
Status: `deposit_paid` → show vendor full address + vendor_notes + events list.
Status: `completed` → show review request CTA + completion summary.
Status: `cancelled` → show cancellation reason + history.

- [ ] **Step 2: AdjustmentReview component**

```typescript
// src/components/booking/AdjustmentReview.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  bookingId: string;
  originalSubtotalCents: number;  // package base + addons (before adjustment)
  adjustmentCents: number;
  reason: string;
  explanation: string | null;
}

export function AdjustmentReview({ bookingId, originalSubtotalCents, adjustmentCents, reason, explanation }: Props) {
  const [busy, setBusy] = useState(false);

  async function action(endpoint: 'accept-adjusted' | 'decline-adjusted') {
    setBusy(true);
    const res = await fetch(`/api/bookings/${bookingId}/${endpoint}`, { method: 'POST' });
    if (res.ok) {
      const json = await res.json();
      if (endpoint === 'accept-adjusted' && json.data?.deposit_checkout_url) {
        window.location.href = json.data.deposit_checkout_url;
      } else {
        window.location.reload();
      }
    } else {
      setBusy(false);
      alert('Action failed');
    }
  }

  const finalTotal = originalSubtotalCents + adjustmentCents;
  const reasonLabels: Record<string, string> = {
    travel: 'Travel distance',
    guest_count: 'Guest count over package limit',
    peak_date: 'Peak-season date',
    custom: 'Custom requirements',
    setup_complexity: 'Setup complexity',
    discount: 'Discount applied',
    other: 'Other',
  };

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <h3 className="font-semibold">Vendor sent an adjusted quote</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Package + add-ons</p>
          <p className="text-lg">${(originalSubtotalCents / 100).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Adjustment</p>
          <p className={`text-lg ${adjustmentCents >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {adjustmentCents >= 0 ? '+' : ''}${(adjustmentCents / 100).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{reasonLabels[reason]}</p>
          {explanation && <p className="text-xs italic mt-1">"{explanation}"</p>}
        </div>
      </div>
      <div className="border-t pt-3 flex items-center justify-between">
        <span className="font-bold text-lg">Adjusted total: ${(finalTotal / 100).toLocaleString()}</span>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => action('accept-adjusted')} disabled={busy}>Accept adjusted quote</Button>
        <Button variant="outline" onClick={() => action('decline-adjusted')} disabled={busy}>Decline</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

## Task A3.7–A3.11: Lint, build, tests, push, PR

Same as A2.13–A2.16.

---

# Phase A4 — Payment + emails (parallel agent Z)

Worktree: `a4/payment-emails` branched from `feat/sub-project-a-packages` at `a1-schema-complete`. ~2 days unattended.

## Task A4.1: createDepositCheckout reads total_price_cents

**Files:**
- Modify: `src/services/payment.service.ts`

- [ ] **Step 1: Find current implementation**

```bash
grep -n "createDepositCheckout\|vendor_quote_amount" src/services/payment.service.ts
```

- [ ] **Step 2: Update to read total_price_cents**

Replace any reference to `vendor_quote_amount` in the deposit calculation with `total_price_cents`. The 30% deposit calc stays the same (`Math.floor(total_price_cents * 0.30)`).

Also: update vendor payout calc (70%) to use `total_price_cents`.

- [ ] **Step 3: Tests + commit**

## Task A4.2: Stripe webhook handler — handle new statuses

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Audit current handler**

```bash
grep -n "booking" src/app/api/webhooks/stripe/route.ts
```

- [ ] **Step 2: Add no-op pass-through for new statuses**

On `payment_intent.succeeded`: existing handler transitions booking to `deposit_paid`. Make sure it handles the case where `booking.status === 'accepted'` (new) — previously it was `quoted`. Confirm the transition logic accepts both.

- [ ] **Step 3: Commit**

## Task A4.3: New email — sendBookingReceiptEmail

**Files:**
- Modify: `src/lib/email/resend.ts`

- [ ] **Step 1: Append function**

```typescript
export async function sendBookingReceiptEmail(coupleEmail: string, bookingId: string): Promise<boolean> {
  return sendEmail({
    to: coupleEmail,
    subject: 'Booking Request Sent',
    html: `
      <h2>Your booking request is in</h2>
      <p>Your booking request has been sent to the vendor. They have 72 hours to respond — accept at the listed price or send an adjusted quote.</p>
      <p>You'll be emailed as soon as they respond.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View your booking</a></p>
      ${FOOTER}
    `,
  });
}
```

- [ ] **Step 2: Commit**

## Task A4.4: New email — sendVendorAcceptedEmail

```typescript
export async function sendVendorAcceptedEmail(
  coupleEmail: string,
  vendorName: string,
  totalCents: number,
  depositCheckoutUrl: string
): Promise<boolean> {
  return sendEmail({
    to: coupleEmail,
    subject: `${vendorName} accepted your booking`,
    html: `
      <h2>${vendorName} accepted your booking</h2>
      <p>Total: <strong>${fmtUsd(totalCents)}</strong></p>
      <p>Pay your hold deposit (30%) to confirm. The vendor's full address and instructions will appear in your dashboard once the deposit is processed.</p>
      <p><a href="${depositCheckoutUrl}">Pay deposit</a></p>
      ${FOOTER}
    `,
  });
}
```

- [ ] Commit.

## Task A4.5: New email — sendAdjustedQuoteEmail

```typescript
export async function sendAdjustedQuoteEmail(
  coupleEmail: string,
  vendorName: string,
  newTotalCents: number,
  reason: string,
  explanation: string | null,
  bookingId: string
): Promise<boolean> {
  const reasonLabel = {
    travel: 'travel distance',
    guest_count: 'guest count over package',
    peak_date: 'peak-season date',
    custom: 'custom requirements',
    setup_complexity: 'setup complexity',
    discount: 'a discount applied',
    other: 'other (see explanation)',
  }[reason] ?? reason;
  return sendEmail({
    to: coupleEmail,
    subject: `${vendorName} sent an adjusted quote`,
    html: `
      <h2>Adjusted quote from ${vendorName}</h2>
      <p>New total: <strong>${fmtUsd(newTotalCents)}</strong></p>
      <p>Reason: ${reasonLabel}${explanation ? ` — "${explanation}"` : ''}</p>
      <p>Review and either accept the adjusted total or decline.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">Review quote</a></p>
      ${FOOTER}
    `,
  });
}
```

## Task A4.6: New email — sendCoupleAcceptedAdjustedEmail

```typescript
export async function sendCoupleAcceptedAdjustedEmail(
  vendorEmail: string,
  coupleName: string,
  totalCents: number,
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: `${coupleName} accepted your adjusted quote`,
    html: `
      <h2>Quote accepted</h2>
      <p>${coupleName} accepted your adjusted quote of ${fmtUsd(totalCents)} and will pay the hold deposit shortly.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View booking</a></p>
      ${FOOTER}
    `,
  });
}
```

## Task A4.7: New email — sendCoupleDeclinedEmail

```typescript
export async function sendCoupleDeclinedEmail(
  vendorEmail: string,
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: 'Couple declined your adjusted quote',
    html: `
      <h2>Adjusted quote declined</h2>
      <p>The couple declined your adjusted quote. You have <strong>72 hours</strong> to send a revised quote, or the booking will auto-cancel.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">Send revised quote</a></p>
      ${FOOTER}
    `,
  });
}
```

## Task A4.8: New email — sendBookingConfirmedEmail (deposit paid, address reveal)

```typescript
export async function sendBookingConfirmedEmail(
  coupleEmail: string,
  vendorName: string,
  vendorFullAddress: string,
  vendorNotes: string | null,
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: coupleEmail,
    subject: `Booking Confirmed — ${vendorName}`,
    html: `
      <h2>Booking confirmed</h2>
      <p>Your deposit has been processed. Here are the details:</p>
      <p><strong>Vendor location:</strong> ${vendorFullAddress}</p>
      ${vendorNotes ? `<p><strong>From your vendor:</strong> ${vendorNotes}</p>` : ''}
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View booking details</a></p>
      ${FOOTER}
    `,
  });
}
```

## Task A4.9: New email — sendBookingAutoCancelEmail

```typescript
export async function sendBookingAutoCancelEmail(
  email: string,
  recipientRole: 'couple' | 'vendor',
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Booking auto-cancelled',
    html: `
      <h2>Booking auto-cancelled</h2>
      <p>This booking was automatically cancelled because there was no response within 72 hours.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View booking</a></p>
      ${FOOTER}
    `,
  });
}
```

## Task A4.10: Update existing emails

**Files:**
- Modify: `src/lib/email/resend.ts`

- [ ] **Step 1: Update sendBookingRequestEmail**

Drop the budget reference (it's gone), add the package name:

```typescript
export async function sendBookingRequestEmail(
  vendorEmail: string,
  vendorName: string,
  bookingId: string  // changed signature: only ID needed now
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: 'New Booking Request',
    html: `
      <h2>New Booking Request</h2>
      <p>Hi ${vendorName},</p>
      <p>You have a new booking request. Review it within 72 hours — accept at the package price or send an adjusted quote.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View Request</a></p>
      ${FOOTER}
    `,
  });
}
```

- [ ] **Step 2: Update sendDepositConfirmationEmail**

Still fired, but now includes vendor address reveal (handled by sendBookingConfirmedEmail to couple — sendDepositConfirmationEmail to vendor stays similar).

- [ ] **Step 3: Commit**

## Task A4.11: Promote sendEmail console.error to logger.error

**Files:**
- Modify: `src/lib/email/resend.ts`

- [ ] **Step 1: Find logger import**

```bash
grep -rn "from '@/lib/logger'" src/ | head
```

Use the existing logger. If none: import `console.error` for now and note logger upgrade.

- [ ] **Step 2: Replace**

```typescript
import { logger } from '@/lib/logger';  // adjust path

async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const { error } = await client().emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    if (error) {
      logger.error('[sendEmail] Resend error', { to: options.to, subject: options.subject, error });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('[sendEmail] Exception', { to: options.to, subject: options.subject, err });
    return false;
  }
}
```

- [ ] **Step 3: Commit**

## Task A4.12: Extend cron sweep for new statuses

**Files:**
- Modify: `src/app/api/cron/tick/route.ts`

- [ ] **Step 1: Find current sweep**

```bash
grep -n "expires_at\|pending\|status" src/app/api/cron/tick/route.ts
```

- [ ] **Step 2: Extend the WHERE clause**

Update the sweep that cancels expired bookings: change from `status = 'pending'` to `status IN ('pending', 'adjusted_quote_sent', 'adjusted_quote_declined')`.

When sweeping → fire `sendBookingAutoCancelEmail` for both parties.

- [ ] **Step 3: Tests + commit**

## Task A4.13–A4.15: Lint, build, tests, push, PR

---

# Phase A5 — Cleanup (sequential, supervised)

After A2/A3/A4 all merged into umbrella, run A5 solo.

## Task A5.1: Backfill total_price_cents on legacy rows

```sql
-- supabase/migrations/00022_a5_backfill_total_price.sql
UPDATE bookings
SET total_price_cents = COALESCE(vendor_quote_amount, 1000)  -- fallback $10 for any rows that lost their quote
WHERE total_price_cents = 0;
```

Apply via Supabase SQL editor.

## Task A5.2: Add total_price_positive constraint

```sql
-- supabase/migrations/00023_a5_add_total_price_constraint.sql
ALTER TABLE bookings ADD CONSTRAINT total_price_positive CHECK (total_price_cents > 0);
```

## Task A5.3: Drop old columns

```sql
-- supabase/migrations/00024_a5_drop_old_booking_columns.sql
ALTER TABLE bookings DROP COLUMN IF EXISTS event_date;
ALTER TABLE bookings DROP COLUMN IF EXISTS event_type;
ALTER TABLE bookings DROP COLUMN IF EXISTS budget_min_cents;
ALTER TABLE bookings DROP COLUMN IF EXISTS budget_max_cents;
ALTER TABLE bookings DROP COLUMN IF EXISTS vendor_quote_amount;
ALTER TABLE bookings DROP COLUMN IF EXISTS deposit_amount;
```

## Task A5.4: Drop vendor_profiles legacy

```sql
-- supabase/migrations/00025_a5_drop_vendor_profile_price.sql
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS price_min;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS price_max;
```

## Task A5.5: Drop event_type enum

```sql
-- supabase/migrations/00026_a5_drop_event_type_enum.sql
DROP TYPE IF EXISTS event_type;
```

## Task A5.6: Final RLS audit

In Supabase SQL editor:
```sql
SELECT schemaname, tablename, policyname, cmd, qual::text, with_check::text
FROM pg_policies
WHERE tablename IN ('packages', 'package_addons', 'booking_events', 'bookings', 'vendor_profiles')
ORDER BY tablename, policyname;
```

Manually inspect output: confirm anonymous users can SELECT active packages, vendors can only edit their own rows, couples can only see their own booking_events.

## Task A5.7: End-to-end smoke test in dev

Manually:
1. Create a fresh vendor account.
2. Define a package with addons and `events_count=3`.
3. Toggle `base_address_public=false`, set base address.
4. Create a fresh couple account.
5. Browse the vendor, click a package, toggle 2 addons, click "Continue to booking."
6. Fill the booking form with 3 events at different venues (or same venue using "Same as Event 1").
7. Submit. Verify booking_request email arrives for vendor.
8. Vendor accepts at base. Verify accepted email arrives for couple with deposit link.
9. Couple pays Stripe test card. Verify deposit_paid status + address reveals + vendor_notes shown.
10. Run cron tick manually after backdating an `expires_at`: verify auto-cancel + emails.
11. Test adjust flow: create another booking → vendor adjusts → couple declines → vendor re-adjusts → couple accepts → pays.

If all green: ready for A5.8.

## Task A5.8: Umbrella PR to main

```bash
git checkout main
git pull
git checkout feat/sub-project-a-packages
git push
gh pr create --base main --head feat/sub-project-a-packages \
  --title "feat(packages): Sub-project A — packages + booking model overhaul" \
  --body-file docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md  # or a shorter summary
```

Review the diff (a lot of changes), squash-merge.

---

## Self-review

**Spec coverage:**
- §1 scope → reflected in phase plan ✓
- §2 data model → A1.1–A1.7 ✓
- §3 vendor surfaces → A2.1–A2.12 ✓
- §4 couple surfaces → A3.1–A3.6 ✓
- §5 payment + emails → A4.1–A4.12 ✓
- §6 phasing → entire plan structure follows it ✓
- §7 defaults → embedded in each task ✓
- §8 API contracts → A2.2–A2.6, A3.1–A3.3 ✓

**Type consistency**:
- `createPackageSchema` (A1.10) used by POST /api/packages (A2.2) ✓
- `createBookingSchema` (A1.10) used by POST /api/bookings (A3.1) ✓
- Service function names consistent: `createPackage`, `updatePackage`, `deactivatePackage`, `hardDeletePackage`, `setPackageActiveState`, `createBooking`, `acceptBooking`, `adjustBookingQuote`, `coupleAcceptAdjusted`, `coupleDeclineAdjusted`
- Email function names consistent across A4.3–A4.10 and call sites in A2.5, A2.6, A3.1, A3.2, A3.3

**Placeholder scan**:
- All migration SQL references the spec where SQL is verbatim — not a placeholder, just a precise pointer
- All API routes have complete code samples or follow named existing patterns
- No TBD / TODO / "implement later" in the plan
