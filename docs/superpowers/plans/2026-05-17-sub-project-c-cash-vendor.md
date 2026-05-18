# Sub-project C — Cash Vendor Payment Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Add `vendor_profiles.payment_mode` enum (`'stripe' | 'cash'`). Cash vendors take a 5% couple deposit retained 100% by Baazar (no Stripe Connect onboarding, no vendor share). Bundled: fix pre-existing `DEPOSIT_RATE` bug (30% → 10%).

**Architecture:** All vendor payment math goes through helper functions `getDepositRate(mode)`, `getPlatformCutRate(mode)`, `calculatePlatformCut(deposit, mode)`, `calculateVendorPending(deposit, mode)`. Booking flow, cancellation policy, and earnings dashboard all branch on `vendor.payment_mode`. Couple-facing UI shows no payment mode distinction.

**Tech Stack:** Postgres, Next.js 14 App Router, Stripe Checkout, vitest, Playwright.

---

## File structure (per spec §10)

**New:**

- `supabase/migrations/00033_add_payment_mode_to_vendor_profiles.sql`
- `src/components/dashboard/DirectPaymentsCard.tsx`
- `src/components/onboarding/StepPaymentMode.tsx`
- `src/app/dashboard/profile/setup/payment-mode/page.tsx`
- `src/__tests__/lib/utils.test.ts` (new file)
- `tests/e2e/cash-vendor.spec.ts`

**Modified:**

- `src/lib/utils.ts`
- `src/services/payment.service.ts`
- `src/services/booking.service.ts`
- `src/lib/onboarding/resume.ts`
- `src/lib/onboarding/validation.ts`
- `src/components/onboarding/WizardStepper.tsx`
- `src/components/onboarding/StepReview.tsx`
- `src/app/api/vendor-profile/publish/route.ts`
- `src/app/api/vendor-profile/setup/[step]/route.ts`
- `src/app/dashboard/page.tsx`
- `src/app/(marketplace)/terms/page.tsx`
- `src/types/database.types.ts`

---

## Phase C1 — Migration + types + helpers + unit tests

### Task C1.1: Migration 00033

**Files:**

- Create: `supabase/migrations/00033_add_payment_mode_to_vendor_profiles.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00033_add_payment_mode_to_vendor_profiles.sql
-- Sub-project C — cash vendor payment mode
-- See docs/superpowers/specs/2026-05-17-sub-project-c-cash-vendor-design.md
--
-- Nullable on purpose: the wizard's resume logic uses NULL to detect
-- "vendor hasn't explicitly chosen yet." All read sites default to 'stripe'.

ALTER TABLE vendor_profiles
  ADD COLUMN payment_mode text
    CHECK (payment_mode IN ('stripe', 'cash'));
```

- [ ] **Step 2: Update database.types.ts**

Add `payment_mode: 'stripe' | 'cash' | null` to vendor_profiles Row, `payment_mode?: 'stripe' | 'cash' | null` to Insert + Update.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00033_add_payment_mode_to_vendor_profiles.sql src/types/database.types.ts
git commit -m "feat(payment): C1 — migration 00033 + types for payment_mode"
```

### Task C1.2: Constants + helpers in src/lib/utils.ts + unit tests

**Files:**

- Modify: `src/lib/utils.ts`
- Create: `src/__tests__/lib/utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import {
  getDepositRate,
  getPlatformCutRate,
  calculatePlatformCut,
  calculateVendorPending,
  STRIPE_DEPOSIT_RATE,
  CASH_DEPOSIT_RATE,
} from '@/lib/utils';

describe('payment-mode helpers', () => {
  it('STRIPE_DEPOSIT_RATE = 0.10', () => {
    expect(STRIPE_DEPOSIT_RATE).toBe(0.1);
  });

  it('CASH_DEPOSIT_RATE = 0.05', () => {
    expect(CASH_DEPOSIT_RATE).toBe(0.05);
  });

  it('getDepositRate returns 0.10 for stripe', () => {
    expect(getDepositRate('stripe')).toBe(0.1);
  });

  it('getDepositRate returns 0.05 for cash', () => {
    expect(getDepositRate('cash')).toBe(0.05);
  });

  it('getPlatformCutRate returns 0.30 for stripe', () => {
    expect(getPlatformCutRate('stripe')).toBe(0.3);
  });

  it('getPlatformCutRate returns 1.0 for cash', () => {
    expect(getPlatformCutRate('cash')).toBe(1.0);
  });

  describe('calculatePlatformCut', () => {
    it('stripe mode: 30% of deposit', () => {
      expect(calculatePlatformCut(30000, 'stripe')).toBe(9000); // 30% of $300
    });

    it('cash mode: 100% of deposit', () => {
      expect(calculatePlatformCut(15000, 'cash')).toBe(15000); // 100% of $150
    });

    it('defaults to stripe mode when no arg', () => {
      expect(calculatePlatformCut(30000)).toBe(9000);
    });
  });

  describe('calculateVendorPending', () => {
    it('stripe mode: 70% of deposit goes to vendor', () => {
      expect(calculateVendorPending(30000, 'stripe')).toBe(21000);
    });

    it('cash mode: 0 (no vendor share)', () => {
      expect(calculateVendorPending(15000, 'cash')).toBe(0);
    });
  });

  describe('end-to-end on $3000 booking', () => {
    it('stripe vendor: $300 deposit → $90 platform / $210 vendor pending', () => {
      const totalCents = 300_000;
      const depositRate = getDepositRate('stripe');
      const deposit = Math.floor(totalCents * depositRate); // 30000
      expect(deposit).toBe(30000);
      expect(calculatePlatformCut(deposit, 'stripe')).toBe(9000);
      expect(calculateVendorPending(deposit, 'stripe')).toBe(21000);
    });

    it('cash vendor: $150 deposit → $150 platform / $0 vendor', () => {
      const totalCents = 300_000;
      const depositRate = getDepositRate('cash');
      const deposit = Math.floor(totalCents * depositRate); // 15000
      expect(deposit).toBe(15000);
      expect(calculatePlatformCut(deposit, 'cash')).toBe(15000);
      expect(calculateVendorPending(deposit, 'cash')).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npm test -- utils` → expect FAIL on undefined exports.

- [ ] **Step 3: Implement in `src/lib/utils.ts`**

Find the existing `DEPOSIT_RATE` export and `calculatePlatformCut` / `calculateVendorPending` functions. Replace with:

```typescript
export const STRIPE_DEPOSIT_RATE = 0.1;
export const CASH_DEPOSIT_RATE = 0.05;

// Legacy alias — keep for backward compat for one release.
export const DEPOSIT_RATE = STRIPE_DEPOSIT_RATE;

export type PaymentMode = 'stripe' | 'cash';

export function getDepositRate(mode: PaymentMode): number {
  return mode === 'cash' ? CASH_DEPOSIT_RATE : STRIPE_DEPOSIT_RATE;
}

export function getPlatformCutRate(mode: PaymentMode): number {
  return mode === 'cash' ? 1.0 : 0.3;
}

export function calculatePlatformCut(depositCents: number, mode: PaymentMode = 'stripe'): number {
  return Math.round(depositCents * getPlatformCutRate(mode));
}

export function calculateVendorPending(depositCents: number, mode: PaymentMode = 'stripe'): number {
  return depositCents - calculatePlatformCut(depositCents, mode);
}
```

- [ ] **Step 4: Verify and commit**

`npm run lint && npm run typecheck && npm test -- utils` all green.

```bash
git add src/lib/utils.ts src/__tests__/lib/utils.test.ts
git commit -m "feat(payment): C1 — payment_mode helpers + unit tests + DEPOSIT_RATE fix to 0.10"
```

---

## Phase C2 — payment.service.ts cash branches

### Task C2.1: Branch deposit checkout on payment_mode

**Files:**

- Modify: `src/services/payment.service.ts`
- Modify: `src/services/booking.service.ts` (to surface `payment_mode` in selects)

- [ ] **Step 1: Update booking.service.ts selects**

Find any `.select(...)` calls on `vendor_profiles` that are returned to payment-service callers. Add `payment_mode` to the select list. Pattern:

```typescript
.select('id, user_id, business_name, slug, category, payment_mode')
```

- [ ] **Step 2: Branch deposit checkout in payment.service.ts**

Find the `createDepositCheckout` (or equivalent) function. It currently does:

```typescript
const depositAmount = Math.floor(booking.total_price_cents * DEPOSIT_RATE);
const platformCut = calculatePlatformCut(depositAmount);
const vendorPending = calculateVendorPending(depositAmount);
```

Replace with:

```typescript
import {
  getDepositRate,
  calculatePlatformCut,
  calculateVendorPending,
  type PaymentMode,
} from '@/lib/utils';

const paymentMode = (vp.payment_mode ?? 'stripe') as PaymentMode;
const depositAmount = Math.floor(booking.total_price_cents * getDepositRate(paymentMode));
const platformCut = calculatePlatformCut(depositAmount, paymentMode);
const vendorPending = calculateVendorPending(depositAmount, paymentMode);
```

Update the Stripe checkout line item description from `'30% deposit for booking with X'` (or `'10% deposit for booking with X'`) to the generic `'Deposit for booking with X'` — this hides the % from couples.

- [ ] **Step 3: Branch cancellation policy in getCancellationPolicy()**

Find `getCancellationPolicy()` in payment.service.ts. After computing the standard Stripe policy, before returning, add:

```typescript
// For cash vendors, vendor has no share — platform keeps whatever the couple doesn't get refunded.
if (paymentMode === 'cash') {
  return {
    ...policy,
    vendorKeepPct: 0,
    platformKeepPct: 1 - policy.coupleRefundPct,
    clawVendorOtherPending: false, // No vendor share to claw
  };
}
```

The function signature needs `paymentMode` as an arg. Update all callers (`cancelBooking` reads it from the booking's vendor profile).

- [ ] **Step 4: Add tests in src/**tests**/services/payment.service.test.ts**

Extend the existing test file with cash-mode cases:

- `createDepositCheckout` for cash vendor: deposit = 5% of total, transaction row has platform_fee = depositAmount, vendor_payout = 0
- `getCancellationPolicy('cash')` for each tier:
  - <24h: 100% refund / 0 platform
  - > 30d: 50% refund / 50% platform / 0 vendor
  - ≤30d: 0% refund / 100% platform / 0 vendor
  - Vendor cancel: 100% refund / 0 platform / 0 vendor

- [ ] **Step 5: Verify and commit**

```bash
git commit -m "feat(payment): C2 — branch deposit + cancellation policy on payment_mode"
```

---

## Phase C3 — Onboarding wizard new step

### Task C3.1: Update resume + validation + Zod schema

**Files:**

- Modify: `src/lib/onboarding/resume.ts`
- Modify: `src/lib/onboarding/validation.ts`

- [ ] **Step 1: Add payment-mode step to resume order**

In `resume.ts`, the existing `WizardStep` type is `'basics' | 'location' | 'online' | 'portfolio' | 'review'`. Add `'payment-mode'` BEFORE `'review'`:

```typescript
export type WizardStep = 'basics' | 'location' | 'online' | 'portfolio' | 'payment-mode' | 'review';
```

Update `nextIncompleteStep`: after `portfolio` check, before `review`, check:

```typescript
if (!profile.payment_mode) return 'payment-mode';
```

Note: payment_mode has a DB-level default of `'stripe'`, so existing vendors will never hit this branch — only fresh signups going through the wizard. For those, the wizard step records their explicit choice rather than relying on the default.

Wait — since `payment_mode` defaults to `'stripe'` and is NOT NULL at the DB level, the resume check `if (!profile.payment_mode)` would never be true after INSERT. Two options:

- Drop the resume check, just always show the step (vendors can navigate back to change)
- Use a sentinel value or NULL-default + backfill — but that breaks the NOT NULL constraint

Simpler: drop the resume check. The wizard always shows the payment-mode step, but on first visit, the vendor's profile already has `payment_mode = 'stripe'` (DB default). The step pre-populates and lets them switch if they want. If they don't visit the step, the default stands.

So `nextIncompleteStep` doesn't change for payment-mode — but the WizardStepper renders it as a 6th step. The "resume to first incomplete step" logic naturally skips past it when all earlier steps are complete (since payment-mode is always "complete" because of the default).

Better approach: make the resume logic land on `payment-mode` IF the vendor hasn't explicitly visited it yet. Track this via a new column? Probably overkill. Let me think...

Alternative: drop the DB default. Make `payment_mode` nullable. Use the resume check as written. The wizard's payment-mode step inserts the value; until then, it's NULL.

Tradeoff: nullable payment_mode means callers need to default to 'stripe' on read. Adds a small surface area.

I'll go with the **nullable payment_mode** approach — cleaner resume logic, costs a few `?? 'stripe'` reads.

Update migration C1.1 accordingly:

```sql
-- 00033_add_payment_mode_to_vendor_profiles.sql
ALTER TABLE vendor_profiles
  ADD COLUMN payment_mode text
    CHECK (payment_mode IN ('stripe', 'cash'));
-- NULL = vendor hasn't completed onboarding payment step yet.
-- Treat NULL as 'stripe' for backfill compat with pre-C onboarding completions.
```

And in code:

```typescript
const paymentMode = (vp.payment_mode ?? 'stripe') as PaymentMode;
```

OK proceeding with nullable.

- [ ] **Step 2: Add paymentModeSchema to validation.ts**

```typescript
export const paymentModeSchema = z.object({
  paymentMode: z.enum(['stripe', 'cash']),
});

export type PaymentModeInput = z.infer<typeof paymentModeSchema>;
```

- [ ] **Step 3: Tests**

Update `src/__tests__/lib/onboarding/resume.test.ts` to add:

- Returns 'payment-mode' when payment_mode is NULL and all prior steps complete
- Returns 'review' when payment_mode is set

Update `src/__tests__/lib/onboarding/validation.test.ts` to add a few `paymentModeSchema` cases.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(onboarding): C3 — payment-mode wizard step in resume + validation"
```

### Task C3.2: StepPaymentMode component + page

**Files:**

- Create: `src/components/onboarding/StepPaymentMode.tsx`
- Create: `src/app/dashboard/profile/setup/payment-mode/page.tsx`

- [ ] **Step 1: Server page**

```typescript
// src/app/dashboard/profile/setup/payment-mode/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepPaymentMode } from '@/components/onboarding/StepPaymentMode';

export const dynamic = 'force-dynamic';

export default async function PaymentModePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('payment_mode')
    .eq('user_id', user.id)
    .maybeSingle();

  return <StepPaymentMode initial={profile?.payment_mode ?? 'stripe'} />;
}
```

- [ ] **Step 2: Client component**

```typescript
// src/components/onboarding/StepPaymentMode.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CreditCard, Wallet } from 'lucide-react';

interface Props {
  initial: 'stripe' | 'cash';
}

export function StepPaymentMode({ initial }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'stripe' | 'cash'>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onNext() {
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/vendor-profile/setup/payment-mode', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMode: mode }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: 'Save failed' }));
      setError(e.error);
      return;
    }
    router.push('/dashboard/profile/setup/review');
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">How do you want to receive payments?</h1>
        <p className="text-sm text-muted-foreground">Step 5 of 6</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('stripe')}
          className={`rounded-lg border-2 p-6 text-left transition-colors ${
            mode === 'stripe' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
          }`}
        >
          <CreditCard className="h-8 w-8 mb-3 text-primary" />
          <h3 className="font-semibold mb-1">Through Baazar (recommended)</h3>
          <p className="text-sm text-muted-foreground">
            Couples pay a 10% deposit. We hold your portion until you set up Stripe Connect later. Best for tracking and dispute protection.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode('cash')}
          className={`rounded-lg border-2 p-6 text-left transition-colors ${
            mode === 'cash' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
          }`}
        >
          <Wallet className="h-8 w-8 mb-3 text-primary" />
          <h3 className="font-semibold mb-1">Direct payments</h3>
          <p className="text-sm text-muted-foreground">
            Coordinate with each couple yourself (cash, Zelle, check, etc.). Baazar handles a small platform fee at booking — you handle the rest.
          </p>
        </button>
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
git commit -m "feat(onboarding): C3 — StepPaymentMode component + page"
```

### Task C3.3: Update setup PATCH route + publish gate

**Files:**

- Modify: `src/app/api/vendor-profile/setup/[step]/route.ts`
- Modify: `src/app/api/vendor-profile/publish/route.ts`
- Modify: `src/lib/onboarding/validation.ts` (publishGateSchema)

- [ ] **Step 1: Add 'payment-mode' branch to setup PATCH**

In the `[step]` route, add another branch:

```typescript
if (step === 'payment-mode') {
  const data = paymentModeSchema.parse(body);
  const { error } = await supabase
    .from('vendor_profiles')
    .update({ payment_mode: data.paymentMode })
    .eq('user_id', user.id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add payment_mode to publishGateSchema**

```typescript
export const publishGateSchema = z.object({
  // ...existing fields
  payment_mode: z.enum(['stripe', 'cash']),
});
```

This ensures the vendor can't publish their profile until they've explicitly set a payment mode (instead of relying on the DB default).

- [ ] **Step 3: Update WizardStepper**

In `src/components/onboarding/WizardStepper.tsx`, the existing `STEPS` array needs a new entry:

```typescript
const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'location', label: 'Location' },
  { key: 'online', label: 'Online presence' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'payment-mode', label: 'Payment mode' },
  { key: 'review', label: 'Review & publish' },
];
```

- [ ] **Step 4: Update StepReview to show payment mode in summary**

In `StepReview.tsx`, add a section displaying the chosen payment mode (Stripe/Cash) with an "Edit" link to `/setup/payment-mode`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(onboarding): C3 — wire payment-mode into setup + publish gate"
```

---

## Phase C4 — Vendor dashboard branch

### Task C4.1: DirectPaymentsCard component

**Files:**

- Create: `src/components/dashboard/DirectPaymentsCard.tsx`

- [ ] **Step 1: Implement** (per spec §7)

```typescript
// src/components/dashboard/DirectPaymentsCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  confirmedBookings: number;
  upcomingEvents: number;
}

export function DirectPaymentsCard({ confirmedBookings, upcomingEvents }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Direct payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Confirmed bookings</span>
          <span className="font-semibold">{confirmedBookings}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Upcoming events</span>
          <span className="font-semibold">{upcomingEvents}</span>
        </div>
        <p className="text-xs text-muted-foreground pt-3 mt-3 border-t">
          Payments tracked outside Baazar. Coordinate directly with each couple.
        </p>
      </CardContent>
    </Card>
  );
}
```

### Task C4.2: Branch dashboard render

**Files:**

- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Find the existing earnings card branch in the vendor render path**

Today the page renders `<EarningsCard earnings={earnings} />` and `<RecentUnlocks unlocks={recentUnlocks} />`. Branch on `vendorProfile.payment_mode`:

```typescript
if (vendorProfile.payment_mode === 'cash') {
  // Fetch counts instead of earnings/unlocks
  const { count: confirmedCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfile.id)
    .in('status', ['deposit_paid', 'completed']);
  const { count: upcomingCount } = await supabase
    .from('booking_events')
    .select('id, bookings!inner(*)', { count: 'exact', head: true })
    .eq('bookings.vendor_profile_id', vendorProfile.id)
    .gte('event_date', new Date().toISOString().slice(0, 10));
  // Render <DirectPaymentsCard /> instead of <EarningsCard /> + <RecentUnlocks />
}
```

- [ ] **Step 2: Stripe Connect pages redirect**

Find any pages under `src/app/dashboard/stripe/*`. At the top of each, if `vendorProfile.payment_mode === 'cash'`, `redirect('/dashboard')`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(dashboard): C4 — branch earnings card on payment_mode for cash vendors"
```

---

## Phase C5 — Terms page + E2E

### Task C5.1: Update terms page

**Files:**

- Modify: `src/app/(marketplace)/terms/page.tsx`

- [ ] **Step 1: Update deposit copy**

The current terms page says "30% of the deposit as its service fee" but the deposit is 10%. Update to make math explicit:

```jsx
<h2>2. Hold deposits and cancellation</h2>
<p>
  When a couple accepts a vendor's quote, they pay a small hold deposit through the
  Platform. The exact amount depends on the vendor's payment model:
</p>
<ul>
  <li>
    <strong>Standard vendors:</strong> couples pay a 10% deposit. The Platform retains
    30% of the deposit as its service fee. The remaining 70% is released to the vendor
    after the event completes (manually or automatically 48 hours after the event date).
  </li>
  <li>
    <strong>Direct-payment vendors:</strong> couples pay a 5% deposit, which the
    Platform retains in full as its service fee. The vendor coordinates the remaining
    balance directly with the couple (cash, Zelle, bank transfer, etc.).
  </li>
</ul>
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs(terms): C5 — update terms page for cash vendor model + correct Stripe %"
```

### Task C5.2: E2E spec

**Files:**

- Create: `tests/e2e/cash-vendor.spec.ts`

- [ ] **Step 1: Write 4 tests**

```typescript
import { test, expect } from '@playwright/test';
import {
  seedVendorWithCapacity,
  seedCouple,
  seedPackage,
  loginAs,
  cleanup,
  getServiceClient,
} from './helpers/seed';

test.describe('cash vendor — C end-to-end', () => {
  test('cash vendor accepts booking → couple sees 5% deposit checkout', async ({
    page,
    request,
  }) => {
    // Seed a cash vendor (payment_mode='cash')
    // Couple submits booking, vendor accepts
    // Couple's deposit checkout: assert amount = 5% of total
    // After payment: assert transactions row has platform_fee = depositAmount, vendor_payout = 0
  });

  test('cash vendor cancellation >30d: couple gets 50% refund', async ({ page, request }) => {
    // Seed cash vendor + deposit_paid booking with event_date > 30d out
    // Couple cancels → assert refund_amount = 50% of deposit, status = 'couple_cancelled'
  });

  test('cash vendor cancellation ≤30d: 0% refund', async ({ page, request }) => {
    // Seed cash vendor + deposit_paid booking with event_date ≤30d out
    // Couple cancels → assert refund_amount = 0
  });

  test('cash vendor onboarding wizard → DirectPaymentsCard shown on dashboard', async ({
    page,
  }) => {
    // Seed a vendor (no profile yet), go through wizard, select Cash mode
    // After publish, visit /dashboard → assert DirectPaymentsCard renders (not EarningsCard)
  });
});
```

Use the existing seed helpers from `tests/e2e/helpers/seed.ts`. May need to add a `seedCashVendor()` helper or extend the existing `seedVendorWithCapacity` with a `paymentMode` option.

- [ ] **Step 2: Commit**

```bash
git commit -m "test(e2e): C5 — cash vendor 4-test spec"
```

---

## Phase C6 — PR + prod migration

### Task C6.1: Push + open PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/sub-project-c-cash-vendor
```

- [ ] **Step 2: Open PR**

Body must include:

- Summary
- Pre-merge checklist with migration SQL block
- Verification query

### Task C6.2: User applies migration + merges

- Hand user the migration SQL + verification query
- After confirmation: `gh pr merge <N> --squash --delete-branch`

---

## Self-review checklist

- [ ] Migration is reversible — DROP COLUMN works without data loss for the test scenario
- [ ] `payment_mode` is nullable so resume logic can detect "not yet set" (corrected mid-plan; spec said NOT NULL DEFAULT, plan corrected to nullable)
- [ ] Every call site that reads `payment_mode` defaults to `'stripe'` when NULL (`vp.payment_mode ?? 'stripe'`)
- [ ] DEPOSIT_RATE legacy alias is exported so any not-yet-migrated callers keep working
- [ ] Couple-facing UI never shows the % — only the deposit amount in dollars (Stripe checkout line item description is generic)
- [ ] WizardStepper STEPS array updated for 6 steps total
- [ ] Existing 252 unit tests still pass after the changes
