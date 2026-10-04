# Shop Connect Onboarding — Sub-project 1

**Date:** 2026-10-04
**Status:** Design — awaiting approval before implementation plan
**Scope:** Local bridal-wear vendors link a Stripe **Standard** connected account so the shop can pay them. This is the money prerequisite for shop checkout (Sub-project 2); it introduces onboarding + status only — no charges, ledger, escrow, or transfers.

---

## 1. Background & where this fits

The bridal/groom-wear **Shop** (physical goods: `products` + `product_variants`, migrations 00082–00085) is live-in-code but hidden behind `NEXT_PUBLIC_SHOP_ENABLED`. Vendors can build a catalog; **nothing can be bought** — there is no checkout.

Adding checkout requires deciding how vendors get paid. The locked model (see §2) is Stripe Connect for **local** vendors, which was deliberately removed from this codebase in migration 00058 (`stripe_accounts` dropped, Bucket F single-mode). This sub-project rebuilds the onboarding half of Connect for local bridal vendors; Sub-project 2 builds cart + orders + the charge flow that consumes it.

Decomposition:

- **SP1 (this spec):** vendor links a Standard account; we persist it and track readiness. Shippable, testable prerequisite.
- **SP2 (next spec):** cart + `orders`/`order_items` + per-sale charge branch (direct vs escrow) + escrow ledger + transfer-escrowed-on-onboarding + stock + made-to-measure measurement snapshot + ship/pickup + lead-time-aware fulfillment-SLA refund.

---

## 2. Locked money-model decisions (context for both sub-projects)

Decided in brainstorming 2026-10-03/04:

1. **Full payment at checkout** (not a deposit) — the shop sells goods, not a service to perform later.
2. **Two lanes keyed on `vendor_profiles.vendor_origin`:**
   - **Local:** Stripe Connect **Standard** accounts, **direct charges**, **vendor = merchant of record** (vendor owns sales tax, 1099s via Stripe, dispute/negative-balance liability). Baazar books commission only. Chosen over self-managed merchant-of-record because it keeps Baazar's books net, offloads vendor 1099s to Stripe, and removes money-transmission risk. (Note: Illinois marketplace-facilitator law may still put _sales-tax collection_ on Baazar regardless — a Stripe Tax config, confirm with counsel before launch.)
   - **International:** Baazar as reseller/merchant-of-record, Wise payouts, landed pricing (wholesale → DDP USD). **Phase 2, verify-before-build** (duty rates, Wise/Stripe Tax access, legal). Currently gated "coming soon."
3. **Onboarding model = "C" (escrow until onboarded):** vendors sign up and build a catalog with **no Stripe step** (avoids losing leads to signup-time Stripe friction). While a local vendor is **not yet charge-enabled**, the shop collects each of their sales as a platform charge into **escrow** (Baazar's balance) and tracks the vendor's share on an internal ledger; when the vendor completes Standard onboarding, the escrowed balance is **transferred** to them and **all subsequent sales are direct charges**. Escrow holds **every** pre-onboarding sale for that vendor (not capped at one); the "finish Stripe to release your earnings" message keeps that balance small. **Escrow + ledger + transfer all live in SP2** (their only writer is checkout); SP1 ships onboarding alone.
4. **Buyer protection = fulfillment SLA (SP2), tied to shipping, not onboarding:** an order not fulfilled (shipped / handed over) by its deadline auto-refunds the buyer. The deadline is **lead-time-aware** (`products.lead_time_days` + grace) — ready-made ships in days, made-to-measure legitimately takes weeks. A vendor who fulfilled but never onboards is only holding up _their own_ earned money (buyer already received the garment) → long-tail reminders/escheat, a deferred edge, not a buyer risk.
5. **Account type = Standard** (not Express/Custom): lowest Baazar liability, no per-account Connect fees, textbook pairing with direct charges + vendor-MoR. Standard works for lane "C" because pre-onboarding escrow lives on Baazar's own ledger (no connected account needed yet); on onboarding we transfer to the Standard account.

---

## 3. Two-lane distinction & mixed-cart principle (locked, recorded here)

- **The distinction is enforced at the SP1 gate:** Connect onboarding requires `category='bridal_wear' AND vendor_origin='local'`. International vendors never enter this Stripe Connect flow — they are a separate lane with a different (unbuilt) payout mechanism (Wise).
- **A cart can never mix lanes.** A single Stripe payment has exactly one merchant of record. A local item makes the _vendor_ the MoR (direct charge); an international item makes _Baazar_ the MoR (reseller charge). The two cannot share one payment, so a mixed cart always decomposes into separate payments/orders per lane.
- **Therefore SP2 scopes a cart to a single vendor** ("check out per boutique"). Each vendor is exactly one origin, so a cart is always lane-pure, and a buyer purchasing from a local and an international boutique does so as two separate orders on two separate rails. Cross-vendor carts are deferred.
- **Today this is moot:** international selling is gated "coming soon", so every purchasable product is from a local vendor and no mixed cart is possible.

---

## 4. Scope of this sub-project

**In:**

- A local bridal vendor links a Stripe **Standard** connected account via Stripe-hosted onboarding (and can OAuth-connect an existing Stripe account).
- Persist the account id; keep `charges_enabled` / `payouts_enabled` / `details_submitted` in sync (on return from onboarding and via the `account.updated` webhook).
- Surface payout-setup status in the vendor dashboard.

**Out (SP2 or later):** any charge, cart, order, escrow ledger, fund transfer, fulfillment SLA, made-to-measure snapshot, the international lane, cross-vendor carts.

---

## 5. Data model — migration `00086_vendor_stripe_accounts.sql`

Fresh table name (the dropped `stripe_accounts` from 00058 left stale scripts; avoid collision):

```sql
CREATE TABLE vendor_stripe_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL UNIQUE REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled   boolean NOT NULL DEFAULT false,
  payouts_enabled   boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_stripe_accounts_vendor_idx ON vendor_stripe_accounts(vendor_profile_id);
```

RLS (mirrors the historical 00004 policy + the vendor-scoped pattern):

- **Vendor SELECTs own:** `vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())`.
- **Service role manages all** (onboarding route + webhook write via service-role client). No vendor INSERT/UPDATE directly — account creation and status sync are server-owned.

Migration-apply policy: Claude applies dev via psql; user applies prod (per project convention). Additive only, no down-migration.

`database.types.ts`: hand-patch the new table (per the regen-pending convention).

---

## 6. Service — `src/services/connect.service.ts`

All DB access through the passed RLS client, except status writes which use a service-role client (mirrors how webhooks write). `ServiceResult<T>` return shape throughout.

- `getOrCreateConnectAccount(supabase, vendorProfileId): ServiceResult<{ accountId: string }>`
  - **Gate:** load `category, vendor_origin` for the profile; require `category === 'bridal_wear' && vendor_origin === 'local'` → else `{ error, status: 403 }`.
  - If a `vendor_stripe_accounts` row exists → return its `stripe_account_id`.
  - Else `stripe.accounts.create({ type: 'standard', country: 'US' })`, insert the row (service-role), return the id.
- `createOnboardingLink(accountId, origin): ServiceResult<{ url: string }>`
  - `stripe.accountLinks.create({ account, type: 'account_onboarding', return_url: ${origin}/dashboard/profile/payments?return=1, refresh_url: ${origin}/dashboard/profile/payments?refresh=1 })`. Links are single-use/expiring — `?refresh=1` mints a new one.
- `refreshAccountStatus(serviceClient, accountId): Promise<void>`
  - `stripe.accounts.retrieve(accountId)` → update `charges_enabled`, `payouts_enabled`, `details_submitted`, `updated_at` on the row.
- `getConnectStatus(supabase, vendorProfileId): ServiceResult<{ connected: boolean; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean }>`
  - Read the row for the UI; `connected=false` when no row.

---

## 7. API + return UX

- `POST /api/connect/onboard` — `withErrorBoundary` + `requireUser`; resolve the caller's vendor profile; `getOrCreateConnectAccount` then `createOnboardingLink` → `{ data: { url } }`. Rate-limit like `booking:deposit` (e.g. 5 / 10 min, keyed on user id) to prevent account-create / link spam.
- **Return page `/dashboard/profile/payments`:**
  - `?return=1` → call `refreshAccountStatus` (service-role) then render current status.
  - `?refresh=1` → the onboarding link expired/was abandoned; render the "continue setup" CTA that re-POSTs to `/api/connect/onboard` for a fresh link.
- **Webhook** `/api/webhooks/stripe/route.ts`: add a case `account.updated` → `refreshAccountStatus(serviceClient, event.account)`. The route already tries `STRIPE_CONNECT_WEBHOOK_SECRET`, so Connect-account events validate without new plumbing. (SP2 extends this same case to also transfer any escrowed balance when `charges_enabled` flips true.)

---

## 8. UI

- **`/dashboard/profile/payments`** (new) — three states:
  - **Not connected:** explainer + "Set up payouts with Stripe" (POSTs `/api/connect/onboard`, redirects to the returned URL). Copy sets the expectation that completing Stripe setup is required to receive earnings.
  - **Pending:** `details_submitted` true but `charges_enabled` false → "Finish verifying your account" (fresh link).
  - **Ready:** `charges_enabled` true → "You're set up to get paid."
- **`SidebarNav`:** a "Payouts" entry for local bridal vendors, behind `NEXT_PUBLIC_SHOP_ENABLED` (consistent with the rest of the hidden shop; flip on with the checkout launch).
- **Shop editor banner:** soft warning when the vendor has products but is not charge-ready — "Set up payouts so customers can buy." **Not** a hard publish block; the hard "can't be purchased unless charge-ready" gate lives in SP2 checkout.

---

## 9. Testing

- **Unit (`connect.service`):** gate rejects non-bridal and international (`403`); `getOrCreate` returns an existing row without a second Stripe create; status-flag mapping from a retrieved account.
- **Webhook:** `account.updated` updates the row's three flags (mirror `src/__tests__/api/webhooks/stripe-retry.test.ts` style, Stripe stubbed).
- **E2E (light):** `/api/connect/onboard` returns a link for a seeded local bridal vendor; `/dashboard/profile/payments` renders each of the three states (Stripe stubbed, matching current e2e stubbing). Full Stripe-hosted onboarding is external and not driven in e2e.

---

## 10. Env / ops prerequisites (user action)

- Enable **Connect** on the Baazar Stripe platform account (Stripe dashboard).
- Set `STRIPE_CONNECT_WEBHOOK_SECRET` in dev and prod (the webhook route already reads it).
- `NEXT_PUBLIC_APP_URL` (already present) is used for onboarding return/refresh URLs.

---

## 11. Deferred / follow-ups

- Escrow ledger, per-sale charge branch, transfer-escrowed-on-onboarding → **SP2**.
- Lead-time-aware fulfillment-SLA auto-refund → **SP2**.
- International lane (Wise, landed pricing) → **Phase 2, verify-before-build**.
- Cross-vendor carts → deferred.
- "Fulfilled but never onboarded" unclaimed-earnings reminders / escheat → long-tail, deferred.
- Counsel/accountant sign-off on marketplace-facilitator sales tax + MTL posture before the shop goes live in prod.

---

## 12. Open questions

None blocking. Account creation defaults to `country: 'US'` (local = Chicago-area); if a local vendor is ever non-US this would need revisiting, but "local" is defined as Chicago-area, so US is correct.
