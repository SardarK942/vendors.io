> **Decisions FINALIZED:** the per-category decisions from this proposal are locked in [`2026-09-17-package-model-locked-decisions.md`](./2026-09-17-package-model-locked-decisions.md).

# Package Model — Per-Category Fit Audit & Phased Proposal

**Purpose:** Audit whether the single flat-scalar `packages` model actually fits all 15 vendor categories, and propose a phased path to per-category package shapes without a premature rewrite of the pricing/booking/payment core.

**Status:** draft-for-discussion (2026-09-15)

---

## Current model (verified)

### The single `packages` table

There is exactly **one** package table — `packages` (no `vendor_packages`, no `cart_vendors`). Every vendor in every category offers the same row shape.

Columns (from `supabase/migrations/00015_create_packages_and_addons.sql` + `supabase/migrations/00074_packages_capacity_unit_and_featured.sql`):

| Column             | Type / constraint                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `base_price_cents` | `integer NOT NULL CHECK (base_price_cents > 0)`                                                                                     |
| `max_guests`       | `integer NOT NULL CHECK (max_guests > 0)`                                                                                           |
| `capacity_unit`    | `text NOT NULL DEFAULT 'guests' CHECK (capacity_unit IN ('guests','servings'))` (added 00074)                                       |
| `duration_hours`   | `numeric(4,1) NOT NULL CHECK (duration_hours > 0)`                                                                                  |
| `events_count`     | `integer NOT NULL DEFAULT 1 CHECK (events_count BETWEEN 1 AND 5)`                                                                   |
| `included_items`   | `jsonb NOT NULL DEFAULT '[]'`                                                                                                       |
| `is_featured`      | `boolean NOT NULL DEFAULT false` (added 00074)                                                                                      |
| `location_mode`    | `text NOT NULL DEFAULT 'couple_provides' CHECK IN ('couple_provides','at_vendor')`                                                  |
| (also)             | `name`, `description`, `featured_image_url` (NOT NULL), `gallery_image_urls`, `vendor_notes_template`, `display_order`, `is_active` |

Add-ons live in a sibling table `package_addons` (`price_delta_cents integer NOT NULL`, no quantity column).

### The flat-scalar price trigger

Booking total is a DB trigger, **not** application code. From `supabase/migrations/00020_total_price_trigger_and_view.sql`:

```
sync_booking_total_price():
  total_price_cents =
      COALESCE(package_base_price_cents_snapshot, 0)
    + SUM(selected_addons[].price_delta_cents)
    + COALESCE(adjustment_amount_cents, 0)
```

The trigger fires `BEFORE INSERT OR UPDATE OF package_base_price_cents_snapshot, selected_addons, adjustment_amount_cents`. There is **no** multiplication by `max_guests`, `guest_count`, servings, hours, or any quantity. Price is a single scalar plus a flat add-on sum plus a signed adjustment.

### Deposit = flat 5% of that one scalar

`src/services/payment.service.ts` (`createDepositCheckout`): `depositAmount = Math.round(booking.total_price_cents * DEPOSIT_RATE)`, and `DEPOSIT_RATE = 0.05` (`src/lib/utils.ts`). Baazar retains 100% of that deposit; the 95% balance is off-platform. The deposit reads the one scalar — nothing per-unit.

### capacity_unit is display-only; guest_count is decoupled from money

`formatCapacity(value, unit)` in `src/types/index.ts` renders `"up to N guests"` / `"up to N servings"`. It is a string helper only — `capacity_unit` never enters any price/booking arithmetic. `guest_count` is captured on bookings (`src/services/booking.service.ts`, and `guest_count` on the custom-request insert) but the price trigger never references it. Capacity and money are fully decoupled.

### The one category special-case

The **only** category-conditional package behavior is cart detection. `isCartVendor(category, services)` (`src/lib/vendor/is-cart.ts`) returns true for `category === 'carts'` or `services` including `'carts'`. It drives a single prop — `capacityUnitEditable` — passed into `PackageEditorForm` (`src/app/dashboard/profile/packages/new/page.tsx` + `.../[id]/page.tsx`). When true, the vendor sees the guests-vs-servings unit selector; every other vendor is pinned to `'guests'` (`src/components/forms/PackageEditorForm.tsx`). No other category branches the package model.

### Custom-quote is a virtual tile, not a row

`appendCustomRequest()` (`src/lib/vendor-packages/with-custom-request.ts`) appends a synthetic `id: 'custom-request'` entry with every sizing/pricing field `null` and `is_custom: true`; it is never persisted. A quote-only booking (`src/app/api/bookings/custom-request/route.ts`) inserts `package_id: null`, `total_price_cents: 0`, `status: 'pending_quote'`. The whole price then arrives later as `adjustment_amount_cents`, which the trigger folds into the total (`0 + 0 + adjustment`). The quote path leans entirely on the flat scalar.

### Verification note — the 8 load-bearing claims

| #   | Claim                                                                                                         | Result                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Single `packages` table with the listed columns/constraints                                                   | **CONFIRMED**                                                                                                                  |
| 2   | `sync_booking_total_price` = snapshot + Σ addon deltas + adjustment, no quantity multiply                     | **CONFIRMED** — with naming correction: the snapshot column is `package_base_price_cents_snapshot` (not `base_price_snapshot`) |
| 3   | Deposit = `round(total_price_cents * 0.05)` flat                                                              | **CONFIRMED**                                                                                                                  |
| 4   | `capacity_unit`/`formatCapacity` display-only; `guest_count` captured but never priced                        | **CONFIRMED**                                                                                                                  |
| 5   | Only category special-case = `isCartVendor` → guests/servings selector                                        | **CONFIRMED**                                                                                                                  |
| 6   | Exactly 15 categories; 5 subcategory taxonomies (carts, photography, catering, hair_makeup[AND-match], decor) | **CONFIRMED**                                                                                                                  |
| 7   | venue, bridal_wear, decor, invitations = `comingSoon`                                                         | **CONFIRMED** (note: `gifts` is `comingSoon: false`)                                                                           |
| 8   | Custom-quote = virtual tile; quote booking `package_id=null`, total seeded 0, adjustment becomes whole price  | **CONFIRMED**                                                                                                                  |

All 8 confirmed. Only correction is the snapshot column name in claim 2 (`package_base_price_cents_snapshot`).

---

## The load-bearing constraint

**Price is a flat scalar with no quantity axis.** The entire money path — package `base_price_cents` → booking `total_price_cents` (trigger) → deposit (`× 0.05`) → price-band view — assumes one number per booking. There is nowhere to hang "per guest × N" or "per serving × N" without touching the trigger, the booking's quantity capture, the deposit math, and every price-display surface.

That is why this proposal is **phased**: anything that is display, labeling, or optionality can move now; true per-unit pricing is a gated rewrite of the core and must not be smuggled in alongside a UI change.

---

## Six archetypes

| #   | Archetype                | Categories                                                             | Fit verdict          | Fields it actually needs                                                                                                   |
| --- | ------------------------ | ---------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Time + deliverables      | photography, videography, content_creation, dj, live_music, photobooth | **Good**             | structured deliverables (edited photo count, reel count, hours of coverage, # shooters); `max_guests` is noise             |
| 2   | Per-person beauty/ritual | hair_makeup, mehndi                                                    | **Strained**         | per-person / per-look pricing; bride + extra-person rates; trial session; travel/on-site fee; mehndi bridal-vs-guest split |
| 3   | Per-head food            | catering, carts                                                        | **Misfit (pricing)** | per-guest / per-serving price + order minimums; `capacity_unit='servings'` half-admits this today                          |
| 4   | Space / rental           | venue                                                                  | **Misfit**           | per-day / per-slot pricing; hard capacity ceiling; inclusions list (tables, parking, in-house catering)                    |
| 5   | Goods / commerce         | bridal_wear, gifts, invitations                                        | **Misfit**           | per-item price; sizing; MOQ; buy-vs-rent; proofs/samples; appointment scheduling                                           |
| 6   | Hybrid                   | decor                                                                  | **Partial**          | turnkey package fits the scalar; à-la-carte rentals need per-item quantity + install/teardown fee                          |

---

## Per-category table (all 15)

| Category         | Archetype                | Current fit      | Fields it actually needs                                                           | Proposed phase                                      |
| ---------------- | ------------------------ | ---------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| photography      | Time + deliverables      | Good             | hours, # shooters, edited-photo count, deliverables list; drop `max_guests`        | Phase 1                                             |
| videography      | Time + deliverables      | Good             | hours, deliverables (highlight film, full-day edit), # shooters; drop `max_guests` | Phase 1                                             |
| content_creation | Time + deliverables      | Good             | hours, # reels/edits, turnaround; drop `max_guests`                                | Phase 1                                             |
| dj               | Time + deliverables      | Good             | hours, gear/lighting inclusions; drop `max_guests`                                 | Phase 1                                             |
| live_music       | Time + deliverables      | Good             | set length/hours, # performers, instrument type; drop `max_guests`                 | Phase 1                                             |
| photobooth       | Time + deliverables      | Good             | hours, prints/digital, backdrop/props; drop `max_guests`                           | Phase 1                                             |
| mehndi           | Per-person beauty/ritual | Strained         | bride vs guest-hand pricing, per-person, travel, trial                             | Phase 1 (attributes) → Phase 2 if per-person priced |
| hair_makeup      | Per-person beauty/ritual | Strained         | per-face/per-look, bride + party rates, trial, travel                              | Phase 1 (attributes) → Phase 2 if per-person priced |
| catering         | Per-head food            | Misfit (pricing) | per-guest price, menu tiers, minimums, staffing                                    | Phase 2 (true per-unit)                             |
| carts            | Per-head food            | Misfit (pricing) | per-serving price, servings count, minimums                                        | Phase 2 (true per-unit)                             |
| venue            | Space / rental           | Misfit           | per-day/slot, capacity ceiling, inclusions                                         | Phase 1 gating now (comingSoon) → space model later |
| decor            | Hybrid                   | Partial          | turnkey scalar OK; à-la-carte rentals need per-item qty + install                  | Phase 1 (attributes) → Phase 2 for rentals          |
| invitations      | Goods / commerce         | Misfit           | per-item, MOQ, proofs, print options                                               | Phase 3 (commerce/appointment)                      |
| bridal_wear      | Goods / commerce         | Misfit           | per-item, sizing, buy/rent, appointments                                           | Phase 3 (separate product model)                    |
| gifts            | Goods / commerce         | Misfit           | per-item, MOQ, customization                                                       | Phase 3 (commerce/appointment)                      |

---

## Phased proposal

### Phase 1 — now, no pricing-math change

Ship archetype-awareness without touching a single line of price arithmetic. Nothing here changes `total_price_cents`, the trigger, or the deposit.

- Make `max_guests` and `duration_hours` **nullable and archetype-gated** — the time+deliverables and goods archetypes stop being forced to invent a guest count / duration. (Requires a migration relaxing the two NOT NULL + CHECK constraints; existing rows keep their values.)
- Generalize `capacity_unit` → a `pricing_unit` **label** with a wider vocabulary: `flat`, `per_hour`, `per_person`, `per_guest`, `per_serving`, `per_item`, `per_day`. **Display-only first** — it labels the headline number, it does not multiply anything yet.
- Add a typed `attributes` jsonb column per package for archetype-specific structured fields (deliverables, # shooters, bride-vs-guest rate, buy/rent, etc.), validated per archetype in the editor.
- Derive `package_archetype` from the vendor's category to drive which editor fields render — generalizing the existing single `isCartVendor` branch into an archetype switch.

**Blast radius of Phase 1:** package editor + read models + display strings only. The money core is untouched by construction.

### Phase 2 — gated: true per-unit pricing (catering, carts)

Only once the product decision is made. This is the real rewrite:

`total = base + Σ(per_unit_price × quantity) + minimums + addons + adjustment`

Files that must change (do NOT touch these in Phase 1):

- `supabase/migrations/00020_total_price_trigger_and_view.sql` — the `sync_booking_total_price` trigger must learn quantity × unit price and minimums.
- `src/services/booking.service.ts` — capture and snapshot the priced quantity (guests/servings) at booking creation.
- `src/services/payment.service.ts` — deposit still `× 0.05`, but of a now-quantity-derived total; verify rounding.
- `vendor_packages_price_band` view (in 00020) — the "from $X" band must reflect per-unit × minimum, not just `base_price_cents`.
- Price-display surfaces: `PackageGrid`, `VendorCard`, `BookingStickyCard` — show "$X / guest" and compute live subtotals.

### Phase 3 — separate product model (bridal_wear, then gifts, invitations)

Goods/commerce does not fit package machinery at all (see deep-dive). Model it as its own product/appointment entity rather than bending `packages`.

---

## Bridal-wear deep-dive

Bridal wear breaks every package assumption: there is no "duration," no "guest count," the unit is a garment, the transaction may be a rental or a sale, sizing/alterations matter, and discovery is an in-person appointment, not an instant booking. Forcing it into `packages` (NOT NULL `base_price_cents`, `max_guests`, `duration_hours`) produces nonsense rows.

Two v1 options — **left OPEN for the user**:

- **(a) Appointment-request-only** — no product catalog. Reuse the existing quote + calendar rails: a bridal_wear "booking" is an appointment request (like custom-quote's `package_id=null` path), price negotiated off-platform or via adjustment. Lowest build cost; leans on machinery that already exists.
- **(b) Product catalog** — real garment records with sizing, buy-vs-rent, image galleries, proofs, and appointment scheduling. A genuine new product model; largest build.

`bridal_wear` is `comingSoon: true`, so there is time to decide before it ships.

---

## Blast-radius checklist

Assumptions any redesign must respect or explicitly break (each is load-bearing today):

1. **Flat-scalar trigger** — `sync_booking_total_price` does snapshot + addon sum + adjustment, no multiply (`supabase/migrations/00020_...sql`).
2. **Single `base_price_cents`** — one required positive scalar per package (`supabase/migrations/00015_...sql`).
3. **One package = one booking** — a booking references at most one `package_id` (nullable for quotes); no line-item/basket model.
4. **Deposit = 5% of one total** — `Math.round(total_price_cents * DEPOSIT_RATE)` (`src/services/payment.service.ts`, `src/lib/utils.ts`).
5. **`events_count` is the only multiplicity** — `CHECK BETWEEN 1 AND 5` for multi-day bundles; it does not multiply price (`00015`).
6. **Capacity / guest_count decoupled from money** — `formatCapacity` is display-only; the trigger ignores `guest_count`/`capacity_unit` (`src/types/index.ts`, `00020`).
7. **Adjustment is a signed delta; the couple counter is absolute-on-accept** — `adjustment_amount_cents` folds into the trigger sum; the quote/counter flow writes this one field (`src/services/booking.service.ts`, `00020`).
8. **Add-ons are flat, no quantity** — `package_addons.price_delta_cents` with no qty column; snapshotted into `selected_addons` jsonb (`00015`, `00020`).
9. **Quote-only path leans on the scalar** — `package_id=null`, `total_price_cents=0` seed, whole price arrives as adjustment (`src/app/api/bookings/custom-request/route.ts`, `src/lib/vendor-packages/with-custom-request.ts`).

---

## Open questions (for the user)

1. **Per-unit food pricing — now or display-only?** Do catering/carts get true per-guest/per-serving math (Phase 2 rewrite) now, or do we ship the `pricing_unit` label as display-only (Phase 1) and defer the arithmetic?
2. **Bridal v1 — (a) or (b)?** Appointment-request-only reusing quote/calendar rails, vs. a full product catalog with sizing/buy-rent/appointments.
3. **Goods in scope or parked?** Are gifts/invitations in scope for a commerce model, or parked behind bridal_wear?
4. **Venue — space-listing or capacity-capped package?** Model venue as its own space listing (per-day/slot + capacity ceiling) or stretch the package model with a hard capacity cap?

---

## Timing note

`venue`, `bridal_wear`, `decor`, `invitations` are `comingSoon: true` (`src/lib/vendor-categories/featured.ts`) — they can be designed before they ship, so their misfit is not yet live. The **live** gap today is:

- **carts** — servings are priced display-only (`capacity_unit='servings'` labels the line, but the booking total is still the flat `base_price_cents`; there is no per-serving math), and
- the **`max_guests` / `duration_hours` NOT NULL friction** on non-time categories (mehndi, hair_makeup, gifts) that must invent a guest count and a duration to save a package.

These two are the concrete Phase-1 wins.
