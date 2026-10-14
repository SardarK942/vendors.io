# Shop Checkout SP2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bridal/groom-wear Shop transactional: a couple buys from one boutique at a time, payment is authorized at checkout, the vendor confirms within 48 hours, and on confirm we capture (direct charge or escrow), decrement stock, and freeze the made-to-measure snapshot.

**Architecture:** Per-vendor cart feeds a hosted Stripe Checkout session created with `capture_method: 'manual'` (authorize only). A `checkout_snapshots` row freezes prices + MTM data at checkout-create. On `checkout.session.completed` we build the order from that snapshot, guard-decrement stock, and alert the vendor + ops. The vendor confirms (capture) or declines (void); a 48h cron auto-voids. Charge mode is direct (on the connected account + 10% application fee) when the vendor is charge-enabled, else escrow (platform charge + ledger row). All business logic in `lib/`/`services/`; routes only marshal request/response; RLS isolates data.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), Stripe (Checkout + Connect, manual capture), Resend, Vitest, Playwright, Zod.

**Spec:** `docs/superpowers/specs/2026-10-13-shop-sp2a-checkout-core-purchase-design.md`

## Global Constraints

- `any` is forbidden; use `unknown` + type guards. All function params and returns typed. (AGENTS.md)
- All API inputs and form data validated with Zod. (AGENTS.md)
- All prices stored and computed in integer cents, never floating point. (AGENTS.md)
- Routes/API handlers do request/response only; all business logic in `lib/` or `services/`; no direct DB calls from route handlers. (AGENTS.md)
- RLS enforces isolation. Server-owned writes use the service-role client. Any management policy is `TO service_role`, never `USING (true)` on PUBLIC. (SP1 lesson)
- Migrations: additive only, no down-migration. Claude applies dev via psql; the user applies prod. `database.types.ts` is hand-patched for new tables/columns.
- Commission is exactly 10% of item subtotal, excluding shipping and tax.
- Hosted Stripe Checkout with `capture_method: 'manual'`. Confirm window is 48 hours.
- Conventional commits; feature branch `feat/shop-sp2a-checkout`; pre-commit hooks (ESLint + Prettier + typecheck) must pass before each commit.
- UI uses DESIGN.md tokens: ink/cream/indigo, hot-pink for save-state + hover only, prices in DM Mono, 10px card radii, one elevation tier. No em dashes in UI copy.
- Run `npm run lint` and `npm run typecheck` after each task; the definitive gate is the CI e2e job (prod build).

## Review Focus

- **Duplicate webhook delivery:** `checkout.session.completed` or `payment_intent.*` delivered twice for the same id must not create two orders or double-decrement/double-restore stock. Expected: idempotent via `stripe_events` dedup + unique `orders.stripe_payment_intent_id`/`stripe_checkout_session_id`. (Task 9, Task 11)
- **Stock race on the last unit:** two buyers both authorize when `stock_quantity = 1`; the second order creation must fail the guarded decrement and that authorization is voided, no charge. (Task 9)
- **Capture against an expired/invalid authorization:** a confirm whose PI can no longer be captured must not silently leave the order in `pending_confirmation`; it surfaces an error and alerts ops, order stays actionable. (Task 10)
- **MTM profile ownership/garment mismatch:** attaching a `measurement_profile_id` not owned by the buyer, or whose garment does not match the line's garment, is rejected before checkout. (Task 5)
- **Unauthorized/duplicate confirm or decline:** confirm/decline by a vendor who does not own the order is 403; confirming or declining an order already `confirmed` or `cancelled` is rejected, not re-processed. (Task 10, Task 12)

---

## Task 1: Migration 00087 + database types

**Files:**

- Create: `supabase/migrations/00087_shop_checkout.sql`
- Modify: `src/types/database.types.ts` (hand-patch new tables + `vendor_profiles` columns)

**Interfaces:**

- Produces: tables `carts`, `cart_items`, `orders`, `order_items`, `vendor_ledger`, `checkout_snapshots`; columns `vendor_profiles.shop_offers_pickup|shop_offers_shipping|shop_shipping_fee_cents|shop_pickup_note`.

- [ ] **Step 1: Write the migration SQL** exactly per spec section 5 (all six tables with the listed columns, checks, FKs, and unique constraints; the four `vendor_profiles` columns). Add RLS:
  - `carts`/`cart_items`: enable RLS; buyer policy `user_id = auth.uid()` (cart_items via `cart_id in (select id from carts where user_id = auth.uid())`), for ALL commands.
  - `orders`: enable RLS; SELECT policy `buyer_user_id = auth.uid() OR vendor_profile_id in (select id from vendor_profiles where user_id = auth.uid())`; management policy `TO service_role USING (true) WITH CHECK (true)`.
  - `order_items`: SELECT via `order_id in (select id from orders where buyer_user_id = auth.uid() OR vendor_profile_id in (select id from vendor_profiles where user_id = auth.uid()))`; management `TO service_role`.
  - `vendor_ledger`: SELECT `vendor_profile_id in (select id from vendor_profiles where user_id = auth.uid())`; management `TO service_role`.
  - `checkout_snapshots`: enable RLS, no public policy at all (service-role bypasses RLS; nothing else may read it).
  - Indexes: `cart_items(cart_id)`, `orders(vendor_profile_id, status)`, `orders(buyer_user_id)`, `order_items(order_id)`, `vendor_ledger(vendor_profile_id, status)`.

- [ ] **Step 2: Apply to dev**

Run: `psql "$DEV_DB_URL" -f supabase/migrations/00087_shop_checkout.sql` (use the dev connection from the migration-apply convention).
Expected: `CREATE TABLE`/`ALTER TABLE`/`CREATE POLICY` with no errors.

- [ ] **Step 3: Verify tables + RLS exist**

Run: `psql "$DEV_DB_URL" -c "\d+ orders" -c "select tablename,policyname,roles from pg_policies where tablename in ('orders','vendor_ledger','checkout_snapshots');"`
Expected: `orders` has the columns from the spec; the management policies list `{service_role}` in `roles`, not `{public}`.

- [ ] **Step 4: Hand-patch `database.types.ts`** — add `Row`/`Insert`/`Update` types for the six new tables and the four new `vendor_profiles` columns, mirroring the existing hand-patched entries (e.g. the SP1 `vendor_stripe_accounts` block). Export `OrderStatus = 'pending_confirmation' | 'confirmed' | 'cancelled'` and `ChargeMode = 'direct' | 'escrow'` and `FulfillmentType = 'pickup' | 'ship'`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00087_shop_checkout.sql src/types/database.types.ts
git commit -m "feat(shop): migration 00087 checkout tables + fulfillment config"
```

---

## Task 2: Zod schemas and shared input types

**Files:**

- Create: `src/lib/shop/schemas.ts`
- Test: `src/__tests__/lib/shop-schemas.test.ts`

**Interfaces:**

- Produces: `addCartItemSchema` → `{ product_id: string; variant_id: string; quantity: number }`; `updateCartItemSchema` → `{ quantity?: number; measurement_profile_id?: string | null }`; `checkoutSchema` → `{ vendor_profile_id: string; fulfillment_type: 'pickup' | 'ship' }`; `declineOrderSchema` → `{ reason?: string }`. Each exported with an inferred `...Input` type.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { addCartItemSchema, checkoutSchema } from '@/lib/shop/schemas';

describe('shop schemas', () => {
  it('accepts a valid add-item payload and defaults quantity to 1', () => {
    const r = addCartItemSchema.parse({ product_id: 'p1', variant_id: 'v1' });
    expect(r.quantity).toBe(1);
  });
  it('rejects quantity < 1', () => {
    expect(() =>
      addCartItemSchema.parse({ product_id: 'p1', variant_id: 'v1', quantity: 0 })
    ).toThrow();
  });
  it('rejects an unknown fulfillment_type', () => {
    expect(() =>
      checkoutSchema.parse({ vendor_profile_id: 'vp1', fulfillment_type: 'teleport' })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/shop-schemas.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the schemas** with `zod`: `quantity: z.number().int().min(1).default(1)`; `fulfillment_type: z.enum(['pickup','ship'])`; `measurement_profile_id: z.string().uuid().nullable().optional()`; export inferred types.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/shop-schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop/schemas.ts src/__tests__/lib/shop-schemas.test.ts
git commit -m "feat(shop): zod schemas for cart/checkout inputs"
```

---

## Task 3: Cart pricing + readiness pure helpers

**Files:**

- Create: `src/lib/shop/cart-pricing.ts`
- Test: `src/__tests__/lib/shop-cart-pricing.test.ts`

**Interfaces:**

- Consumes: a `CartLine` shape `{ variantId: string; unitPriceCents: number; quantity: number; stockQuantity: number; isMadeToMeasure: boolean; measurementResolved: boolean }`.
- Produces: `computeBoutiqueSummary(lines: CartLine[]): { subtotalCents: number; outOfStockVariantIds: string[]; unresolvedMtmVariantIds: string[] }`; `isReadyToCheckout(summary): boolean` (true when both arrays empty).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeBoutiqueSummary, isReadyToCheckout } from '@/lib/shop/cart-pricing';

const base = { stockQuantity: 5, isMadeToMeasure: false, measurementResolved: true };

describe('computeBoutiqueSummary', () => {
  it('sums unit price x quantity', () => {
    const s = computeBoutiqueSummary([
      { ...base, variantId: 'a', unitPriceCents: 2400_00, quantity: 1 },
      { ...base, variantId: 'b', unitPriceCents: 320_00, quantity: 2 },
    ]);
    expect(s.subtotalCents).toBe(2400_00 + 320_00 * 2);
  });
  it('flags an out-of-stock line and blocks checkout', () => {
    const s = computeBoutiqueSummary([
      { ...base, variantId: 'a', unitPriceCents: 100, quantity: 2, stockQuantity: 1 },
    ]);
    expect(s.outOfStockVariantIds).toEqual(['a']);
    expect(isReadyToCheckout(s)).toBe(false);
  });
  it('flags an unresolved MTM line and blocks checkout', () => {
    const s = computeBoutiqueSummary([
      {
        ...base,
        variantId: 'm',
        unitPriceCents: 100,
        quantity: 1,
        isMadeToMeasure: true,
        measurementResolved: false,
      },
    ]);
    expect(s.unresolvedMtmVariantIds).toEqual(['m']);
    expect(isReadyToCheckout(s)).toBe(false);
  });
  it('MTM lines ignore stock (made to order)', () => {
    const s = computeBoutiqueSummary([
      {
        ...base,
        variantId: 'm',
        unitPriceCents: 100,
        quantity: 9,
        stockQuantity: 0,
        isMadeToMeasure: true,
      },
    ]);
    expect(s.outOfStockVariantIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/shop-cart-pricing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** both functions. `outOfStock` only for non-MTM lines where `quantity > stockQuantity`; `unresolvedMtm` for MTM lines where `!measurementResolved`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/shop-cart-pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop/cart-pricing.ts src/__tests__/lib/shop-cart-pricing.test.ts
git commit -m "feat(shop): cart pricing + checkout-readiness helpers"
```

---

## Task 4: Money + charge-mode pure helpers

**Files:**

- Create: `src/lib/shop/money.ts`
- Test: `src/__tests__/lib/shop-money.test.ts`

**Interfaces:**

- Produces: `COMMISSION_RATE = 0.10`; `computeCommissionCents(subtotalCents: number): number` (rounded); `computeOrderAmounts({ subtotalCents, shippingCents, taxCents }): { commissionCents; totalCents }`; `computeEscrowNetCents({ subtotalCents, shippingCents, commissionCents, stripeFeeCents }): number` = `subtotal - commission + shipping - stripeFee` (tax excluded); `resolveChargeMode(chargesEnabled: boolean): ChargeMode`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  computeCommissionCents,
  computeOrderAmounts,
  computeEscrowNetCents,
  resolveChargeMode,
} from '@/lib/shop/money';

describe('shop money', () => {
  it('commission is 10% of subtotal, rounded', () => {
    expect(computeCommissionCents(2720_00)).toBe(272_00);
    expect(computeCommissionCents(99_99)).toBe(1000); // round(999.9)
  });
  it('total adds shipping + tax; commission excludes them', () => {
    const r = computeOrderAmounts({ subtotalCents: 2720_00, shippingCents: 0, taxCents: 238_00 });
    expect(r.commissionCents).toBe(272_00);
    expect(r.totalCents).toBe(2720_00 + 238_00);
  });
  it('escrow net = subtotal - commission + shipping - stripe fee, tax excluded', () => {
    expect(
      computeEscrowNetCents({
        subtotalCents: 2720_00,
        shippingCents: 0,
        commissionCents: 272_00,
        stripeFeeCents: 80_00,
      })
    ).toBe(2720_00 - 272_00 - 80_00);
  });
  it('charge mode follows charges_enabled', () => {
    expect(resolveChargeMode(true)).toBe('direct');
    expect(resolveChargeMode(false)).toBe('escrow');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/shop-money.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** with `Math.round`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/shop-money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop/money.ts src/__tests__/lib/shop-money.test.ts
git commit -m "feat(shop): commission + charge-mode money helpers"
```

---

## Task 5: cart.service

**Files:**

- Create: `src/services/cart.service.ts`
- Test: `src/__tests__/services/cart.service.test.ts`

**Interfaces:**

- Consumes: `computeBoutiqueSummary` (Task 3), `garmentToMeasurementGarment` + `offersMadeToMeasure` (`@/lib/products/customization`).
- Produces: `addItem(supabase, userId, input): ServiceResult<{ cartItemId: string }>`; `updateItem(supabase, userId, itemId, patch): ServiceResult<...>`; `removeItem(...)`; `getCartsForBuyer(supabase, userId): ServiceResult<BoutiqueCart[]>` where `BoutiqueCart = { vendorProfileId; vendorName; lines: CartLineView[]; subtotalCents; ready: boolean }`. `attachMeasurementProfile` is `updateItem` with `measurement_profile_id`.

- [ ] **Step 1: Write the failing test** (model on `connect.service.test.ts`: `fakeClient` per table). Cover: `addItem` gate rejects a product whose vendor is not local bridal (403); `updateItem` attaching a `measurement_profile_id` whose `garment` does not match the line's product garment returns 400; attaching a profile not owned by the buyer returns 403. Example for the mismatch case:

```ts
it('rejects attaching a measurement profile for the wrong garment', async () => {
  const c = fakeCartClient({
    cartItem: { id: 'ci1', product_id: 'p1', cart_owner: 'u1' },
    product: { garment_type: 'lehenga' },
    profile: { id: 'mp1', user_id: 'u1', garment: 'sherwani' },
  });
  const r = await updateItem(c, 'u1', 'ci1', { measurement_profile_id: 'mp1' });
  expect(r.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/services/cart.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement cart.service.** `addItem`: load product+vendor, gate `category==='bridal_wear' && vendor_origin==='local' && status==='active'`, upsert `cart` for (user, vendor), insert/increment `cart_items` (respect the `unique (cart_id, variant_id)`). `updateItem`: verify ownership via cart; when setting `measurement_profile_id`, load the profile (must be `user_id===userId`, else 403) and the product garment (must equal `garmentToMeasurementGarment(product.garment_type)`, else 400). `getCartsForBuyer`: read carts + items + joined product/variant (price, stock, garment, customization_types) + whether each MTM line has a profile attached; map to `CartLine` and run `computeBoutiqueSummary`; a line's `measurementResolved` is `!isMadeToMeasure || measurement_profile_id != null`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/services/cart.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/services/cart.service.ts src/__tests__/services/cart.service.test.ts
git commit -m "feat(shop): cart service (crud + grouped reads + mtm attach)"
```

---

## Task 6: Cart API routes

**Files:**

- Create: `src/app/api/cart/route.ts` (GET), `src/app/api/cart/items/route.ts` (POST), `src/app/api/cart/items/[id]/route.ts` (PATCH, DELETE)
- Test: `src/__tests__/api/cart.test.ts`

**Interfaces:**

- Consumes: cart.service (Task 5), schemas (Task 2), `withErrorBoundary`, `requireUser`, rate limiter.
- Produces: HTTP endpoints returning `ServiceResult` JSON.

- [ ] **Step 1: Write the failing test** — POST `/api/cart/items` with no auth returns 401; with a valid body calls `cart.service.addItem` and returns its status. Mock `requireUser` + `cart.service` per existing api-test patterns (`src/__tests__/api/connect-onboard.test.ts`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/api/cart.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the routes.** Each: `withErrorBoundary(requireUser(async (req, { user }) => { ... }))`, parse with the Zod schema, call the service with the RLS client, return `NextResponse.json(result.data ?? { error }, { status })`. Rate-limit POST/PATCH like other mutating routes.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/api/cart.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint && npm run typecheck
git add src/app/api/cart src/__tests__/api/cart.test.ts
git commit -m "feat(shop): cart api routes"
```

---

## Task 7: checkout.service

**Files:**

- Create: `src/services/checkout.service.ts`
- Test: `src/__tests__/services/checkout.service.test.ts`

**Interfaces:**

- Consumes: cart.service reads, `money.ts` (Task 4), `cart-pricing` (Task 3), `stripe` client, `vendor_stripe_accounts`, `checkout_snapshots`.
- Produces: `createCheckoutSession(supabase, serviceClient, userId, input): ServiceResult<{ url: string }>`.

- [ ] **Step 1: Write the failing test** (mock `@/lib/stripe/client` like `connect.service.test.ts`). Assert:
  - unready cart (out-of-stock or unresolved MTM) returns 409 and never calls `stripe.checkout.sessions.create`.
  - charge-enabled vendor → session created with `{ stripeAccount }` option and `payment_intent_data.application_fee_amount === commissionCents` and `capture_method === 'manual'`.
  - not-charge-enabled vendor → session created with no `stripeAccount` option and no `application_fee_amount`.
  - a `checkout_snapshots` insert is made with the frozen `lines`.

```ts
it('builds a direct-charge session on the connected account with a 10% app fee', async () => {
  sessionsCreate.mockResolvedValue({ url: 'https://stripe/x' });
  const c = fakeCheckoutClient({
    ready: true,
    chargesEnabled: true,
    accountId: 'acct_1',
    subtotalCents: 2720_00,
  });
  const r = await createCheckoutSession(c.rls, c.svc, 'u1', {
    vendor_profile_id: 'vp1',
    fulfillment_type: 'pickup',
  });
  expect(r.status).toBe(200);
  const [, opts] = sessionsCreate.mock.calls[0];
  expect(opts.stripeAccount).toBe('acct_1');
  const [params] = sessionsCreate.mock.calls[0];
  expect(params.payment_intent_data.capture_method).toBe('manual');
  expect(params.payment_intent_data.application_fee_amount).toBe(272_00);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/services/checkout.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Re-read the buyer's cart for the vendor; compute summary; if `!ready` return `{ error, status: 409 }`. Resolve charge mode from `vendor_stripe_accounts.charges_enabled`. Build line items from frozen cart prices (`price_data` with `unit_amount`, `product_data.name`, `product_data.metadata.variant_id`). Shipping: when `fulfillment_type==='ship'`, add `shipping_address_collection` + a `shipping_options` flat rate from `shop_shipping_fee_cents`. Set `automatic_tax.enabled: true`, `payment_intent_data: { capture_method:'manual', metadata: { kind:'shop', buyer:userId, vendor:vendorProfileId } }`, `metadata.kind='shop'`, success/cancel URLs, idempotency key `checkout:${userId}:${vendorProfileId}:${hash}`. For direct mode pass `{ stripeAccount: accountId }` and `payment_intent_data.application_fee_amount = commissionCents`. Insert a `checkout_snapshots` row (service-role) with `stripe_checkout_session_id`, `charge_mode`, `fulfillment_type`, `lines` (each with frozen unit price + `measurement_snapshot` copied from the attached profile), `subtotal/shipping/commission` cents. Return `{ url }`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/services/checkout.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/services/checkout.service.ts src/__tests__/services/checkout.service.test.ts
git commit -m "feat(shop): checkout service (authorize session, direct vs escrow, snapshot)"
```

---

## Task 8: Checkout API route

**Files:**

- Create: `src/app/api/checkout/route.ts`
- Test: `src/__tests__/api/checkout.test.ts`

**Interfaces:**

- Consumes: checkout.service (Task 7), `checkoutSchema` (Task 2), `requireUser`, rate limiter.

- [ ] **Step 1: Write the failing test** — unauth 401; valid body returns `{ url }` from the service; service 409 propagates as 409.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/api/checkout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the POST route; rate-limit like `booking:deposit`; pass both the RLS client and a service-role client to the service.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/api/checkout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck
git add src/app/api/checkout src/__tests__/api/checkout.test.ts
git commit -m "feat(shop): checkout api route"
```

---

## Task 9: orders.service — createOrderFromSession (+ stock guard)

**Files:**

- Create: `src/services/orders.service.ts`
- Test: `src/__tests__/services/orders-create.service.test.ts`

**Interfaces:**

- Consumes: `checkout_snapshots`, `orders`, `order_items`, `product_variants`, `carts`.
- Produces: `createOrderFromSession(serviceClient, { sessionId, paymentIntentId, chargeMode, account })): ServiceResult<{ orderId: string } | { skipped: 'duplicate' } | { voided: 'out_of_stock' }>`.

- [ ] **Step 1: Write the failing test.** Cover: happy path creates `orders` (status `pending_confirmation`, `confirm_deadline_at ≈ now+48h`) + `order_items` from the snapshot and decrements each non-MTM variant; a variant whose `stock_quantity < qty` makes the whole creation return `{ voided:'out_of_stock' }` and no order row; an existing order for the same `stripe_checkout_session_id` returns `{ skipped:'duplicate' }` and does not decrement again.

```ts
it('voids when a non-mtm line is short on stock', async () => {
  const c = fakeOrderClient({
    snapshot: snapWithLine({ variantId: 'v', qty: 2, mtm: false }),
    variantStock: { v: 1 },
  });
  const r = await createOrderFromSession(c, {
    sessionId: 'cs_1',
    paymentIntentId: 'pi_1',
    chargeMode: 'escrow',
    account: null,
  });
  expect(r.data).toEqual({ voided: 'out_of_stock' });
  expect(c.inserted('orders')).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/services/orders-create.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Read `checkout_snapshots` by `sessionId`; if none, `{ skipped:'duplicate' }` (already consumed). If an `orders` row with this `stripe_checkout_session_id` exists, `{ skipped:'duplicate' }`. For each non-MTM line, run `update product_variants set stock_quantity = stock_quantity - qty where id = :v and stock_quantity >= :qty` and check affected rows; if any fails, roll back already-decremented lines (increment them back) and return `{ voided:'out_of_stock' }` (the caller voids the PI). Insert `orders` + `order_items` (copy `measurement_snapshot` from the snapshot line). Set `confirm_deadline_at = now()+interval '48 hours'`. After decrementing, for each affected product whose variants are now all `stock_quantity = 0`, set the product `status = 'out_of_stock'` (and conversely restore to `active` on a void-restore in Task 10). Delete the `checkout_snapshots` row and the buyer's `cart` for this vendor. Return `{ orderId }`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/services/orders-create.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/services/orders.service.ts src/__tests__/services/orders-create.service.test.ts
git commit -m "feat(shop): create order from checkout session with stock guard"
```

---

## Task 10: orders.service — confirm / decline / autoVoid (+ ledger)

**Files:**

- Modify: `src/services/orders.service.ts`
- Test: `src/__tests__/services/orders-confirm.service.test.ts`

**Interfaces:**

- Consumes: `stripe.paymentIntents.capture|cancel`, `money.ts` (`computeEscrowNetCents`), `vendor_ledger`.
- Produces: `confirmOrder(serviceClient, orderId): ServiceResult<{ status:'confirmed' }>`; `declineOrder(serviceClient, orderId, reason?): ServiceResult<{ status:'cancelled' }>`; `autoVoidExpired(serviceClient): ServiceResult<{ voided: number }>`.

- [ ] **Step 1: Write the failing test** (mock stripe). Cover: confirm on a `pending_confirmation` escrow order captures the PI, sets `confirmed`, and inserts a `vendor_ledger` row with `net_vendor_cents` from `computeEscrowNetCents`; confirm on an already-`confirmed` order returns 409 and does not capture again; a capture that throws (`StripeInvalidRequestError`) leaves the order `pending_confirmation`, returns 502, and records the error for ops; decline cancels the PI, restores stock, sets `cancelled`.

```ts
it('capture failure keeps the order pending and surfaces an error', async () => {
  piCapture.mockRejectedValue(new Error('payment_intent_unexpected_state'));
  const c = fakeOrderClient({
    order: {
      id: 'o1',
      status: 'pending_confirmation',
      charge_mode: 'direct',
      stripe_payment_intent_id: 'pi_1',
    },
  });
  const r = await confirmOrder(c, 'o1');
  expect(r.status).toBe(502);
  expect(c.updated('orders').find((u) => u.status === 'confirmed')).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/services/orders-confirm.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** `confirmOrder`: load order; if status !== `pending_confirmation` return 409. `paymentIntents.capture(pi, { idempotencyKey: 'order:'+id+':capture' })` (on `{ stripeAccount }` when direct). On throw, return `{ error, status: 502 }` (webhook `payment_intent.succeeded` still finalizes if capture actually went through; the ops alert is fired by the route). On success set `confirmed`/`confirmed_at`; if `charge_mode==='escrow'` insert `vendor_ledger` (`status:'held'`). `declineOrder`: if not `pending_confirmation` return 409; `paymentIntents.cancel`; restore stock for non-MTM order_items; set `cancelled`/`cancel_reason`. `autoVoidExpired`: select `pending_confirmation` orders with `confirm_deadline_at < now()`; call `declineOrder(reason:'auto_void_timeout')` for each; return the count.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/services/orders-confirm.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/services/orders.service.ts src/__tests__/services/orders-confirm.service.test.ts
git commit -m "feat(shop): confirm/decline/auto-void orders + escrow ledger"
```

---

## Task 11: Webhook extension

**Files:**

- Modify: `src/app/api/webhooks/stripe/route.ts`
- Test: `src/__tests__/api/webhooks/shop-events.test.ts`

**Interfaces:**

- Consumes: orders.service (`createOrderFromSession`), connect/void helpers, existing `stripe_events` dedup.

- [ ] **Step 1: Write the failing test** (model on `stripe-retry.test.ts`, stripe + supabase stubbed). Cover: a `checkout.session.completed` event with `metadata.kind==='shop'` calls `createOrderFromSession`; when it returns `{ voided:'out_of_stock' }` the handler calls `paymentIntents.cancel` and still returns 200; a `payment_intent.succeeded` with `metadata.kind==='shop'` marks the order confirmed; a booking-kind event is routed to the existing booking handler, not the shop one.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/api/webhooks/shop-events.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** In the existing `switch (event.type)`, add branches that first check `event.data.object.metadata?.kind === 'shop'` (or session metadata): `checkout.session.completed` → `createOrderFromSession`; on `{ voided }` cancel the PI. `payment_intent.succeeded` (shop) → finalize `confirmed` + ledger if not already done by `confirmOrder`. `payment_intent.canceled` (shop) → ensure `cancelled` + stock restore (idempotent). Keep booking branches unchanged; dedup via `stripe_events` as today.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/api/webhooks/shop-events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/app/api/webhooks/stripe/route.ts src/__tests__/api/webhooks/shop-events.test.ts
git commit -m "feat(shop): route shop checkout + capture + void webhook events"
```

---

## Task 12: Order confirm/decline/get API routes

**Files:**

- Create: `src/app/api/orders/[id]/confirm/route.ts`, `src/app/api/orders/[id]/decline/route.ts`, `src/app/api/orders/[id]/route.ts` (GET)
- Test: `src/__tests__/api/orders.test.ts`

**Interfaces:**

- Consumes: orders.service (Task 10), `declineOrderSchema`, `requireUser`.

- [ ] **Step 1: Write the failing test** — confirm by a user who does not own the order's vendor profile returns 403 and never calls `confirmOrder`; the owning vendor's confirm calls the service; GET returns the order for the buyer or the owning vendor only.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/api/orders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Confirm/decline: load the order via the RLS client, assert the caller owns `vendor_profile_id` (query `vendor_profiles` by `user_id`), else 403; call the service with a service-role client; after a 502 confirm, fire the ops alert (Task 14). GET: return via the RLS client (RLS already limits visibility).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/api/orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck
git add src/app/api/orders src/__tests__/api/orders.test.ts
git commit -m "feat(shop): order confirm/decline/get api with ownership checks"
```

---

## Task 13: Auto-void cron + reminder

**Files:**

- Create: `src/app/api/cron/shop-auto-void/route.ts`
- Modify: `vercel.json` (add the cron schedule)
- Test: `src/__tests__/api/cron-shop-auto-void.test.ts`

**Interfaces:**

- Consumes: `orders.service.autoVoidExpired`, a pure `selectReminderOrders(orders, now)` helper, `CRON_SECRET`.

- [ ] **Step 1: Write the failing test** — request without the `CRON_SECRET` header returns 401; with it, calls `autoVoidExpired` and returns its count; `selectReminderOrders` returns only `pending_confirmation` orders whose remaining time just crossed ~24h.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/api/cron-shop-auto-void.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the guarded route (reuse the existing cron-secret check pattern); run reminders then `autoVoidExpired`. Add to `vercel.json` a schedule (e.g. hourly).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/api/cron-shop-auto-void.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/shop-auto-void vercel.json src/__tests__/api/cron-shop-auto-void.test.ts
git commit -m "feat(shop): 48h auto-void cron + mid-window reminder"
```

---

## Task 14: Notifications (vendor + ops)

**Files:**

- Modify: `src/services/notifications.service.ts` (new notification types), `src/lib/email/resend.tsx` (ops recipient)
- Create: `src/services/shop-notifications.service.ts`
- Test: `src/__tests__/services/shop-notifications.service.test.ts`

**Interfaces:**

- Produces: `notifyShopOrderPlaced(serviceClient, orderId)` (vendor bell+email + ops email to sardar@baazar.io with vendor phone + order summary); `notifyShopOrderConfirmed`, `notifyShopOrderCancelled` (buyer + vendor), `notifyShopConfirmReminder`.

- [ ] **Step 1: Write the failing test** — `notifyShopOrderPlaced` sends a vendor notification and an ops email whose recipient is `sardar@baazar.io` and whose body contains the vendor phone + order id (Resend mocked).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/services/shop-notifications.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**, reusing the existing notification + Resend helpers. Wire `notifyShopOrderPlaced` into `createOrderFromSession` (Task 9), `notifyShopOrderConfirmed/Cancelled` into confirm/decline (Task 10), reminder into the cron (Task 13).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/services/shop-notifications.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/services/shop-notifications.service.ts src/services/notifications.service.ts src/lib/email/resend.tsx src/__tests__/services/shop-notifications.service.test.ts
git commit -m "feat(shop): vendor + ops order notifications"
```

---

## Task 15: Your Bag UI

**Files:**

- Create: `src/app/(marketplace)/bag/page.tsx`, `src/components/shop/BagBoutiqueCard.tsx`, `src/components/shop/BagMtmResolve.tsx`
- Test: `src/__tests__/components/BagBoutiqueCard.test.tsx`

**Interfaces:**

- Consumes: `GET /api/cart`, `POST /api/checkout`, the existing `GuidedMeasurementModal` + measurement-profiles API.

- [ ] **Step 1: Write the failing RTL test** — given a boutique cart with an unresolved MTM line, the "Check out this boutique" button is `disabled` and the helper note is shown; once a measurement profile is attached (prop flips `ready` true) the button enables.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/components/BagBoutiqueCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the page (server component fetches carts; client card handles quantity/remove/measurement-resolve/fulfillment select, posts to `/api/checkout` and redirects to the returned Stripe URL). Match the approved mockup (`.superpowers/brainstorm/.../your-bag-v2.html`): grouped boutique cards, DM Mono prices, ink/cream/indigo, hot-pink on hover only, one haldi dot on the 48h note, 10px radii. Blocked checkout until `ready`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/components/BagBoutiqueCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck
git add "src/app/(marketplace)/bag" src/components/shop src/__tests__/components/BagBoutiqueCard.test.tsx
git commit -m "feat(shop): your bag page grouped by boutique"
```

---

## Task 16: Order confirmation UI

**Files:**

- Create: `src/app/(marketplace)/orders/[id]/page.tsx`, `src/components/shop/OrderConfirmation.tsx`
- Test: `src/__tests__/components/OrderConfirmation.test.tsx`

**Interfaces:**

- Consumes: `GET /api/orders/[id]`.

- [ ] **Step 1: Write the failing RTL test** — renders a `pending_confirmation` order with the "not yet charged" total, the countdown, and the three-step timeline; the "Total on hold" label reads "Not yet charged".

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/components/OrderConfirmation.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** per the approved mockup (`order-confirmation-v2.html`): hold-not-charge lede, countdown pill (haldi dot), 3-step timeline, summary with frozen measurements + "Total on hold, not yet charged", real product images from the order items, staggered entrance disabled under `prefers-reduced-motion`. No em dashes.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/components/OrderConfirmation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck
git add "src/app/(marketplace)/orders" src/components/shop/OrderConfirmation.tsx src/__tests__/components/OrderConfirmation.test.tsx
git commit -m "feat(shop): order confirmation page"
```

---

## Task 17: Vendor confirm UI + fulfillment config

**Files:**

- Create: `src/app/dashboard/orders/[id]/page.tsx`, `src/components/shop/VendorOrderConfirm.tsx`
- Modify: the shop editor (`src/app/dashboard/profile/shop/...`) to set `shop_offers_pickup|shop_offers_shipping|shop_shipping_fee_cents|shop_pickup_note`
- Test: `src/__tests__/components/VendorOrderConfirm.test.tsx`

**Interfaces:**

- Consumes: `GET /api/orders/[id]`, `POST /api/orders/[id]/confirm|decline`, a vendor-profile update for fulfillment config.

- [ ] **Step 1: Write the failing RTL test** — the confirm view shows the submitted measurements and the payout breakdown (subtotal, Baazar fee 10%, your payout); clicking "Can't fulfill" opens a confirm step (not an immediate POST); confirming posts to `/api/orders/[id]/confirm`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/components/VendorOrderConfirm.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** per the approved mockup (`vendor-confirm.html`): product register, quieter chrome, hot-pink only on the alert badge + hover, measurements grid, payout breakdown with the tax-remitted note and escrow note, Confirm (ink) + Can't-fulfill (never delete-on-first-click: a typed/second-tap confirm, wired to the destructive primitive). Add the fulfillment-config fields to the shop editor.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/components/VendorOrderConfirm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck
git add src/app/dashboard/orders src/components/shop/VendorOrderConfirm.tsx "src/app/dashboard/profile/shop" src/__tests__/components/VendorOrderConfirm.test.tsx
git commit -m "feat(shop): vendor confirm/decline view + fulfillment config"
```

---

## Task 18: E2E specs

**Files:**

- Create: `tests/e2e/shop-checkout.spec.ts`
- Modify: `tests/e2e/helpers/seed.ts` (seed a buyer cart + a pending order)

**Interfaces:**

- Consumes: the API + pages above; Stripe stubbed per the current e2e stubbing.

- [ ] **Step 1: Write the specs** — (a) a logged-in couple adds an MTM item, is blocked until measurements are attached, then `POST /api/checkout` returns a URL; (b) seeded `pending_confirmation` order: the owning vendor confirms it and the status becomes `confirmed`; a non-owning vendor gets 403.

- [ ] **Step 2: Run locally**

Run: `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test shop-checkout` (with :3001 dev server, `.env.local`, migrations applied; run `ai:eval-cleanup` first).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/shop-checkout.spec.ts tests/e2e/helpers/seed.ts
git commit -m "test(shop): e2e checkout + vendor confirm"
```

---

## Final: branch verification

- [ ] Run `npm run lint && npm run typecheck && npx vitest run` — all green.
- [ ] Confirm migration 00087 applied to dev; note for the user to apply to prod before deploy.
- [ ] Push `feat/shop-sp2a-checkout` and open a PR per the git workflow (one squash-merge commit). Do not merge until full CI (incl. e2e) is green.
