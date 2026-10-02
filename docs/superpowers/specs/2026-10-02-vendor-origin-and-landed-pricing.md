# Vendor origin & landed-pricing engine

**Date:** 2026-10-02
**Status:** Phase 1 (vendor-origin fork) SHIPPED in this slice · Phase 2 (landed-price engine) DESIGN ONLY — not built
**Migration:** `00085_vendor_origin.sql`
**Branch / PR:** `feat/bridal-vendor-onboarding` (PR #176)

---

## Problem

Bridal-wear vendors come in two lanes:

1. **Local (Chicago-area)** — operate here, hold USD inventory, and can be
   booked / sold to today through the existing Shop.
2. **International** — overseas ateliers (India, Pakistan, …) whose prices are
   quoted in a home currency and need a **landed-price conversion** (duty, FX,
   fees, shipping, margin) before a US buyer ever sees a number. Selling these
   requires cross-border payments, customs/tax handling, and verified duty
   rates — none of which exist yet.

We want international vendors to onboard and build their catalog NOW (so we have
supply when the machinery is ready) without exposing a broken buy flow.

---

## Phase 1 — Vendor-origin fork (BUILT in this slice)

### Data model (migration 00085, additive, no down-migration)

```sql
ALTER TABLE vendor_profiles ADD COLUMN vendor_origin text NOT NULL DEFAULT 'local' CHECK (vendor_origin IN ('local','international'));
ALTER TABLE vendor_profiles ADD COLUMN vendor_country text;
ALTER TABLE vendor_profiles ADD COLUMN vendor_currency text NOT NULL DEFAULT 'usd';
```

- `vendor_origin` — `'local'` (default) or `'international'`. TEXT + CHECK enum,
  matching the project's category/status convention.
- `vendor_country` — nullable country label for international vendors; NULL for
  local. App-layer value set (India, Pakistan, Bangladesh, United Kingdom, UAE,
  Canada, Other).
- `vendor_currency` — currency the vendor quotes wholesale in. `'usd'` default
  (local vendors price directly in USD). International picks inr/pkr/bdt/gbp/
  aed/cad/usd. App-layer validated.

### Onboarding fork (StepBasics)

- The 6-step wizard is UNCHANGED (still basics → location → online → details →
  portfolio → review). The fork lives INSIDE StepBasics, conditional on
  `category === 'bridal_wear'` — mirroring how ServicesMultiSelect /
  SubcategoryMultiSelect already render by category.
- "Where do you operate?" segmented control: **Local (Chicago-area)** (default)
  vs **International**.
- International reveals a country select + currency select + an inline notice:
  _"International selling is coming soon. We'll save your shop details and reach
  out when it's ready."_
- Switching back to Local resets `vendor_country → null`, `vendor_currency →
'usd'` (both client-side and normalized server-side in the basics handler).
- Non-bridal vendors never see the fork; the DB defaults (`local`/`usd`) apply
  silently.

### Shop gate

`/dashboard/profile/shop`: a bridal vendor with `vendor_origin === 'international'`
sees an "International selling is coming soon" state (we've saved your details,
we'll reach out) INSTEAD of the product editor/list. Local bridal vendors get
the existing Shop, unchanged. The existing non-bridal gate is unchanged.

---

## Phase 2 — Landed-price engine (DESIGN ONLY — DO NOT BUILD YET)

International vendors will store **wholesale** prices in their home currency. The
buyer must see a single **all-in DDP** (Delivered Duty Paid) USD price — no
surprise customs bills at the door. The conversion:

```
retail_usd = ( wholesale_local × fx_rate × (1 + duty_pct + fx_buffer_pct + fee_pct) + shipping ) × (1 + margin)
```

then **rounded to a clean price** (e.g. nearest $5 / charm-price $X9).

### Config values (placeholders — set ONLY once verified)

| Symbol          | Placeholder | Meaning                                              |
| --------------- | ----------- | ---------------------------------------------------- |
| `duty_pct`      | `0.25`      | Import duty as a fraction of landed goods value      |
| `fx_buffer_pct` | `0.04`      | Buffer against FX rate movement between quote & pay  |
| `fee_pct`       | `0.03`      | Payment / processing fees                            |
| `margin`        | `1.0`       | Platform markup multiplier (1.0 = 100% over cost)    |
| `shipping`      | `$25`       | Flat per-order cross-border shipping                 |
| `fx_rate`       | live        | home-currency → USD, pulled at quote time + buffered |

These are CONFIG, not hardcoded in the formula — one source of truth so a
verified duty rate or a margin change is a config edit, not a code change.

**Local vendors**: price in USD directly. NO landed markup, NO FX, NO duty. The
engine is bypassed entirely for `vendor_origin = 'local'`.

### Verify-BEFORE-build gates (all must clear before the lib is written)

1. **Exact duty rate** — real HTS classification for bridal garments by country
   of origin; the 0.25 placeholder is a guess. Wrong duty = we eat the loss or
   the buyer gets a customs bill.
2. **Cross-border payout rail** — Stripe cross-border / Wise access and the
   legal entity to receive + remit. Confirm we can actually pay overseas
   vendors and collect DDP.
3. **Legal / tax** — who is importer of record, sales-tax / VAT handling,
   de minimis thresholds. Needs counsel sign-off.
4. **FX source** — a reliable, rate-locked FX feed and how long a quote holds.

### Not in this slice

- No pricing lib, no FX fetch, no checkout wiring, no products-in-foreign-
  currency storage schema. Phase 1 only records the vendor's lane + currency so
  the catalog can be built; Phase 2 turns on selling.
- Buyer `/shop` flag gating and measurement libs are untouched.
