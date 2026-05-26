# Baazar Onboarding Welcome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement [the onboarding welcome spec](../specs/2026-05-26-baazar-onboarding-welcome-design.md) — install the cult-ui Onboarding primitive via shadcn CLI, build two role-specific composed flows (`CoupleOnboarding`, `VendorOnboarding`), and auto-trigger them on first dashboard visit via an `OnboardingGate` mounted in the dashboard layout. Persist `users.onboarding_completed_at` + `users.onboarding_data` to prevent re-firing. Vendor flow's category answer writes to `vendor_profiles.category` so the existing Sub-project B wizard pre-fills.

**Architecture:** `OnboardingGate` (client, mounted in dashboard layout) reads role + `onboarding_completed_at` from props; renders `<CoupleOnboarding>` or `<VendorOnboarding>` modal when timestamp is null. Both flows are 3-step (Welcome features → Personalize → Tips) composing the cult-ui primitives + role-specific content from `welcome-data.ts`. Submit/skip → `POST /api/users/onboarding-complete` → updates user record (and for vendors, upserts `vendor_profiles.category` so the wizard pre-fills).

**Tech Stack:** Next.js 14 App Router · React 18 · TypeScript · Tailwind 3.4 · Supabase Postgres · zod · vitest · **cult-ui Onboarding primitive (NEW via shadcn CLI)**.

**Branch:** `feat/baazar-onboarding-welcome` (already created, spec committed at `5c823d0`).

**Out of scope (deferred):** Account-menu "Welcome tour" reopen link, Resend welcome emails, per-step drop-off analytics, A/B variants, custom illustrations (Day 1 uses lucide icons + simple static placeholders), personalization-driven recommendations, vendor "Established" badge from years_in_business, editable onboarding answers.

---

## File Structure

| File                                                                  | Action      | Responsibility                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/onboarding.tsx`                                    | **Install** | Cult-ui Onboarding primitives via `npx shadcn@latest add https://cult-ui.com/r/onboarding.json`. Provides `Onboarding`, `Onboarding.Step`, `Onboarding.StepIndicator`, `Onboarding.Navigation`, `ChoiceGroup`, `FeatureCarousel`, `TipsList`, `useOnboarding` hook. |
| `supabase/migrations/00043_users_onboarding.sql`                      | **Create**  | Add `onboarding_completed_at: timestamptz` + `onboarding_data: jsonb` columns to `users` + partial index on pending lookups.                                                                                                                                        |
| `src/types/database.types.ts`                                         | **Modify**  | Add the 2 new columns to `users` Row / Insert / Update.                                                                                                                                                                                                             |
| `src/lib/onboarding/welcome-data.ts`                                  | **Create**  | Pure data exports: `COUPLE_FEATURES`, `COUPLE_TIPS`, `VENDOR_FEATURES`, `VENDOR_TIPS` + `YEARS_IN_BUSINESS` enum + `COMMISSION_CATEGORIES` (filters out Bridal Wear/Decor/Venue from VENDOR_CATEGORIES).                                                            |
| `src/__tests__/lib/onboarding/welcome-data.test.ts`                   | **Create**  | TDD tests: features/tips length + shape + role-scoping; COMMISSION_CATEGORIES excludes Coming Soon slugs.                                                                                                                                                           |
| `src/lib/onboarding/onboarding-complete-validation.ts`                | **Create**  | Zod schema for the POST body. Discriminated union on `skipped`; couple data (event_date + categories) vs vendor data (category + years_in_business).                                                                                                                |
| `src/__tests__/lib/onboarding/onboarding-complete-validation.test.ts` | **Create**  | TDD tests for the schema.                                                                                                                                                                                                                                           |
| `src/app/api/users/onboarding-complete/route.ts`                      | **Create**  | POST handler. Auth-gated. Validates body via zod. Updates `users` record; for vendors, also upserts `vendor_profiles.category`.                                                                                                                                     |
| `src/__tests__/api/users-onboarding-complete.test.ts`                 | **Create**  | TDD tests for the route.                                                                                                                                                                                                                                            |
| `src/components/onboarding/CoupleOnboarding.tsx`                      | **Create**  | Client component, `'use client'`. 3-step modal with couple-specific content.                                                                                                                                                                                        |
| `src/components/onboarding/VendorOnboarding.tsx`                      | **Create**  | Client component, `'use client'`. 3-step modal with vendor-specific content.                                                                                                                                                                                        |
| `src/components/onboarding/OnboardingGate.tsx`                        | **Create**  | Client component. Receives `role` + `onboardingCompleted` (boolean) as props from server. Auto-opens the correct modal when not yet completed.                                                                                                                      |
| `src/app/dashboard/layout.tsx`                                        | **Modify**  | Fetch `onboarding_completed_at` alongside `role`. Mount `<OnboardingGate role={...} onboardingCompleted={...} />` inside the layout.                                                                                                                                |
| `DESIGN.md`                                                           | **Modify**  | Add `onboarding-welcome:` entry to `components:` block.                                                                                                                                                                                                             |

---

## Task 1: Install cult-ui Onboarding primitive

**Files:**

- Install: `src/components/ui/onboarding.tsx` (via shadcn CLI)

- [ ] **Step 1: Run the shadcn add command**

```bash
npx shadcn@latest add https://cult-ui.com/r/onboarding.json
```

Expected: Prompts about overwrites if any (accept defaults). Creates `src/components/ui/onboarding.tsx` (or `.tsx` alongside other ui primitives). Verify the install location:

```bash
ls src/components/ui/ | grep -i onboarding
```

Expected: `onboarding.tsx` (file present).

If the CLI installs to a different path (e.g., `src/components/cult-ui/onboarding.tsx`), STOP and report — the spec assumes `src/components/ui/onboarding.tsx`.

- [ ] **Step 2: Verify exports**

```bash
grep -E "^export " src/components/ui/onboarding.tsx | head -20
```

Expected: exports include (at minimum) `Onboarding`, `ChoiceGroup`, `FeatureCarousel`, `TipsList`, `useOnboarding`. The compound exports (`Onboarding.Step`, `Onboarding.StepIndicator`, `Onboarding.Navigation`) are likely attached to the `Onboarding` namespace via `Onboarding.Step = Step`, etc.

If any of these exports are missing, note in the implementer report and we may need to build them ourselves.

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean. If cult-ui pulls in any peer deps (e.g., `framer-motion` is already installed from PR #25; verify no new missing deps), the typecheck flags them — install via `npm install <missing-dep>` and proceed.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/onboarding.tsx package.json package-lock.json
git commit -m "feat(onboarding): install cult-ui Onboarding primitive"
```

---

## Task 2: Migration 00043 + apply to dev + sync types

**Files:**

- Create: `supabase/migrations/00043_users_onboarding.sql`
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Write the migration**

Write to `supabase/migrations/00043_users_onboarding.sql`:

```sql
-- Adds onboarding state to the users table:
--   - onboarding_completed_at: timestamp when the user finishes (or skips)
--     the welcome onboarding modal. NULL = not yet completed; the dashboard
--     OnboardingGate auto-fires the modal on next render.
--   - onboarding_data: jsonb stash of the user's answers. Shape varies by role:
--       Couple: { event_date: 'YYYY-MM-DD' | null, categories: string[] }
--       Vendor: { years_in_business: '0-1' | '1-3' | '3-10' | '10+' }
--                (category is written directly to vendor_profiles.category
--                 so the existing Sub-project B wizard pre-fills it.)
--     For skipped sessions: NULL.
--
-- The partial index covers the lookup that runs on every dashboard render
-- ("is this user still in onboarding?") so we don't full-scan users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb;

CREATE INDEX IF NOT EXISTS users_onboarding_pending_idx
  ON users (id)
  WHERE onboarding_completed_at IS NULL;
```

- [ ] **Step 2: Apply to dev DB**

The dev DB password for this session is `$uperLocked$300` — pass via inline `PGPASSWORD=` only, never echo/persist.

```bash
PGPASSWORD='$uperLocked$300' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00043_users_onboarding.sql
```

Expected output:

```
ALTER TABLE
CREATE INDEX
```

- [ ] **Step 3: Sanity check**

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "\d users" | grep -E "onboarding_completed_at|onboarding_data|users_onboarding_pending_idx"
```

Expected: 2 column rows + 1 index reference.

- [ ] **Step 4: Sync database.types.ts**

Find the `users` table type in `src/types/database.types.ts` (grep for `email: string` and `role: string` or similar to locate the right table). Add to `Row`:

```ts
onboarding_completed_at: string | null;
onboarding_data: Json | null;
```

Add to `Insert` and `Update` (both with `?` since they're optional):

```ts
onboarding_completed_at?: string | null
onboarding_data?: Json | null
```

If the file uses `import type { Json } from ...` at the top, reuse the existing `Json` type. If not, the cleanest type is `Record<string, unknown> | null` or `unknown` cast appropriately.

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00043_users_onboarding.sql src/types/database.types.ts
git commit -m "feat(onboarding): users.onboarding_completed_at + onboarding_data columns"
```

---

## Task 3: welcome-data.ts + tests (TDD)

**Files:**

- Create: `src/lib/onboarding/welcome-data.ts`
- Create: `src/__tests__/lib/onboarding/welcome-data.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/onboarding/welcome-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  COUPLE_FEATURES,
  COUPLE_TIPS,
  VENDOR_FEATURES,
  VENDOR_TIPS,
  YEARS_IN_BUSINESS,
  COMMISSION_CATEGORIES,
} from '@/lib/onboarding/welcome-data';
import { VENDOR_CATEGORIES } from '@/lib/utils';

describe('welcome-data', () => {
  it('has 3 features for each role', () => {
    expect(COUPLE_FEATURES).toHaveLength(3);
    expect(VENDOR_FEATURES).toHaveLength(3);
  });

  it('has 3 tips for each role', () => {
    expect(COUPLE_TIPS).toHaveLength(3);
    expect(VENDOR_TIPS).toHaveLength(3);
  });

  it('every feature has id + title + description + icon', () => {
    for (const f of [...COUPLE_FEATURES, ...VENDOR_FEATURES]) {
      expect(f.id).toBeTruthy();
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.icon).toBeDefined();
    }
  });

  it('every tip has number + text', () => {
    for (const t of [...COUPLE_TIPS, ...VENDOR_TIPS]) {
      expect(typeof t.number).toBe('number');
      expect(t.text.length).toBeGreaterThan(0);
    }
  });

  it('YEARS_IN_BUSINESS has 4 buckets', () => {
    expect(YEARS_IN_BUSINESS).toEqual(['0-1', '1-3', '3-10', '10+']);
  });

  it('COMMISSION_CATEGORIES excludes Coming Soon slugs (bridal_wear, decor, venue)', () => {
    expect(COMMISSION_CATEGORIES).not.toContain('bridal_wear');
    expect(COMMISSION_CATEGORIES).not.toContain('decor');
    expect(COMMISSION_CATEGORIES).not.toContain('venue');
  });

  it('COMMISSION_CATEGORIES is a subset of VENDOR_CATEGORIES', () => {
    for (const slug of COMMISSION_CATEGORIES) {
      expect(VENDOR_CATEGORIES).toContain(slug);
    }
  });

  it('COMMISSION_CATEGORIES has 10 entries (13 total minus 3 Coming Soon)', () => {
    expect(COMMISSION_CATEGORIES).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/lib/onboarding/welcome-data.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/onboarding/welcome-data'`.

- [ ] **Step 3: Write the data module**

Write to `src/lib/onboarding/welcome-data.ts`:

```ts
import {
  Search,
  Heart,
  ShieldCheck,
  Eye,
  CalendarCheck,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import { VENDOR_CATEGORIES } from '@/lib/utils';

export interface OnboardingFeature {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Image preview for the right column. Day 1: empty string (renders placeholder); future: licensed assets. */
  image: string;
}

export interface OnboardingTip {
  number: number;
  text: string;
}

export const COUPLE_FEATURES: readonly OnboardingFeature[] = [
  {
    id: 'browse',
    icon: Search,
    title: 'Browse verified vendors',
    description:
      'Search Chicago vendors curated for cultural weddings — photographers, mehndi artists, caterers, and more.',
    image: '',
  },
  {
    id: 'save',
    icon: Heart,
    title: 'Save & compare',
    description:
      'Heart the vendors you love. Compare packages, pricing, and availability side-by-side.',
    image: '',
  },
  {
    id: 'book',
    icon: ShieldCheck,
    title: 'Book with confidence',
    description:
      "Small hold deposits via Stripe. Full refund if the vendor doesn't confirm within 72 hours.",
    image: '',
  },
];

export const COUPLE_TIPS: readonly OnboardingTip[] = [
  {
    number: 1,
    text: 'Click the heart on any vendor card to save them. Your shortlist lives in your dashboard.',
  },
  {
    number: 2,
    text: 'Submitting a booking request sends it to the vendor — they respond within 72 hours with their quote. You only pay the hold deposit if you accept.',
  },
  {
    number: 3,
    text: "For non-standard requests (multi-day events, custom catering, large guest counts), use the Custom Request card on a vendor's profile to brief them directly.",
  },
];

export const VENDOR_FEATURES: readonly OnboardingFeature[] = [
  {
    id: 'discovered',
    icon: Eye,
    title: 'Get discovered',
    description:
      "Chicago couples search verified vendors in your category. Show up where they're already looking.",
    image: '',
  },
  {
    id: 'calendar',
    icon: CalendarCheck,
    title: 'Manage your calendar',
    description:
      'Block dates, set capacity, prevent double-bookings. We automatically check availability before accepting bookings.',
    image: '',
  },
  {
    id: 'paid',
    icon: CreditCard,
    title: 'Get paid securely',
    description:
      "Stripe holds the deposit when a couple books. You're paid out after the event completes. No chasing invoices.",
    image: '',
  },
];

export const VENDOR_TIPS: readonly OnboardingTip[] = [
  {
    number: 1,
    text: "Complete your profile (basics, photos, packages) to publish to the marketplace. Couples can't book you until you publish.",
  },
  {
    number: 2,
    text: 'Set your response SLA under Profile → Settings. Couples see this on your card — fast responders book more.',
  },
  {
    number: 3,
    text: 'Keep your calendar up to date. Blocked dates prevent surprise double-bookings and protect your reputation.',
  },
];

export const YEARS_IN_BUSINESS = ['0-1', '1-3', '3-10', '10+'] as const;
export type YearsInBusiness = (typeof YEARS_IN_BUSINESS)[number];

/**
 * The 10 commission-model categories vendors can pick during onboarding.
 * Excludes bridal_wear, decor, venue (Coming Soon — flat-fee infrastructure
 * lands in a future sub-project).
 */
const COMING_SOON_SLUGS = new Set(['bridal_wear', 'decor', 'venue']);
export const COMMISSION_CATEGORIES: readonly string[] = VENDOR_CATEGORIES.filter(
  (slug) => !COMING_SOON_SLUGS.has(slug)
);
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/lib/onboarding/welcome-data.test.ts
```

Expected: 8/8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/welcome-data.ts src/__tests__/lib/onboarding/welcome-data.test.ts
git commit -m "feat(onboarding): welcome-data — features, tips, commission categories"
```

---

## Task 4: onboarding-complete-validation.ts + tests (TDD)

**Files:**

- Create: `src/lib/onboarding/onboarding-complete-validation.ts`
- Create: `src/__tests__/lib/onboarding/onboarding-complete-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/onboarding/onboarding-complete-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { onboardingCompleteSchema } from '@/lib/onboarding/onboarding-complete-validation';

describe('onboardingCompleteSchema', () => {
  it('accepts a skipped session (data: null)', () => {
    const r = onboardingCompleteSchema.safeParse({ skipped: true, data: null });
    expect(r.success).toBe(true);
  });

  it('rejects skipped:true with non-null data', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: true,
      data: { event_date: '2026-10-17', categories: ['photography'] },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid couple submission', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: '2026-10-17', categories: ['photography', 'mehndi'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a couple submission with null event_date (still planning)', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: null, categories: ['photography'] },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a couple submission with malformed event_date', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: '10/17/2026', categories: ['photography'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a couple submission with 0 categories', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: null, categories: [] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a couple submission with 6 categories', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: {
        event_date: null,
        categories: ['photography', 'mehndi', 'dj', 'catering', 'hair_makeup', 'carts'],
      },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid vendor submission', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { category: 'photography', years_in_business: '3-10' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a vendor submission with invalid years_in_business', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { category: 'photography', years_in_business: 'forever' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a vendor submission with empty category', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { category: '', years_in_business: '3-10' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an entirely malformed body', () => {
    const r = onboardingCompleteSchema.safeParse({ foo: 'bar' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/lib/onboarding/onboarding-complete-validation.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/onboarding/onboarding-complete-validation'`.

- [ ] **Step 3: Write the schema**

Write to `src/lib/onboarding/onboarding-complete-validation.ts`:

```ts
import { z } from 'zod';
import { YEARS_IN_BUSINESS } from './welcome-data';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const coupleDataSchema = z.object({
  event_date: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD').nullable(),
  categories: z.array(z.string().min(1)).min(1).max(5),
});

const vendorDataSchema = z.object({
  category: z.string().min(1),
  years_in_business: z.enum(YEARS_IN_BUSINESS),
});

export const onboardingCompleteSchema = z.discriminatedUnion('skipped', [
  z.object({
    skipped: z.literal(true),
    data: z.null(),
  }),
  z.object({
    skipped: z.literal(false),
    data: z.union([coupleDataSchema, vendorDataSchema]),
  }),
]);

export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;
export type CoupleOnboardingData = z.infer<typeof coupleDataSchema>;
export type VendorOnboardingData = z.infer<typeof vendorDataSchema>;

/** Type guard: discriminates between couple and vendor data shapes. */
export function isVendorData(
  data: CoupleOnboardingData | VendorOnboardingData
): data is VendorOnboardingData {
  return 'category' in data && 'years_in_business' in data;
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/lib/onboarding/onboarding-complete-validation.test.ts
```

Expected: 11/11 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/onboarding-complete-validation.ts src/__tests__/lib/onboarding/onboarding-complete-validation.test.ts
git commit -m "feat(onboarding): zod schema for /api/users/onboarding-complete"
```

---

## Task 5: POST /api/users/onboarding-complete + tests (TDD)

**Files:**

- Create: `src/app/api/users/onboarding-complete/route.ts`
- Create: `src/__tests__/api/users-onboarding-complete.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/api/users-onboarding-complete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/users/onboarding-complete/route';

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/users/onboarding-complete', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function buildSupabase(opts: {
  user?: { id: string } | null;
  userRole?: 'couple' | 'vendor';
  userUpdateError?: { message: string } | null;
  vendorUpsertError?: { message: string } | null;
}) {
  const userUpdate = vi.fn().mockResolvedValue({ error: opts.userUpdateError ?? null });
  const vendorUpsert = vi.fn().mockResolvedValue({ error: opts.vendorUpsertError ?? null });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.userRole ? { role: opts.userRole } : null,
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: opts.userUpdateError ?? null }),
          })),
        };
      }
      if (table === 'vendor_profiles') {
        return {
          upsert: vendorUpsert,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    userUpdate,
    vendorUpsert,
  };
}

describe('POST /api/users/onboarding-complete', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const sb = buildSupabase({ user: null });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ skipped: true, data: null }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'couple' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ foo: 'bar' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on couple completion', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'couple' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(
      makePostRequest({
        skipped: false,
        data: { event_date: '2026-10-17', categories: ['photography'] },
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('returns 200 on vendor completion + upserts vendor_profiles.category', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'vendor' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(
      makePostRequest({
        skipped: false,
        data: { category: 'photography', years_in_business: '3-10' },
      })
    );
    expect(res.status).toBe(200);
    expect(sb.vendorUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-1', category: 'photography' }),
      expect.objectContaining({ onConflict: 'user_id' })
    );
  });

  it('returns 200 on skip (data: null)', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'couple' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ skipped: true, data: null }));
    expect(res.status).toBe(200);
  });

  it('returns 200 even if vendor_profiles upsert fails (non-fatal)', async () => {
    const sb = buildSupabase({
      user: { id: 'u-1' },
      userRole: 'vendor',
      vendorUpsertError: { message: 'duplicate row' },
    });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(
      makePostRequest({
        skipped: false,
        data: { category: 'photography', years_in_business: '3-10' },
      })
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/api/users-onboarding-complete.test.ts
```

Expected: FAIL with `Cannot find module '@/app/api/users/onboarding-complete/route'`.

- [ ] **Step 3: Write the route**

Write to `src/app/api/users/onboarding-complete/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  onboardingCompleteSchema,
  isVendorData,
} from '@/lib/onboarding/onboarding-complete-validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth required' }, { status: 401 });
  }

  const parsed = onboardingCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const input = parsed.data;
  const now = new Date().toISOString();

  // For vendor completion (not skipped, has category + years_in_business):
  // upsert vendor_profiles.category so the existing wizard pre-fills it.
  // Stash only years_in_business in users.onboarding_data (category lives
  // in vendor_profiles).
  let userOnboardingData: Record<string, unknown> | null = null;

  if (input.skipped) {
    userOnboardingData = null;
  } else if (isVendorData(input.data)) {
    const { error: upsertError } = await supabase
      .from('vendor_profiles')
      .upsert({ user_id: user.id, category: input.data.category }, { onConflict: 'user_id' });
    if (upsertError) {
      // Non-fatal: log + proceed. The user can change category in the wizard.
      logger.error('vendor_profiles category upsert failed', upsertError, {
        user_id: user.id,
        category: input.data.category,
      });
    }
    userOnboardingData = { years_in_business: input.data.years_in_business };
  } else {
    // Couple data: store as-is
    userOnboardingData = {
      event_date: input.data.event_date,
      categories: input.data.categories,
    };
  }

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({
      onboarding_completed_at: now,
      onboarding_data: userOnboardingData,
    })
    .eq('id', user.id);

  if (userUpdateError) {
    logger.error('users onboarding update failed', userUpdateError, { user_id: user.id });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  logger.info('onboarding_completed', {
    user_id: user.id,
    skipped: input.skipped,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/api/users-onboarding-complete.test.ts
```

Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/onboarding-complete/route.ts src/__tests__/api/users-onboarding-complete.test.ts
git commit -m "feat(onboarding): POST /api/users/onboarding-complete"
```

---

## Task 6: CoupleOnboarding component

**Files:**

- Create: `src/components/onboarding/CoupleOnboarding.tsx`

No unit tests (DOM-heavy); visual verification in Task 9 covers behavior.

- [ ] **Step 1: Write the component**

Write to `src/components/onboarding/CoupleOnboarding.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Onboarding,
  ChoiceGroup,
  FeatureCarousel,
  TipsList,
  useOnboarding,
} from '@/components/ui/onboarding';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { COUPLE_FEATURES, COUPLE_TIPS, COMMISSION_CATEGORIES } from '@/lib/onboarding/welcome-data';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

const STEP_CONFIG = [
  {
    title: 'Welcome to Baazar',
    description: "Chicago's marketplace for cultural wedding vendors. Here's what you can do.",
  },
  {
    title: 'Tell us about your event',
    description: 'Two quick questions so we can show you the most relevant vendors.',
  },
  {
    title: "You're ready to start",
    description: 'Three things to remember as you explore.',
  },
];

export interface CoupleOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoupleOnboarding({ open, onOpenChange }: CoupleOnboardingProps) {
  const router = useRouter();
  const [eventDate, setEventDate] = React.useState<string>('');
  const [categories, setCategories] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  async function submitOrSkip(skipped: boolean) {
    setSubmitting(true);
    try {
      const body = skipped
        ? { skipped: true, data: null }
        : {
            skipped: false,
            data: {
              event_date: eventDate || null,
              categories,
            },
          };
      await fetch('/api/users/onboarding-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      if (!skipped) {
        router.push('/vendors');
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && submitOrSkip(true)}>
      <DialogContent
        className="w-full max-w-[calc(100dvw-2rem)] border-none bg-transparent p-0 shadow-none sm:max-w-3xl"
        showCloseButton={false}
      >
        <div className="w-full rounded-2xl bg-cream-soft p-[2px] md:p-2">
          <Onboarding
            canGoNext={(step) => step === 1 || (step === 2 && categories.length >= 1) || step === 3}
            className="relative overflow-hidden rounded-2xl bg-cream p-6 md:p-8"
            maxStepValue={COUPLE_FEATURES.length - 1}
            onComplete={() => submitOrSkip(false)}
            totalSteps={3}
          >
            <CoupleHeader onSkip={() => submitOrSkip(true)} submitting={submitting} />
            <div className="my-8 min-h-[280px]">
              <Onboarding.Step step={1}>
                <CoupleFeatureStep />
              </Onboarding.Step>
              <Onboarding.Step step={2}>
                <CouplePersonalizeStep
                  eventDate={eventDate}
                  onEventDateChange={setEventDate}
                  categories={categories}
                  onCategoriesChange={setCategories}
                />
              </Onboarding.Step>
              <Onboarding.Step step={3}>
                <CoupleTipsStep />
              </Onboarding.Step>
            </div>
            <Onboarding.Navigation completeLabel="Start browsing" />
          </Onboarding>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CoupleHeader({ onSkip, submitting }: { onSkip: () => void; submitting: boolean }) {
  const { currentStep } = useOnboarding();
  const config = STEP_CONFIG[currentStep - 1];
  return (
    <DialogHeader className="relative !text-center">
      <button
        type="button"
        onClick={onSkip}
        disabled={submitting}
        className="absolute right-0 top-0 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
      >
        Skip for now
      </button>
      <DialogTitle className="font-serif font-bold tracking-tight text-ink md:text-3xl">
        {config.title}
      </DialogTitle>
      <DialogDescription className="text-ink-muted md:text-base">
        {config.description}
      </DialogDescription>
      <div className="pt-3">
        <Onboarding.StepIndicator />
      </div>
    </DialogHeader>
  );
}

function CoupleFeatureStep() {
  const { stepValue, setStepValue } = useOnboarding();
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <FeatureCarousel
        className="order-2 flex w-full flex-col gap-3 md:order-1 md:w-1/2"
        onValueChange={setStepValue}
        totalItems={COUPLE_FEATURES.length}
        value={stepValue}
      >
        {COUPLE_FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          const isActive = stepValue === index;
          return (
            <FeatureCarousel.Item index={index} key={feature.id}>
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-200',
                  isActive ? 'border-indigo/30 bg-indigo/10' : 'border-hairline hover:bg-cream-soft'
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    isActive ? 'text-indigo' : 'text-ink-muted'
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-ink">{feature.title}</p>
                  {isActive && (
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      {feature.description}
                    </p>
                  )}
                </div>
              </div>
            </FeatureCarousel.Item>
          );
        })}
      </FeatureCarousel>
      <div className="order-1 w-full md:order-2 md:w-1/2">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-hairline bg-cream-soft">
          <p className="text-sm text-ink-soft">Feature preview</p>
        </div>
      </div>
    </div>
  );
}

function CouplePersonalizeStep({
  eventDate,
  onEventDateChange,
  categories,
  onCategoriesChange,
}: {
  eventDate: string;
  onEventDateChange: (v: string) => void;
  categories: string[];
  onCategoriesChange: (v: string[]) => void;
}) {
  const { handleNext } = useOnboarding();
  const [question, setQuestion] = React.useState(categories.length > 0 ? 2 : 1);

  return (
    <div className="flex flex-col gap-4">
      {question === 1 ? (
        <div className="flex flex-col gap-4" key="q1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              1
            </span>
            <span className="text-base font-medium text-ink">When's the big day?</span>
          </div>
          <DatePicker selected={eventDate} onSelect={onEventDateChange} />
          <div className="flex items-center justify-between">
            <Button
              className="text-sm text-ink-muted hover:text-ink"
              onClick={() => {
                onEventDateChange('');
                setQuestion(2);
              }}
              type="button"
              size="sm"
              variant="ghost"
            >
              Still figuring it out →
            </Button>
            <Button type="button" size="sm" onClick={() => setQuestion(2)} disabled={!eventDate}>
              Next question
            </Button>
          </div>
          <p className="text-sm text-ink-muted">Question 1 of 2</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" key="q2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              2
            </span>
            <span className="text-base font-medium text-ink">
              Which vendors are top priority? (pick 1–5)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3">
            {COMMISSION_CATEGORIES.map((slug) => {
              const isSelected = categories.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onCategoriesChange(categories.filter((c) => c !== slug));
                    } else if (categories.length < 5) {
                      onCategoriesChange([...categories, slug]);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200',
                    isSelected
                      ? 'border-indigo/30 bg-indigo/10 text-ink'
                      : 'border-hairline bg-cream text-ink hover:bg-cream-soft'
                  )}
                >
                  <span>{VENDOR_CATEGORY_LABELS[slug] ?? slug}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <Button
              className="text-sm text-ink-muted hover:text-ink"
              onClick={() => setQuestion(1)}
              type="button"
              size="sm"
              variant="ghost"
            >
              <ArrowLeft className="size-4" />
              Back to question 1
            </Button>
            <p className="text-sm text-ink-muted">{categories.length}/5 · Question 2 of 2</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CoupleTipsStep() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-6">
      <div className="order-2 w-full md:order-1 md:w-1/2">
        <TipsList className="flex h-full flex-col gap-4" title="Tips">
          {COUPLE_TIPS.map((tip) => (
            <TipsList.Item className="flex items-start gap-3" key={tip.number} number={tip.number}>
              <p className="text-sm leading-relaxed text-ink">{tip.text}</p>
            </TipsList.Item>
          ))}
        </TipsList>
      </div>
      <div className="order-1 w-full md:order-2 md:w-1/2">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-hairline bg-cream-soft">
          <p className="text-sm text-ink-soft">Tips preview</p>
        </div>
      </div>
    </div>
  );
}
```

NOTE: This component assumes cult-ui exports `Onboarding`, `Onboarding.Step`, `Onboarding.StepIndicator`, `Onboarding.Navigation`, `useOnboarding`, `FeatureCarousel`, `TipsList` with the API shape used here. If the install yields slightly different APIs (e.g., different prop names), the implementer adjusts inline.

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean. If `useOnboarding` or compound exports don't match, fix imports per actual cult-ui exports.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/CoupleOnboarding.tsx
git commit -m "feat(onboarding): CoupleOnboarding 3-step modal"
```

---

## Task 7: VendorOnboarding component

**Files:**

- Create: `src/components/onboarding/VendorOnboarding.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/onboarding/VendorOnboarding.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Onboarding,
  ChoiceGroup,
  FeatureCarousel,
  TipsList,
  useOnboarding,
} from '@/components/ui/onboarding';
import { Button } from '@/components/ui/button';
import {
  VENDOR_FEATURES,
  VENDOR_TIPS,
  YEARS_IN_BUSINESS,
  COMMISSION_CATEGORIES,
  type YearsInBusiness,
} from '@/lib/onboarding/welcome-data';
import { VENDOR_CATEGORY_LABELS, cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

const STEP_CONFIG = [
  {
    title: 'Welcome to Baazar for vendors',
    description: "Get discovered by Chicago couples. Here's how it works.",
  },
  {
    title: 'Tell us about your business',
    description: 'Two quick questions to set up your profile.',
  },
  {
    title: "You're ready to publish",
    description: 'Three things to remember as you build out your profile.',
  },
];

const YEARS_LABELS: Record<YearsInBusiness, string> = {
  '0-1': 'Less than 1 year',
  '1-3': '1–3 years',
  '3-10': '3–10 years',
  '10+': '10+ years',
};

export interface VendorOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorOnboarding({ open, onOpenChange }: VendorOnboardingProps) {
  const router = useRouter();
  const [category, setCategory] = React.useState<string>('');
  const [yearsInBusiness, setYearsInBusiness] = React.useState<YearsInBusiness | ''>('');
  const [submitting, setSubmitting] = React.useState(false);

  async function submitOrSkip(skipped: boolean) {
    setSubmitting(true);
    try {
      const body = skipped
        ? { skipped: true, data: null }
        : {
            skipped: false,
            data: {
              category,
              years_in_business: yearsInBusiness,
            },
          };
      await fetch('/api/users/onboarding-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      if (!skipped) {
        router.push('/dashboard/profile/setup/basics');
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && submitOrSkip(true)}>
      <DialogContent
        className="w-full max-w-[calc(100dvw-2rem)] border-none bg-transparent p-0 shadow-none sm:max-w-3xl"
        showCloseButton={false}
      >
        <div className="w-full rounded-2xl bg-cream-soft p-[2px] md:p-2">
          <Onboarding
            canGoNext={(step) =>
              step === 1 || (step === 2 && category !== '' && yearsInBusiness !== '') || step === 3
            }
            className="relative overflow-hidden rounded-2xl bg-cream p-6 md:p-8"
            maxStepValue={VENDOR_FEATURES.length - 1}
            onComplete={() => submitOrSkip(false)}
            totalSteps={3}
          >
            <VendorHeader onSkip={() => submitOrSkip(true)} submitting={submitting} />
            <div className="my-8 min-h-[280px]">
              <Onboarding.Step step={1}>
                <VendorFeatureStep />
              </Onboarding.Step>
              <Onboarding.Step step={2}>
                <VendorPersonalizeStep
                  category={category}
                  onCategoryChange={setCategory}
                  yearsInBusiness={yearsInBusiness}
                  onYearsChange={setYearsInBusiness}
                />
              </Onboarding.Step>
              <Onboarding.Step step={3}>
                <VendorTipsStep />
              </Onboarding.Step>
            </div>
            <Onboarding.Navigation completeLabel="Build my profile" />
          </Onboarding>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VendorHeader({ onSkip, submitting }: { onSkip: () => void; submitting: boolean }) {
  const { currentStep } = useOnboarding();
  const config = STEP_CONFIG[currentStep - 1];
  return (
    <DialogHeader className="relative !text-center">
      <button
        type="button"
        onClick={onSkip}
        disabled={submitting}
        className="absolute right-0 top-0 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
      >
        Skip for now
      </button>
      <DialogTitle className="font-serif font-bold tracking-tight text-ink md:text-3xl">
        {config.title}
      </DialogTitle>
      <DialogDescription className="text-ink-muted md:text-base">
        {config.description}
      </DialogDescription>
      <div className="pt-3">
        <Onboarding.StepIndicator />
      </div>
    </DialogHeader>
  );
}

function VendorFeatureStep() {
  const { stepValue, setStepValue } = useOnboarding();
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <FeatureCarousel
        className="order-2 flex w-full flex-col gap-3 md:order-1 md:w-1/2"
        onValueChange={setStepValue}
        totalItems={VENDOR_FEATURES.length}
        value={stepValue}
      >
        {VENDOR_FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          const isActive = stepValue === index;
          return (
            <FeatureCarousel.Item index={index} key={feature.id}>
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-200',
                  isActive ? 'border-indigo/30 bg-indigo/10' : 'border-hairline hover:bg-cream-soft'
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    isActive ? 'text-indigo' : 'text-ink-muted'
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-ink">{feature.title}</p>
                  {isActive && (
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      {feature.description}
                    </p>
                  )}
                </div>
              </div>
            </FeatureCarousel.Item>
          );
        })}
      </FeatureCarousel>
      <div className="order-1 w-full md:order-2 md:w-1/2">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-hairline bg-cream-soft">
          <p className="text-sm text-ink-soft">Feature preview</p>
        </div>
      </div>
    </div>
  );
}

function VendorPersonalizeStep({
  category,
  onCategoryChange,
  yearsInBusiness,
  onYearsChange,
}: {
  category: string;
  onCategoryChange: (v: string) => void;
  yearsInBusiness: YearsInBusiness | '';
  onYearsChange: (v: YearsInBusiness) => void;
}) {
  const [question, setQuestion] = React.useState(category && yearsInBusiness ? 2 : 1);

  return (
    <div className="flex flex-col gap-4">
      {question === 1 ? (
        <div className="flex flex-col gap-4" key="q1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              1
            </span>
            <span className="text-base font-medium text-ink">
              Which category best describes your business?
            </span>
          </div>
          <ChoiceGroup
            className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3"
            name="vendor-category"
            onValueChange={(v) => {
              onCategoryChange(v);
              setTimeout(() => setQuestion(2), 300);
            }}
            orientation="grid"
            value={category}
          >
            {COMMISSION_CATEGORIES.map((slug) => {
              const isSelected = category === slug;
              return (
                <ChoiceGroup.Item
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200',
                    isSelected
                      ? 'border-indigo/30 bg-indigo/10 text-ink'
                      : 'border-hairline bg-cream text-ink hover:bg-cream-soft'
                  )}
                  key={slug}
                  value={slug}
                >
                  <span>{VENDOR_CATEGORY_LABELS[slug] ?? slug}</span>
                </ChoiceGroup.Item>
              );
            })}
          </ChoiceGroup>
          <p className="text-sm text-ink-muted">Question 1 of 2</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" key="q2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              2
            </span>
            <span className="text-base font-medium text-ink">
              How long have you been in business?
            </span>
          </div>
          <ChoiceGroup
            className="grid grid-cols-2 gap-2 sm:gap-3"
            name="years-in-business"
            onValueChange={(v) => {
              onYearsChange(v as YearsInBusiness);
            }}
            orientation="grid"
            value={yearsInBusiness}
          >
            {YEARS_IN_BUSINESS.map((bucket) => {
              const isSelected = yearsInBusiness === bucket;
              return (
                <ChoiceGroup.Item
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200',
                    isSelected
                      ? 'border-indigo/30 bg-indigo/10 text-ink'
                      : 'border-hairline bg-cream text-ink hover:bg-cream-soft'
                  )}
                  key={bucket}
                  value={bucket}
                >
                  <span>{YEARS_LABELS[bucket]}</span>
                </ChoiceGroup.Item>
              );
            })}
          </ChoiceGroup>
          <div className="flex items-center justify-between">
            <Button
              className="text-sm text-ink-muted hover:text-ink"
              onClick={() => setQuestion(1)}
              type="button"
              size="sm"
              variant="ghost"
            >
              <ArrowLeft className="size-4" />
              Back to question 1
            </Button>
            <p className="text-sm text-ink-muted">Question 2 of 2</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorTipsStep() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-6">
      <div className="order-2 w-full md:order-1 md:w-1/2">
        <TipsList className="flex h-full flex-col gap-4" title="Tips">
          {VENDOR_TIPS.map((tip) => (
            <TipsList.Item className="flex items-start gap-3" key={tip.number} number={tip.number}>
              <p className="text-sm leading-relaxed text-ink">{tip.text}</p>
            </TipsList.Item>
          ))}
        </TipsList>
      </div>
      <div className="order-1 w-full md:order-2 md:w-1/2">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-hairline bg-cream-soft">
          <p className="text-sm text-ink-soft">Tips preview</p>
        </div>
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
git add src/components/onboarding/VendorOnboarding.tsx
git commit -m "feat(onboarding): VendorOnboarding 3-step modal + category pre-fill"
```

---

## Task 8: OnboardingGate + mount in dashboard layout

**Files:**

- Create: `src/components/onboarding/OnboardingGate.tsx`
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Write the gate**

Write to `src/components/onboarding/OnboardingGate.tsx`:

```tsx
'use client';

import * as React from 'react';
import { CoupleOnboarding } from './CoupleOnboarding';
import { VendorOnboarding } from './VendorOnboarding';

export interface OnboardingGateProps {
  role: 'couple' | 'vendor';
  /** Whether the user has already completed (or skipped) onboarding. If true, gate is a no-op. */
  onboardingCompleted: boolean;
}

/**
 * Auto-fires the appropriate onboarding modal on first dashboard visit.
 * Receives role + completion state from the dashboard layout's server-side fetch
 * so the modal renders without a client-side flash.
 *
 * Once dismissed (via Skip, Esc, complete, or backdrop click), the API marks
 * users.onboarding_completed_at, so subsequent dashboard renders pass
 * onboardingCompleted=true and this component is a no-op.
 */
export function OnboardingGate({ role, onboardingCompleted }: OnboardingGateProps) {
  const [open, setOpen] = React.useState(!onboardingCompleted);

  if (onboardingCompleted) return null;

  if (role === 'couple') {
    return <CoupleOnboarding open={open} onOpenChange={setOpen} />;
  }
  if (role === 'vendor') {
    return <VendorOnboarding open={open} onOpenChange={setOpen} />;
  }

  return null;
}
```

- [ ] **Step 2: Wire the gate into the dashboard layout**

Read `src/app/dashboard/layout.tsx`. Modify the user-fetch to ALSO select `onboarding_completed_at`:

Find:

```ts
const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();

const role = (profile?.role as 'couple' | 'vendor') || 'couple';
```

Change to:

```ts
const { data: profile } = await supabase
  .from('users')
  .select('role, onboarding_completed_at')
  .eq('id', user.id)
  .single();

const role = (profile?.role as 'couple' | 'vendor') || 'couple';
const onboardingCompleted =
  profile?.onboarding_completed_at !== null && profile?.onboarding_completed_at !== undefined;
```

Then add the import + mount:

```ts
import { OnboardingGate } from '@/components/onboarding/OnboardingGate';
```

In the JSX, mount the gate (anywhere inside the layout — adjacent to `{children}` works):

```tsx
<ActiveBusinessProvider activeBusinessId={activeBusinessId}>
  <div className="min-h-screen bg-muted/40">
    <Navbar />
    <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <aside className="hidden w-56 shrink-0 md:block">
        <SidebarNav role={role} />
      </aside>
      <main className="flex-1">{children}</main>
    </div>
    {panel}
    <OnboardingGate role={role} onboardingCompleted={onboardingCompleted} />
  </div>
</ActiveBusinessProvider>
```

- [ ] **Step 3: Verify typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/OnboardingGate.tsx 'src/app/dashboard/layout.tsx'
git commit -m "feat(onboarding): OnboardingGate auto-fires on first dashboard visit"
```

---

## Task 9: Visual verification

**Files:** none (browser-only)

- [ ] **Step 1: Reset onboarding state on dev DB for a test user**

Pick a test user from your dev DB (or create one). Reset their onboarding so the modal will fire:

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT id, email, role, onboarding_completed_at FROM users LIMIT 10;"
```

Pick a couple user + a vendor user. Reset both:

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "UPDATE users SET onboarding_completed_at = NULL, onboarding_data = NULL WHERE id IN ('<couple-uuid>', '<vendor-uuid>');"
```

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard` after logging in as the couple user.

- [ ] **Step 3: Verify couple flow**

1. Onboarding modal auto-opens.
2. Step 1: Welcome features carousel — 3 features (Browse / Save / Book). Click each card; active state shows description + indigo border.
3. Click Next → Step 2 (Personalize).
4. Q1: Date picker visible. Pick a date. "Next question" button enables. Click → Q2.
5. Q2: 10 category grid (no Bridal Wear / Decor / Venue). Click 3 categories. Counter reads "3/5". Try to click a 6th — should not add (capped at 5).
6. Click Next → Step 3 (Tips). 3 tips show.
7. Click "Start browsing" → modal closes, navigates to `/vendors`.

Verify DB:

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT onboarding_completed_at, onboarding_data FROM users WHERE id = '<couple-uuid>';"
```

Expected: timestamp populated; data contains `{ event_date: '...', categories: [...] }`.

Visit `/dashboard` again — modal should NOT re-fire.

- [ ] **Step 4: Verify vendor flow**

Log out, log in as vendor user. Visit `/dashboard`.

1. Modal auto-opens.
2. Step 1: 3 vendor features (Get discovered / Manage calendar / Get paid).
3. Step 2 Q1: 10 commission categories. Click "Photography". Auto-advances to Q2 after 300ms.
4. Q2: 4 years-in-business buckets. Click "3–10 years".
5. Step 3: 3 vendor tips.
6. Click "Build my profile" → modal closes, navigates to `/dashboard/profile/setup/basics`.

On the basics page, verify the category is pre-filled with "Photography":

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT category FROM vendor_profiles WHERE user_id = '<vendor-uuid>';"
```

Expected: `photography`.

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT onboarding_completed_at, onboarding_data FROM users WHERE id = '<vendor-uuid>';"
```

Expected: timestamp populated; data contains `{ years_in_business: '3-10' }`.

- [ ] **Step 5: Verify skip behavior**

Reset onboarding for the couple user again. Visit `/dashboard`, click "Skip for now" in the modal header.

```bash
PGPASSWORD='$uperLocked$300' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT onboarding_completed_at, onboarding_data FROM users WHERE id = '<couple-uuid>';"
```

Expected: timestamp populated; data is NULL.

Visit `/dashboard` again — modal should NOT re-fire.

If any step fails, fix the underlying issue + re-verify.

---

## Task 10: DESIGN.md update

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Add the entry**

Read the `components:` block in `DESIGN.md`. Append (matching indent):

```yaml
onboarding-welcome:
  pattern: '3-step modal (Welcome features → Personalize → Tips), composed from cult-ui Onboarding primitives. Auto-fires on first dashboard visit; dismissible. Two role-specific flows (CoupleOnboarding, VendorOnboarding) share the same shell but render different content + collect different data.'
  trigger: 'OnboardingGate mounted in dashboard layout. Server-fetches users.onboarding_completed_at; renders modal when null. Sets timestamp on complete OR skip so it never re-fires.'
  couple-data: 'event_date (or null = still planning) + categories (1–5 from 10 commission-active slugs). Persisted in users.onboarding_data jsonb.'
  vendor-data: "category (single, from 10 commission-active) + years_in_business ('0-1' | '1-3' | '3-10' | '10+'). Category writes to vendor_profiles.category so the existing Sub-project B wizard pre-fills. years_in_business stays in users.onboarding_data."
  coming-soon: "Bridal Wear, Decor, Venue excluded from both flows' category pickers. They'll get a separate flat-fee onboarding flow in a future sub-project."
  tokens: 'M+ adapted from cult-ui defaults — border-indigo/30 + bg-indigo/10 for selected states; bg-cream-soft for the modal frame; text-ink/text-ink-muted/text-ink-soft for typography hierarchy.'
  accessibility: "role='dialog' + aria-modal. Skip on Esc, backdrop click, or X mark — all wired to mark completed. ChoiceGroup is role='radiogroup'. Step indicator gets aria-current='step' on active dot."
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): add onboarding-welcome to M+ frontmatter"
```

---

## Task 11: Plan commit + push + PR

**Files:** none — git operations only.

- [ ] **Step 1: Commit the plan doc**

```bash
git status --short docs/superpowers/plans/2026-05-26-baazar-onboarding-welcome.md
```

If listed as untracked (`??`):

```bash
git add docs/superpowers/plans/2026-05-26-baazar-onboarding-welcome.md
git commit -m "docs(plan): Baazar onboarding welcome implementation plan"
```

- [ ] **Step 2: Final verification**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean, lint clean (pre-existing warnings OK), test: 25 new tests (8 welcome-data + 11 schema + 6 route) plus existing suite; 3 pre-existing failures unchanged.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/baazar-onboarding-welcome
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(onboarding): Baazar welcome modal — couple + vendor flows" --body "$(cat <<'EOF'
## Summary

Implements [the onboarding welcome spec](docs/superpowers/specs/2026-05-26-baazar-onboarding-welcome-design.md). Fills the onboarding gap: couples had zero post-signup explanation; vendors had the existing Sub-project B data-collection wizard but no welcome/explanation surface around it.

## What's in this PR

- **`<OnboardingGate>`** mounted in dashboard layout. Server-fetches `users.onboarding_completed_at`; renders modal when null. Once dismissed (complete OR skip), timestamp is set and modal never re-fires.
- **`<CoupleOnboarding>`** — 3-step modal. Step 1: 3 feature cards (Browse / Save / Book). Step 2: event date (or "still planning") + 1–5 categories from 10 commission-active slugs. Step 3: 3 tips. Complete → navigate to `/vendors`.
- **`<VendorOnboarding>`** — 3-step modal. Step 1: 3 vendor features (Get discovered / Manage calendar / Get paid). Step 2: category (10 commission slugs) + years in business (4 buckets). Step 3: 3 tips. Complete → navigate to `/dashboard/profile/setup/basics`. Vendor's category writes to `vendor_profiles.category` so the existing wizard pre-fills.
- **cult-ui Onboarding primitive** — installed via `npx shadcn@latest add https://cult-ui.com/r/onboarding.json`. Provides `Onboarding`, `Onboarding.Step`, `Onboarding.StepIndicator`, `Onboarding.Navigation`, `ChoiceGroup`, `FeatureCarousel`, `TipsList`, `useOnboarding`. M+ tokens applied at the consumer layer.
- **Migration 00043** — adds `users.onboarding_completed_at: timestamptz` + `users.onboarding_data: jsonb` + partial index on pending lookups.
- **`POST /api/users/onboarding-complete`** — auth-gated, zod-validated, discriminated union on `skipped`. For vendors: upserts category into `vendor_profiles` (non-fatal on failure). For couples: stores event_date + categories in users.onboarding_data.
- **25 new tests** — 8 welcome-data + 11 schema + 6 route.
- **DESIGN.md** — adds `onboarding-welcome:` to `components:` block.

## Out of scope (per spec)

- Account-menu "Welcome tour" reopen link (once dismissed, only DB reset can re-trigger Day 1)
- Resend welcome email series
- Per-step drop-off analytics
- A/B variants
- Custom illustrations (Day 1 uses lucide icons + placeholder previews)
- Personalization-driven "For you" recommendations
- Vendor "Established" badge from years_in_business

## Test plan

- [ ] Reset `onboarding_completed_at = NULL` for a couple user; visit `/dashboard` → modal auto-opens
- [ ] Couple flow: 3 steps complete; `users.onboarding_completed_at` populated; `onboarding_data` has event_date + categories
- [ ] Couple skip: timestamp populated; data = NULL; modal does not re-fire
- [ ] Reset for a vendor user; visit `/dashboard` → modal auto-opens (vendor variant)
- [ ] Vendor flow: complete; navigates to `/dashboard/profile/setup/basics`; basics page shows category pre-filled
- [ ] `vendor_profiles.category` = the picked slug
- [ ] Verify Bridal Wear / Decor / Venue NOT shown in either flow's category picker
- [ ] Verify Esc + backdrop click + X mark all fire the skip handler (mark completed)
- [ ] All 25 new tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL.

- [ ] **Step 5: Report**

Report DONE | DONE_WITH_CONCERNS | BLOCKED with:

- Final test results
- PR URL
- Any concerns (e.g., cult-ui's API differs from the spec assumption, M+ token adaptation issues, etc.)
