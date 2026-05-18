# Sub-project C — Cash Vendor Payment Model

**Date:** 2026-05-17
**Status:** Design (pending user review)
**Predecessors:** A (packages + booking model), B (vendor onboarding wizard), F (notifications), G (calendar), D (couple dashboard). All shipped.

---

## 1. Goal

Add a "cash vendor" payment mode where the vendor opts out of Stripe Connect entirely. Couple still pays a deposit via Stripe at confirmation — but for cash vendors, **Baazar keeps 100% of the deposit** as its platform fee (smaller deposit %, no vendor portion). Vendor coordinates the remaining 95% directly with the couple (cash, Zelle, bank transfer — outside the platform).

Bundled into this PR: **fix the pre-existing `DEPOSIT_RATE` bug** (code charges 30% while terms page promises 10%).

## 2. Non-goals

- **No instant-accept** for cash vendors. They use the same `pending → accepted → deposit_paid → completed` lifecycle as Stripe vendors. Just no Stripe Connect onboarding required.
- **No Zelle/ACH distribution.** Baazar never routes funds to the vendor for cash vendors. Avoids MSB regulation, Zelle business-API gap, and operational complexity.
- **No trust badge on couple-facing UI.** Couples don't see "this is a cash vendor" — payment mode is invisible to them. Reason: even Stripe vendors may handle the remaining 90% of payment via cash/Zelle outside the platform; the couple's post-deposit experience is the same.
- **No subscription/listing-fee model.** Revenue stays per-booking.
- **No automated refund mechanic on completion** (the "option C" from brainstorm). Cash vendors get the full 5% as platform revenue; couples' skin-in-the-game is the 5% deposit + the 30-day cancellation policy.
- **No payment-mode change after launch.** Vendor picks during onboarding (or later via settings, but defaults to `'stripe'`). Switching modes mid-booking-lifecycle is out of scope — affects only future bookings.

## 3. Locked decisions (from brainstorm)

| Decision                           | Choice                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cash deposit rate                  | **5%** of total. Justification: cash vendors save the platform Stripe processing on the 70% vendor share, so 5% (vs Stripe vendor's 3% net) is fair.                                     |
| Platform retention on cash deposit | **100%** — Baazar keeps the entire 5%. Vendor gets nothing through the platform.                                                                                                         |
| Booking lifecycle                  | Identical to Stripe vendors: `pending → accepted → deposit_paid → completed`.                                                                                                            |
| Cancellation policy                | Mirror existing matrix: <24h cooling off (100% refund), >30d (50%/50% to platform), ≤30d (0% refund / 100% platform). Vendor cancel = 100% refund. Mutual = 50/50.                       |
| DEPOSIT_RATE bug fix               | Bundled. Change `DEPOSIT_RATE` from 0.30 → 0.10 for Stripe vendors. Update Stripe checkout line item string "30% deposit" → "10% deposit".                                               |
| Couple-facing UI                   | **Hide payment mode entirely.** No "cash vendor" / "direct booking" badge. Deposit amount differs (10% vs 5%) but couples don't see the % — just the dollar amount on the checkout page. |
| Vendor onboarding                  | Add a Step 6 to the wizard: "Payment mode" (Stripe or Cash). Default Stripe. Cash vendors skip the deferred Stripe Connect onboarding entirely.                                          |
| Vendor dashboard                   | Earnings card branches on payment_mode. Cash vendors see "Direct payments" info card instead of Stripe earnings.                                                                         |

## 4. Schema changes

### Migration 00033

```sql
-- 00033_add_payment_mode_to_vendor_profiles.sql

ALTER TABLE vendor_profiles
  ADD COLUMN payment_mode text NOT NULL DEFAULT 'stripe'
    CHECK (payment_mode IN ('stripe', 'cash'));

-- No backfill needed — default 'stripe' covers all existing rows.
-- No new indexes needed — payment_mode isn't queried on its own.
```

That's the only schema change. Cancellation, transactions, booking_events all stay structurally identical.

### Constants (no schema, but code-level changes)

In `src/lib/utils.ts`:

```typescript
// OLD:
// export const DEPOSIT_RATE = 0.30;

// NEW:
export const STRIPE_DEPOSIT_RATE = 0.1;
export const CASH_DEPOSIT_RATE = 0.05;

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

// `calculateVendorPending` becomes mode-aware too — returns 0 for cash.
export function calculateVendorPending(depositCents: number, mode: PaymentMode = 'stripe'): number {
  return depositCents - calculatePlatformCut(depositCents, mode);
}
```

**Deprecation:** the existing `DEPOSIT_RATE` export stays for one release as `STRIPE_DEPOSIT_RATE` alias. All current call sites get updated to call `getDepositRate(vendor.payment_mode)` instead.

## 5. Payment flow

### Couple submits booking → unchanged

No deposit involved at submit. Status starts `pending`.

### Vendor accepts → unchanged status transition, but `total_price_cents` calculation reads from the SAME source. The accept handler doesn't touch the deposit.

### Couple pays deposit → branched on `vendor.payment_mode`

In `src/services/payment.service.ts`, the deposit-checkout creation logic:

```typescript
// Get the vendor's payment mode
const paymentMode = vp.payment_mode as PaymentMode;
const depositRate = getDepositRate(paymentMode);
const depositAmount = Math.floor(booking.total_price_cents * depositRate);
const platformCut = calculatePlatformCut(depositAmount, paymentMode);
const vendorPending = calculateVendorPending(depositAmount, paymentMode);

// Build the Stripe checkout — the line item description should be generic, not "30% deposit":
const description = `Deposit for booking with ${vp.business_name}`;
```

The Stripe checkout session is created in the same way for both modes. The difference is the **amount** charged + how the resulting transaction is allocated (platform_fee vs vendor_payout in the `transactions` table).

For cash vendors, `vendorPending = 0` — the entire deposit is recorded as `platform_fee` in the transactions table. No transfer to vendor's Connect account is ever scheduled (since they have no Connect account).

### Cancellation → mode-aware policy

The current `cancelBooking` function references `policy.platformKeepPct` and `policy.vendorKeepPct`. For cash vendors:

- `vendorKeepPct` should always be 0 (vendor has no share to keep)
- `platformKeepPct` should be 1.0 (platform keeps everything)
- BUT the **couple refund** percentage still follows the existing tiers (24h cooling off → 100%, >30d → 50%, ≤30d → 0%)

Easy fix: in `getCancellationPolicy()`, after computing the Stripe policy, override `vendorKeepPct = 0` and recompute `platformKeepPct = 1 - coupleRefundPct` if `paymentMode === 'cash'`.

### Completion → no Stripe transfer for cash vendors

The current `autoCompleteBookings` cron triggers a Stripe transfer to the vendor's Connect account 48h after the event. For cash vendors, this transfer never happens — there's no Connect account. The transaction stays as `platform_fee = depositAmount, vendor_payout = 0` with no `transferred_at` field set.

## 6. Vendor onboarding (Sub-project B integration)

Add a new step to the wizard. **Step 6: Payment mode** between "Portfolio" (Step 4) and "Review" (Step 5 → 6).

```
/dashboard/profile/setup/payment-mode
```

UI:

- Two cards:
  - **Stripe Connect** (recommended) — "Get paid through Baazar. We hold a portion of your deposit until you set up your account."
  - **Direct payments** — "Coordinate payment with each couple directly (cash, Zelle, check, etc.). Baazar handles a small platform fee at booking."
- Single-select radio. Default to Stripe.
- On Next: PATCH `/api/vendor-profile/setup/payment-mode` with `{ payment_mode: 'stripe' | 'cash' }`. Routes back to Review (now Step 6 → 7).
- Resume logic in `nextIncompleteStep` updates: `payment_mode IS NULL → 'payment-mode'`. (Note: since the column is NOT NULL with default 'stripe', this is a no-op for existing vendors. New vendors see the step and explicitly choose.)

Edit form (`VendorProfileForm.tsx`) gets a payment mode field too. Couple changes are blocked when the vendor has any non-terminal bookings (don't let them switch mid-flight and confuse settlement).

## 7. Vendor dashboard changes

### Earnings card branch

In `src/app/dashboard/page.tsx`, the existing `<EarningsCard earnings={earnings} />` branch becomes:

```jsx
{
  vendorProfile.payment_mode === 'cash' ? (
    <DirectPaymentsCard confirmedBookings={confirmedCount} upcomingEvents={upcomingCount} />
  ) : (
    <EarningsCard earnings={earnings} />
  );
}
```

### `DirectPaymentsCard` (new component)

```typescript
// src/components/dashboard/DirectPaymentsCard.tsx
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
        <div className="flex justify-between"><span>Confirmed bookings</span><span className="font-semibold">{confirmedBookings}</span></div>
        <div className="flex justify-between"><span>Upcoming events</span><span className="font-semibold">{upcomingEvents}</span></div>
        <p className="text-xs text-muted-foreground pt-2 border-t">
          Payments tracked outside Baazar. Coordinate directly with each couple.
        </p>
      </CardContent>
    </Card>
  );
}
```

### Stripe Connect onboarding pages

For cash vendors, the existing `/dashboard/stripe/onboarding` and similar Stripe Connect pages should redirect to `/dashboard` with a flash message: "Stripe Connect isn't needed for direct payment vendors." Easy guard at the page level.

## 8. Booking detail page

Stays unchanged. The booking detail shows the deposit amount in dollars, not as a percentage. Whether it was 10% or 5% is invisible. The address-reveal gate at `deposit_paid` still fires for both modes.

## 9. Tests

**Unit:**

- `src/__tests__/lib/utils.test.ts` — `getDepositRate`, `getPlatformCutRate`, `calculatePlatformCut(mode='cash')` math
- Existing `src/__tests__/services/payment.service.test.ts` — extend to cover cash-mode branch: deposit checkout uses 5%, transaction row has platform_fee = depositAmount + vendor_payout = 0
- Existing `src/__tests__/services/booking-a3.service.test.ts` (or wherever cancel is tested) — add cash-mode cancellation cases: <24h, >30d, ≤30d each compute correct platform/couple split

**E2E (`tests/e2e/cash-vendor.spec.ts`):**

1. Seed a cash vendor → couple submits → vendor accepts → couple pays deposit (5%) → status flips to `deposit_paid` → assert transaction row has `vendor_payout: 0` and `platform_fee = depositAmount`
2. Seed a cash vendor + couple, couple cancels >30d out → couple gets 50% refund, platform keeps 50%
3. Seed a cash vendor + couple, couple cancels ≤30d → couple gets 0%, platform keeps 100%
4. Vendor onboarding wizard happy path with Cash mode selected → vendor lands on `/dashboard` with the `DirectPaymentsCard` rendered

## 10. Files affected

**New files:**

- `supabase/migrations/00033_add_payment_mode_to_vendor_profiles.sql`
- `src/components/dashboard/DirectPaymentsCard.tsx`
- `src/app/dashboard/profile/setup/payment-mode/page.tsx`
- `src/components/onboarding/StepPaymentMode.tsx`
- `src/__tests__/lib/utils.test.ts` (new file or extend if exists)
- `tests/e2e/cash-vendor.spec.ts`

**Modified files:**

- `src/lib/utils.ts` — rename DEPOSIT_RATE, add helpers
- `src/services/payment.service.ts` — branch deposit calc + cancellation policy on payment_mode
- `src/services/booking.service.ts` — surface `payment_mode` in selects (so payment.service has it)
- `src/lib/onboarding/resume.ts` — update step ordering + add 'payment-mode' branch
- `src/lib/onboarding/validation.ts` — add `paymentModeSchema`
- `src/components/onboarding/WizardStepper.tsx` — add the new step
- `src/components/onboarding/StepReview.tsx` — display payment mode in the summary
- `src/app/api/vendor-profile/publish/route.ts` — validate `payment_mode` is set
- `src/app/dashboard/page.tsx` — branch earnings card render
- `src/app/dashboard/stripe/onboarding/page.tsx` (if exists) — redirect cash vendors away
- `src/app/(marketplace)/terms/page.tsx` — update terms to reflect 10% Stripe deposit + cash-vendor 5% policy
- `src/types/database.types.ts` — add `payment_mode` to vendor_profiles types

## 11. Phasing

Single PR. Sequential tasks:

- **C1** — Migration 00033 + types + constants/helpers in `lib/utils.ts` + unit tests
- **C2** — `payment.service.ts` cash branches (deposit calc, cancellation policy) + service tests
- **C3** — Onboarding wizard new step (StepPaymentMode + route + resume + publish gate)
- **C4** — Vendor dashboard branch (DirectPaymentsCard + earnings card branch + Stripe pages redirect)
- **C5** — Terms page update + E2E spec
- **C6** — PR + prod migration

## 12. Open questions (none — all locked in chat)

Ready for plan.
