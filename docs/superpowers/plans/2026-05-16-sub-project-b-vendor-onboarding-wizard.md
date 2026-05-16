# Sub-project B — Vendor Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/dashboard/profile`'s single-page form with a 5-step full-page wizard (Basics → Location → Online → Portfolio → Review) that persists per-step, resumes on next visit, and only publishes profiles to the marketplace once all required fields are present. Includes a Claude Haiku–powered AI bio assistant in Step 1.

**Architecture:** Route-per-step under `/dashboard/profile/setup/[step]`. Shared layout enforces ordering + redirects published profiles to the edit form. PATCH endpoints per step persist partial state to `vendor_profiles`. A dedicated `/api/vendor-profile/publish` endpoint flips `onboarding_complete = true` after server-side validation. Marketplace queries gate on `is_active = true AND onboarding_complete = true`. The AI bio assistant streams from Anthropic's API server-side, rate-limited 10 calls/user/24h.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Auth + RLS), Zod, UploadThing, Google Places Autocomplete, `@anthropic-ai/sdk` (claude-haiku-4-5-20251001), vitest, Playwright.

---

## File Structure (locked in design §11)

**New libs:**
- `src/lib/onboarding/resume.ts` — `nextIncompleteStep(profile)`
- `src/lib/onboarding/validation.ts` — Zod schemas per step + required-field constants
- `src/lib/ai/anthropic.ts` — Anthropic client
- `src/lib/ai/prompts.ts` — locked system/user prompts
- `src/lib/ai/rate-limit.ts` — per-user 24h counter

**New API routes:**
- `src/app/api/vendor-profile/setup/[step]/route.ts` — PATCH per step
- `src/app/api/vendor-profile/publish/route.ts` — POST publish handler
- `src/app/api/ai/bio-assist/route.ts` — POST streaming text/event-stream

**New pages/components:**
- `src/app/dashboard/profile/setup/{layout,page,basics/page,location/page,online/page,portfolio/page,review/page}.tsx`
- `src/components/onboarding/{WizardStepper,StepBasics,StepLocation,StepOnline,StepPortfolio,StepReview,BioAssistButton}.tsx`

**Modified:**
- `src/app/(marketplace)/vendors/page.tsx` (B1.1 — add gate filters)
- `src/app/(marketplace)/vendors/[slug]/page.tsx` (B1.2 — 404 unpublished)
- `src/app/(marketplace)/vendors/[slug]/book/page.tsx` (B1.3 — 404 unpublished)
- `src/app/dashboard/profile/page.tsx` (B5.3 — redirect if not onboarded)
- `src/app/dashboard/page.tsx` (B5.2 — CTA points at /setup)
- `src/app/api/vendors/claim/route.ts` (B5.2 — post-claim redirect target)

**Deleted:**
- `src/components/dashboard/ProfileSetup.tsx` (B5.2 — subsumed by wizard)

**Migrations:**
- `supabase/migrations/00031_ai_bio_assist_calls.sql` (B4.5.2)

---

## Phase B1 — Marketplace gate

### Task B1.1: Gate the vendor list page

**Files:**
- Modify: `src/app/(marketplace)/vendors/page.tsx:26-31`
- Test: `src/__tests__/integration/marketplace-gate.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// src/__tests__/integration/marketplace-gate.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server';

const sb = createServiceRoleClient();
const TEST_UUIDS = {
  publishedVendor: '00000000-0000-0000-0000-000000000b01',
  unpublishedVendor: '00000000-0000-0000-0000-000000000b02',
  pausedVendor: '00000000-0000-0000-0000-000000000b03',
};

describe('marketplace gate — only published + active vendors visible', () => {
  beforeAll(async () => {
    // Seed 3 vendor users + profiles in 3 states
    // (full helper code — copy seedVendor pattern from tests/e2e/helpers/seed.ts)
  });
  afterAll(async () => { /* cleanup by TEST_UUIDS */ });

  it('GET /vendors returns only onboarding_complete=true AND is_active=true', async () => {
    const { data } = await sb
      .from('vendor_profiles')
      .select('id')
      .eq('is_active', true)
      .eq('onboarding_complete', true)
      .in('id', Object.values(TEST_UUIDS));
    expect(data?.map((v) => v.id)).toEqual([TEST_UUIDS.publishedVendor]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- marketplace-gate`
Expected: PASS (the test asserts what the DB query does directly, not the page; will pass even before B1.1 ships — see Step 3 for the page-level assertion).

Add this assertion to the same test file:

```typescript
it('page query (current behavior) shows unpublished — should change after B1.1', async () => {
  const { data } = await sb.from('vendor_profiles').select('id').in('id', Object.values(TEST_UUIDS));
  // Before B1.1: returns all 3. After B1.1, the page-level query filters; we'll port that filter inline here.
});
```

- [ ] **Step 3: Apply the gate filter**

Edit `src/app/(marketplace)/vendors/page.tsx` line 26–31:

```typescript
let query = supabase
  .from('vendor_profiles')
  .select(
    '*, vendor_packages_price_band!vendor_packages_price_band_vendor_profile_id_fkey(min_price_cents, max_price_cents)',
    { count: 'exact' }
  )
  .eq('is_active', true)
  .eq('onboarding_complete', true);
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test -- marketplace-gate`
Expected: PASS

```bash
git add src/app/\(marketplace\)/vendors/page.tsx src/__tests__/integration/marketplace-gate.test.ts
git commit -m "feat(marketplace): gate vendor list on is_active + onboarding_complete"
```

### Task B1.2: 404 unpublished profile detail page for non-owners

**Files:**
- Modify: `src/app/(marketplace)/vendors/[slug]/page.tsx`

- [ ] **Step 1: Read the existing handler**

The detail page fetches by `slug` then renders. We need: if `onboarding_complete = false` AND the requester is not the owner, call `notFound()`.

- [ ] **Step 2: Implement**

Find the line `const { data: vendor } = await supabase.from('vendor_profiles').select('...').eq('slug', slug).single();` and immediately after:

```typescript
if (!vendor) notFound();
if (!vendor.onboarding_complete || !vendor.is_active) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== vendor.user_id) {
    notFound();
  }
}
```

Add `import { notFound } from 'next/navigation';` to the imports if not already present.

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck`

```bash
git add src/app/\(marketplace\)/vendors/\[slug\]/page.tsx
git commit -m "feat(marketplace): 404 unpublished vendor profiles for non-owners"
```

### Task B1.3: 404 unpublished booking page

**Files:**
- Modify: `src/app/(marketplace)/vendors/[slug]/book/page.tsx`

- [ ] **Step 1: Apply the same gate**

The booking page lookup at line 43 + 85 — apply the same `notFound()` block as B1.2 (no owner-exception needed here: even the owner shouldn't book themselves).

- [ ] **Step 2: Verify and commit**

```bash
git add src/app/\(marketplace\)/vendors/\[slug\]/book/page.tsx
git commit -m "feat(marketplace): 404 booking page for unpublished vendors"
```

---

## Phase B2 — Resume + Validation libs (pure functions, fully testable)

### Task B2.1: Required-fields constants + Zod schemas

**Files:**
- Create: `src/lib/onboarding/validation.ts`
- Test: `src/__tests__/lib/onboarding/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/lib/onboarding/validation.test.ts
import { describe, it, expect } from 'vitest';
import {
  basicsSchema,
  locationSchema,
  onlineSchema,
  portfolioSchema,
  publishGateSchema,
} from '@/lib/onboarding/validation';

describe('basicsSchema', () => {
  it('accepts valid input', () => {
    const r = basicsSchema.safeParse({
      businessName: 'Henna Art Chicago',
      category: 'mehndi',
      bio: 'We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years of bridal experience.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects bio < 50 chars', () => {
    const r = basicsSchema.safeParse({ businessName: 'X', category: 'mehndi', bio: 'short' });
    expect(r.success).toBe(false);
  });

  it('rejects bio > 500 chars', () => {
    const r = basicsSchema.safeParse({ businessName: 'X', category: 'mehndi', bio: 'a'.repeat(501) });
    expect(r.success).toBe(false);
  });
});

describe('locationSchema', () => {
  it('accepts complete address', () => {
    expect(
      locationSchema.safeParse({
        baseAddressLine1: '123 Main', baseCity: 'Chicago', baseState: 'IL',
        basePostalCode: '60601', baseGooglePlaceId: 'ChIJxxx', baseAddressPublic: false,
      }).success
    ).toBe(true);
  });
  it('rejects missing line_1', () => {
    expect(
      locationSchema.safeParse({
        baseAddressLine1: '', baseCity: 'Chicago', baseState: 'IL',
        basePostalCode: '60601', baseGooglePlaceId: 'ChIJxxx', baseAddressPublic: false,
      }).success
    ).toBe(false);
  });
});

describe('onlineSchema', () => {
  it('accepts instagram only', () => {
    expect(onlineSchema.safeParse({ instagramHandle: 'hennaart', websiteUrl: '' }).success).toBe(true);
  });
  it('rejects missing instagram', () => {
    expect(onlineSchema.safeParse({ instagramHandle: '', websiteUrl: 'https://x.com' }).success).toBe(false);
  });
  it('strips leading @ from instagram', () => {
    const r = onlineSchema.parse({ instagramHandle: '@hennaart', websiteUrl: '' });
    expect(r.instagramHandle).toBe('hennaart');
  });
});

describe('portfolioSchema', () => {
  it('accepts 1 image', () => {
    expect(portfolioSchema.safeParse({ portfolioImages: ['https://utfs.io/a.jpg'] }).success).toBe(true);
  });
  it('rejects 0 images', () => {
    expect(portfolioSchema.safeParse({ portfolioImages: [] }).success).toBe(false);
  });
});

describe('publishGateSchema (server-side guard)', () => {
  it('rejects profile missing instagram', () => {
    const r = publishGateSchema.safeParse({
      business_name: 'X', category: 'mehndi', bio: 'a'.repeat(60),
      base_address_line_1: '1', base_city: 'C', base_state: 'IL', base_postal_code: '1',
      base_google_place_id: 'P', base_address_public: false,
      instagram_handle: null, website_url: null,
      portfolio_images: ['x.jpg'],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a complete profile', () => {
    const r = publishGateSchema.safeParse({
      business_name: 'X', category: 'mehndi', bio: 'a'.repeat(60),
      base_address_line_1: '1', base_city: 'C', base_state: 'IL', base_postal_code: '1',
      base_google_place_id: 'P', base_address_public: false,
      instagram_handle: 'x', website_url: null,
      portfolio_images: ['x.jpg'],
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- validation`
Expected: FAIL with "Cannot find module '@/lib/onboarding/validation'"

- [ ] **Step 3: Implement**

```typescript
// src/lib/onboarding/validation.ts
import { z } from 'zod';

const instagramHandle = z
  .string()
  .min(1, 'Instagram handle is required')
  .transform((s) => s.replace(/^@/, '').trim())
  .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, 'Invalid Instagram handle'));

export const basicsSchema = z.object({
  businessName: z.string().min(1).max(120),
  category: z.string().min(1),
  bio: z.string().min(50, 'Bio must be at least 50 characters').max(500, 'Bio must be at most 500 characters'),
});

export const locationSchema = z.object({
  baseAddressLine1: z.string().min(1, 'Address required'),
  baseCity: z.string().min(1),
  baseState: z.string().min(1),
  basePostalCode: z.string().min(1),
  baseGooglePlaceId: z.string().min(1),
  baseAddressPublic: z.boolean(),
});

export const onlineSchema = z.object({
  instagramHandle: instagramHandle,
  websiteUrl: z.union([z.string().url(), z.literal('')]).optional().transform((v) => v || ''),
});

export const portfolioSchema = z.object({
  portfolioImages: z.array(z.string().url()).min(1, 'At least 1 portfolio image is required'),
});

// Server-side gate on the full DB row before flipping onboarding_complete = true.
// Mirrors the four step schemas but reads the DB column names directly.
export const publishGateSchema = z.object({
  business_name: z.string().min(1),
  category: z.string().min(1),
  bio: z.string().min(50).max(500),
  base_address_line_1: z.string().min(1),
  base_city: z.string().min(1),
  base_state: z.string().min(1),
  base_postal_code: z.string().min(1),
  base_google_place_id: z.string().min(1),
  base_address_public: z.boolean(),
  instagram_handle: z.string().regex(/^[A-Za-z0-9._]{1,30}$/),
  website_url: z.string().nullable(),
  portfolio_images: z.array(z.string()).min(1),
});

export type BasicsInput = z.infer<typeof basicsSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type OnlineInput = z.infer<typeof onlineSchema>;
export type PortfolioInput = z.infer<typeof portfolioSchema>;
```

- [ ] **Step 4: Verify and commit**

Run: `npm test -- validation`
Expected: PASS (all cases)

```bash
git add src/lib/onboarding/validation.ts src/__tests__/lib/onboarding/validation.test.ts
git commit -m "feat(onboarding): Zod validation schemas for wizard steps"
```

### Task B2.2: Resume function

**Files:**
- Create: `src/lib/onboarding/resume.ts`
- Test: `src/__tests__/lib/onboarding/resume.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/lib/onboarding/resume.test.ts
import { describe, it, expect } from 'vitest';
import { nextIncompleteStep } from '@/lib/onboarding/resume';

const baseProfile = {
  business_name: 'X',
  category: 'mehndi',
  bio: 'a'.repeat(60),
  base_address_line_1: '1',
  base_city: 'C',
  base_state: 'IL',
  base_postal_code: '60601',
  base_google_place_id: 'P',
  base_address_public: false,
  instagram_handle: 'x',
  website_url: null,
  portfolio_images: ['x.jpg'],
};

describe('nextIncompleteStep', () => {
  it('returns basics when business_name missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, business_name: null })).toBe('basics');
  });
  it('returns basics when bio missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, bio: null })).toBe('basics');
  });
  it('returns location when address line_1 missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, base_address_line_1: null })).toBe('location');
  });
  it('returns location when city missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, base_city: null })).toBe('location');
  });
  it('returns online when instagram_handle missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, instagram_handle: null })).toBe('online');
  });
  it('returns portfolio when no images', () => {
    expect(nextIncompleteStep({ ...baseProfile, portfolio_images: [] })).toBe('portfolio');
  });
  it('returns review when everything filled', () => {
    expect(nextIncompleteStep(baseProfile)).toBe('review');
  });
  it('returns basics when profile is null', () => {
    expect(nextIncompleteStep(null)).toBe('basics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

```typescript
// src/lib/onboarding/resume.ts
export type WizardStep = 'basics' | 'location' | 'online' | 'portfolio' | 'review';

export interface ProfileRowShape {
  business_name: string | null;
  category: string | null;
  bio: string | null;
  base_address_line_1: string | null;
  base_city: string | null;
  base_state: string | null;
  base_postal_code: string | null;
  base_google_place_id: string | null;
  instagram_handle: string | null;
  portfolio_images: string[] | null;
}

export function nextIncompleteStep(profile: ProfileRowShape | null): WizardStep {
  if (!profile) return 'basics';
  if (!profile.business_name || !profile.category || !profile.bio || profile.bio.length < 50) {
    return 'basics';
  }
  if (
    !profile.base_address_line_1 ||
    !profile.base_city ||
    !profile.base_state ||
    !profile.base_postal_code ||
    !profile.base_google_place_id
  ) {
    return 'location';
  }
  if (!profile.instagram_handle) return 'online';
  if (!profile.portfolio_images || profile.portfolio_images.length < 1) return 'portfolio';
  return 'review';
}
```

- [ ] **Step 4: Verify and commit**

```bash
git add src/lib/onboarding/resume.ts src/__tests__/lib/onboarding/resume.test.ts
git commit -m "feat(onboarding): nextIncompleteStep resume function"
```

---

## Phase B3 — Wizard shell + step components

### Task B3.1: Setup layout (auth + redirect logic + stepper mount)

**Files:**
- Create: `src/app/dashboard/profile/setup/layout.tsx`

- [ ] **Step 1: Implement**

```typescript
// src/app/dashboard/profile/setup/layout.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { WizardStepper } from '@/components/onboarding/WizardStepper';
import { nextIncompleteStep } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profile?.onboarding_complete) redirect('/dashboard/profile');

  const currentStep = nextIncompleteStep(profile);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:block w-64 border-r bg-muted/30 p-6">
        <WizardStepper profile={profile} />
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/profile/setup/layout.tsx
git commit -m "feat(onboarding): wizard setup layout with stepper + auth guard"
```

### Task B3.2: WizardStepper component

**Files:**
- Create: `src/components/onboarding/WizardStepper.tsx`

- [ ] **Step 1: Implement**

```typescript
// src/components/onboarding/WizardStepper.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import { nextIncompleteStep, type WizardStep, type ProfileRowShape } from '@/lib/onboarding/resume';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'location', label: 'Location' },
  { key: 'online', label: 'Online presence' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'review', label: 'Review & publish' },
];

interface Props {
  profile: ProfileRowShape | null;
}

export function WizardStepper({ profile }: Props) {
  const pathname = usePathname();
  const current = (pathname.split('/').pop() as WizardStep) ?? 'basics';
  const next = nextIncompleteStep(profile);
  const nextIdx = STEPS.findIndex((s) => s.key === next);

  return (
    <nav className="space-y-1">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Set up your profile
      </h2>
      <ul className="space-y-1">
        {STEPS.map((step, idx) => {
          const isComplete = idx < nextIdx;
          const isCurrent = step.key === current;
          const isReachable = idx <= nextIdx;
          const content = (
            <span
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                isCurrent
                  ? 'bg-primary/10 font-semibold text-primary'
                  : isComplete
                  ? 'text-foreground hover:bg-accent'
                  : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                  isComplete
                    ? 'border-green-500 bg-green-500 text-white'
                    : isCurrent
                    ? 'border-primary text-primary'
                    : 'border-muted-foreground/40'
                }`}
              >
                {isComplete ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              {step.label}
            </span>
          );
          return (
            <li key={step.key}>
              {isReachable ? (
                <Link href={`/dashboard/profile/setup/${step.key}`}>{content}</Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
      <Link
        href="/dashboard"
        className="mt-6 block px-3 py-2 text-xs text-muted-foreground underline hover:text-foreground"
      >
        Save &amp; exit
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/WizardStepper.tsx
git commit -m "feat(onboarding): WizardStepper sidebar component"
```

### Task B3.3: /setup index page (redirector)

**Files:**
- Create: `src/app/dashboard/profile/setup/page.tsx`

- [ ] **Step 1: Implement**

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { nextIncompleteStep } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

export default async function SetupIndex() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('vendor_profiles').select('*').eq('user_id', user.id).maybeSingle();
  redirect(`/dashboard/profile/setup/${nextIncompleteStep(profile)}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/profile/setup/page.tsx
git commit -m "feat(onboarding): /setup index redirects to first incomplete step"
```

### Task B3.4: Step 1 — Basics page + StepBasics component

**Files:**
- Create: `src/app/dashboard/profile/setup/basics/page.tsx`
- Create: `src/components/onboarding/StepBasics.tsx`

- [ ] **Step 1: Server component shell**

```typescript
// src/app/dashboard/profile/setup/basics/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepBasics } from '@/components/onboarding/StepBasics';

export const dynamic = 'force-dynamic';

export default async function BasicsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('vendor_profiles').select('*').eq('user_id', user.id).maybeSingle();
  return (
    <StepBasics
      initial={{
        businessName: profile?.business_name ?? '',
        category: profile?.category ?? '',
        bio: profile?.bio ?? '',
      }}
    />
  );
}
```

- [ ] **Step 2: Client component**

```typescript
// src/components/onboarding/StepBasics.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { basicsSchema } from '@/lib/onboarding/validation';
import { BioAssistButton } from './BioAssistButton';

const CATEGORIES = ['photography', 'mehndi', 'dj', 'catering', 'florist', 'venue', 'decor', 'planner']; // existing enum

interface Props {
  initial: { businessName: string; category: string; bio: string };
}

export function StepBasics({ initial }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onNext() {
    const parsed = basicsSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/vendor-profile/setup/basics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    setSubmitting(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
      setError(error);
      return;
    }
    router.push('/dashboard/profile/setup/location');
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tell us about your business</h1>
        <p className="text-sm text-muted-foreground">Step 1 of 5</p>
      </div>

      <div>
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          value={data.businessName}
          onChange={(e) => setData({ ...data, businessName: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <Select
          value={data.category}
          onValueChange={(v) => setData({ ...data, category: v })}
        >
          <SelectTrigger id="category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="bio">Bio</Label>
          <BioAssistButton
            businessName={data.businessName}
            category={data.category}
            currentBio={data.bio}
            onAccept={(polished) => setData({ ...data, bio: polished })}
          />
        </div>
        <Textarea
          id="bio"
          rows={5}
          value={data.bio}
          onChange={(e) => setData({ ...data, bio: e.target.value })}
          placeholder="What do you do, who do you serve, and what makes you different? (50–500 characters)"
        />
        <p className="mt-1 text-xs text-muted-foreground">{data.bio.length} / 500</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/profile/setup/basics src/components/onboarding/StepBasics.tsx
git commit -m "feat(onboarding): step 1 — Basics (business name + category + bio)"
```

### Task B3.5: Step 2 — Location

**Files:**
- Create: `src/app/dashboard/profile/setup/location/page.tsx`
- Create: `src/components/onboarding/StepLocation.tsx`

- [ ] **Step 1: Server shell** (analogous to B3.4 — fetch profile, pass `base_*` fields as `initial`)

- [ ] **Step 2: Client component**

Reuse the existing GooglePlacesAutocomplete component. Form fields: address (autocompleted, fills line_1/city/state/postal/place_id at once) + `Switch` for `base_address_public`.

Helper text under the toggle: "Couples see your city + state always. Full address shown only after they pay the deposit, unless you make it public here."

Validation via `locationSchema`. On Next: PATCH `/api/vendor-profile/setup/location`, then `router.push('/dashboard/profile/setup/online')`.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/profile/setup/location src/components/onboarding/StepLocation.tsx
git commit -m "feat(onboarding): step 2 — Location with Google Places + privacy toggle"
```

### Task B3.6: Step 3 — Online presence

**Files:**
- Create: `src/app/dashboard/profile/setup/online/page.tsx`
- Create: `src/components/onboarding/StepOnline.tsx`

- [ ] **Step 1: Implementation**

Form: `instagramHandle` (required, strip leading `@` on blur), `websiteUrl` (optional, validate URL when non-empty). Validation via `onlineSchema`. PATCH `/api/vendor-profile/setup/online`, push `/setup/portfolio`.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(onboarding): step 3 — Online presence (Instagram required, website optional)"
```

### Task B3.7: Step 4 — Portfolio

**Files:**
- Create: `src/app/dashboard/profile/setup/portfolio/page.tsx`
- Create: `src/components/onboarding/StepPortfolio.tsx`

- [ ] **Step 1: Implementation**

Use existing UploadThing `UploadButton` from `@/lib/uploadthing` (verify the import path matches the codebase). Grid of thumbnails (96×96) with a red X delete button on each. Maintain `portfolio_images: string[]` in local state. On `onClientUploadComplete`, push new URLs into the array. Soft nudge banner: "Vendors with 3+ photos get 2× more clicks — add more if you have them" (shown only when length < 3).

Required: length ≥ 1 (`portfolioSchema`). PATCH `/api/vendor-profile/setup/portfolio`, push `/setup/review`.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(onboarding): step 4 — Portfolio with UploadThing + soft 3+ nudge"
```

### Task B3.8: Step 5 — Review & publish

**Files:**
- Create: `src/app/dashboard/profile/setup/review/page.tsx`
- Create: `src/components/onboarding/StepReview.tsx`

- [ ] **Step 1: Server shell** — fetches the full profile + passes to client.

- [ ] **Step 2: Client component**

Read-only summary divided into 4 sections (Basics, Location, Online, Portfolio), each with an "Edit" link back to that step. Below the summary: a live `VendorCard` preview (reuse the existing marketplace component). Bottom: `Publish profile` button.

On click: POST `/api/vendor-profile/publish`. On success → `router.push('/dashboard/profile/packages?just_onboarded=1')`. On 400 → show error + offer "Go to {step}" link based on `error.field`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(onboarding): step 5 — Review & publish with live preview"
```

---

## Phase B4 — Per-step PATCH + Publish endpoint

### Task B4.1: Per-step PATCH endpoint

**Files:**
- Create: `src/app/api/vendor-profile/setup/[step]/route.ts`
- Test: `src/__tests__/api/vendor-profile-setup.test.ts`

- [ ] **Step 1: Write the failing test (one per step)**

Mock `requireUser` to return a known user. Mock the Supabase client. Assert:
- Each step calls UPSERT (basics) or UPDATE (others) with the correctly mapped column names
- Invalid input returns 400 with the Zod error
- Unauthorized returns 401

- [ ] **Step 2: Implement**

```typescript
// src/app/api/vendor-profile/setup/[step]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import {
  basicsSchema, locationSchema, onlineSchema, portfolioSchema,
} from '@/lib/onboarding/validation';
import { slugify } from '@/lib/utils'; // verify name; existing helper for vendor slugs

export const PATCH = withErrorBoundary(
  async (req: NextRequest, { params }: { params: Promise<{ step: string }> }) => {
    const { step } = await params;
    const { user, supabase } = await requireUser();
    const body = await req.json();

    if (step === 'basics') {
      const data = basicsSchema.parse(body);
      const { data: existing } = await supabase
        .from('vendor_profiles').select('id, slug').eq('user_id', user.id).maybeSingle();
      const payload = {
        user_id: user.id,
        business_name: data.businessName,
        category: data.category,
        bio: data.bio,
        slug: existing?.slug ?? slugify(data.businessName),
      };
      const { error } = existing
        ? await supabase.from('vendor_profiles').update(payload).eq('id', existing.id)
        : await supabase.from('vendor_profiles').insert(payload);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (step === 'location') {
      const data = locationSchema.parse(body);
      const { error } = await supabase.from('vendor_profiles').update({
        base_address_line_1: data.baseAddressLine1,
        base_city: data.baseCity,
        base_state: data.baseState,
        base_postal_code: data.basePostalCode,
        base_google_place_id: data.baseGooglePlaceId,
        base_address_public: data.baseAddressPublic,
      }).eq('user_id', user.id);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (step === 'online') {
      const data = onlineSchema.parse(body);
      const { error } = await supabase.from('vendor_profiles').update({
        instagram_handle: data.instagramHandle,
        website_url: data.websiteUrl || null,
      }).eq('user_id', user.id);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (step === 'portfolio') {
      const data = portfolioSchema.parse(body);
      const { error } = await supabase.from('vendor_profiles').update({
        portfolio_images: data.portfolioImages,
      }).eq('user_id', user.id);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown step: ${step}`);
  }
);
```

Note: if `slugify` doesn't exist in `@/lib/utils`, write a small helper inline that lowercases, replaces non-alphanumerics with `-`, collapses runs, and appends `-{6 hex chars}` for uniqueness. Verify before implementing.

- [ ] **Step 3: Verify and commit**

```bash
git add src/app/api/vendor-profile/setup src/__tests__/api/vendor-profile-setup.test.ts
git commit -m "feat(api): PATCH /api/vendor-profile/setup/[step] for wizard persistence"
```

### Task B4.2: Publish endpoint

**Files:**
- Create: `src/app/api/vendor-profile/publish/route.ts`
- Test: `src/__tests__/api/vendor-profile-publish.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/vendor-profile/publish/route';

vi.mock('@/lib/api/auth', () => ({
  requireUser: vi.fn(),
}));

describe('POST /api/vendor-profile/publish', () => {
  // 8 test cases:
  // 1. unauth → 401
  // 2. missing bio → 400 with field='bio'
  // 3. missing address → 400 with field='base_address_line_1' (first missing)
  // 4. missing instagram → 400 with field='instagram_handle'
  // 5. empty portfolio → 400 with field='portfolio_images'
  // 6. bio too short → 400
  // 7. complete profile → 200 + flips onboarding_complete=true + is_active=true
  // 8. already published → 200 (idempotent) returns same fields
});
```

- [ ] **Step 2: Implement**

```typescript
// src/app/api/vendor-profile/publish/route.ts
import { NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { publishGateSchema } from '@/lib/onboarding/validation';

export const POST = withErrorBoundary(async () => {
  const { user, supabase } = await requireUser();
  const { data: profile, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (error || !profile) throw new HttpError(404, 'No vendor profile found — start the wizard first.');

  const parsed = publishGateSchema.safeParse(profile);
  if (!parsed.success) {
    const issue = parsed.error.errors[0];
    return NextResponse.json(
      { error: 'Profile incomplete', field: issue.path[0], message: issue.message },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from('vendor_profiles')
    .update({ onboarding_complete: true, is_active: true, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (updateError) throw new HttpError(500, updateError.message);

  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 3: Verify and commit**

```bash
git add src/app/api/vendor-profile/publish src/__tests__/api/vendor-profile-publish.test.ts
git commit -m "feat(api): POST /api/vendor-profile/publish with server-side gate"
```

---

## Phase B4.5 — AI bio assistant

### Task B4.5.1: Install SDK + env setup

- [ ] **Step 1: Install**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add env var**

Tell the user (in the PR description) to add `ANTHROPIC_API_KEY=sk-ant-...` to:
- `.env.local`
- Vercel → Settings → Environment Variables → Production

Do **not** commit the key. Add `ANTHROPIC_API_KEY` to `.env.example` with `<your-anthropic-api-key>`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore(deps): add @anthropic-ai/sdk for bio assistant"
```

### Task B4.5.2: Rate limit table + migration

**Files:**
- Create: `supabase/migrations/00031_ai_bio_assist_calls.sql`
- Create: `src/lib/ai/rate-limit.ts`
- Test: `src/__tests__/lib/ai/rate-limit.test.ts`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/00031_ai_bio_assist_calls.sql
CREATE TABLE ai_bio_assist_calls (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  calls_in_window integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_bio_assist_calls ENABLE ROW LEVEL SECURITY;
-- No policies: service-role-only access from the API endpoint.
```

- [ ] **Step 2: Rate limit lib**

```typescript
// src/lib/ai/rate-limit.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CALLS = 10;

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkAndIncrement(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<RateLimitCheck> {
  const { data: row } = await supabase
    .from('ai_bio_assist_calls')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const now = Date.now();
  const windowStart = row ? new Date(row.window_started_at).getTime() : 0;
  const windowExpired = now - windowStart > WINDOW_MS;

  if (!row || windowExpired) {
    await supabase.from('ai_bio_assist_calls').upsert({
      user_id: userId, calls_in_window: 1, window_started_at: new Date(now).toISOString(),
    });
    return { allowed: true, remaining: MAX_CALLS - 1, resetAt: new Date(now + WINDOW_MS) };
  }

  if (row.calls_in_window >= MAX_CALLS) {
    return { allowed: false, remaining: 0, resetAt: new Date(windowStart + WINDOW_MS) };
  }

  await supabase
    .from('ai_bio_assist_calls')
    .update({ calls_in_window: row.calls_in_window + 1 })
    .eq('user_id', userId);
  return {
    allowed: true,
    remaining: MAX_CALLS - row.calls_in_window - 1,
    resetAt: new Date(windowStart + WINDOW_MS),
  };
}
```

- [ ] **Step 3: Unit tests** — fresh user (0 calls → allowed), at-limit (10 calls → denied), expired window (resets), increment counter.

- [ ] **Step 4: Apply migration to dev**

Hand the user the SQL block for Supabase SQL editor.

- [ ] **Step 5: Regenerate types**

```bash
npx supabase gen types typescript --project-id lquvhjedlzubqusnfaak > src/types/database.types.ts
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00031_ai_bio_assist_calls.sql src/lib/ai/rate-limit.ts \
        src/__tests__/lib/ai/rate-limit.test.ts src/types/database.types.ts
git commit -m "feat(ai): rate limit table + per-user 10/24h check"
```

### Task B4.5.3: /api/ai/bio-assist streaming endpoint

**Files:**
- Create: `src/lib/ai/anthropic.ts`
- Create: `src/lib/ai/prompts.ts`
- Create: `src/app/api/ai/bio-assist/route.ts`
- Test: `src/__tests__/api/ai-bio-assist.test.ts`

- [ ] **Step 1: Anthropic client singleton**

```typescript
// src/lib/ai/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}
```

- [ ] **Step 2: Prompts** (full content from spec §5a)

```typescript
// src/lib/ai/prompts.ts
export const BIO_DRAFT_SYSTEM = `You write short, warm vendor bios for a Desi/South Asian wedding marketplace called Baazar.io. Bios are 50–500 characters, 2–3 sentences, written in first person plural (we/our). Focus on what the vendor does, who they serve, and one specific quality. Avoid clichés ("passionate", "experienced") and superlatives ("the best"). Don't mention pricing.`;

export const BIO_POLISH_SYSTEM = `You polish vendor bios for a Desi/South Asian wedding marketplace. Preserve the vendor's meaning and voice. Improve clarity, warmth, and flow. Keep the polished version under 500 characters. Don't add facts the vendor didn't state. Output only the polished bio, no preamble.`;

export function bioDraftUserPrompt(ctx: { businessName: string; category: string; instagramHandle?: string }): string {
  const insta = ctx.instagramHandle ? `Instagram: @${ctx.instagramHandle}\n` : '';
  return `Vendor: ${ctx.businessName}\nCategory: ${ctx.category}\n${insta}\nWrite a starter bio for this vendor.`;
}

export function bioPolishUserPrompt(ctx: { businessName: string; category: string; draft: string }): string {
  return `Vendor: ${ctx.businessName}\nCategory: ${ctx.category}\n\nOriginal bio:\n${ctx.draft}\n\nPolish it.`;
}
```

- [ ] **Step 3: Streaming endpoint**

```typescript
// src/app/api/ai/bio-assist/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api/auth';
import { getAnthropic } from '@/lib/ai/anthropic';
import { BIO_DRAFT_SYSTEM, BIO_POLISH_SYSTEM, bioDraftUserPrompt, bioPolishUserPrompt } from '@/lib/ai/prompts';
import { checkAndIncrement } from '@/lib/ai/rate-limit';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  businessName: z.string().min(1),
  category: z.string().min(1),
  instagramHandle: z.string().optional(),
  draft: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { data: userRow } = await createServiceRoleClient()
    .from('users').select('role').eq('id', user.id).single();
  if (userRow?.role !== 'vendor') {
    return new Response(JSON.stringify({ error: 'Vendors only' }), { status: 403 });
  }

  const rate = await checkAndIncrement(createServiceRoleClient(), user.id);
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', resetAt: rate.resetAt.toISOString() }),
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)) } }
    );
  }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400 });

  const { businessName, category, instagramHandle, draft } = parsed.data;
  const usePolish = draft && draft.trim().length >= 20;
  const system = usePolish ? BIO_POLISH_SYSTEM : BIO_DRAFT_SYSTEM;
  const userPrompt = usePolish
    ? bioPolishUserPrompt({ businessName, category, draft: draft! })
    : bioDraftUserPrompt({ businessName, category, instagramHandle });

  try {
    const anthropic = getAnthropic();
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (err) {
          logger.error('bio-assist stream error', err, { user_id: user.id });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`));
          controller.close();
        }
      },
    });
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    logger.error('bio-assist setup error', err, { user_id: user.id });
    return new Response(JSON.stringify({ error: 'AI service unavailable' }), { status: 503 });
  }
}
```

- [ ] **Step 4: Unit tests**

Mock `getAnthropic()` + `requireUser` + `createServiceRoleClient`. Tests:
- Unauth → 401
- Couple role → 403
- Rate-limited → 429 with `Retry-After` header
- Empty draft → uses draft system prompt
- Draft ≥20 chars → uses polish system prompt
- Anthropic throws → 503

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai src/app/api/ai/bio-assist src/__tests__/api/ai-bio-assist.test.ts
git commit -m "feat(ai): streaming bio-assist endpoint with draft + polish modes"
```

### Task B4.5.4: BioAssistButton component

**Files:**
- Create: `src/components/onboarding/BioAssistButton.tsx`

- [ ] **Step 1: Implement**

```typescript
// src/components/onboarding/BioAssistButton.tsx
'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Props {
  businessName: string;
  category: string;
  currentBio: string;
  onAccept: (polished: string) => void;
}

export function BioAssistButton({ businessName, category, currentBio, onAccept }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setSuggestion('');
    setError(null);
    setStreaming(true);
    try {
      const res = await fetch('/api/ai/bio-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, category, draft: currentBio }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Request failed' }));
        setError(e.error);
        setStreaming(false);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.text) setSuggestion((s) => s + payload.text);
          if (payload.error) setError(payload.error);
        }
      }
      setStreaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream failed');
      setStreaming(false);
    }
  }

  const disabled = !businessName || !category;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={start} disabled={disabled}>
        <Sparkles className="h-3 w-3 mr-1" />
        Help me write this
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>AI suggestion</DialogTitle>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="rounded-md border bg-muted/30 p-4 min-h-[120px] whitespace-pre-wrap text-sm">
            {suggestion || (streaming ? 'Generating…' : '')}
          </div>
          <p className="text-xs text-muted-foreground">
            Edit it below before accepting if you want changes.
          </p>
          <textarea
            className="w-full rounded-md border p-2 text-sm"
            rows={5}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            disabled={streaming}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onAccept(suggestion); setOpen(false); }} disabled={streaming || !suggestion}>
              Use this
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/BioAssistButton.tsx
git commit -m "feat(onboarding): BioAssistButton with streaming modal"
```

---

## Phase B5 — Polish + post-onboarding routing

### Task B5.1: Just-onboarded banner on packages page

**Files:**
- Modify: `src/app/dashboard/profile/packages/page.tsx`

- [ ] **Step 1: Read the existing page, add a `searchParams.just_onboarded` check, render a banner above the packages list:**

```jsx
{justOnboarded && (
  <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/10 p-4">
    <h3 className="font-semibold">🎉 Profile is live!</h3>
    <p className="text-sm">Create your first package to start receiving bookings.</p>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(onboarding): just_onboarded banner on packages page"
```

### Task B5.2: Dashboard CTA + ProfileSetup cleanup + claim redirect

**Files:**
- Modify: `src/app/dashboard/page.tsx` (vendor "Set up your profile" CTA → `/dashboard/profile/setup`)
- Modify: `src/app/api/vendors/claim/route.ts` (return redirect target as `/dashboard/profile/setup`)
- Delete: `src/components/dashboard/ProfileSetup.tsx`
- Modify: `src/app/dashboard/profile/page.tsx` — remove the `<ProfileSetup>` render path (now lives at `/setup`)

- [ ] **Step 1: Find the CTA**

```bash
grep -rn "Set up your profile\|claim" src/app/dashboard/ | head -5
```

- [ ] **Step 2: Update + delete**

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(onboarding): point dashboard CTA + claim flow at /setup; remove ProfileSetup component"
```

### Task B5.3: Redirect edit form to wizard if not onboarded

**Files:**
- Modify: `src/app/dashboard/profile/page.tsx`

- [ ] **Step 1: Add redirect**

At the top of the page handler, after fetching the vendor profile:

```typescript
if (vendorProfile && !vendorProfile.onboarding_complete) {
  redirect('/dashboard/profile/setup');
}
if (!vendorProfile) redirect('/dashboard/profile/setup');
```

The remaining edit form code only runs for onboarding-complete profiles.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(onboarding): redirect /profile to /setup when onboarding_complete=false"
```

---

## Phase B6 — E2E

### Task B6.1: E2E spec

**Files:**
- Create: `tests/e2e/vendor-onboarding.spec.ts`

- [ ] **Step 1: Test 1 — Fresh signup → publish**

```typescript
test('fresh vendor signup → wizard → publish → visible in marketplace', async ({ page, request }) => {
  const vendor = await seedVendor({ /* user only, no profile */ });
  await loginAs(page, vendor);
  await page.goto('/dashboard/profile/setup');
  await expect(page).toHaveURL(/\/setup\/basics/);

  // Fill Step 1
  await page.getByLabel('Business name').fill('E2E Henna');
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'mehndi' }).click();
  await page.getByLabel('Bio').fill('We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years of bridal experience.');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: Location (Google Places stubbed in test env)
  await expect(page).toHaveURL(/\/setup\/location/);
  await page.getByLabel('Base address').fill('123 Test St, Chicago, IL 60601');
  // Wait for autocomplete selection or fill hidden fields directly via test endpoint
  // ... (test-only mode hits a stubbed completer)
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: Online
  await page.getByLabel('Instagram handle').fill('e2e_henna');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 4: Portfolio — seed an image URL directly via API since UploadThing needs network
  await request.patch('/api/vendor-profile/setup/portfolio', {
    data: { portfolioImages: ['https://utfs.io/test.jpg'] },
    headers: { Cookie: /* session cookie */ }
  });
  await page.goto('/dashboard/profile/setup/review');

  // Step 5: Publish
  await page.getByRole('button', { name: 'Publish profile' }).click();
  await expect(page).toHaveURL(/just_onboarded=1/);

  // Marketplace visibility
  await page.goto('/vendors');
  await expect(page.getByText('E2E Henna')).toBeVisible();

  await cleanup(vendor);
});
```

- [ ] **Step 2: Test 2 — Prefilled profile (mimic scraper)**

Seed a vendor_profiles row directly with business_name + category + instagram + portfolio already set. Log in. `/setup` should redirect straight to `/setup/location` (the first gap). Fill location + publish. Assert.

- [ ] **Step 3: Test 3 — Mid-wizard exit**

Fill Step 1, save, navigate away. Re-visit `/setup` — should redirect to `/setup/location`. Don't complete; just assert URL.

- [ ] **Step 4: Test 4 — Unpublished vendor invisible**

Seed a vendor with `onboarding_complete = false`. Visit `/vendors` (anonymous) — should NOT find the vendor's business_name. Visit `/vendors/<slug>` — should 404.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/vendor-onboarding.spec.ts
git commit -m "test(e2e): vendor onboarding wizard — 4 happy-path + edge tests"
```

---

## Phase B7 — PR + prod migration

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin feat/sub-project-b-vendor-onboarding
gh pr create --title "feat(onboarding): Sub-project B — vendor onboarding wizard + AI bio" --body "$(cat <<'EOF'
## Summary
5-step full-page wizard for vendor onboarding with per-step save, side stepper,
AI bio assistant (Claude Haiku streaming), and a marketplace gate so only
onboarding-complete + active vendors appear in search.

Builds on sub-project A (packages) and F (notifications), both shipped 2026-05-16.

## Pre-merge checklist
- [ ] Apply migration `00031_ai_bio_assist_calls.sql` to prod (dev applied during B4.5.2)
- [ ] Add `ANTHROPIC_API_KEY` to Vercel → Production env
- [ ] Verify `/vendors` list filters work on a prod-like dataset

## Test plan
- [x] Unit tests pass (resume, validation, rate-limit, publish, bio-assist)
- [x] E2E tests pass (vendor-onboarding.spec.ts) locally
EOF
)"
```

- [ ] **Step 2: User applies migration 00031 to prod + sets ANTHROPIC_API_KEY in Vercel**

Hand the user the SQL block:
```sql
CREATE TABLE ai_bio_assist_calls (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  calls_in_window integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_bio_assist_calls ENABLE ROW LEVEL SECURITY;
```

Tell user to add `ANTHROPIC_API_KEY` to Vercel production env vars before merging.

- [ ] **Step 3: Merge**

```bash
gh pr merge <N> --squash --delete-branch
```

---

## Self-review checklist (controller, before dispatching)

- [ ] Every task has explicit file paths
- [ ] Every step shows code or a clear command, not "TBD"
- [ ] Type names consistent across tasks (`ProfileRowShape`, `WizardStep`, `BasicsInput`)
- [ ] `slugify` helper presence verified before B4.1 implementation (or inline helper added)
- [ ] Existing test seed helpers (`seedVendor`) verified to support no-profile case for B6.1 Test 1
- [ ] CATEGORIES list in StepBasics matches the existing enum used by VendorProfileForm
