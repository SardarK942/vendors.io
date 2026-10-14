# Shop Checkout — Sub-project 2a (Core Purchase Path)

**Date:** 2026-10-13
**Status:** Design, awaiting approval before implementation plan
**Scope:** Make the bridal/groom-wear Shop transactional. A couple buys from one boutique at a time; payment is authorized at checkout, the vendor confirms within 48 hours, and on confirm we capture (direct charge or escrow), decrement stock, and freeze the made-to-measure snapshot. Builds on SP1 Connect onboarding (migration 00086).

---

## 1. Background and where this fits

The Shop (physical goods: `products` + `product_variants`, migrations 00082 to 00085) is live in code but hidden behind `NEXT_PUBLIC_SHOP_ENABLED`. Vendors build catalogs; nothing can be bought because there is no checkout. SP1 (migration 00086, `vendor_stripe_accounts`) added Connect onboarding and status tracking for local bridal vendors but no charges.

SP2 (cart + orders + charge branch + escrow ledger + transfer-on-onboarding + stock + MTM snapshot + fulfillment + SLA refund) is too large for one plan, so it is decomposed:

- **SP2a (this spec):** cart, orders, the authorize/confirm/capture purchase path, the direct-vs-escrow charge branch, the escrow ledger (writes only), stock decrement, MTM snapshot, fulfillment choice, and the vendor confirm/decline surface. Shippable: the Shop becomes transactional.
- **SP2b:** transfer the escrowed balance to the vendor when `charges_enabled` flips true (extends the `account.updated` webhook) plus ledger reconciliation.
- **SP2c:** vendor marks shipped/handed-over, buyer order-status timeline, and the lead-time-aware auto-refund for unfulfilled orders.

The international lane (reseller, Wise, landed pricing) stays Phase 2 and gated "coming soon." Every purchasable product today is from a local vendor, so SP2a is all-local and lane-pure by construction.

---

## 2. Decisions carried in and decided for SP2a

Carried from the SP1 design (see `2026-10-04-shop-connect-onboarding-design.md`, section 2):

1. Full payment at checkout, not a deposit.
2. Two lanes keyed on `vendor_profiles.vendor_origin`. Local = Stripe Connect **Standard**, **direct charges**, vendor is merchant of record, Baazar books commission only. International = reseller (Phase 2, unbuilt).
3. Onboarding model C (escrow until onboarded): a vendor can sell before connecting Stripe. Pre-onboarding sales collect as a platform charge into escrow and are tracked on an internal ledger; SP2b transfers on onboarding.
4. Account type Standard.

Decided for SP2a in the 2026-10-13 brainstorm:

5. **Cart model:** per-vendor cart (one cart per boutique per buyer). The buyer sees a single "Your bag" view grouped by boutique; each boutique has its own subtotal and its own checkout. Checkout is atomic per boutique (one payment, one order). Cross-vendor single checkout is deferred.
6. **Checkout mechanism:** hosted Stripe Checkout (reuses the booking-deposit pattern), with **manual capture**.
7. **Order finality:** vendor-confirmed. Checkout **authorizes** the card (funds held, not charged). The vendor confirms "I can make/fulfill this" within **48 hours**. On confirm we **capture**; on decline or timeout we **void** the authorization, so the buyer is never charged for stale or phantom stock. This is the answer to vendor stock mismanagement (off-platform sales making our counts stale): only the vendor knows physical reality, so they confirm before money is captured.
8. **MTM:** add to bag freely; resolve measurements at the bag (per line, pick a saved profile or fill the existing guided modal); checkout is blocked until every MTM line is resolved; the snapshot freezes at order creation.
9. **Fulfillment:** both pickup and shipping, vendor-configurable. The buyer chooses at checkout. Stripe Checkout collects the shipping address when shipping is chosen.
10. **Commission:** 10% of item subtotal (excluding shipping and tax), as the `application_fee_amount` on direct charges and the retained share in escrow.
11. **Login required** to purchase (measurements are per-account, high-value purchase, order history). No guest checkout.
12. **Stripe fees:** direct charges, the connected account (vendor) bears Stripe's processing fee and Baazar's 10% rides on top as the application fee. Escrow, Baazar bears the Stripe fee and the ledger records the vendor's net share.
13. **Tax:** Stripe Tax enabled on Checkout. The marketplace-facilitator filing posture needs counsel before production (carried from SP1).

---

## 3. Scope

**In:**

- Per-vendor cart: add, update quantity, remove, attach a measurement profile to an MTM line.
- "Your bag" grouped by boutique, per-boutique checkout, blocked until MTM resolved and lines in stock.
- Hosted Stripe Checkout with manual capture, direct-vs-escrow construction, Stripe Tax, address collection for shipping.
- `orders` + `order_items` created on authorization; stock decremented atomically; MTM snapshot frozen.
- Vendor confirm (capture) and decline (void); 48h auto-void cron.
- Escrow ledger **writes** for escrow-mode orders.
- Vendor confirm/decline dashboard surface; buyer order-confirmation surface.
- Notifications: vendor alert + internal ops alert to sardar@baazar.io on a new pending order, a mid-window reminder, and a timeout/void notice.

**Out (SP2b, SP2c, later):** transfer-escrowed-on-onboarding; vendor marks shipped + buyer status timeline + lead-time auto-refund; international lane; cross-vendor single checkout; partial-shipment; the per-order vendor cancel/refund after capture (basic hook only, full flow in SP2c).

---

## 4. Order lifecycle

```
(bag) ──checkout──▶ Stripe Checkout (manual capture)
                         │ buyer completes ⇒ PI = requires_capture
                         ▼
   checkout.session.completed ⇒ create order PENDING_CONFIRMATION
     (order_items frozen, stock decremented w/ guard, MTM snapshot frozen,
      vendor + ops alerts fired, confirm_deadline_at = now + 48h)
                         │
        ┌────────────────┴─────────────────┐
   vendor Confirm                   vendor Decline / 48h cron
        │ capture PI                        │ cancel PI (void auth)
        ▼                                    ▼
   status = CONFIRMED                   status = CANCELLED
   (escrow path: write vendor_ledger)   restore stock; notify buyer + vendor + ops
   notify buyer + vendor
```

Two deadlines, no overlap: **confirm-by** (48h, before any charge, this spec) and later **fulfill-by** (lead-time SLA, after charge, SP2c).

Edge: if two buyers both authorize the last unit, the second's stock-decrement guard fails during order creation; we void that authorization immediately and tell the buyer it just sold. No charge, since it was only an authorization.

---

## 5. Data model (migration `00087`)

New tables plus additive columns on `vendor_profiles`. Additive only, no down-migration. `database.types.ts` hand-patched per the regen-pending convention. Dev applied by Claude via psql; prod applied by the user.

**`carts`** — one per (buyer, boutique)

```
id uuid pk default gen_random_uuid()
user_id uuid not null references auth.users(id) on delete cascade
vendor_profile_id uuid not null references vendor_profiles(id) on delete cascade
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique (user_id, vendor_profile_id)
```

**`cart_items`**

```
id uuid pk
cart_id uuid not null references carts(id) on delete cascade
product_id uuid not null references products(id) on delete cascade
variant_id uuid not null references product_variants(id) on delete cascade
quantity integer not null default 1 check (quantity >= 1)
measurement_profile_id uuid null references user_measurement_profiles(id) on delete set null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique (cart_id, variant_id)
```

No price stored. Price and stock are read live at the bag and frozen only at order creation.

**`orders`** — one per boutique checkout

```
id uuid pk
buyer_user_id uuid not null references auth.users(id)
vendor_profile_id uuid not null references vendor_profiles(id)
status text not null default 'pending_confirmation'
  check (status in ('pending_confirmation','confirmed','cancelled'))
stripe_payment_intent_id text unique
stripe_checkout_session_id text unique
charge_mode text not null check (charge_mode in ('direct','escrow'))
item_subtotal_cents integer not null
shipping_cents integer not null default 0
tax_cents integer not null default 0
commission_cents integer not null
total_cents integer not null
fulfillment_type text not null check (fulfillment_type in ('pickup','ship'))
shipping_address jsonb null
confirm_deadline_at timestamptz not null
confirmed_at timestamptz null
cancelled_at timestamptz null
cancel_reason text null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

**`order_items`** — frozen at order creation

```
id uuid pk
order_id uuid not null references orders(id) on delete cascade
product_id uuid not null references products(id)
variant_id uuid not null references product_variants(id)
product_name_snapshot text not null
variant_label_snapshot text null
unit_price_cents integer not null
quantity integer not null
line_subtotal_cents integer not null
customization_type text null
measurement_snapshot jsonb null   -- the MTM liability record
```

**`vendor_ledger`** — escrow accounting (writes only in SP2a)

```
id uuid pk
vendor_profile_id uuid not null references vendor_profiles(id)
order_id uuid not null unique references orders(id) on delete cascade
gross_cents integer not null
commission_cents integer not null
stripe_fee_cents integer not null default 0
net_vendor_cents integer not null
status text not null default 'held' check (status in ('held','transferred'))
transferred_at timestamptz null
stripe_transfer_id text null
created_at timestamptz not null default now()
```

**`checkout_snapshots`** — frozen line set between checkout and webhook

```
id uuid pk
stripe_checkout_session_id text not null unique
buyer_user_id uuid not null references auth.users(id) on delete cascade
vendor_profile_id uuid not null references vendor_profiles(id) on delete cascade
charge_mode text not null check (charge_mode in ('direct','escrow'))
fulfillment_type text not null check (fulfillment_type in ('pickup','ship'))
lines jsonb not null          -- [{variant_id, product_id, name, variant_label, unit_price_cents, quantity, customization_type, measurement_snapshot}]
subtotal_cents integer not null
shipping_cents integer not null
commission_cents integer not null
created_at timestamptz not null default now()
```

Written at `/api/checkout` when the Stripe session is created, so prices and the MTM snapshot are frozen at that instant (not re-read at webhook time, which would risk drift and Stripe metadata-size limits). The `checkout.session.completed` handler reads this row by session id to build the order, then deletes it. RLS: service-role only (no client access); abandoned rows are swept by the auto-void cron.

**`vendor_profiles` additive columns (fulfillment config)**

```
shop_offers_pickup boolean not null default true
shop_offers_shipping boolean not null default false
shop_shipping_fee_cents integer not null default 0
shop_pickup_note text null
```

**Stock (no separate table):** on order creation decrement `product_variants.stock_quantity` with a guarded conditional update (`... where stock_quantity >= qty`); the pending order is the 48h hold. On void, increment back. MTM lines are made-to-order and do not decrement. When a variant reaches 0 and all variants are 0, set the product `status = 'out_of_stock'`.

### RLS

- `carts`, `cart_items`: buyer manages own (`user_id = auth.uid()`, cart_items via parent cart).
- `orders`: buyer SELECT own (`buyer_user_id = auth.uid()`); vendor SELECT own (`vendor_profile_id in (select id from vendor_profiles where user_id = auth.uid())`). All writes via service-role (checkout webhook, confirm/decline, cron).
- `order_items`: SELECT via parent order's policy; writes service-role.
- `vendor_ledger`: vendor SELECT own; writes service-role. **Mirror the SP1 lesson: the management policy is `TO service_role`, never `USING (true)` on PUBLIC.**

---

## 6. Services

All reads/writes through the passed RLS client except server-owned status writes (service-role), matching the existing `payment.service` and `connect.service` patterns. `ServiceResult<T>` throughout.

- **`src/services/cart.service.ts`** — `getCartsForBuyer` (grouped by vendor, with live prices + stock + MTM-resolved flags), `addItem` (gate: product active, vendor local bridal), `updateItemQuantity`, `removeItem`, `attachMeasurementProfile` (validates the profile belongs to the buyer and the garment type matches). A pure pricing/validation helper computes per-boutique subtotal and the "ready to check out" predicate (all MTM lines resolved, all lines in stock).
- **`src/services/checkout.service.ts`** — `createCheckoutSession(supabase, serviceClient, buyerUserId, vendorProfileId, fulfillmentChoice)`: re-validate stock + MTM resolution, resolve charge mode from `vendor_stripe_accounts.charges_enabled`, build the hosted Checkout Session (manual capture, line items from live prices, Stripe Tax, shipping address/options when shipping, metadata carrying `kind=shop`, buyer, vendor, session id), **persist a `checkout_snapshots` row** with the frozen line set (prices + MTM snapshot frozen now), return `{ url }`. No order row yet.
- **`src/services/orders.service.ts`** — `createOrderFromSession` (webhook-driven: read the `checkout_snapshots` row by session id, freeze order + order_items from it, decrement stock guarded, write escrow ledger deferred to capture, delete the snapshot, clear the cart), `confirmOrder` (vendor: capture PI, status confirmed, write `vendor_ledger` for escrow mode), `declineOrder` (vendor: cancel PI, restore stock, status cancelled, reason), `autoVoidExpired` (cron: decline-equivalent for orders past `confirm_deadline_at`). Vendor confirm/decline is authorized through an API that checks the caller owns the vendor profile, then calls the service with the service-role client for the Stripe + status writes.
- **Webhook** extends `src/app/api/webhooks/stripe/route.ts` (see section 8). Shop events are distinguished from booking events by `metadata.kind === 'shop'`.
- **Notifications** extend `notifications.service` (vendor in-app + email) and add an internal ops email via the existing Resend ops channel to sardar@baazar.io.

---

## 7. API routes

All `withErrorBoundary` + `requireUser`, rate-limited like existing money routes.

- `GET /api/cart` — carts grouped by boutique with live totals + readiness.
- `POST /api/cart/items` — add `{ product_id, variant_id, quantity }`.
- `PATCH /api/cart/items/[id]` — quantity and/or `measurement_profile_id`.
- `DELETE /api/cart/items/[id]`.
- `POST /api/checkout` — `{ vendor_profile_id, fulfillment_type }` → `{ url }`. Rate-limit like `booking:deposit`.
- `POST /api/orders/[id]/confirm` — vendor only (owns the order's vendor profile) → capture.
- `POST /api/orders/[id]/decline` — vendor only → void, `{ reason? }`.
- `GET /api/orders/[id]` — buyer or owning vendor, for the confirmation + vendor surfaces.
- Cron `POST /api/cron/shop-auto-void` — `CRON_SECRET`-guarded; voids orders past the 48h deadline. Also fires the mid-window reminder (for orders crossing ~24h remaining).

---

## 8. Stripe mechanics

**Authorize at checkout.** `stripe.checkout.sessions.create(params, options)`, `mode: 'payment'`, `payment_intent_data: { capture_method: 'manual', metadata: { kind:'shop', ... } }`, `automatic_tax: { enabled: true }`, `shipping_address_collection` + `shipping_options` when shipping, `success_url`/`cancel_url`, idempotency key `checkout:{buyer}:{vendor}:{cartHash}`.

**Charge branch is where the session is created:**

- **Direct** (`vendor_stripe_accounts.charges_enabled`): create the session **on the connected account** (`{ stripeAccount: accountId }`) with `payment_intent_data.application_fee_amount = commission_cents`. Vendor is merchant of record; Stripe fee borne by the connected account. These PI/session events arrive as **Connect events** (validated by `STRIPE_CONNECT_WEBHOOK_SECRET`, already wired in SP1).
- **Escrow** (not charge-enabled): plain **platform** session, no application fee. Baazar holds the full amount; at capture we write the `vendor_ledger` row (`net_vendor = subtotal - commission + shipping`, Stripe fee absorbed from commission, tax held for remittance). SP2b transfers.

**Order creation on authorization, not on click.** Create the order from `checkout.session.completed` so an abandoned checkout leaves no phantom order and holds no stock.

**Confirm/decline.**

- Confirm: `paymentIntents.capture(pi, { idempotencyKey: 'order:{id}:capture' })` (on the connected account for direct). `payment_intent.succeeded` finalizes status + ledger.
- Decline/timeout: `paymentIntents.cancel(pi, { idempotencyKey: 'order:{id}:cancel' })`. `payment_intent.canceled` ensures cancelled status + stock restore (idempotent with the action).

**Webhook additions** (`/api/webhooks/stripe/route.ts`, gated on `metadata.kind === 'shop'`):

- `checkout.session.completed` → `createOrderFromSession` (read `checkout_snapshots`, create order + order_items, decrement stock, alerts). Read `event.account` to know direct vs platform.
- `payment_intent.succeeded` → mark order confirmed, write ledger (escrow).
- `payment_intent.canceled` → mark order cancelled, restore stock.

**Idempotency/safety:** existing `stripe_events` dedup; `orders.stripe_payment_intent_id` unique; keyed capture/cancel; the stock-decrement guard prevents double decrement. Authorization lifetime (~7 days) safely exceeds the 48h window; a capture that fails because the auth expired notifies ops.

---

## 9. Stock and availability

Availability source is vendor-maintained `stock_quantity` per variant; MTM is made-to-order and not count-gated. Two checkpoints prevent selling what is gone:

1. **Before payment:** the bag re-validates every line against current stock when opened and when checkout is requested; a now-unavailable line is flagged and checkout is blocked until it is removed or reduced.
2. **At order creation:** guarded atomic decrement; the loser of a race on the last unit is voided immediately (authorization only, no charge).

**Stale stock from off-platform sales** (the main real-world risk) is handled by the vendor confirmation step, not by our counts: the vendor confirms against physical reality before capture, and declining voids the authorization with no charge. A vendor cancel/refund hook after capture is deferred to SP2c.

---

## 10. Made-to-measure snapshot

An MTM line (product `customization_types` includes `made_to_measure`, garment maps via `garmentToMeasurementGarment` to `lehenga` or `sherwani`) must have a `measurement_profile_id` attached before checkout. At order creation we copy the profile's values into `order_items.measurement_snapshot` (jsonb, inches canonical), freezing the liability record. In-app measurement capture currently exists only for lehenga and sherwani; other garment types with `made_to_measure` are out of scope until their schemas exist. The buyer resolves measurements at the bag by selecting a saved profile or filling the existing `GuidedMeasurementModal`.

---

## 11. Fulfillment

Vendor sets `shop_offers_pickup` and/or `shop_offers_shipping` (+ `shop_shipping_fee_cents`, `shop_pickup_note`). At least one must be enabled for a product to be purchasable. The buyer chooses per boutique at checkout. Shipping: Stripe Checkout collects the address and adds the flat fee as a shipping option; `fulfillment_type='ship'`, `shipping_address` stored. Pickup: no address, show the pickup note; `fulfillment_type='pickup'`. Marking shipped/handed-over and the fulfillment SLA are SP2c.

---

## 12. Notifications

On a new `pending_confirmation` order:

- **Vendor:** in-app bell + email, "New order, confirm within 48 hours."
- **Internal ops:** email to **sardar@baazar.io** with the vendor's name, phone, and order summary, so Baazar can call the vendor and make sure they act.

Mid-window **reminder** (at roughly 24h remaining) to vendor + ops. On confirm: buyer + vendor confirmation emails. On decline/timeout: buyer + vendor + ops notice.

---

## 13. UX and screens

Validated as mockups in the 2026-10-13 brainstorm (persisted under `.superpowers/brainstorm/`). Built on the DESIGN.md token system.

- **Your bag** (couple, brand register, flow so chrome quieted): grouped by boutique cards, each with line items, per-line MTM resolve ("Add measurements": saved profile or guided modal), a pickup/ship segmented control, a per-boutique subtotal, the "held, not charged, 48h" copy with one haldi dot, and a per-boutique checkout button disabled until MTM is resolved and lines are in stock. Ink/cream/indigo, hot-pink on hover only, 10px cards, prices in DM Mono, structural responsive behavior (20px gutters, stacked actions, clamped headings on mobile).
- **Order confirmation** (couple): warm matter-of-fact headline, a plain-language hold explanation, a countdown status pill, a three-step "what happens next" timeline (placed and authorized, confirm within 48h, made then pickup/ship), an order summary with the frozen measurements shown and a "Total on hold, not yet charged" line, real garment imagery.
- **Vendor confirm** (vendor, product register, chrome quieted, no haldi, hot-pink only on the alert badge): the order with items, the submitted measurements in a labeled DM Mono grid, the fulfillment choice, a payout breakdown (subtotal, Baazar fee 10%, your payout) with the tax-remitted note, the escrow note for not-yet-onboarded vendors, and Confirm (ink, captures) + Can't-fulfill (quiet, turns error-red on hover, never delete-on-first-click, with a "releases the hold, no charge" note).

---

## 14. Testing

- **Unit (`cart.service`):** add/update/remove, the per-boutique subtotal and readiness predicate, MTM profile attach validation (ownership + garment match), gate rejects non-local-bridal.
- **Unit (`checkout.service`):** charge-mode resolution from `charges_enabled`, session params for direct vs escrow (Stripe stubbed), stock + MTM re-validation blocks an unready checkout.
- **Unit (`orders.service`):** order + order_items freeze, guarded stock decrement and restore, MTM snapshot copy, ledger math (escrow), confirm captures, decline voids and restores, auto-void respects the deadline.
- **Webhook:** `checkout.session.completed` creates the order and decrements stock; `payment_intent.succeeded` confirms + writes ledger; `payment_intent.canceled` cancels + restores. Shop-vs-booking routing by metadata. Dedup via `stripe_events`. Mirror `stripe-retry.test.ts` style.
- **E2E (light, Stripe stubbed):** add to bag, resolve MTM, blocked-until-ready, `POST /api/checkout` returns a URL; vendor confirm and decline transitions on a seeded order. Hosted Checkout and real capture are external and not driven in E2E (matching current stubbing).
- Run `npm run lint` and `npm run typecheck` after each slice. Definitive gate is the CI e2e job (prod build).

---

## 15. Env and ops prerequisites

- SP1 Connect prerequisites already satisfied (Connect enabled, both webhook endpoints, `STRIPE_CONNECT_WEBHOOK_SECRET` in dev + prod).
- `CRON_SECRET` already present (reused for the auto-void cron); register the cron in `vercel.json`.
- Confirm the ops email recipient (sardar@baazar.io) is reachable through the existing Resend ops channel.
- Stripe Tax enabled on the platform account before production; counsel sign-off on marketplace-facilitator sales tax and MoR posture before the Shop goes live (carried from SP1).

---

## 16. Deferred and follow-ups

- **SP2b:** transfer escrowed balance on onboarding (extend `account.updated`), ledger reconciliation.
- **SP2c:** vendor marks shipped/handed-over, buyer order-status timeline, lead-time-aware auto-refund, vendor cancel/refund after capture.
- International lane (Wise, landed pricing), cross-vendor single checkout, partial shipment, MTM capture for garment types beyond lehenga/sherwani: later.

---

## 17. Open questions

None blocking. Fulfillment config is vendor-level in v1; if per-product shipping ever matters it moves onto `products` additively. Commission is a constant (10%) in v1; a configurable rate is a later additive change.
