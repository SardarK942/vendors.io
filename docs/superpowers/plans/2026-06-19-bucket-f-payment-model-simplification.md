# Bucket F — Payment Model Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the dual payment model (Stripe mode 10% / Cash mode 5%) to a single 5%-only mode. Rip Stripe Connect plumbing, reframe the vendor Money section as a Baazar-attribution dashboard, unify all fee + cancellation copy at 5%.

**Architecture:** Pure simplification — no new external dependencies, no new tables. One DB migration drops 5 columns from `vendor_profiles`. One service helper (`getVendorAttribution`) replaces the existing earnings query. The wizard collapses 7 → 6 steps via a file deletion + redirect. Locked-verbatim copy blocks land on the terms page, deposit dialog, two emails, and the vendor's StepReview agreement.

**Tech Stack:** Next.js 14 App Router · Supabase (Postgres + RLS, TEXT+CHECK constraints) · Stripe (customer-side checkout only, no Connect transfers) · Tailwind + shadcn · Vitest (unit) · Playwright (E2E, `workers=1`, `fullyParallel=false`) · `tsx` for one-off scripts.

## Global Constraints

- **Spec source of truth:** `docs/superpowers/specs/2026-06-19-bucket-f-payment-model-simplification-design.md` — every task's requirements implicitly include the spec's locked rules.
- **Git workflow:** branch off `main` → `feat/bucket-f-payment-model` → squash-merge via `gh pr create`. NEVER commit directly to `main` (AGENTS.md rule).
- **Migration apply policy:** Claude writes migration SQL files but does NOT apply them. User applies via Supabase SQL editor manually — first to dev, then to prod after PR merge + Vercel rollover.
- **Migration shape lesson (from D.1):** all migration SQL must be single-line statements. The Supabase web SQL editor mangles multi-line `ALTER TABLE` statements.
- **Deposit rate:** `DEPOSIT_RATE = 0.05`. Single constant. No per-mode helpers.
- **Locked verbatim cancellation policy** (used VERBATIM wherever the policy surfaces):
  > **Customer cancellation.** Your 5% deposit is fully refundable within 24 hours of booking. After that, the deposit confirms your reservation and is non-refundable.
  >
  > **Vendor cancellation.** If the vendor cancels at any time, you receive a full refund of your 5% deposit.
  >
  > The 95% balance you pay directly to the vendor is between you and them; Baazar doesn't process or hold those funds.
- **Locked verbatim fee narrative** (replaces every 30%/70% mention):
  > Baazar charges a 5% deposit at booking. We keep that 5% as our platform fee. You pay the remaining 95% directly to the vendor per their payment terms.
- **Locked verbatim vendor-side agreement copy** (StepReview above Publish button):
  > By publishing your profile, you agree to Baazar's terms. Customers pay a 5% deposit through Baazar at booking — that's our platform fee. You collect the 95% balance directly from them. If you cancel a confirmed booking, the customer's deposit is refunded in full.
- **StepReview fee one-liner** (replaces Bucket A T9's dual-mode line):
  > Baazar takes a 5% deposit at booking. Everything else you collect directly from the customer.
- **ROI multiple is 20×**, not 19× (Section 11 of the spec notes the brainstorm math error).
- **Brand tokens (from `docs/DESIGN.md`):** ink `#1B1414`, cream `#FBF6EC`, hot-pink `#D1006C`.
- **Vendor Money section honesty footnote** (persistent caption under KPI strip):
  > Based on confirmed booking totals; doesn't track balance collection.
- **Qualifying booking statuses for attribution:** `accepted`, `adjusted_quote_sent`, `couple_countered`, `deposit_paid`, `completed`. Cancelled and pending excluded.

---

## File Structure

**New files:**

- `supabase/migrations/00058_drop_payment_mode_and_stripe_columns.sql` (number may shift — implementer verifies next available)
- `src/app/dashboard/profile/setup/payment-mode/page.tsx` — replaced with a 3-line redirect (the route directory stays so legacy bookmarks resolve)
- `src/__tests__/services/get-vendor-attribution.test.ts` (or co-located with existing payment.service tests)
- `tests/e2e/bucket-f-wizard-six-steps.spec.ts`
- `tests/e2e/bucket-f-attribution-dashboard.spec.ts`

**Modified files:**

- `src/lib/utils.ts` — single `DEPOSIT_RATE` constant, drop `STRIPE_DEPOSIT_RATE` + `CASH_DEPOSIT_RATE` + `getDepositRate()`
- `src/services/payment.service.ts` — drop Stripe-mode branch, drop the "Vendor hasn't set up payments" null-check, add `getVendorAttribution()`
- `src/types/database.types.ts` — remove `payment_mode` + `stripe_*` columns from `vendor_profiles` Row/Insert/Update
- `src/components/onboarding/StepBasics.tsx` — step counter "1 of 7" → "1 of 6"
- `src/components/onboarding/StepLocation.tsx` — "2 of 7" → "2 of 6"
- `src/components/onboarding/StepOnline.tsx` — "3 of 7" → "3 of 6"
- `src/components/onboarding/StepDetails.tsx` — "4 of 7" → "4 of 6"
- `src/components/onboarding/StepPortfolio.tsx` — "5 of 7" → "5 of 6"
- `src/components/onboarding/StepReview.tsx` — "7 of 7" → "6 of 6"; drop payment-mode summary card; new fee one-liner; vendor agreement block
- `src/components/onboarding/WizardStepper.tsx` — 6 circles, not 7
- `src/lib/onboarding/resume.ts` — `nextIncompleteStep()` skips payment-mode
- `src/lib/onboarding/validation.ts` — delete `paymentModeSchema`; drop `paymentMode` from `publishGateSchema`
- `src/components/dashboard/EarningsCard.tsx` — body rewrite as attribution dashboard
- `src/app/(marketplace)/terms/page.tsx` — locked-verbatim fee + cancellation blocks
- `src/components/dashboard/DepositDialog.tsx` — inline policy via `<details>`
- `src/components/dashboard/CancelDialog.tsx` — vendor-cancellation warning
- `src/lib/email/resend.ts` — lines 148 + 253 rewrites

**Deleted files:**

- `src/components/onboarding/StepPaymentMode.tsx`

---

## Task List

- **T1.** Operational pre-deploy state check
- **T2.** Collapse deposit-rate constants in `utils.ts`
- **T3.** Rip Stripe-mode branch from `payment.service.ts`
- **T4.** Update `database.types.ts` — remove `payment_mode` + `stripe_*` columns
- **T5.** Delete `StepPaymentMode.tsx` + replace route with redirect
- **T6.** Step counter sweep 7→6 across 6 step files
- **T7.** `WizardStepper` + `resume.ts` + `validation.ts` cleanup
- **T8.** `StepReview` updates (drop card, new fee one-liner, vendor agreement)
- **T9.** `getVendorAttribution()` service helper + unit tests
- **T10.** `EarningsCard.tsx` rewrite (attribution dashboard)
- **T11.** Terms page rewrite (fee + cancellation locked blocks)
- **T12.** `DepositDialog` + `CancelDialog` updates
- **T13.** Email template line rewrites (`resend.ts`)
- **T14.** Migration `00058_drop_payment_mode_and_stripe_columns.sql`
- **T15.** E2E specs (wizard six-steps + attribution dashboard)
- **T16.** Open PR + manual smoke

---

### Task 1: Operational pre-deploy state check

**Files:** none (operational; result documented in the report).

**Interfaces:**

- Consumes: prod Supabase access.
- Produces: confirmation that the spec's assumptions hold — zero `payment_mode='stripe'` rows, zero confirmed-bookings, so the migration can DROP without prior data migration.

- [ ] **Step 1: Run the verification query against prod**

```bash
PGPASSWORD="$PROD_DB_PASSWORD" psql \
  -h db.obpdgihdskbxzgyctaib.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "SELECT COUNT(*) FILTER (WHERE payment_mode = 'stripe') AS stripe_vendors, COUNT(*) FILTER (WHERE payment_mode = 'cash') AS cash_vendors, COUNT(*) FILTER (WHERE payment_mode IS NULL) AS unset_vendors, COUNT(*) AS total FROM vendor_profiles;"
```

If `PROD_DB_PASSWORD` isn't set in env, the user can run this query directly in the Supabase SQL editor at https://supabase.com/dashboard/project/obpdgihdskbxzgyctaib/sql/new.

Expected: `total ≈ 3,300`, `unset_vendors ≈ 3,300`, `stripe_vendors = 0`, `cash_vendors = 0`.

- [ ] **Step 2: Run the bookings query**

```bash
PGPASSWORD="$PROD_DB_PASSWORD" psql \
  -h db.obpdgihdskbxzgyctaib.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM bookings WHERE status IN ('deposit_paid', 'completed');"
```

Expected: `count = 0`.

- [ ] **Step 3: Check for `vendor_payment_accounts` table (from Sub-project I)**

```bash
PGPASSWORD="$PROD_DB_PASSWORD" psql \
  -h db.obpdgihdskbxzgyctaib.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "\dt vendor_payment_accounts"
```

Expected: either the table exists (we'll drop it in T14) or it doesn't (no-op).

- [ ] **Step 4: List all `stripe_*` columns on `vendor_profiles`**

```bash
PGPASSWORD="$PROD_DB_PASSWORD" psql \
  -h db.obpdgihdskbxzgyctaib.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'vendor_profiles' AND column_name LIKE 'stripe_%';"
```

Record the full list. T14's migration must drop all of them.

- [ ] **Step 5: No commit needed — operational task.** Proceed to T2 once all four checks confirm spec assumptions. If `stripe_vendors > 0` OR confirmed-bookings count > 0, **stop and escalate** — the rip-out path needs rethinking (we'd need to handle in-flight Stripe-mode bookings).

---

### Task 2: Collapse deposit-rate constants in `utils.ts`

**Files:**

- Modify: `src/lib/utils.ts`
- Test: `src/__tests__/lib/utils.test.ts` (or add to existing utils test file)

**Interfaces:**

- Consumes: nothing.
- Produces:

  ```ts
  export const DEPOSIT_RATE = 0.05;
  ```

  Removes: `STRIPE_DEPOSIT_RATE`, `CASH_DEPOSIT_RATE`, `getDepositRate(mode)`.

- [ ] **Step 1: Read the current `utils.ts` to see the exact existing exports**

```bash
grep -n "DEPOSIT_RATE\|getDepositRate" src/lib/utils.ts
```

Note the line numbers and existing exports so you only modify those lines, not the rest of the file.

- [ ] **Step 2: Find all consumers of the old constants**

```bash
grep -rn "STRIPE_DEPOSIT_RATE\|CASH_DEPOSIT_RATE\|getDepositRate" src/ 2>/dev/null
```

Build a list of files that need updating in later tasks. Note them in your report — T3 (`payment.service.ts`) is the main consumer; T9 (`getVendorAttribution`) will be the new consumer.

- [ ] **Step 3: Write the failing test**

```ts
// src/__tests__/lib/utils.test.ts (add to existing file)
import { describe, it, expect } from 'vitest';
import { DEPOSIT_RATE } from '@/lib/utils';

describe('DEPOSIT_RATE', () => {
  it('is exactly 0.05', () => {
    expect(DEPOSIT_RATE).toBe(0.05);
  });

  it('computes correct deposit amount for $5000 booking', () => {
    const totalCents = 500_000; // $5000
    const depositCents = Math.round(totalCents * DEPOSIT_RATE);
    expect(depositCents).toBe(25_000); // $250
  });
});
```

If `utils.test.ts` doesn't exist yet, create it with the standard vitest scaffold.

- [ ] **Step 4: Run the test, expect FAIL (constant not exported / old shape)**

```bash
npx vitest run src/__tests__/lib/utils.test.ts
```

- [ ] **Step 5: Update `utils.ts`**

Replace the existing deposit-rate exports with:

```ts
export const DEPOSIT_RATE = 0.05;
```

Delete `STRIPE_DEPOSIT_RATE`, `CASH_DEPOSIT_RATE`, and the `getDepositRate()` function.

If `DEPOSIT_RATE` already existed as an alias (`export const DEPOSIT_RATE = STRIPE_DEPOSIT_RATE`), replace that line with the new direct definition.

- [ ] **Step 6: Run the test, expect PASS**

```bash
npx vitest run src/__tests__/lib/utils.test.ts
```

Expected: 2/2 passing.

- [ ] **Step 7: Run typecheck — expect errors in `payment.service.ts`**

```bash
npm run typecheck
```

Expected: typecheck FAILS with errors about `getDepositRate` or `STRIPE_DEPOSIT_RATE` no longer existing. Those errors will be fixed in T3. Do NOT fix them yet.

If typecheck fails ONLY because of consumers of the deleted constants (i.e. the failures are limited to expected files like `payment.service.ts`), proceed. If it fails elsewhere unexpectedly, report and stop.

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils.ts src/__tests__/lib/utils.test.ts
git commit -m "refactor(utils): collapse to single DEPOSIT_RATE constant (Bucket F T2)"
```

The commit message includes "refactor" not "feat" because the public-facing API stays the same — it's an internal simplification.

---

### Task 3: Rip Stripe-mode branch from `payment.service.ts`

**Files:**

- Modify: `src/services/payment.service.ts`

**Interfaces:**

- Consumes: `DEPOSIT_RATE` from `@/lib/utils` (T2).
- Produces: `payment.service.ts` typechecks clean. The Stripe-mode branch, the "Vendor hasn't set up payments" error, the 30/70 split comment, the Stripe Connect transfer code, and the Connect account lookup helpers are all deleted.

- [ ] **Step 1: Find every consumer of the removed APIs**

```bash
grep -n "getDepositRate\|payment_mode\|STRIPE_DEPOSIT_RATE\|getActiveStripeAccount\|Vendor hasn't set up payments" src/services/payment.service.ts
```

Map every line to either "delete" or "update."

- [ ] **Step 2: Find the `initiateCouplePaymentDeposit` function**

```bash
grep -n "initiateCouplePaymentDeposit\|export async function initiate" src/services/payment.service.ts
```

Read the full function body. Identify the mode-switch branch.

- [ ] **Step 3: Rewrite `initiateCouplePaymentDeposit` to single-mode**

Replace the mode-switch logic with a single path:

```ts
// Compute the deposit amount — uniform 5% of the booking total.
import { DEPOSIT_RATE } from '@/lib/utils';

// ...inside initiateCouplePaymentDeposit (or whatever it's called):
const depositCents = Math.round(totalCents * DEPOSIT_RATE);

// Create Stripe checkout session for the deposit amount — customer-side only.
// We retain 100% of the deposit; no Connect transfer.
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: `Deposit for ${bookingDescription}` },
        unit_amount: depositCents,
      },
      quantity: 1,
    },
  ],
  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${bookingId}?deposit=success`,
  cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${bookingId}?deposit=cancelled`,
  metadata: { booking_id: bookingId },
});
```

The exact existing surrounding code (auth check, booking fetch, error handling) stays. Only the branching logic + Connect transfer creation gets deleted.

If the existing function structure is more complex than this snippet suggests (e.g. it returns a typed result, uses a different metadata shape), preserve that structure and only swap the mode-switch internals.

- [ ] **Step 4: Delete the "Vendor hasn't set up payments yet" null-check branch**

Find:

```bash
grep -n "Vendor hasn't set up payments" src/services/payment.service.ts
```

Delete the entire `if (payment_mode === null) { throw ... }` block. The error message string disappears with it.

- [ ] **Step 5: Delete the Stripe Connect transfer creation code**

Find:

```bash
grep -n "stripe.transfers.create\|Transfer\|transfer_data" src/services/payment.service.ts
```

Delete the entire block that creates a Stripe Connect transfer post-deposit. Under single-mode, Baazar retains the full deposit; no onward transfer happens.

- [ ] **Step 6: Delete Stripe Connect account lookup helpers**

Find:

```bash
grep -n "getActiveStripeAccount\|stripe_account_id" src/services/payment.service.ts
```

Delete the helper function(s) that look up `stripe_account_id` from `vendor_profiles`. Delete any callers within `payment.service.ts`.

- [ ] **Step 7: Delete the 30/70 split comment**

Find:

```bash
grep -n "Stripe vendors:\|30% to platform\|70% to vendor" src/services/payment.service.ts
```

Delete the comment block.

- [ ] **Step 8: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors in `payment.service.ts`. If `database.types.ts` still has `payment_mode` typed (it does until T4), you may see errors elsewhere — that's OK, T4 will fix.

If typecheck reports `payment_mode` access errors specifically in `payment.service.ts`, that means there are more reads of the column that need deleting. Repeat steps 4-6 for any leftover sites.

- [ ] **Step 9: Run the full unit suite — expect existing tests that asserted on Stripe-mode behavior to fail**

```bash
npx vitest run
```

Identify failing tests. They'll be in files like `src/__tests__/services/payment.service.test.ts`. Read each failure. For each, decide:

- Does the test assert on Stripe-mode behavior that we just deleted? → DELETE the test.
- Does the test assert on the deposit calculation? → UPDATE the test to use `DEPOSIT_RATE`.
- Does the test assert on something orthogonal that should still pass? → INVESTIGATE; possibly a real regression.

Update or delete each failing test as appropriate. Keep notes in your report on which were deleted vs updated.

- [ ] **Step 10: Run unit suite again — expect green**

```bash
npx vitest run
```

Expected: all green (modulo any pre-existing failures unrelated to F).

- [ ] **Step 11: Commit**

```bash
git add src/services/payment.service.ts src/__tests__/services/
git commit -m "refactor(payments): rip Stripe-mode branch from payment.service.ts (Bucket F T3)"
```

---

### Task 4: Update `database.types.ts` — remove `payment_mode` + `stripe_*` columns

**Files:**

- Modify: `src/types/database.types.ts`

**Interfaces:**

- Consumes: list of `stripe_*` columns from T1 step 4.
- Produces: `database.types.ts` no longer declares `payment_mode`, `stripe_account_id`, or any other `stripe_*` column on `vendor_profiles`.

- [ ] **Step 1: Read the current `vendor_profiles` interface**

```bash
grep -A 50 "vendor_profiles:" src/types/database.types.ts | head -100
```

Identify Row, Insert, and Update interface blocks for `vendor_profiles`.

- [ ] **Step 2: Remove the columns from Row interface**

Delete these lines from the `Row:` block within `vendor_profiles`:

- `payment_mode: 'stripe' | 'cash' | null;`
- `stripe_account_id: string | null;`
- `stripe_charges_enabled: boolean | null;`
- `stripe_payouts_enabled: boolean | null;`
- `stripe_onboarding_complete: boolean | null;`
- Plus any other `stripe_*` columns found in T1 step 4.

- [ ] **Step 3: Remove the columns from Insert interface**

Delete the same fields from the `Insert:` block (they'll be marked `?` optional in Insert — delete them entirely, not just the optional marker).

- [ ] **Step 4: Remove the columns from Update interface**

Delete the same fields from the `Update:` block.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. The previous T3 commit dropped all reads of these columns from `payment.service.ts`; the type removal here is consistency-only.

If typecheck reports errors about missing `payment_mode` or `stripe_*` reads elsewhere (outside the files T3 touched), trace each one. The remaining sites are:

- `src/services/booking.service.ts` may have `vendor_profiles!inner(payment_mode)` join selectors — drop those.
- `src/app/api/webhooks/stripe/route.ts` may have `account.updated` handlers that read `stripe_account_id` — delete those handlers.
- `src/components/dashboard/EarningsCard.tsx` will be rewritten in T10 anyway.

Fix each one minimally — just drop the reads, don't refactor surrounding logic.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts src/services/ src/app/api/
git commit -m "refactor(types): drop payment_mode + stripe_* columns from vendor_profiles type (Bucket F T4)"
```

---

### Task 5: Delete `StepPaymentMode.tsx` + replace route with redirect

**Files:**

- Delete: `src/components/onboarding/StepPaymentMode.tsx`
- Modify: `src/app/dashboard/profile/setup/payment-mode/page.tsx` (replace contents with redirect)

**Interfaces:**

- Consumes: nothing.
- Produces: `/dashboard/profile/setup/payment-mode` route returns a 308 redirect to `/dashboard/profile/setup/review`. Any in-flight vendor with a bookmarked or auto-resumed payment-mode URL lands on review.

- [ ] **Step 1: Delete the component**

```bash
rm src/components/onboarding/StepPaymentMode.tsx
```

- [ ] **Step 2: Check for orphan imports**

```bash
grep -rn "StepPaymentMode" src/ 2>/dev/null
```

If anything still imports it, delete those imports too. Expected: zero matches after deletion.

- [ ] **Step 3: Replace the route page with a redirect**

Replace the contents of `src/app/dashboard/profile/setup/payment-mode/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/dashboard/profile/setup/review');
}
```

That's the entire file. No metadata, no imports beyond `redirect`, no params.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Manual smoke (optional but recommended)**

If a dev server is running, visit `http://localhost:3000/dashboard/profile/setup/payment-mode` — should redirect to `/review`. Skip if a dev server is not already running.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/StepPaymentMode.tsx src/app/dashboard/profile/setup/payment-mode/
git commit -m "feat(onboarding): drop StepPaymentMode; redirect route to review (Bucket F T5)"
```

---

### Task 6: Step counter sweep 7→6 across 6 step files

**Files:**

- Modify: `src/components/onboarding/StepBasics.tsx`
- Modify: `src/components/onboarding/StepLocation.tsx`
- Modify: `src/components/onboarding/StepOnline.tsx`
- Modify: `src/components/onboarding/StepDetails.tsx`
- Modify: `src/components/onboarding/StepPortfolio.tsx`
- Modify: `src/components/onboarding/StepReview.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: every step shows "Step N of 6" copy. The wizard's step-count number matches its visible content.

- [ ] **Step 1: Find every "of 7" reference in step files**

```bash
grep -n "of 7\|Step [0-9] of 7" src/components/onboarding/Step*.tsx
```

Note: Bucket A's memory mentions a previous sweep 5→7. Expected: 6 hits, one per file (excluding the deleted StepPaymentMode).

- [ ] **Step 2: Update each file**

For each of the 6 step files, find the hardcoded "Step N of 7" string and update to "Step N of 6":

- `StepBasics.tsx`: "Step 1 of 7" → "Step 1 of 6"
- `StepLocation.tsx`: "Step 2 of 7" → "Step 2 of 6"
- `StepOnline.tsx`: "Step 3 of 7" → "Step 3 of 6"
- `StepDetails.tsx`: "Step 4 of 7" → "Step 4 of 6"
- `StepPortfolio.tsx`: "Step 5 of 7" → "Step 5 of 6"
- `StepReview.tsx`: "Step 7 of 7" → "Step 6 of 6"

Use `Edit` per file with exact `old_string` / `new_string`. Do NOT use `sed -i` — that risks unintended replacements.

- [ ] **Step 3: Confirm no "of 7" remains in step files**

```bash
grep -n "of 7\|Step [0-9] of 7" src/components/onboarding/Step*.tsx
```

Expected: zero matches.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/Step*.tsx
git commit -m "feat(onboarding): sweep step counter 7 → 6 across remaining 6 steps (Bucket F T6)"
```

---

### Task 7: `WizardStepper` + `resume.ts` + `validation.ts` cleanup

**Files:**

- Modify: `src/components/onboarding/WizardStepper.tsx`
- Modify: `src/lib/onboarding/resume.ts`
- Modify: `src/lib/onboarding/validation.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: the wizard sidebar renders 6 circles (was 7); `nextIncompleteStep()` no longer routes to payment-mode; `paymentModeSchema` deleted; `publishGateSchema` doesn't require `paymentMode`.

- [ ] **Step 1: Read `WizardStepper.tsx`**

```bash
grep -n "Payment\|payment-mode\|stepNumber\|stepIndex" src/components/onboarding/WizardStepper.tsx
```

Identify the array or map that defines the step list. Likely a `STEPS` constant with 7 entries.

- [ ] **Step 2: Remove the payment-mode entry from the steps list**

Find the entry for Payment (likely something like `{ id: 'payment-mode', label: 'Payment', href: '/dashboard/profile/setup/payment-mode' }`) and delete it. The Review entry shifts from position 7 to position 6 automatically since arrays are zero-indexed.

If the file hardcodes circle numbers as JSX (rare), renumber Review's circle from 7 to 6.

- [ ] **Step 3: Read `resume.ts`**

```bash
grep -n "payment-mode\|paymentMode\|nextIncompleteStep" src/lib/onboarding/resume.ts
```

Identify the `nextIncompleteStep` function and any payment-mode checks.

- [ ] **Step 4: Remove payment-mode from `nextIncompleteStep`**

Delete any condition like:

```ts
if (!profile.payment_mode) return '/dashboard/profile/setup/payment-mode';
```

The function now goes from the portfolio check directly to review. If the function uses a step list (similar pattern to T7 step 1), remove the payment-mode entry from that list.

- [ ] **Step 5: Read `validation.ts`**

```bash
grep -n "paymentModeSchema\|paymentMode\|payment_mode" src/lib/onboarding/validation.ts
```

Identify `paymentModeSchema` and its usage in `publishGateSchema`.

- [ ] **Step 6: Delete `paymentModeSchema`; drop `paymentMode` from `publishGateSchema`**

Delete the `paymentModeSchema` definition entirely. In `publishGateSchema`, remove the line that includes `paymentMode: paymentModeSchema` (or similar).

If `publishGateSchema` uses `.extend()` or `.merge()` with `paymentModeSchema`, restructure to just drop that piece — keep the other schemas being merged.

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. If the publish API endpoint reads `paymentMode` from the validated payload, that read will fail — drop it.

- [ ] **Step 8: Run unit tests**

```bash
npx vitest run
```

Expected: no regressions. Any test asserting on `paymentModeSchema` validation should be deleted (covered under T3's general test cleanup).

- [ ] **Step 9: Commit**

```bash
git add src/components/onboarding/WizardStepper.tsx src/lib/onboarding/
git commit -m "feat(onboarding): drop payment-mode from stepper + resume + validation (Bucket F T7)"
```

---

### Task 8: `StepReview` updates (drop card, new fee one-liner, vendor agreement)

**Files:**

- Modify: `src/components/onboarding/StepReview.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: StepReview no longer renders a payment-mode summary card; the fee one-liner reads the new single-mode copy; the vendor-side agreement block appears above the Publish button.

- [ ] **Step 1: Find and delete the payment-mode summary card**

```bash
grep -n "payment_mode\|paymentMode\|Payment mode\|Stripe mode\|Cash mode\|cash mode" src/components/onboarding/StepReview.tsx
```

Identify the JSX block that summarizes the vendor's selected payment mode (added in Bucket A T9). Delete the entire block — it's typically a `<Card>` or `<div>` containing a label and the mode string.

- [ ] **Step 2: Update the fee one-liner**

Find the line that reads:

```tsx
Baazar takes 3% (Stripe mode) or 5% (cash mode). Everything else is yours.
```

Replace with:

```tsx
Baazar takes a 5% deposit at booking. Everything else you collect directly from the customer.
```

Preserve the surrounding `<p>` tag and its className.

- [ ] **Step 3: Add the vendor-side agreement block above the Publish button**

Find the Publish button. Above it, add:

```tsx
<div className="rounded-md border border-ink/15 bg-cream/60 p-3">
  <p className="text-xs text-ink/80">
    By publishing your profile, you agree to Baazar's terms. Customers pay a 5% deposit through
    Baazar at booking — that's our platform fee. You collect the 95% balance directly from them. If
    you cancel a confirmed booking, the customer's deposit is refunded in full.
  </p>
</div>
```

Preserve any existing spacing classes between this block and the Publish button.

- [ ] **Step 4: Verify the file still compiles**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Manual smoke (optional)**

If a dev server is running, visit Step 6 of the wizard. Confirm:

- No payment-mode summary card visible
- One-liner reads the new copy
- Agreement block appears above Publish

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/StepReview.tsx
git commit -m "feat(onboarding): StepReview drops payment-mode card; new fee + agreement copy (Bucket F T8)"
```

---

### Task 9: `getVendorAttribution()` service helper + unit tests

**Files:**

- Modify: `src/services/payment.service.ts` (add the new helper)
- Create: `src/__tests__/services/get-vendor-attribution.test.ts`

**Interfaces:**

- Consumes: `DEPOSIT_RATE` from `@/lib/utils` (T2).
- Produces:

  ```ts
  type AttributionRange = 'month' | 'quarter' | 'year' | 'all';

  interface Attribution {
    totalCents: number;
    bookingCount: number;
    platformFeeCents: number;
    netCents: number;
    roiMultiple: number;
  }

  export async function getVendorAttribution(
    supabase: SupabaseClient<Database>,
    vendorProfileId: string,
    range: AttributionRange
  ): Promise<Attribution>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/get-vendor-attribution.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVendorAttribution } from '@/services/payment.service';

// Minimal supabase mock that returns the test bookings
function mockSupabase(
  bookings: Array<{ total_price_cents: number; status: string; created_at: string }>
) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            gte: vi.fn(() => Promise.resolve({ data: bookings, error: null })),
            // No date filter for 'all' range
          })),
        })),
      })),
    })),
  } as any;
}

describe('getVendorAttribution()', () => {
  it('returns zeros + roiMultiple 0 when no bookings', async () => {
    const sb = mockSupabase([]);
    const result = await getVendorAttribution(sb, 'vp-1', 'all');
    expect(result).toEqual({
      totalCents: 0,
      bookingCount: 0,
      platformFeeCents: 0,
      netCents: 0,
      roiMultiple: 0,
    });
  });

  it('computes correct sums for 3 bookings', async () => {
    const sb = mockSupabase([
      { total_price_cents: 100_000, status: 'accepted', created_at: '2026-06-01T00:00:00Z' },
      { total_price_cents: 250_000, status: 'deposit_paid', created_at: '2026-06-02T00:00:00Z' },
      { total_price_cents: 450_000, status: 'completed', created_at: '2026-06-03T00:00:00Z' },
    ]);
    const result = await getVendorAttribution(sb, 'vp-1', 'all');
    expect(result.totalCents).toBe(800_000); // $8,000
    expect(result.bookingCount).toBe(3);
    expect(result.platformFeeCents).toBe(40_000); // 5% of $8,000 = $400
    expect(result.netCents).toBe(760_000); // 95% of $8,000 = $7,600
    expect(result.roiMultiple).toBe(20); // total / fee = 1 / 0.05
  });

  it('roiMultiple is always 20 when non-empty', async () => {
    const sb = mockSupabase([
      { total_price_cents: 12_345, status: 'accepted', created_at: '2026-06-01T00:00:00Z' },
    ]);
    const result = await getVendorAttribution(sb, 'vp-1', 'all');
    expect(result.roiMultiple).toBe(20);
  });
});
```

- [ ] **Step 2: Run, expect FAIL (function not exported)**

```bash
npx vitest run src/__tests__/services/get-vendor-attribution.test.ts
```

- [ ] **Step 3: Implement the helper in `payment.service.ts`**

Add to `src/services/payment.service.ts`:

```ts
import { DEPOSIT_RATE } from '@/lib/utils';

export type AttributionRange = 'month' | 'quarter' | 'year' | 'all';

export interface Attribution {
  totalCents: number;
  bookingCount: number;
  platformFeeCents: number;
  netCents: number;
  roiMultiple: number;
}

const QUALIFYING_STATUSES = [
  'accepted',
  'adjusted_quote_sent',
  'couple_countered',
  'deposit_paid',
  'completed',
] as const;

function rangeStartDate(range: AttributionRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  // year
  return new Date(now.getFullYear(), 0, 1);
}

export async function getVendorAttribution(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  range: AttributionRange
): Promise<Attribution> {
  let query = supabase
    .from('bookings')
    .select('total_price_cents, status, created_at')
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', QUALIFYING_STATUSES as unknown as string[]);

  const start = rangeStartDate(range);
  if (start) {
    query = query.gte('created_at', start.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`getVendorAttribution failed: ${error.message}`);
  }

  const rows = data ?? [];
  const totalCents = rows.reduce((sum, r) => sum + (r.total_price_cents ?? 0), 0);
  const bookingCount = rows.length;
  const platformFeeCents = Math.round(totalCents * DEPOSIT_RATE);
  const netCents = totalCents - platformFeeCents;
  const roiMultiple = platformFeeCents > 0 ? Math.round(totalCents / platformFeeCents) : 0;

  return { totalCents, bookingCount, platformFeeCents, netCents, roiMultiple };
}
```

- [ ] **Step 4: Update the test's supabase mock to handle the chained query**

The mock in step 1 may need adjustment to match the actual chain `from().select().eq().in().gte()` or `from().select().eq().in()` (when range='all'). Adjust the mock to return the expected data shape from the terminal `await`.

Sketch:

```ts
function mockSupabase(bookings: Array<...>) {
  const terminal = Promise.resolve({ data: bookings, error: null });
  const chain: any = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gte: () => terminal,
  };
  // For 'all' range, the chain ends at `.in()` since no .gte() is called.
  // Make `.in()` itself thenable.
  chain.in = () => Object.assign(terminal, { gte: () => terminal });
  return chain as any;
}
```

Adjust as needed for the actual query shape — the goal is the mock returns `{ data: bookings, error: null }` at the terminal await.

- [ ] **Step 5: Run, expect PASS**

```bash
npx vitest run src/__tests__/services/get-vendor-attribution.test.ts
```

Expected: 3/3 passing.

- [ ] **Step 6: Run full unit suite — no regressions**

```bash
npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/services/payment.service.ts src/__tests__/services/get-vendor-attribution.test.ts
git commit -m "feat(payments): add getVendorAttribution helper + unit tests (Bucket F T9)"
```

---

### Task 10: `EarningsCard.tsx` rewrite (attribution dashboard)

**Files:**

- Modify: `src/components/dashboard/EarningsCard.tsx` (full body rewrite)

**Interfaces:**

- Consumes: `getVendorAttribution()` + `Attribution` + `AttributionRange` from T9.
- Produces: dashboard Money tab renders the new attribution KPIs.

- [ ] **Step 1: Read the current `EarningsCard.tsx`**

```bash
cat src/components/dashboard/EarningsCard.tsx
```

Note the component signature (props, server/client), how it fetches data, and how it's mounted by the dashboard parent.

- [ ] **Step 2: Identify which props need to stay**

The parent layout in the vendor dashboard passes `vendorProfileId` (or similar) to this card. Preserve that prop. Add a new state for the selected range.

If the component is currently a Server Component that calls a service helper directly, keep that pattern but use `getVendorAttribution()` instead. Range selection still needs client-side state for the chip toggle, so wrap the interactive parts in a client child component.

If the component is already a Client Component, hooks-based state is fine.

- [ ] **Step 3: Rewrite the component body**

For a Client Component shape (simplest):

```tsx
'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase/client'; // verify exact path
import {
  getVendorAttribution,
  type Attribution,
  type AttributionRange,
} from '@/services/payment.service';

interface EarningsCardProps {
  vendorProfileId: string;
}

const RANGES: { id: AttributionRange; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function EarningsCard({ vendorProfileId }: EarningsCardProps) {
  const [range, setRange] = useState<AttributionRange>('month');
  const [data, setData] = useState<Attribution | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    getVendorAttribution(supabase, vendorProfileId, range).then(setData).catch(console.error);
  }, [vendorProfileId, range]);

  if (!data) {
    return (
      <div className="rounded-lg border border-ink/15 bg-cream p-6">
        <p className="text-sm text-ink/60">Loading…</p>
      </div>
    );
  }

  if (data.bookingCount === 0) {
    return (
      <div className="rounded-lg border border-ink/15 bg-cream p-6 text-center">
        <p className="text-sm text-ink">You haven't received any Baazar bookings yet.</p>
        <p className="mt-1 text-xs text-ink/60">
          When customers confirm bookings with you, you'll see them here.
        </p>
        <a
          href="/vendors"
          className="mt-3 inline-block text-sm font-medium text-hot-pink hover:underline"
        >
          Browse the marketplace →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ink/15 bg-cream p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={
              range === r.id
                ? 'rounded-full bg-ink px-3 py-1 text-xs font-medium text-cream'
                : 'rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink hover:bg-ink/5'
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-semibold text-ink">{formatCents(data.totalCents)}</p>
          <p className="text-xs text-ink/60">in confirmed bookings driven by Baazar</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{data.bookingCount}</p>
          <p className="text-xs text-ink/60">bookings confirmed</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{formatCents(data.platformFeeCents)}</p>
          <p className="text-xs text-ink/60">in fees paid to Baazar</p>
        </div>
      </div>

      <div className="mt-4 border-t border-ink/10 pt-4">
        <p className="text-sm text-ink">
          Net to you: <span className="font-semibold">{formatCents(data.netCents)}</span> (95% of
          bookings driven)
        </p>
        <p className="mt-2 text-base text-ink">
          ROI: every $1 paid to Baazar →{' '}
          <span className="font-bold text-hot-pink">${data.roiMultiple}</span> in bookings
        </p>
      </div>

      <p className="mt-4 text-[11px] text-ink/50">
        Based on confirmed booking totals; doesn't track balance collection.
      </p>
    </div>
  );
}
```

Adapt the exact imports + prop shape to match what the existing dashboard parent expects. If the existing component takes different props (e.g. accepts pre-fetched data instead of a vendor id), restructure to match.

- [ ] **Step 4: Delete the old earnings query function**

Find the helper that was previously feeding `EarningsCard` (likely `getVendorEarnings()` in `payment.service.ts`):

```bash
grep -n "getVendorEarnings\|vendor.*earnings\|70.*deposit" src/services/payment.service.ts
```

Delete the helper if it's no longer called from anywhere (verify with grep across `src/`).

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Run unit suite**

```bash
npx vitest run
```

Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/EarningsCard.tsx src/services/payment.service.ts
git commit -m "feat(dashboard): EarningsCard renders Baazar attribution dashboard (Bucket F T10)"
```

---

### Task 11: Terms page rewrite (fee + cancellation locked blocks)

**Files:**

- Modify: `src/app/(marketplace)/terms/page.tsx`

**Interfaces:**

- Consumes: locked-verbatim copy blocks from Global Constraints.
- Produces: `/terms` page renders the new copy in two clearly-labelled sections.

- [ ] **Step 1: Read the current terms page**

```bash
cat src/app/(marketplace)/terms/page.tsx
```

Identify the existing sections — likely numbered (e.g. "1. Service", "2. Hold deposits and cancellation", etc.).

- [ ] **Step 2: Replace the fee section**

Find the section that mentions "30%" or "70%" and the 10% deposit. Replace its body with:

```tsx
<section>
  <h2 className="text-lg font-semibold text-ink">Platform fee</h2>
  <p className="mt-2 text-sm text-ink/80">
    Baazar charges a 5% deposit at booking. We keep that 5% as our platform fee. You pay the
    remaining 95% directly to the vendor per their payment terms.
  </p>
</section>
```

Preserve the surrounding section numbering/structure if other sections rely on order.

- [ ] **Step 3: Replace the cancellation section**

Find the existing cancellation section (currently has the 24h / 50% / no-refund tiered language). Replace its body with:

```tsx
<section>
  <h2 className="text-lg font-semibold text-ink">Cancellations</h2>
  <div className="mt-2 space-y-3 text-sm text-ink/80">
    <p>
      <strong>Customer cancellation.</strong> Your 5% deposit is fully refundable within 24 hours of
      booking. After that, the deposit confirms your reservation and is non-refundable.
    </p>
    <p>
      <strong>Vendor cancellation.</strong> If the vendor cancels at any time, you receive a full
      refund of your 5% deposit.
    </p>
    <p>
      The 95% balance you pay directly to the vendor is between you and them; Baazar doesn't process
      or hold those funds.
    </p>
  </div>
</section>
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(marketplace\)/terms/page.tsx
git commit -m "feat(terms): rewrite fee + cancellation sections for 5%-only model (Bucket F T11)"
```

---

### Task 12: `DepositDialog` + `CancelDialog` updates

**Files:**

- Modify: `src/components/dashboard/DepositDialog.tsx`
- Modify: `src/components/dashboard/CancelDialog.tsx`

**Interfaces:**

- Consumes: locked-verbatim cancellation policy block.
- Produces: deposit checkout shows the policy inline (collapsed); vendor cancel dialog shows the impact warning.

- [ ] **Step 1: Read both dialogs**

```bash
cat src/components/dashboard/DepositDialog.tsx
cat src/components/dashboard/CancelDialog.tsx
```

Identify where the new copy should land (typically below the price / before the action button).

- [ ] **Step 2: Update `DepositDialog.tsx`**

Above the Pay button, add the inline fee narrative (one sentence):

```tsx
<p className="mb-3 text-xs text-ink/70">
  Baazar charges a 5% deposit at booking. We keep that 5% as our platform fee. You pay the remaining
  95% directly to the vendor per their payment terms.
</p>
```

Then add the collapsible cancellation policy:

```tsx
<details className="mb-3 text-xs text-ink/70">
  <summary className="cursor-pointer font-medium text-ink">Cancellation policy</summary>
  <div className="mt-2 space-y-2">
    <p>
      <strong>Customer cancellation.</strong> Your 5% deposit is fully refundable within 24 hours of
      booking. After that, the deposit confirms your reservation and is non-refundable.
    </p>
    <p>
      <strong>Vendor cancellation.</strong> If the vendor cancels at any time, you receive a full
      refund of your 5% deposit.
    </p>
    <p>
      The 95% balance you pay directly to the vendor is between you and them; Baazar doesn't process
      or hold those funds.
    </p>
  </div>
</details>
```

If the dialog already has a cancellation-policy reference (the audit found one as a `<Link>` to /terms), replace that reference with the collapsed `<details>` block above.

- [ ] **Step 3: Update `CancelDialog.tsx`**

`CancelDialog` is the vendor-side cancel flow. Add a warning above the Confirm/Cancel buttons:

```tsx
<div className="mb-3 rounded-md border border-hot-pink/30 bg-cream p-3">
  <p className="text-xs text-ink">
    If you cancel, the customer receives a full refund of their 5% deposit and you lose this
    booking.
  </p>
</div>
```

If `CancelDialog` is also used by couples (audit-discovered), gate this copy on vendor role:

```tsx
{
  actorRole === 'vendor' && (
    <div className="mb-3 rounded-md border border-hot-pink/30 bg-cream p-3">
      <p className="text-xs text-ink">
        If you cancel, the customer receives a full refund of their 5% deposit and you lose this
        booking.
      </p>
    </div>
  );
}
```

Verify the actual prop / context shape and adapt.

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DepositDialog.tsx src/components/dashboard/CancelDialog.tsx
git commit -m "feat(dashboard): inline cancellation policy + vendor-cancel warning (Bucket F T12)"
```

---

### Task 13: Email template line rewrites (`resend.ts`)

**Files:**

- Modify: `src/lib/email/resend.ts`

**Interfaces:**

- Consumes: locked-verbatim copy.
- Produces: the two specific lines audit-discovered at lines 148 + 253 are rewritten.

- [ ] **Step 1: Find the exact lines**

```bash
grep -n "Pay your hold deposit\|30%\|70%\|escrow\|hold deposit" src/lib/email/resend.ts
```

The audit named lines 148 + 253. File contents may have shifted slightly; trust the grep.

- [ ] **Step 2: Rewrite line ~148 (customer payment prompt)**

Find:

```ts
'Pay your hold deposit (30%) to confirm...';
```

Replace with:

```ts
'Pay your 5% deposit to confirm your booking...';
```

Match the exact surrounding template string. If it's a tagged template or interpolated string, preserve the interpolations on either side of the literal text.

- [ ] **Step 3: Rewrite line ~253 (vendor share notification)**

Find:

```ts
'Your 70% share is held in escrow and released...';
```

Replace with:

```ts
'The customer paid their 5% deposit. Coordinate the balance with them directly per your payment terms.';
```

If the template needs the customer's name interpolated (which the spec mentions), preserve the interpolation:

```ts
`${coupleName} paid their 5% deposit. Coordinate the balance with them directly per your payment terms.`;
```

Use whatever variable is in scope.

- [ ] **Step 4: Verify no `30%` or `70%` remains in `resend.ts`**

```bash
grep -n "30%\|70%\|escrow" src/lib/email/resend.ts
```

Expected: zero matches. If any remain (footers, marketing-style legalese), update them too.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "feat(email): replace 30/70 deposit copy with 5%-only language (Bucket F T13)"
```

---

### Task 14: Migration `00058_drop_payment_mode_and_stripe_columns.sql`

**Files:**

- Create: `supabase/migrations/<next-number>_drop_payment_mode_and_stripe_columns.sql`

**Interfaces:**

- Consumes: `stripe_*` column list from T1 step 4 + the existence-check for `vendor_payment_accounts` from T1 step 3.
- Produces: a single SQL file with single-line `DROP COLUMN IF EXISTS` + optional `DROP TABLE IF EXISTS`.

- [ ] **Step 1: Find the next available migration number**

```bash
ls supabase/migrations/ | tail -5
```

D.1 shipped 00057. Bucket A didn't add migrations. So 00058 is likely free — but verify. If anything sits at 00058 already (e.g. from a sub-project I didn't track), use the next free number.

- [ ] **Step 2: Write the migration file**

Use the column list from T1 step 4. Skeleton:

```sql
-- supabase/migrations/00058_drop_payment_mode_and_stripe_columns.sql
-- Bucket F: single-mode payment model. Drop dual-mode + Stripe Connect plumbing.
--
-- All statements single-line for Supabase web editor compatibility.

ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS payment_mode;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_account_id;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_charges_enabled;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_payouts_enabled;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_onboarding_complete;
```

Add any additional `stripe_*` columns found in T1 step 4 (each on its own line).

If T1 step 3 found a `vendor_payment_accounts` table, add:

```sql
DROP TABLE IF EXISTS vendor_payment_accounts;
```

If T3 step 6 found RLS policies referencing `payment_mode` or `stripe_*` columns, also drop those (each on its own line):

```sql
DROP POLICY IF EXISTS <policy_name> ON vendor_profiles;
```

- [ ] **Step 3: Do NOT apply the migration yet**

Per the migration apply policy, Claude writes the SQL but doesn't run it. The user applies manually:

- Dev: https://supabase.com/dashboard/project/lquvhjedlzubqusnfaak/sql/new
- Prod: https://supabase.com/dashboard/project/obpdgihdskbxzgyctaib/sql/new

T16 surfaces the SQL to the user for dev application before opening the PR.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00058_drop_payment_mode_and_stripe_columns.sql
git commit -m "feat(migrations): drop payment_mode + stripe_* columns from vendor_profiles (Bucket F T14)"
```

---

### Task 15: E2E specs (wizard six-steps + attribution dashboard)

**Files:**

- Create: `tests/e2e/bucket-f-wizard-six-steps.spec.ts`
- Create: `tests/e2e/bucket-f-attribution-dashboard.spec.ts`

**Interfaces:**

- Consumes: existing E2E helpers `seedVendor`, `cleanup`, `getServiceClient`, `loginAs` from `tests/e2e/helpers/`.

- [ ] **Step 1: Write the wizard six-steps spec**

```ts
// tests/e2e/bucket-f-wizard-six-steps.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket F — wizard is 6 steps', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('step counter shows N of 6 on each step; /payment-mode redirects to /review', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    // Step 1
    await page.goto('/dashboard/profile/setup/basics');
    await expect(page.getByText(/Step 1 of 6/i)).toBeVisible();

    // Step 2
    await page.goto('/dashboard/profile/setup/location');
    await expect(page.getByText(/Step 2 of 6/i)).toBeVisible();

    // Step 3
    await page.goto('/dashboard/profile/setup/online');
    await expect(page.getByText(/Step 3 of 6/i)).toBeVisible();

    // Step 4
    await page.goto('/dashboard/profile/setup/details');
    await expect(page.getByText(/Step 4 of 6/i)).toBeVisible();

    // Step 5
    await page.goto('/dashboard/profile/setup/portfolio');
    await expect(page.getByText(/Step 5 of 6/i)).toBeVisible();

    // Step 6
    await page.goto('/dashboard/profile/setup/review');
    await expect(page.getByText(/Step 6 of 6/i)).toBeVisible();

    // /payment-mode redirects
    await page.goto('/dashboard/profile/setup/payment-mode');
    await expect(page).toHaveURL(/\/review/);

    await ctx.close();
  });
});
```

- [ ] **Step 2: Write the attribution dashboard spec**

```ts
// tests/e2e/bucket-f-attribution-dashboard.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, getServiceClient, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket F — Money attribution dashboard', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('shows total + count + fees + net + 20x ROI for 3 seeded bookings', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const sb = getServiceClient();

    // Seed 3 bookings: $1,000 + $2,500 + $4,500 = $8,000 total
    // Fees = 5% = $400; net = $7,600; ROI = 20x
    const totals = [100_000, 250_000, 450_000];
    for (const total of totals) {
      await sb.from('bookings').insert({
        vendor_profile_id: vendor.vendorProfileId,
        couple_user_id: vendor.id, // self-booking is fine for test purposes
        status: 'accepted',
        total_price_cents: total,
        guest_count: 50,
        couple_full_name: 'Test Customer',
        couple_contact_phone: '(312) 555-0100',
      });
    }

    // Onboarding bypass — only set users.onboarding_completed_at (NOT vendor_profiles.onboarding_complete which redirects)
    await sb
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', vendor.id);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto('/dashboard');

    // Click All time to ensure the 3 seeded bookings are included regardless of when "now" falls
    await page.getByRole('button', { name: /All time/i }).click();

    // KPIs
    await expect(page.getByText('$8,000')).toBeVisible(); // total driven
    await expect(page.getByText('3', { exact: true })).toBeVisible(); // count (best-effort)
    await expect(page.getByText('$400')).toBeVisible(); // fees
    await expect(page.getByText('$7,600')).toBeVisible(); // net

    // ROI
    await expect(page.getByText(/\$20 in bookings/i)).toBeVisible();

    // Honesty footnote
    await expect(page.getByText(/doesn't track balance collection/i)).toBeVisible();

    await ctx.close();
  });
});
```

Note: the `getByText('3', { exact: true })` for the booking count may collide with other "3"s on the page. If it does, scope it: `await expect(page.locator('text=/^3$/').first()).toBeVisible();` or use a `data-testid` if the component renders one.

- [ ] **Step 3: Run both specs**

```bash
npm run test:e2e -- bucket-f-
```

Expected: both PASS. If a selector mismatch fails, inspect the rendered page and adjust.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/bucket-f-wizard-six-steps.spec.ts tests/e2e/bucket-f-attribution-dashboard.spec.ts
git commit -m "test(e2e): Bucket F wizard 6-step + attribution dashboard specs (T15)"
```

---

### Task 16: Open PR + manual smoke

**Files:** none.

**Interfaces:**

- Consumes: all commits from T2–T15.

- [ ] **Step 1: Run the full local suite**

```bash
npm run typecheck && npx vitest run && npm run test:e2e -- bucket-f-
```

Expected: green across the board (pre-existing scraped-vendor test failures from K, if any, are unrelated).

- [ ] **Step 2: Surface the migration SQL to the user**

Copy the contents of `supabase/migrations/00058_drop_payment_mode_and_stripe_columns.sql` and present it to the user with the dev Supabase SQL editor link:

> https://supabase.com/dashboard/project/lquvhjedlzubqusnfaak/sql/new

The user runs it against dev to verify it applies cleanly. Wait for confirmation before proceeding.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/bucket-f-payment-model
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "feat: Bucket F — payment model simplification (5%-only)" --body "$(cat <<'EOF'
## Summary

Implements Bucket F per `docs/superpowers/specs/2026-06-19-bucket-f-payment-model-simplification-design.md` (spec PR #49).

Collapses the dual payment model (Stripe mode 10% / Cash mode 5%) to a single 5%-only mode. Rips Stripe Connect plumbing, reframes the vendor Money section as a Baazar-attribution dashboard, unifies all fee + cancellation copy at 5%.

- Single `DEPOSIT_RATE = 0.05`; deleted `STRIPE_DEPOSIT_RATE`, `CASH_DEPOSIT_RATE`, `getDepositRate(mode)`
- Stripe-mode branch and "Vendor hasn't set up payments" error gone from `payment.service.ts`
- `payment_mode` + `stripe_*` columns removed from `vendor_profiles` types
- `StepPaymentMode.tsx` deleted; `/payment-mode` route redirects to `/review`
- Wizard step counter swept 7→6 across all 6 remaining steps; `WizardStepper` shows 6 circles
- New `getVendorAttribution()` service helper with unit tests
- `EarningsCard.tsx` rewritten as attribution dashboard (5 KPIs + 20× ROI line + 4-chip time-range filter + honesty footnote)
- Terms page, DepositDialog, CancelDialog, two email lines all use the locked verbatim 5% + cancellation copy
- Migration `00058` drops `payment_mode` + all `stripe_*` columns from `vendor_profiles`
- New Playwright specs: wizard six-steps + attribution dashboard

## Test plan

- [ ] CI green
- [ ] Migration applied to dev (already done pre-PR)
- [ ] Apply migration to prod after merge: https://supabase.com/dashboard/project/obpdgihdskbxzgyctaib/sql/new
- [ ] Manual smoke: walk wizard end-to-end as a fresh claimed vendor — confirm 6 steps + correct fee copy
- [ ] Manual smoke: visit vendor dashboard Money tab — confirm KPIs render + ROI line + footnote

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Hand off for human review.**

Wait for user to merge + apply prod migration.

---

## Self-Review

**Spec coverage:**

- §3.1 utils.ts constants → T2 ✓
- §3.2 payment.service.ts rip-out → T3 ✓
- §3.3 getVendorAttribution() → T9 ✓
- §3.4 database.types.ts → T4 ✓
- §3.5 Migration 00058 → T14 ✓
- §3.6 Pre-deploy state check → T1 ✓
- §4 Wizard changes → T5 (delete + redirect), T6 (counter sweep), T7 (stepper + resume + validation), T8 (StepReview) ✓
- §5 Money section reframe → T10 ✓
- §6 Cancellation + copy → T11 (terms), T12 (dialogs), T13 (emails) ✓
- §7 Tests → embedded in T2/T3/T9 (unit) + T15 (E2E) ✓
- §8 Deploy sequencing → T14 (writes only) + T16 (dev apply pre-PR, prod apply post-merge) ✓

**Placeholder scan:** zero "TBD"/"TODO"/"implement later" entries in plan steps. The migration column list is parameterized on T1's audit — that's not a placeholder, that's "do the audit first, then list." Same pattern as D.1's `pg_constraint` lookup.

**Type consistency:**

- `DEPOSIT_RATE` defined in T2, consumed in T3 + T9.
- `Attribution`, `AttributionRange` defined in T9, consumed in T10.
- `getVendorAttribution` signature matches across T9 + T10.
- Removed `payment_mode` + `stripe_*` columns referenced consistently across T3, T4, T9, T14.

No gaps found. Plan is ready for execution.
