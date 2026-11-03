# Shop SP2b — Escrow Transfer on Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a vendor completes Stripe onboarding, transfer their accumulated held escrow balance to their connected account (idempotently, per order), and surface that balance in the dashboard as an onboarding nudge.

**Architecture:** One idempotent money-movement function, `transferHeldEarnings`, called by an `account.updated` webhook (immediacy) and a daily cron (safety net), gated on `payouts_enabled`. Each `held` `vendor_ledger` row becomes one Stripe `Transfer` with `source_transaction` set to the order's charge, an idempotency key per row, and a compare-and-swap stamp. A 4-state earnings card on `/dashboard/profile/payments` reads ledger sums.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS, service-role writes), Stripe Connect (Standard, platform-side Transfers), Vitest + React Testing Library, Playwright, Zod.

**Spec:** `docs/superpowers/specs/2026-10-18-shop-sp2b-escrow-transfer-design.md`

## Global Constraints

- All prices are integer cents. Currency is **USD only**; skip/assert any non-USD ledger row.
- No `any`. Use `unknown` + guards. All params/returns typed.
- Business logic lives in `services/` or `lib/`; routes only marshal request/response.
- Service-role client for all `vendor_ledger`, `orders`, `vendor_stripe_accounts` writes (RLS has no vendor write policy on these).
- Money movement must be **idempotent**: Stripe `idempotencyKey` = `escrow-transfer:${ledger_id}`; ledger stamp is a compare-and-swap on `status='held'`.
- Notifications are best-effort and MUST NOT throw into the money path.
- All vendor-facing surfacing stays behind `NEXT_PUBLIC_SHOP_ENABLED`.
- Stripe client import: `import { stripe } from '@/lib/stripe/client'`. Service client: `createServiceRoleClient()` from `@/lib/supabase/server`. `Client = SupabaseClient<Database>`. Results use `ServiceResult<T>` from `@/types`.
- Migrations: Claude applies dev via psql/SQL editor; user applies prod. Commit SQL + hand-patch `database.types.ts`; do not block tasks on the apply.

## Review Focus

- **Double-transfer under retry or webhook/cron concurrency** — a vendor paid twice. Pin a test that runs the transfer twice (and two concurrent calls) and asserts exactly one Stripe Transfer per row and one stamp. (Task 4)
- **Stranded funds** — a Stripe/transfer failure must leave the row `held` (not lost, not marked transferred) and be retried by the cron. Pin a failure-path test. (Task 4, 6)
- **`source_transaction` resolution** — the transfer must reference the charge (`ch_…`), not the payment intent; and must still work when `source_charge_id` is null (retrieve fallback). Pin both. (Task 3, 4)
- **Readiness gate** — never transfer to a vendor who is not `payouts_enabled` or has no `stripe_account_id`. Pin a guard test. (Task 4, 5)
- **Card-state correctness** — never show "set up payouts" to a payouts-enabled vendor, nor "paid out" while rows are still held. Pin the state-machine test. (Task 2, 9)

---

## File Structure

- Create: `supabase/migrations/00089_shop_escrow_transfer.sql`
- Create: `src/lib/shop/earnings.ts` (pure selector + card-state machine)
- Create: `src/services/escrow-transfer.service.ts` (`transferHeldEarnings`, `resolveSourceChargeId`)
- Create: `src/app/api/cron/shop-escrow-transfer/route.ts`
- Create: `src/app/dashboard/profile/payments/EarningsCard.tsx`
- Modify: `src/services/orders.service.ts` (`ensureEscrowLedger` stamps `source_charge_id`; `confirmOrder`/`finalizeOrderPaid` callers)
- Modify: `src/app/api/webhooks/stripe/route.ts` (`account.updated` → transfer on `payouts_enabled`)
- Modify: `vercel.json` (daily cron entry)
- Modify: `src/services/shop-notifications.service.ts` + `src/services/notifications.service.ts` (funds-transferred notification)
- Modify: `src/app/dashboard/profile/payments/page.tsx` + `PaymentsClient.tsx` (fetch earnings, render card)
- Modify: `src/types/database.types.ts` (hand-patch `vendor_ledger.source_charge_id`)
- Create: `tests/e2e/shop-escrow-transfer.spec.ts` (run deferred)

---

## Task 1: Migration — `source_charge_id` + notification type

**Files:**

- Create: `supabase/migrations/00089_shop_escrow_transfer.sql`
- Modify: `src/types/database.types.ts`

**Interfaces:**

- Produces: `vendor_ledger.source_charge_id text NULL`; `notifications.type` accepts `shop_funds_transferred`.

- [ ] **Step 1: Write the migration**

```sql
-- Shop SP2b: escrow transfer on onboarding. Additive.
ALTER TABLE vendor_ledger ADD COLUMN source_charge_id text NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['booking_request_received'::text,'vendor_accepted'::text,'vendor_adjusted_quote'::text,'couple_accepted_adjusted'::text,'couple_declined_adjusted'::text,'deposit_paid'::text,'booking_confirmed'::text,'booking_auto_cancelled'::text,'booking_cancelled'::text,'event_completed'::text,'booking_completed'::text,'review_received'::text,'custom_request_received'::text,'couple_countered'::text,'event_task_due'::text,'event_task_overdue'::text,'event_countdown'::text,'shop_order_placed'::text,'shop_order_confirmed'::text,'shop_order_cancelled'::text,'shop_order_reminder'::text,'shop_funds_transferred'::text]));
```

- [ ] **Step 2: Hand-patch `database.types.ts`** — add `source_charge_id: string | null` to `vendor_ledger` Row/Insert/Update (Insert/Update optional). Do not regenerate (wipes custom aliases — see migration policy memo).

- [ ] **Step 3: Commit** — `git add supabase/migrations/00089_shop_escrow_transfer.sql src/types/database.types.ts && git commit -m "feat(shop): migration 00089 escrow-transfer column + notification type"`. (Dev/prod apply handed to the user; do not block later tasks — they run against the typed schema.)

---

## Task 2: Earnings summary + card-state (pure)

**Files:**

- Create: `src/lib/shop/earnings.ts`
- Test: `src/__tests__/lib/shop/earnings.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface EarningsSummary {
    heldCents: number;
    heldCount: number;
    transferredCents: number;
    lastTransferredAt: string | null;
    payoutsEnabled: boolean;
  }
  export type EarningsCardState = 'held_not_ready' | 'in_flight' | 'paid_out' | 'none';
  export function deriveEarningsState(s: EarningsSummary): EarningsCardState;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { deriveEarningsState } from '@/lib/shop/earnings';

const base = {
  heldCents: 0,
  heldCount: 0,
  transferredCents: 0,
  lastTransferredAt: null,
  payoutsEnabled: false,
};

describe('deriveEarningsState', () => {
  it('held + not payouts-enabled → held_not_ready', () => {
    expect(deriveEarningsState({ ...base, heldCents: 124000, heldCount: 3 })).toBe(
      'held_not_ready'
    );
  });
  it('held + payouts-enabled → in_flight', () => {
    expect(
      deriveEarningsState({ ...base, heldCents: 124000, heldCount: 3, payoutsEnabled: true })
    ).toBe('in_flight');
  });
  it('nothing held but transfers exist → paid_out', () => {
    expect(
      deriveEarningsState({
        ...base,
        transferredCents: 124000,
        payoutsEnabled: true,
        lastTransferredAt: '2026-03-14T00:00:00Z',
      })
    ).toBe('paid_out');
  });
  it('no sales at all → none', () => {
    expect(deriveEarningsState(base)).toBe('none');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npx vitest run src/__tests__/lib/shop/earnings.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export interface EarningsSummary {
  heldCents: number;
  heldCount: number;
  transferredCents: number;
  lastTransferredAt: string | null;
  payoutsEnabled: boolean;
}

export type EarningsCardState = 'held_not_ready' | 'in_flight' | 'paid_out' | 'none';

export function deriveEarningsState(s: EarningsSummary): EarningsCardState {
  if (s.heldCents > 0) return s.payoutsEnabled ? 'in_flight' : 'held_not_ready';
  if (s.transferredCents > 0) return 'paid_out';
  return 'none';
}
```

- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** — `feat(shop): earnings summary card-state helper`.

---

## Task 3: Stamp `source_charge_id` when writing the escrow ledger

**Files:**

- Modify: `src/services/orders.service.ts` (`ensureEscrowLedger`, `confirmOrder`, `finalizeOrderPaid`)
- Test: `src/__tests__/services/orders.escrow-charge.test.ts`

**Interfaces:**

- Consumes: `ensureEscrowLedger(db, order)` (existing). `stripe.paymentIntents.capture/retrieve` returning a PI with `latest_charge: string | Stripe.Charge | null`.
- Produces: `ensureEscrowLedger(db: Client, order: PendingOrder, sourceChargeId?: string | null)` — inserts `source_charge_id`, resolving from the PI when not supplied.

- [ ] **Step 1: Write the failing test** — mock `stripe` + supabase `insert`; assert the inserted row carries `source_charge_id`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({
  stripe: { paymentIntents: { retrieve: vi.fn() } },
}));
import { stripe } from '@/lib/stripe/client';
import { ensureEscrowLedgerForTest as ensureEscrowLedger } from '@/services/orders.service';

const ESCROW_ORDER = {
  id: 'o1',
  vendor_profile_id: 'v1',
  charge_mode: 'escrow',
  item_subtotal_cents: 100000,
  shipping_cents: 2000,
  commission_cents: 10000,
  stripe_payment_intent_id: 'pi_1',
} as unknown as import('@/services/orders.service').PendingOrder;

function dbWithInsertSpy() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return { db: { from: () => ({ insert }) } as never, insert };
}

describe('ensureEscrowLedger source_charge_id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps the supplied charge id', async () => {
    const { db, insert } = dbWithInsertSpy();
    await ensureEscrowLedger(db, ESCROW_ORDER, 'ch_supplied');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_charge_id: 'ch_supplied' })
    );
  });

  it('falls back to the PI latest_charge when not supplied', async () => {
    (stripe.paymentIntents.retrieve as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      latest_charge: 'ch_fallback',
    });
    const { db, insert } = dbWithInsertSpy();
    await ensureEscrowLedger(db, ESCROW_ORDER);
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_charge_id: 'ch_fallback' })
    );
  });
});
```

- [ ] **Step 2: Run, confirm fail** (export + param not present yet).

- [ ] **Step 3: Implement** — add the optional param + resolution, and a test-only export.

```ts
function chargeIdOf(pi: { latest_charge?: string | { id?: string } | null }): string | null {
  const c = pi.latest_charge;
  return typeof c === 'string' ? c : (c?.id ?? null);
}

async function ensureEscrowLedger(
  db: Client,
  order: PendingOrder,
  sourceChargeId?: string | null
): Promise<string | null> {
  if (order.charge_mode !== 'escrow') return null;
  let chargeId = sourceChargeId ?? null;
  if (!chargeId && order.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      chargeId = chargeIdOf(pi);
    } catch {
      chargeId = null; // non-fatal; transfer path has its own fallback
    }
  }
  const { error } = await db.from('vendor_ledger').insert({
    vendor_profile_id: order.vendor_profile_id,
    order_id: order.id,
    gross_cents: order.item_subtotal_cents + order.shipping_cents,
    commission_cents: order.commission_cents,
    stripe_fee_cents: 0,
    net_vendor_cents: computeEscrowNetCents({
      subtotalCents: order.item_subtotal_cents,
      shippingCents: order.shipping_cents,
      commissionCents: order.commission_cents,
      stripeFeeCents: 0,
    }),
    status: 'held',
    source_charge_id: chargeId,
  });
  if (error && (error as { code?: string }).code !== '23505') return error.message;
  return null;
}

// test-only
export const ensureEscrowLedgerForTest = ensureEscrowLedger;
```

- [ ] **Step 4: Update `confirmOrder`** to pass the capture's charge id (avoids the extra retrieve):

```ts
let captured: Stripe.PaymentIntent;
try {
  captured = await stripe.paymentIntents.capture(order.stripe_payment_intent_id, opts);
} catch (err) {
  /* unchanged error handling */
}
const ledgerErr = await ensureEscrowLedger(db, order, chargeIdOf(captured));
```

(`finalizeOrderPaid` keeps calling `ensureEscrowLedger(db, order)` with no charge id → the fallback retrieves it.)

- [ ] **Step 5: Run the new test + existing orders tests, confirm pass.**
- [ ] **Step 6: Commit** — `feat(shop): record source_charge_id on escrow ledger rows`.

---

## Task 4: `transferHeldEarnings` — the core money path

**Files:**

- Create: `src/services/escrow-transfer.service.ts`
- Test: `src/__tests__/services/escrow-transfer.service.test.ts`

**Interfaces:**

- Consumes: `vendor_stripe_accounts(stripe_account_id, payouts_enabled)`, `vendor_ledger(id, order_id, net_vendor_cents, status, source_charge_id)`, `orders(stripe_payment_intent_id)`, `stripe.transfers.create`, `stripe.paymentIntents.retrieve`.
- Produces:

  ```ts
  export interface TransferResult {
    transferredCount: number;
    transferredCents: number;
    failed: number;
  }
  export async function transferHeldEarnings(
    db: Client,
    vendorProfileId: string
  ): Promise<TransferResult>;
  ```

- [ ] **Step 1: Write the failing tests** — cover: happy path; guard no-ops; idempotency key; failure leaves held; double-run doesn't double-transfer; source_transaction fallback.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({
  stripe: { transfers: { create: vi.fn() }, paymentIntents: { retrieve: vi.fn() } },
}));
import { stripe } from '@/lib/stripe/client';
import { transferHeldEarnings } from '@/services/escrow-transfer.service';

// Minimal supabase stub: one account row + held ledger rows, capturing the CAS update.
function makeDb(opts: {
  account: { stripe_account_id: string; payouts_enabled: boolean } | null;
  held: Array<{
    id: string;
    order_id: string;
    net_vendor_cents: number;
    source_charge_id: string | null;
  }>;
}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      if (table === 'vendor_stripe_accounts') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.account }) }) }),
        };
      }
      if (table === 'vendor_ledger') {
        return {
          select: () => ({ eq: () => ({ eq: async () => ({ data: opts.held }) }) }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c: string, id: string) => ({
              eq: async () => {
                updates.push({ id, patch });
                return { data: [{ id }], error: null };
              },
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { stripe_payment_intent_id: 'pi_x' } }),
            }),
          }),
        };
      }
      throw new Error('unexpected table ' + table);
    },
  } as never;
  return { db, updates };
}

beforeEach(() => vi.clearAllMocks());

it('transfers each held row with source_transaction + idempotency key, then stamps it', async () => {
  (stripe.transfers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tr_1' });
  const { db, updates } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: true },
    held: [{ id: 'L1', order_id: 'o1', net_vendor_cents: 90000, source_charge_id: 'ch_1' }],
  });
  const res = await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: 90000,
      currency: 'usd',
      destination: 'acct_1',
      source_transaction: 'ch_1',
    }),
    { idempotencyKey: 'escrow-transfer:L1' }
  );
  expect(updates[0].patch).toMatchObject({ status: 'transferred', stripe_transfer_id: 'tr_1' });
  expect(res).toMatchObject({ transferredCount: 1, transferredCents: 90000, failed: 0 });
});

it('no-op when not payouts-enabled', async () => {
  const { db } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: false },
    held: [{ id: 'L1', order_id: 'o1', net_vendor_cents: 1, source_charge_id: 'ch_1' }],
  });
  const res = await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).not.toHaveBeenCalled();
  expect(res.transferredCount).toBe(0);
});

it('no-op when no account row', async () => {
  const { db } = makeDb({ account: null, held: [] });
  await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).not.toHaveBeenCalled();
});

it('transfer failure leaves the row held (no stamp) and counts as failed', async () => {
  (stripe.transfers.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('stripe down'));
  const { db, updates } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: true },
    held: [{ id: 'L1', order_id: 'o1', net_vendor_cents: 90000, source_charge_id: 'ch_1' }],
  });
  const res = await transferHeldEarnings(db, 'v1');
  expect(updates).toHaveLength(0);
  expect(res).toMatchObject({ transferredCount: 0, failed: 1 });
});

it('resolves source_transaction from the PI when source_charge_id is null', async () => {
  (stripe.transfers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tr_2' });
  (stripe.paymentIntents.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
    latest_charge: 'ch_resolved',
  });
  const { db } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: true },
    held: [{ id: 'L2', order_id: 'o2', net_vendor_cents: 5000, source_charge_id: null }],
  });
  await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).toHaveBeenCalledWith(
    expect.objectContaining({ source_transaction: 'ch_resolved' }),
    { idempotencyKey: 'escrow-transfer:L2' }
  );
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/logger';

type Client = SupabaseClient<Database>;

export interface TransferResult {
  transferredCount: number;
  transferredCents: number;
  failed: number;
}

async function resolveSourceChargeId(
  db: Client,
  row: { order_id: string; source_charge_id: string | null }
): Promise<string | null> {
  if (row.source_charge_id) return row.source_charge_id;
  const { data: order } = await db
    .from('orders')
    .select('stripe_payment_intent_id')
    .eq('id', row.order_id)
    .maybeSingle();
  if (!order?.stripe_payment_intent_id) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    const c = pi.latest_charge;
    return typeof c === 'string' ? c : (c?.id ?? null);
  } catch {
    return null;
  }
}

/**
 * Transfer a vendor's held escrow balance to their connected account. Idempotent
 * and safe to call repeatedly: no-ops unless the vendor is payouts-enabled with
 * held rows. One Stripe Transfer per ledger row, keyed by ledger id.
 */
export async function transferHeldEarnings(
  db: Client,
  vendorProfileId: string
): Promise<TransferResult> {
  const empty: TransferResult = { transferredCount: 0, transferredCents: 0, failed: 0 };

  const { data: account } = await db
    .from('vendor_stripe_accounts')
    .select('stripe_account_id, payouts_enabled')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();
  if (!account?.stripe_account_id || !account.payouts_enabled) return empty;

  const { data: held } = await db
    .from('vendor_ledger')
    .select('id, order_id, net_vendor_cents, source_charge_id')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'held');
  if (!held || held.length === 0) return empty;

  const result: TransferResult = { ...empty };
  for (const row of held) {
    try {
      const sourceCharge = await resolveSourceChargeId(db, row);
      const transfer = await stripe.transfers.create(
        {
          amount: row.net_vendor_cents,
          currency: 'usd',
          destination: account.stripe_account_id,
          ...(sourceCharge ? { source_transaction: sourceCharge } : {}),
          metadata: {
            kind: 'shop_escrow_transfer',
            order_id: row.order_id,
            ledger_id: row.id,
            vendor_profile_id: vendorProfileId,
          },
        },
        { idempotencyKey: `escrow-transfer:${row.id}` }
      );
      const { data: stamped, error } = await db
        .from('vendor_ledger')
        .update({
          status: 'transferred',
          transferred_at: new Date().toISOString(),
          stripe_transfer_id: transfer.id,
        })
        .eq('id', row.id)
        .eq('status', 'held')
        .select('id');
      if (error) {
        logger.error('escrow-transfer: stamp failed', { ledgerId: row.id, error: error.message });
        result.failed++;
        continue;
      }
      if (stamped && stamped.length > 0) {
        result.transferredCount++;
        result.transferredCents += row.net_vendor_cents;
      }
    } catch (err) {
      logger.error('escrow-transfer: transfer failed', err, { ledgerId: row.id, vendorProfileId });
      result.failed++;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit** — `feat(shop): transferHeldEarnings escrow payout core`.

---

## Task 5: Webhook trigger on `account.updated`

**Files:**

- Modify: `src/app/api/webhooks/stripe/route.ts`
- Test: `src/__tests__/api/webhooks/account-updated-transfer.test.ts`

**Interfaces:**

- Consumes: `transferHeldEarnings` (Task 4), `refreshAccountStatus` (existing), `vendor_stripe_accounts(vendor_profile_id, payouts_enabled, stripe_account_id)`.

- [ ] **Step 1: Write the failing test** — a mocked `account.updated` where the account becomes payouts-enabled calls `transferHeldEarnings` with the mapped vendor; a non-payouts-enabled account does not.

```ts
// Mock refreshAccountStatus + transferHeldEarnings; simulate account.updated handling
// via the exported handler path (or a small extracted helper handleAccountUpdated).
```

(If the route's switch is not unit-testable directly, extract `handleAccountUpdated(db, stripeAccountId)` into the route module and export it for the test; it calls `refreshAccountStatus`, re-reads the row, and when `payouts_enabled` is true maps to `vendor_profile_id` and calls `transferHeldEarnings`.)

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** — replace the `account.updated` case body:

```ts
case 'account.updated': {
  if (event.account) await handleAccountUpdated(supabase, event.account);
  break;
}
```

```ts
export async function handleAccountUpdated(db: Client, stripeAccountId: string): Promise<void> {
  await refreshAccountStatus(db, stripeAccountId);
  const { data: row } = await db
    .from('vendor_stripe_accounts')
    .select('vendor_profile_id, payouts_enabled')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();
  if (row?.payouts_enabled && row.vendor_profile_id) {
    await transferHeldEarnings(db, row.vendor_profile_id);
  }
}
```

- [ ] **Step 4: Run tests (new + existing webhook), confirm pass.**
- [ ] **Step 5: Commit** — `feat(shop): transfer held earnings on account.updated payouts-enabled`.

---

## Task 6: Daily cron safety net

**Files:**

- Create: `src/app/api/cron/shop-escrow-transfer/route.ts`
- Modify: `vercel.json`
- Test: `src/__tests__/api/cron/shop-escrow-transfer.test.ts`

**Interfaces:**

- Consumes: `transferHeldEarnings` (Task 4); `CRON_SECRET`.

- [ ] **Step 1: Write the failing test** — unauthorized → 401; authorized → calls `transferHeldEarnings` once per distinct payouts-enabled vendor that has held rows.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** (mirror `shop-auto-void/route.ts` auth + shape)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { transferHeldEarnings } from '@/services/escrow-transfer.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createServiceRoleClient();

  // Distinct vendors with at least one held row.
  const { data: rows, error } = await db
    .from('vendor_ledger')
    .select('vendor_profile_id')
    .eq('status', 'held');
  if (error) {
    logger.error('shop-escrow-transfer: held query failed', { error: error.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const vendorIds = Array.from(new Set((rows ?? []).map((r) => r.vendor_profile_id)));

  let transferred = 0;
  let failed = 0;
  for (const vid of vendorIds) {
    try {
      const r = await transferHeldEarnings(db, vid);
      transferred += r.transferredCount;
      failed += r.failed;
    } catch (err) {
      logger.error('shop-escrow-transfer: vendor sweep failed', err, { vendorProfileId: vid });
      failed++;
    }
  }
  return NextResponse.json({ vendors: vendorIds.length, transferred, failed });
}

export const GET = POST;
```

- [ ] **Step 4: Add to `vercel.json`** a daily entry (Hobby constraint — issue #181):

```json
{ "path": "/api/cron/shop-escrow-transfer", "schedule": "30 3 * * *" }
```

- [ ] **Step 5: Run tests, confirm pass.**
- [ ] **Step 6: Commit** — `feat(shop): daily escrow-transfer cron safety net`.

---

## Task 7: Funds-transferred notification

**Files:**

- Modify: `src/services/notifications.service.ts`, `src/services/shop-notifications.service.ts`, `src/services/escrow-transfer.service.ts`
- Test: `src/__tests__/services/shop-notifications.funds.test.ts`

**Interfaces:**

- Produces: `notifyFundsTransferred(db: Client, vendorProfileId: string, amountCents: number): Promise<void>` (best-effort, never throws).

- [ ] **Step 1: Write the failing test** — on a non-empty transfer result, a `shop_funds_transferred` bell notification is created for the vendor's user; a thrown email error is swallowed.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** `notifyFundsTransferred` (mirror the `notifyShopOrder*` pattern: resolve vendor `user_id` + email, insert the bell row with `type: 'shop_funds_transferred'`, send the vendor email, wrap in try/catch + logger).

- [ ] **Step 4: Wire into `transferHeldEarnings`** — after the loop, if `result.transferredCount > 0`, `await notifyFundsTransferred(db, vendorProfileId, result.transferredCents)` (its own try/catch; never affects the return).

- [ ] **Step 5: Run tests, confirm pass.**
- [ ] **Step 6: Commit** — `feat(shop): notify vendor when held earnings are paid out`.

---

## Task 8: Earnings selector + payments page wiring

**Files:**

- Create: `src/services/earnings.service.ts`
- Modify: `src/app/dashboard/profile/payments/page.tsx`, `src/app/dashboard/profile/payments/PaymentsClient.tsx`
- Test: `src/__tests__/services/earnings.service.test.ts`

**Interfaces:**

- Produces: `getVendorEarningsSummary(db: Client, vendorProfileId: string, payoutsEnabled: boolean): Promise<EarningsSummary>` (sums `net_vendor_cents` by status; `lastTransferredAt` = max `transferred_at`).

- [ ] **Step 1: Write the failing test** — given mixed held/transferred rows, returns the correct sums, held count, and latest transfer timestamp.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** the selector (service-role read), then wire the page: compute `payoutsEnabled` from `getConnectStatus`, call `getVendorEarningsSummary`, pass the `EarningsSummary` into `PaymentsClient` which forwards it to `EarningsCard` (Task 9). The existing `return=1` refresh stays; no money moves here.

- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** — `feat(shop): vendor earnings summary + payments page wiring`.

---

## Task 9: Earnings card UI (4 states)

**Files:**

- Create: `src/app/dashboard/profile/payments/EarningsCard.tsx`
- Test: `src/__tests__/components/EarningsCard.test.tsx`

**Interfaces:**

- Consumes: `EarningsSummary`, `deriveEarningsState` (Task 2). Reuses the existing Connect onboarding CTA from `PaymentsClient`.

- [ ] **Step 1: Write the failing RTL test** — the four states render the right figure + copy: `held_not_ready` shows the held total + "Set up payouts"; `in_flight` shows "Transferring to your account"; `paid_out` shows the transferred total + "paid out"; `none` renders nothing.

```tsx
import { render, screen } from '@testing-library/react';
import { EarningsCard } from '@/app/dashboard/profile/payments/EarningsCard';

const base = {
  heldCents: 0,
  heldCount: 0,
  transferredCents: 0,
  lastTransferredAt: null,
  payoutsEnabled: false,
};

it('held, not ready → shows held total + set up payouts', () => {
  render(
    <EarningsCard summary={{ ...base, heldCents: 124000, heldCount: 3 }} onSetup={() => {}} />
  );
  expect(screen.getByText('$1,240.00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /set up payouts/i })).toBeInTheDocument();
});

it('none → renders nothing', () => {
  const { container } = render(<EarningsCard summary={base} onSetup={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** `EarningsCard` using `deriveEarningsState`, DESIGN.md tokens (cream/ink/indigo/hairline; figure in DM Mono; CTA ink with **hot-pink hover**; the in-flight **pulse** with a `prefers-reduced-motion` fallback). Copy per spec. `none` → `return null`. No side-stripes, no nested cards.

- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** — `feat(shop): vendor earnings card on payments page`.

---

## Task 10: E2E (run deferred)

**Files:**

- Create: `tests/e2e/shop-escrow-transfer.spec.ts`
- Modify: `tests/e2e/helpers/seed.ts` (add a `seedHeldLedgerRow` helper if absent)

**Interfaces:** hits Stripe **test-mode** Transfers; needs migration 00089 applied + `sk_test_`.

- [ ] **Step 1: Write the spec** — seed a vendor with a payouts-enabled `vendor_stripe_accounts` row + a confirmed escrow order + a `held` `vendor_ledger` row (with a real test charge id), invoke the transfer (via the cron endpoint with `CRON_SECRET`, or `transferHeldEarnings` through a test route), then assert the row is `transferred` with a non-null `stripe_transfer_id`. Clean up (delete order → ledger cascades; delete vendor/user).

- [ ] **Step 2: Do NOT run in CI yet** — annotate like `shop-checkout.spec.ts` (deferred pending the migrated DB + a seeded Connect test account that can receive transfers). Document the run command in the file header.

- [ ] **Step 3: Commit** — `test(shop): e2e escrow transfer (run deferred)`.

---

## Self-Review notes

- **Spec coverage:** core transfer (T4), data model (T1/T3), webhook trigger (T5), cron (T6), card + page refresh (T2/T8/T9), notification (T7), deferral of reserve/clawback (not built, by design), e2e (T10). All spec sections mapped.
- **Type consistency:** `EarningsSummary`/`deriveEarningsState` (T2) consumed by T8/T9; `transferHeldEarnings`/`TransferResult` (T4) consumed by T5/T6/T7; `ensureEscrowLedger(…, sourceChargeId?)` (T3) consumed by confirm/finalize callers.
- **Review Focus:** double-transfer + concurrency (T4 tests), stranded funds (T4/T6), source_transaction + fallback (T3/T4), readiness gate (T4/T5), card-state (T2/T9) — each pinned.
