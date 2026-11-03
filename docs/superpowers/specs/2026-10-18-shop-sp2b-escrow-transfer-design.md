# Shop SP2b — Escrow Transfer on Onboarding (design)

**Status:** approved design, pre-plan
**Author:** brainstormed 2026-10-18
**Builds on:** SP1 Connect onboarding (migration 00086, PR #177) and SP2a checkout (migration 00087/00088, PR #180, squash `3dfd143`)

## Problem

When a local bridal-wear vendor sells through the shop **before** they have
completed Stripe Connect onboarding, SP2a takes the money as a **platform
charge** (escrow mode) and writes a `vendor_ledger` row with
`status='held'`: the funds sit in Baazar's Stripe balance, owed to the
vendor, with `net_vendor_cents` already computed and
`stripe_transfer_id`/`transferred_at` null.

Nothing yet moves that money to the vendor. SP2b closes the loop: when the
vendor finishes onboarding, transfer their accumulated held balance to their
connected account, and give them a dashboard surface that both shows the
held money and nudges them to onboard to receive it.

This is the "escrow holds ALL pre-onboarding sales, transferred on
onboarding, then direct charges forever after" model locked 2026-10-04.

## Goals / success

- Every `held` dollar reaches the correct vendor **exactly once** — no
  double-transfer, no stranded funds.
- Per-order reconciliation: each transfer maps 1:1 to a `vendor_ledger` row
  and carries its Stripe transfer id.
- Resilient to webhook drops and Stripe/transient failures (self-healing).
- A vendor-facing "earnings" surface that turns the held balance into a
  concrete reason to finish onboarding.

## Out of scope (deferred)

- **Refund / chargeback clawback and rolling reserve.** SP2a has no refund
  flow, there are zero live vendors/orders, and reserves are a large
  separate concern. SP2b transfers the full `net_vendor_cents` on
  onboarding. The ledger retains per-order transfer ids + timestamps so a
  future reserve/clawback slice can reconcile. (Matches the international
  rolling-reserve research, which is Phase 2.)
- **International lane** (reseller / Wise payouts) — Phase 2.
- **Multi-currency** — USD only.
- **SP2c** concerns: shipped/handover status, buyer order timeline,
  fulfillment-SLA auto-refund.

## Decisions (locked in brainstorm)

1. **Trigger = both webhook + cron** (belt-and-suspenders for money movement).
2. **Granularity = one Stripe Transfer per `vendor_ledger` row**, with
   `source_transaction` = the original charge.
3. **Readiness gate = `payouts_enabled`** (the strongest "safe to pay them"
   signal; implies onboarding complete and a payout destination exists).
4. **Reserve/clawback deferred** (full net transferred now).
5. **Vendor-facing "earnings" card** on `/dashboard/profile/payments`.

---

## Architecture

### The core: `transferHeldEarnings(db, vendorProfileId)`

A single idempotent function is the only money-movement path; both triggers
call it. Lives in a new `src/services/escrow-transfer.service.ts`.

1. **Guard.** Load the vendor's `vendor_stripe_accounts`. No-op (return a
   zero summary) if: no row, `payouts_enabled !== true`, or no
   `stripe_account_id`. Load the vendor's `vendor_ledger` rows where
   `status='held'`; no-op if none. So the function is always safe to call,
   repeatedly, for any vendor.
2. **Per held row**, create one Stripe `Transfer`:
   - `amount` = `net_vendor_cents`
   - `currency` = `'usd'`
   - `destination` = `stripe_account_id`
   - `source_transaction` = the order's charge id (`ch_…`) — ties the
     transfer to that charge's settled funds, so it never trips
     "insufficient available balance" when the platform balance is pending.
   - `metadata` = `{ kind: 'shop_escrow_transfer', order_id, ledger_id, vendor_profile_id }`
   - **`idempotencyKey` = `escrow-transfer:${ledger_id}`** — stable per row;
     any retry returns the same Transfer, never a duplicate.
3. **On success**, compare-and-swap the row:
   `UPDATE vendor_ledger SET status='transferred', transferred_at=now(),
stripe_transfer_id=$id WHERE id=$ledgerId AND status='held'`.
4. **On failure**, leave the row `held`, log it, and let the cron retry.

**Idempotency corner (transfer succeeds, DB write then fails):** the row
stays `held` → next run re-attempts with the same idempotency key → Stripe
returns the identical Transfer (no second payout) → the row is stamped.

**Concurrency (webhook and cron for the same vendor at once):** the Stripe
idempotency key dedups the Transfer; the CAS `WHERE status='held'` means only
one run stamps each row (the other updates 0 rows, benign).

### Resolving the charge id (`source_transaction`)

`source_transaction` needs the charge id (`ch_…`), not the payment-intent id
the order stores. We capture it when we already know it, at capture time, so
the transfer path never has to fetch it.

- **Migration `00089`:** `ALTER TABLE vendor_ledger ADD COLUMN
source_charge_id text NULL;`
- **Write it in `ensureEscrowLedger`** (SP2a's helper that inserts the `held`
  row on confirm/capture): it already has the captured PaymentIntent, whose
  `latest_charge` is the charge id. Stamp `source_charge_id` at insert.
- **Fallback:** if a row lacks `source_charge_id`, `transferHeldEarnings`
  resolves it on demand from `orders.stripe_payment_intent_id` →
  `paymentIntents.retrieve(...).latest_charge`. (Won't occur in prod — zero
  existing held rows — but keeps the function robust.)

No other schema change: `status`, `transferred_at`, `stripe_transfer_id`
already exist on `vendor_ledger` from SP2a (migration 00087).

### Triggers

**1. Webhook (immediacy)** — extend the `account.updated` case in
`src/app/api/webhooks/stripe/route.ts`. After `refreshAccountStatus(...)`,
if the account is now `payouts_enabled`, map `event.account` →
`vendor_profile_id` via `vendor_stripe_accounts`, then call
`transferHeldEarnings`. Idempotent, so firing on every `account.updated` is
safe.

**2. Cron (safety net)** — new `src/app/api/cron/shop-escrow-transfer/route.ts`,
`CRON_SECRET`-guarded like the others. Selects every vendor that is
`payouts_enabled` AND has ≥1 `held` ledger row, and runs
`transferHeldEarnings` for each. Registered in `vercel.json` on a **daily**
schedule (Vercel Hobby constraint — see issue #181; the webhook covers
immediacy, the cron just catches drops/failures).

**3. Page-load status refresh (UI immediacy, not a money trigger)** — when the
vendor lands back on `/dashboard/profile/payments` after Stripe onboarding,
the page proactively calls `refreshAccountStatus` (SP1 already has it) so
`payouts_enabled` is accurate immediately, rather than waiting for the
webhook. This flips the card straight to the "on the way" state — the vendor
never sees a stale "set up payouts" after they just did. The actual transfer
still completes via the webhook/cron; the page load does **not** move money.

---

## Vendor-facing earnings card (`/dashboard/profile/payments`)

Product register (vendor dashboard), DESIGN.md tokens, dollar figures in DM
Mono. The card reads `vendor_ledger` sums (by `status`) for the vendor and
renders by state:

- **State 1 — held, not yet payouts-enabled** (the onboarding nudge):
  eyebrow "Earnings · held", figure = sum of `held` `net_vendor_cents`,
  copy "From N orders, waiting to be paid out. Set up payouts with Stripe to
  receive it, and get paid directly on every order from here on.", + the
  existing Connect onboarding CTA (ink button; **hover → hot-pink**).
- **State 2 — payouts-enabled, transfer in flight** (brief window): figure =
  still-held sum, copy "Headed to your bank account now. This usually lands
  within a couple of business days.", + an animated indigo **pulse** +
  "Transferring to your account". (`prefers-reduced-motion` fallback: static
  dimmed ring.)
- **State 3 — settled, nothing held**: eyebrow "Paid out", figure = sum of
  `transferred` `net_vendor_cents`, copy "All your shop earnings have been
  paid out to your account.", + a green "Most recent payout · <date>" line.
- **State 4 — no shop sales**: card does not render; page shows its normal
  payout-setup content.

Copy is plain and vendor-facing (not the couple brand voice), no em dashes,
one figure per card. Single hairline-bordered block that swaps content by
state — no side-stripes, no nested cards.

### Data for the card

A read-only selector (service + a small API or server-component query):

- `heldCents` = Σ `net_vendor_cents` where `status='held'`, + count of held orders.
- `transferredCents` = Σ `net_vendor_cents` where `status='transferred'`, +
  most-recent `transferred_at`.
- plus `payouts_enabled` from `vendor_stripe_accounts`.

State selection: held>0 && !payouts_enabled → 1; held>0 && payouts_enabled →
2; held==0 && transferred>0 → 3; held==0 && transferred==0 → 4.

---

## Notifications

One new `notifications.type`: **`shop_funds_transferred`** (migration 00089,
alongside the column) — notify the vendor "Your held earnings of $X have been
paid out to your account" when `transferHeldEarnings` completes a non-empty
transfer for them. (High-priority? No — informational.) Ops alert reused only
if a transfer repeatedly fails (optional, low priority — can be deferred to
the cron's logging).

---

## Edge cases

- **Not payouts-enabled / no held rows** → no-op (guarded).
- **Transfer API error** (account restricted, Stripe hiccup) → row stays
  `held`, logged; cron retries. Vendor keeps seeing "on the way" (honest:
  still queued).
- **DB write fails after a successful transfer** → idempotency key recovers
  on the next run.
- **Concurrent webhook + cron** → Stripe idempotency key + CAS prevent
  double transfer.
- **Vendor onboards, then becomes restricted before the cron runs** →
  `payouts_enabled` flips false → guard no-ops until they're enabled again.
  Funds remain safely held.
- **Currency** → USD only; assert/skip any non-USD ledger row (none today).

---

## Testing strategy

Unit (Vitest), mocking Stripe + Supabase, on the pure/service layer:

- `transferHeldEarnings`: happy path (held→transferred, correct amount,
  `source_transaction`, idempotency key, metadata); no-op when not
  payouts-enabled; no-op when no held rows; failure leaves row `held`;
  idempotent re-run does not double-transfer (mock returns same Transfer);
  DB-write-fails-after-transfer recovers on re-run.
- `source_charge_id`: written by `ensureEscrowLedger`; fallback resolves from
  the PaymentIntent when null.
- Webhook: `account.updated` with `payouts_enabled` triggers the transfer;
  already-transferred vendor is a no-op; not-payouts-enabled does nothing.
- Cron: sweeps multiple vendors, skips non-payouts-enabled and
  nothing-held vendors; `CRON_SECRET` enforced.
- Card selector + RTL: each of the 4 states renders the right figure/copy.

E2E (Playwright, run deferred like SP2a — hits Stripe test-mode Transfers):
seed a `held` ledger row + a payouts-enabled connected test account → invoke
the transfer path → assert the row is `transferred` with a `stripe_transfer_id`.

---

## Review focus (highest-risk, pin tests in the plan)

1. **Double-transfer under retry/concurrency** — the single worst failure
   (paying a vendor twice). Idempotency key + CAS must be exercised directly.
2. **Stranded funds** — a dropped webhook must be caught by the cron;
   a failed transfer must stay `held` and retry, not silently vanish.
3. **`source_transaction` / funds availability** — transfer must reference
   the charge, not the PI; fallback resolution when `source_charge_id` null.
4. **Readiness gate** — never transfer to a non-payouts-enabled or missing
   account.
5. **Card state correctness** — the state machine must not show "set up
   payouts" to an already-onboarded vendor (the page-load refresh), nor
   "paid out" while rows are still held.

---

## Migrations

- **00089**: `ALTER TABLE vendor_ledger ADD COLUMN source_charge_id text NULL;`
  - add `shop_funds_transferred` to `notifications_type_check`.
    Additive, safe to run live. Apply dev (Claude) then prod (user), per policy.

## Feature gating

All vendor-facing surfacing stays behind `NEXT_PUBLIC_SHOP_ENABLED`, like
SP2a. The webhook/cron transfer logic is inert in practice until there are
escrow (`held`) ledger rows, which only exist once the shop is live.
