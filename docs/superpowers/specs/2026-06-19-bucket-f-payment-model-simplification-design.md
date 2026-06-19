# Bucket F — Payment Model Simplification

**Status:** Approved (brainstorm) · awaiting implementation plan
**Date:** 2026-06-19
**Author:** Claude (with Sardar)
**Sequencing:** Bucket F slots IN FRONT OF Bucket B in the pre-launch sweep. Original sequence was D → A → B → E → C. New sequence: D → A → **F** → B → E → C. F is a strategic payment-model pivot that simplifies Bucket B's copy work (no more 30%/70% language to rewrite).

---

## 1. Why this exists

D.1 + Bucket A shipped under a dual-mode payment model: vendors picked between "Through Baazar (Stripe)" — 10% deposit collected via Stripe with 7% transferred to the vendor's Stripe Connect account — or "Direct payments (cash)" — 5% deposit fully retained by Baazar. The dual model was a hedge: it kept the door open for full marketplace payment processing while accommodating vendors without Stripe accounts.

The hedge doesn't pay off:

- **Code complexity.** ~40% of `src/services/payment.service.ts` is Stripe-mode-specific (payout split, "Vendor hasn't set up payments" error, mode-switch in `initiateCouplePaymentDeposit`). T9 of Bucket A had to write two different fee-disclosure cards. The cancellation policy had to cover both modes. Every dual-mode branch is a place bugs live.
- **Customer + vendor confusion.** Customers see "10% deposit, 70% to vendor, 30% retained" in some places and "5% deposit retained by Baazar" in others. Vendors see two different fee narratives depending on their mode. The audit found five surfaces with the old 30%/70% framing co-existing with Bucket A's new 3%/5% framing — internally consistent but externally contradictory.
- **Vendor signup friction.** Even with the deferred Stripe-Connect onboarding pivot, vendors who want to receive money on-platform must complete Stripe KYC at withdrawal time. The four hand-curated photobooth vendors and most of our long-tail (chai carts, mehndi artists, home-based makeup) don't have business bank accounts ready for that.
- **Underpriced for what we do.** 3% of a $5,000 booking = $150. That underprices the platform's role (curation, calendar protection, reviews, dispute mediation, communication infrastructure, AI vendor tooling). Comparable: The Knot Pro's per-lead pricing, Etsy 6.5%, Airbnb 14-16%.

Bucket F collapses the dual model to a single mode: **5% deposit at booking, Baazar retains all of it, vendor handles the 95% balance directly with the customer off-platform.** No Stripe Connect onboarding for any vendor. No per-vendor mode selection. One payment flow, one fee number, one cancellation policy.

**What we're explicitly choosing:**

- Lead-gen-shaped marketplace, not embedded-payment marketplace. The Knot and Yelp shapes, not the Airbnb shape.
- Curation + reviews as the trust moat, not Baazar-held escrow funds.
- Other revenue streams (featured listings, vendor subscriptions, planning tools) as the path to higher LTV per vendor, not maximizing per-booking commission.

**What we're explicitly deferring:**

- Embedded full-payment processing — revisit in 12-18 months if customer trust signals demand it. Likely a full rewrite against a more mature codebase, not a flag-flip.
- Vendor cancellation friction (reason required, account standing tracking) — Trust & Safety bucket later.
- Receivables tracking (mark-as-collected toggles) — its own feature bucket later.

---

## 2. Scope (in / out)

### In scope

- Rip out all Stripe Connect plumbing: `STRIPE_DEPOSIT_RATE` constant, `vendor_profiles.payment_mode` column, `vendor_profiles.stripe_account_id` + related `stripe_*` columns, the Stripe-mode branch in `src/services/payment.service.ts`, the `initiateCouplePaymentDeposit` mode-switch, Stripe Connect transfer creation, Stripe Connect account lookup helpers
- Single `DEPOSIT_RATE = 0.05` constant in `src/lib/utils.ts`; delete the `getDepositRate(mode)` helper
- Delete `src/components/onboarding/StepPaymentMode.tsx` entirely
- Delete the `/dashboard/profile/setup/payment-mode` route page; replace with a 3-line redirect file pointing at `/review`
- Sweep wizard step counter copy 7 → 6 across all six remaining step components
- Update `WizardStepper.tsx` to render six numbered circles, not seven
- Update `nextIncompleteStep(profile)` in `src/lib/onboarding/resume.ts` to drop the payment-mode check
- Delete `paymentModeSchema`; remove `paymentMode` from `publishGateSchema` in `src/lib/onboarding/validation.ts`
- Drop StepReview's payment-mode summary card and the "(Stripe mode)/(cash mode)" qualifier from the fee one-liner
- Reframe the Money section in the vendor dashboard from "earnings (we paid you)" to **Baazar attribution metrics** (total booking value, count, avg, platform fees paid, net, ROI multiple) with a 4-chip time-range filter and an honesty footnote about unverified balance collection
- New service helper `getVendorAttribution(supabase, vendorProfileId, range)` returning the attribution shape
- Rewrite `EarningsCard.tsx` contents to render the attribution dashboard (keep the file path; replace the body)
- Locked verbatim cancellation policy: "24h cooling-off + non-refundable after" for customer; "100% refund" for vendor cancellation
- Locked verbatim fee narrative: "Baazar charges a 5% deposit at booking. We keep that 5% as our platform fee. You pay the remaining 95% directly to the vendor per their payment terms."
- Locked verbatim vendor-side agreement copy on StepReview
- Update `src/app/(marketplace)/terms/page.tsx` with both locked blocks (fee + cancellation)
- Inline cancellation policy on `DepositDialog.tsx` via collapsed `<details>`
- Update `CancelDialog.tsx` warning for vendor-side cancellation
- Rewrite two specific lines in `src/lib/email/resend.ts` that still say 30% / 70% (audit lines 148 + 253)
- Delete the "Vendor hasn't set up payments yet" error string
- Delete the "Stripe vendors: 10% deposit, 30% to platform, 70% to vendor" comment in `payment.service.ts`
- Migration `00058_drop_payment_mode_and_stripe_columns.sql` — single file, single-line statements, `DROP COLUMN IF EXISTS` guards
- New Playwright spec `bucket-f-wizard-six-steps.spec.ts`
- New Playwright spec `bucket-f-attribution-dashboard.spec.ts`
- Update Bucket A's `bucket-a-form-errors.spec.ts` if it references the deleted Step 6

### Out of scope (deferred)

- Receivables tracking (mark-as-collected toggles on bookings)
- Vendor cancellation friction (reason field, cooling-off, account standing impact)
- Time-series charts in the attribution dashboard
- Per-customer breakdown in attribution
- CSV export of attribution data
- Embedded full-payment processing — explicitly deferred 12-18 months
- Bucket B remaining items (`couple` → `customer` copy sweep, event-type expansion, guest-count consolidation, vendor's-own-profile edit affordance, OnboardingGate investigation, "Guests" label rename)

---

## 3. Service layer + DB changes

### 3.1 `src/lib/utils.ts`

```ts
// BEFORE
export const STRIPE_DEPOSIT_RATE = 0.1;
export const CASH_DEPOSIT_RATE = 0.05;
export const DEPOSIT_RATE = STRIPE_DEPOSIT_RATE; // alias
export function getDepositRate(mode: 'stripe' | 'cash'): number {
  return mode === 'cash' ? CASH_DEPOSIT_RATE : STRIPE_DEPOSIT_RATE;
}

// AFTER
export const DEPOSIT_RATE = 0.05;
// getDepositRate() helper deleted — there's only one rate now.
```

### 3.2 `src/services/payment.service.ts`

Drop these specific code paths:

- The `if (payment_mode === null)` null-check branch that throws `"Vendor hasn't set up payments yet"`. The branch is dead under single-mode; the error string disappears with it.
- The Stripe-mode vs. cash-mode switch in `initiateCouplePaymentDeposit`. All callers funnel through a single path: compute `total_price_cents × DEPOSIT_RATE`, create Stripe checkout for that amount, mark the booking row.
- The 30%/70% split calculation in the deposit-paid handler. Under single-mode, Baazar retains 100% of the deposit; nothing is transferred onward.
- Stripe Connect transfer creation code.
- Stripe Connect account lookup helpers (`getActiveStripeAccountForVendor` or whatever it's named — audit at implementation time).
- The "Stripe vendors: 10% deposit, 30% to platform, 70% to vendor" comment block.

Keep these code paths:

- Customer-side Stripe checkout session creation for the 5% deposit (we still take cards via Stripe; we just don't transfer anything onward).
- The Stripe webhook handler at `src/app/api/webhooks/stripe/route.ts` — keep customer-payment events (`checkout.session.completed`, `payment_intent.succeeded`); drop Connect-account events (`account.updated`, `account.application.deauthorized`, etc.).
- The deposit-amount calculation, now uniformly `total_price_cents × DEPOSIT_RATE`.

### 3.3 New service helper `getVendorAttribution()`

New file or function in `src/services/payment.service.ts` (or a new `src/services/attribution.service.ts` — implementation decides):

```ts
type AttributionRange = 'month' | 'quarter' | 'year' | 'all';

interface Attribution {
  totalCents: number; // sum of total_price_cents across qualifying bookings
  bookingCount: number; // count of qualifying bookings
  platformFeeCents: number; // = totalCents * DEPOSIT_RATE (rounded)
  netCents: number; // = totalCents - platformFeeCents
  roiMultiple: number; // = totalCents / platformFeeCents (always 19 when non-empty)
}

export async function getVendorAttribution(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  range: AttributionRange
): Promise<Attribution>;
```

**Qualifying booking statuses:** bookings count from `'accepted'` onward — `accepted`, `adjusted_quote_sent`, `couple_countered`, `deposit_paid`, `completed`. Cancelled bookings (`couple_cancelled`, `vendor_cancelled`, `cancelled_mutual`, `auto_cancelled`, `expired`) are excluded. Pending bookings (`pending`, `pending_quote`) are excluded — they're not yet confirmed.

**Date range filter:**

- `'month'` → bookings where `created_at >= date_trunc('month', now())`
- `'quarter'` → `created_at >= date_trunc('quarter', now())`
- `'year'` → `created_at >= date_trunc('year', now())`
- `'all'` → no date filter

**Empty-state behavior:** when no qualifying bookings exist, all numeric fields are 0 and `roiMultiple` is 0 (renderer can choose to show "—" or "0×"). The math `totalCents / platformFeeCents` would divide by zero; the service returns 0 explicitly for that case.

### 3.4 `src/types/database.types.ts`

Remove these from `vendor_profiles` Row, Insert, and Update interfaces:

- `payment_mode: 'stripe' | 'cash' | null`
- `stripe_account_id: string | null`
- `stripe_charges_enabled: boolean | null`
- `stripe_payouts_enabled: boolean | null`
- `stripe_onboarding_complete: boolean | null`

The implementation step audits the actual columns and removes whichever exist.

### 3.5 Migration `00058_drop_payment_mode_and_stripe_columns.sql`

Single file, single-line statements (D.1's lesson about Supabase web editor compatibility):

```sql
-- Drop Stripe Connect + payment_mode columns from vendor_profiles.
-- Bucket F: single-mode payment model. No Stripe payouts; all deposits retained by Baazar.

ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS payment_mode;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_account_id;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_charges_enabled;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_payouts_enabled;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_onboarding_complete;
```

`IF EXISTS` guards each one so the migration is idempotent and tolerant of whichever `stripe_*` columns Sub-project I actually created. The implementation step runs `\d vendor_profiles` first to find any others (e.g. `stripe_account_status`, `stripe_business_type`) and adds them to this list.

**Also audit at implementation time:**

- Is there a separate `vendor_payment_accounts` table from Sub-project I's "Stripe FK flip"? If yes, drop it.
- Any RLS policies on `vendor_profiles` referencing `payment_mode` or `stripe_*` columns? Drop those policies.
- Any DB triggers referencing those columns? Audit.

### 3.6 Pre-deploy state verification

Run this query against prod before merging the PR to confirm expectations:

```sql
SELECT
  COUNT(*) FILTER (WHERE payment_mode = 'stripe') AS stripe_vendors,
  COUNT(*) FILTER (WHERE payment_mode = 'cash')   AS cash_vendors,
  COUNT(*) FILTER (WHERE payment_mode IS NULL)    AS unset_vendors,
  COUNT(*) AS total
FROM vendor_profiles;

SELECT COUNT(*) FROM bookings WHERE status IN ('deposit_paid', 'completed');
```

**Expected:** total ≈ 3,300 (scraped + 4 hand-curated), all `payment_mode = NULL`, zero confirmed bookings. None of the four photobooth vendors have completed onboarding; no real customer has paid a deposit end-to-end.

**If `stripe_vendors > 0`:** add a defensive `UPDATE vendor_profiles SET payment_mode = NULL WHERE payment_mode = 'stripe';` step before the column drop. Functionally the same since the column is being dropped, but cleaner.

**If `deposit_paid` bookings > 0:** stop and investigate. An in-flight customer somewhere means the dual-mode logic was actually used in production, which contradicts our assumption that we're pre-launch.

---

## 4. Wizard changes (7 → 6 steps)

### 4.1 Deletions

- Delete `src/components/onboarding/StepPaymentMode.tsx` entirely.
- Replace `src/app/dashboard/profile/setup/payment-mode/page.tsx` with a 3-line redirect:

```tsx
import { redirect } from 'next/navigation';
export default function Page() {
  redirect('/dashboard/profile/setup/review');
}
```

The redirect catches any in-flight vendor who had `/payment-mode` bookmarked or saved as their resume step. After 2 weeks, delete this file entirely.

### 4.2 Step counter sweep (7 → 6)

Every Step component has hardcoded "Step N of 7" copy at the top. Update each:

| Step | File                | Counter copy               |
| ---- | ------------------- | -------------------------- |
| 1    | `StepBasics.tsx`    | "Step 1 of 6"              |
| 2    | `StepLocation.tsx`  | "Step 2 of 6"              |
| 3    | `StepOnline.tsx`    | "Step 3 of 6"              |
| 4    | `StepDetails.tsx`   | "Step 4 of 6"              |
| 5    | `StepPortfolio.tsx` | "Step 5 of 6"              |
| 6    | `StepReview.tsx`    | "Step 6 of 6" (was 7 of 7) |

### 4.3 Sidebar stepper

`src/components/onboarding/WizardStepper.tsx` — drop the 6th numbered circle (Payment), shift Review's circle from position 7 to position 6. Six circles total.

### 4.4 StepReview changes

- Drop the payment-mode summary card that Bucket A T9 added (the card that summarized the vendor's chosen mode).
- Replace the existing one-liner _"Baazar takes 3% (Stripe mode) or 5% (cash mode). Everything else is yours."_ with _"Baazar takes a 5% deposit at booking. Everything else you collect directly from the customer."_
- Add the locked-verbatim vendor-side agreement copy (see §5.4) above the Publish button.

### 4.5 Resume + validation

- `src/lib/onboarding/resume.ts` — `nextIncompleteStep(profile)` drops the payment-mode check entirely. After Step 5 (Portfolio), the next incomplete step is Review.
- `src/lib/onboarding/validation.ts` — delete `paymentModeSchema`; remove `paymentMode` from `publishGateSchema`. Bucket A's T7 wired `useFormErrors` into StepPaymentMode — that wiring vanishes with the file delete.

### 4.6 Tests to update or delete

- Any unit test that exercises `StepPaymentMode` validation, the `paymentMode` schema, or `getDepositRate('stripe' | 'cash')` — delete those test cases.
- Bucket A's `bucket-a-form-errors.spec.ts` doesn't currently test Step 6 directly (it tests Step 1 and Step 2). Verify with grep at implementation time; if it does reference Step 6, update accordingly.

---

## 5. Money section reframe

### 5.1 Component path

Rewrite the contents of `src/components/dashboard/EarningsCard.tsx` — keep the file path so the existing dashboard layout (built by Sub-project E) doesn't need restructuring. Replace the entire body.

### 5.2 Hero KPI strip

The top of the Money tab renders:

- **Total booking value driven** — `attribution.totalCents`, formatted as USD. Label: "in confirmed bookings driven by Baazar".
- **Bookings count** — `attribution.bookingCount`. Label: "bookings confirmed".
- **Platform fees paid** — `attribution.platformFeeCents`, formatted as USD. Label: "in fees paid to Baazar".
- **Net revenue from Baazar leads** — `attribution.netCents`, formatted as USD. Label: "net to you (95% of bookings driven)".
- **ROI multiple** — `attribution.roiMultiple`, formatted as "Nx". Label: "every $1 paid to Baazar → $N in bookings".

The ROI line is the hero — vendors should screenshot it. Make it visually prominent (larger font, hot-pink accent on the number).

### 5.3 Time-range filter

Four chip buttons above the KPI strip: **This month** · **Quarter** · **Year** · **All time**. Default: This month. Each click refilters the data server-side and re-renders.

### 5.4 Honesty footnote

Persistent caption under the KPI strip (small, unobtrusive but visible):

> Based on confirmed booking totals; doesn't track balance collection.

### 5.5 Empty state

When no qualifying bookings exist:

```
You haven't received any Baazar bookings yet.
When customers confirm bookings with you, you'll see them here.
[ Browse the marketplace → ]    (links to /vendors)
```

### 5.6 What gets deleted

- All "70% / 30%" copy in `EarningsCard.tsx`.
- Whatever existing service helper computed Stripe-payout-based earnings (likely `getVendorEarnings()` or similar) — its query joined to Stripe transfer records, all that goes.
- Any test asserting on the old 70/30 shape.

### 5.7 Brand styling

Reuse the cream / ink / hot-pink palette established in Bucket A. KPI numbers in ink, labels in ink/60, ROI number accented in hot-pink, footnote in ink/50.

---

## 6. Cancellation policy + customer-facing copy unification

### 6.1 Locked verbatim cancellation policy

Single source of truth — the **exact** text appears wherever the policy surfaces:

> **Customer cancellation.** Your 5% deposit is fully refundable within 24 hours of booking. After that, the deposit confirms your reservation and is non-refundable.
>
> **Vendor cancellation.** If the vendor cancels at any time, you receive a full refund of your 5% deposit.
>
> The 95% balance you pay directly to the vendor is between you and them; Baazar doesn't process or hold those funds.

### 6.2 Locked verbatim fee narrative

Replaces every 30%/70% mention across the platform:

> Baazar charges a 5% deposit at booking. We keep that 5% as our platform fee. You pay the remaining 95% directly to the vendor per their payment terms.

### 6.3 Locked verbatim vendor-side agreement copy

Appears on `StepReview.tsx` above the Publish button:

> By publishing your profile, you agree to Baazar's terms. Customers pay a 5% deposit through Baazar at booking — that's our platform fee. You collect the 95% balance directly from them. If you cancel a confirmed booking, the customer's deposit is refunded in full.

### 6.4 Surface inventory

| Surface                                                                           | What lives there                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(marketplace)/terms/page.tsx`                                            | Both blocks (§6.1 + §6.2), in two sections labelled "Platform fee" and "Cancellations"                                                                                                  |
| `src/components/dashboard/DepositDialog.tsx`                                      | The cancellation block in a collapsed `<details>` labelled "Cancellation policy"; the fee narrative inline above the Pay button                                                         |
| Deposit-paid confirmation email (customer recipient) in `src/lib/email/resend.ts` | Short reminder: "Your 5% deposit confirms your booking. Coordinate the 95% balance directly with [vendor name] per their terms." + link to `/terms`                                     |
| Vendor's deposit-received email in `src/lib/email/resend.ts`                      | Rewrite the existing line 253 from "Your 70% share is held in escrow..." to: "[Customer name] paid their 5% deposit. Coordinate the balance with them directly per your payment terms." |
| `src/components/onboarding/StepReview.tsx`                                        | The vendor-side agreement copy (§6.3), shown above the Publish button                                                                                                                   |
| `src/components/dashboard/CancelDialog.tsx` (vendor cancelling a booking)         | Inline warning: "If you cancel, the customer receives a full refund of their 5% deposit and you lose this booking."                                                                     |

### 6.5 Specific email line rewrites

`src/lib/email/resend.ts`:

- **Line 148** (current): `"Pay your hold deposit (30%) to confirm..."`
  - **New:** `"Pay your 5% deposit to confirm your booking..."`
- **Line 253** (current): `"Your 70% share is held in escrow and released..."`
  - **New:** `"[Customer name] paid their 5% deposit. Coordinate the balance with them directly per your payment terms."` (full line replacement; the escrow concept doesn't exist anymore)

### 6.6 Other dead copy to remove

- The `"Vendor hasn't set up payments yet"` error string in `src/services/payment.service.ts` (§3.2 already deletes the branch).
- The `"Stripe vendors: 10% deposit, 30% to platform, 70% to vendor"` comment block (§3.2 already deletes).

### 6.7 Explicitly NOT in Bucket F's copy sweep

These stay for Bucket B:

- Anywhere the literal word `couple` appears in user-facing copy (e.g. _"Waiting for the couple to pay the deposit..."_ in `BookingDetail.tsx`).
- Event-type-list expansion copy.
- Guest-count form labels.
- Operations view "Guests" label.

---

## 7. Testing approach

### 7.1 Unit tests (vitest)

- `payment.service.ts` deposit calculation: single rate, `total × DEPOSIT_RATE`. Property test: for any `total`, the deposit is `Math.round(total * 0.05)`.
- `getVendorAttribution()`:
  - Returns 0s on empty data, `roiMultiple: 0` (avoids divide-by-zero).
  - Returns correct sums when given seeded bookings with known totals.
  - Time-range filtering: bookings outside the range are excluded.
  - Excludes cancelled and pending bookings.
  - Always returns `roiMultiple: 20` when non-empty (algebraic invariant: total / (total × 0.05) = 20).
- `validation.ts`: `paymentModeSchema` is gone; `publishGateSchema` doesn't require `paymentMode`.
- `resume.ts`: `nextIncompleteStep()` skips the deleted payment-mode step.
- Delete existing tests that asserted on Stripe-mode behaviour.

### 7.2 E2E tests (Playwright)

- Modify Bucket A's `bucket-a-form-errors.spec.ts` if it touches Step 6.
- New `bucket-f-wizard-six-steps.spec.ts`:
  - Walk through Steps 1-6 of the wizard, fill minimal valid data on each.
  - Assert "Step N of 6" copy on each step.
  - Assert no `/payment-mode` route is reachable (visiting it redirects to `/review`).
- New `bucket-f-attribution-dashboard.spec.ts`:
  - Seed a vendor with 3 confirmed bookings of known totals ($1,000, $2,500, $4,500 → total $8,000).
  - Navigate to the vendor dashboard Money tab.
  - Assert the attribution card shows: total $8,000 · 3 bookings · $400 fees · $7,600 net · 20× ROI.
  - Assert the honesty footnote is visible.
  - Click the "All time" chip; assert numbers unchanged (since all seeded bookings fit any range).

### 7.3 Manual smoke

- Visit `/dashboard/profile/setup/payment-mode` — should redirect to `/review`.
- Visit `/terms` — both new locked blocks visible.
- Trigger a deposit checkout as a test customer — DepositDialog shows the new policy via `<details>`.

---

## 8. Deploy sequencing

Standard zero-downtime pattern (same as D.1 + Bucket A):

1. **Land code first.** PR squash-merges to main. Vercel auto-deploys. New app no longer reads `payment_mode` or `stripe_*` columns at all.
2. **Old app instance still alive briefly** during deploy rollover. It still reads those columns, but the columns still exist — no errors.
3. **After Vercel rollover completes**, user applies the migration manually via Supabase SQL editor: first to dev, then to prod. By the time columns are dropped, no live code reads them.

The migration is NOT bundled with the code deploy. It's a separate, post-deploy step the user runs (per the migration apply policy).

### Rollback story

- Rolling back code: revert the PR, redeploy. Columns still exist; old code works.
- Rolling back migration: can't really — recreating dropped columns with NULL defaults gets us back to a state functionally identical to dropped-columns (old code reading NULL behaves the same as new code not reading at all).
- The point-of-no-return is when (a) code is deployed and (b) columns are dropped and (c) someone reverses the product decision to keep dual-mode. We're betting that doesn't happen for 12-18 months; if it does, we rebuild against the codebase we have then.

---

## 9. Estimated effort

**4-5 working days**, split as:

- **Day 1** — `payment.service.ts` rip-out + single `DEPOSIT_RATE` constant + unit tests + `database.types.ts` updates.
- **Day 2** — Wizard cleanup: delete `StepPaymentMode.tsx`, sweep step counter 7→6, delete the `/payment-mode` route + replace with redirect, update `WizardStepper.tsx`, update `resume.ts`, update `validation.ts`.
- **Day 3** — Attribution dashboard: new `getVendorAttribution()` service helper, rewrite `EarningsCard.tsx` contents.
- **Day 4** — Copy unification: terms page, `DepositDialog.tsx`, `CancelDialog.tsx`, two email template rewrites, vendor agreement on StepReview, delete dead error strings.
- **Day 5** — Migration file + new Playwright specs + manual smoke + PR.

Single squash-merge PR.

---

## 10. Success criteria

The bucket is done when:

1. Zero references to `payment_mode` or `STRIPE_DEPOSIT_RATE` anywhere in `src/`.
2. `DEPOSIT_RATE = 0.05` is the only deposit-rate constant; no per-mode helpers.
3. Wizard is 6 steps; the step counter reads "Step N of 6" on each.
4. `/dashboard/profile/setup/payment-mode` returns a redirect to `/review`.
5. Attribution dashboard renders 5 KPIs + ROI line + honesty footnote + 4-chip time-range filter.
6. Terms page, `DepositDialog`, `CancelDialog`, two email templates use the locked verbatim cancellation + fee copy.
7. Migration drops `payment_mode` + all `stripe_*` columns from `vendor_profiles` (and the `vendor_payment_accounts` table if it exists from Sub-project I).
8. No `"Vendor hasn't set up payments yet"` error string remains in the codebase.
9. Bucket A E2E specs still pass after the step-count change.
10. New attribution-dashboard E2E spec passes — correct math + correct copy.
11. `npm run typecheck` clean.
12. Full unit suite passes.

---

## 11. Math note

The ROI multiple is **20×**, not 19× (brainstorm contained a math error):

- Net revenue per dollar of bookings: `1 - 0.05 = 0.95` (vendor's share)
- Fee per dollar of bookings: `0.05` (Baazar's share)
- ROI = `1 / 0.05 = 20` (every $1 in platform fees → $20 in bookings)

The hero copy on the Money tab reads: _"every $1 paid to Baazar → $20 in bookings"_. The E2E test in §7.2 also asserts 20×.
