# Sub-project A: Packages + Booking Model — Design Spec

- **Date**: 2026-05-11
- **Branch**: `feat/sub-project-a-packages`
- **Status**: Pending user review
- **Origin**: Sub-project A of post-launch-prep decomposition (see `docs/phases.md`)

---

## 0. Executive summary

Replace the current `budget_min/max → vendor quote` booking flow with a **package-driven** flow.

A vendor declares 1..N packages (each with a base price, included items, max_guests, duration, photos, optional add-ons, and optional `vendor_notes_template`). Couples browse a vendor's packages in a photo-forward grid, select one + toggle add-ons, fill a multi-event booking (1..N events under one booking — natively supporting Desi multi-day weddings: Mehndi → Shaadi → Walima), and submit. The vendor either **accepts at base** or sends an **adjusted quote with a structured reason** (chip + optional explanation). The couple accepts or declines; declined quotes return to the vendor for a re-quote with a 72h timer. Deposit (30% of total) flows through existing Stripe Connect pivot logic.

This is foundational for downstream sub-projects (vendor onboarding wizard, couple dashboard rebuild, vendor CRM, search filters, calendar, etc.). It changes the schema for `booking_requests` (renamed to `bookings`) and `vendor_profiles`, adds three new tables, and reshapes the booking lifecycle.

Implementation is **phased** (A1 schema → A2 vendor + A3 couple + A4 payment/emails in parallel → A5 cleanup) under one umbrella branch `feat/sub-project-a-packages`. After A1 lands, A2/A3/A4 can be dispatched to parallel agents in worktrees.

---

## 1. Scope & success criteria

### In scope

- **Schema**: new tables `packages`, `package_addons`, `booking_events`; rename `booking_requests → bookings`; new columns + status values; new `vendor_profiles.base_address_*` columns.
- **Vendor surface**: package editor at `/dashboard/profile/packages` (CRUD), vendor adjustment-quote response, onboarding gate (≥1 active package required to appear in search), `base_address` + visibility toggle in profile setup.
- **Couple surface**: photo-forward package grid (Layout C) on vendor profile, package detail modal with add-on toggles, multi-event booking form with Google Places Autocomplete, adjustment-review page.
- **Booking lifecycle**: new statuses `accepted`, `adjusted_quote_sent`, `adjusted_quote_declined`; unlimited negotiation rounds with 72h auto-expiry per transition.
- **Payment**: deposit checkout reads `bookings.total_price_cents` (denormalized, kept in sync by DB trigger). Existing 30% deposit / 70% vendor payout retained.
- **Emails**: updated and new templates for the new state machine.

### Out of scope (other sub-projects)

| Concern | Sub-project |
|---|---|
| Calendar / availability / double-booking | G |
| Cash-only vendor payment | C |
| Multi-business per vendor account | I |
| In-app notification center | F |
| Couple dashboard event-based rebuild | D |
| Vendor dashboard CRM redesign | E |
| Advanced search filters beyond city | H |
| Homepage polish + animations | J |
| Playwright vendor scraper | K |
| AI invitation cards, anonymous chat, boosted posts, new categories | Parking lot |

### Defaults that stay unchanged

- Stripe deposit % (30%)
- Cancellation / refund policy (Phase D)
- Reviews flow (Phase D)
- Dispute flow (Phase D)
- Stripe Connect deferred onboarding (Stripe pivot)
- Webhook security model (Phase A)

### Acceptance criteria

A new vendor signs up → defines 3 packages (including one with `events_count=3` for a Desi multi-day bundle) with photos, add-ons, and `vendor_notes_template` → goes live. A couple browses the vendor → opens a package detail modal → toggles 2 add-ons → submits a 3-event booking (Mehndi at home / Shaadi at hotel / Walima at hotel) with Google Places venues. The vendor either accepts at base or sends an adjusted quote with a reason chip. The couple accepts the final quote → pays deposit via Stripe → vendor's full address and `vendor_notes` become visible. Lint, build, and existing tests pass; new tests cover the package + adjustment flow end-to-end.

---

## 2. Data model

### 2.1 New tables

#### `packages`

```sql
CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  base_price_cents integer NOT NULL CHECK (base_price_cents > 0),
  included_items jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of strings
  max_guests integer NOT NULL CHECK (max_guests > 0),
  duration_hours numeric(4,1) NOT NULL CHECK (duration_hours > 0),
  events_count integer NOT NULL DEFAULT 1 CHECK (events_count BETWEEN 1 AND 5),
  featured_image_url text NOT NULL,
  gallery_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of URLs, max 2
  vendor_notes_template text,  -- ≤ 1000 chars (UX-enforced; not DB-constrained)
  location_mode text NOT NULL DEFAULT 'couple_provides'
    CHECK (location_mode IN ('couple_provides', 'at_vendor')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX packages_vendor_active_idx ON packages(vendor_profile_id, is_active);
```

#### `package_addons`

```sql
CREATE TABLE package_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta_cents integer NOT NULL,  -- positive or negative (discount)
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX package_addons_package_idx ON package_addons(package_id);
```

#### `booking_events`

```sql
CREATE TABLE booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 1),
  event_date date NOT NULL,
  event_start_time timestamptz NOT NULL,
  event_end_time timestamptz NOT NULL,
  event_type_label text NOT NULL,  -- free-text from autocomplete or custom
  location_name text,              -- optional ("The Drake Hotel" or null for makeup-at-home)
  address_line_1 text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  google_place_id text,
  guest_count_override integer,    -- nullable; falls back to bookings.guest_count
  location_overridden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_end_time > event_start_time),
  UNIQUE (booking_id, sequence)
);

CREATE INDEX booking_events_booking_idx ON booking_events(booking_id);
CREATE INDEX booking_events_city_idx ON booking_events(city);  -- for future location filters
```

### 2.2 Table rename + column changes on `bookings`

```sql
ALTER TABLE booking_requests RENAME TO bookings;
-- Also rename indexes, RLS policies, triggers that reference the old name.

ALTER TABLE bookings ADD COLUMN package_id uuid REFERENCES packages(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN package_name_snapshot text;
ALTER TABLE bookings ADD COLUMN package_base_price_cents_snapshot integer;
-- ON DELETE SET NULL lets a vendor hard-delete a package whose only bookings
-- are historical (completed/cancelled). The snapshot fields keep displayable
-- info on those bookings. Active bookings still block hard delete (enforced
-- in application layer; see §3.1 + §8.1).
ALTER TABLE bookings ADD COLUMN selected_addons jsonb NOT NULL DEFAULT '[]'::jsonb;
-- jsonb entries: {addon_id: uuid, name: text, price_delta_cents: int}
ALTER TABLE bookings ADD COLUMN adjustment_amount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN adjustment_reason text
  CHECK (adjustment_reason IN
    ('travel','guest_count','peak_date','custom','setup_complexity','discount','other'));
ALTER TABLE bookings ADD COLUMN adjustment_explanation text;
ALTER TABLE bookings ADD COLUMN vendor_notes text;
ALTER TABLE bookings ADD COLUMN total_price_cents integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN negotiation_round_count integer NOT NULL DEFAULT 0;

-- NOTE: total_price_positive constraint is deferred to A5 cleanup migration.
-- In A1, existing bookings rows have total_price_cents=0 (trigger fires only when
-- new snapshot columns are updated; old code paths populate vendor_quote_amount,
-- not the new fields). Adding > 0 in A1 would fail on existing rows. A5 backfills
-- those rows and then adds the constraint.

ALTER TABLE bookings ADD CONSTRAINT adjustment_explanation_when_other
  CHECK (adjustment_reason IS DISTINCT FROM 'other' OR adjustment_explanation IS NOT NULL);

-- Add new status values (don't drop 'quoted' yet — that's A5 cleanup)
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'adjusted_quote_sent';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'adjusted_quote_declined';
```

Columns that **stay until A5 cleanup** (do not drop in A1): `event_date`, `event_type`, `budget_min_cents`, `budget_max_cents`, `vendor_quote_amount`, `deposit_amount`. Old code paths keep functioning during A2–A4 development.

### 2.3 Column changes on `vendor_profiles`

```sql
ALTER TABLE vendor_profiles ADD COLUMN base_address_line_1 text;
ALTER TABLE vendor_profiles ADD COLUMN base_city text;
ALTER TABLE vendor_profiles ADD COLUMN base_state text;
ALTER TABLE vendor_profiles ADD COLUMN base_postal_code text;
ALTER TABLE vendor_profiles ADD COLUMN base_google_place_id text;
ALTER TABLE vendor_profiles ADD COLUMN base_address_public boolean NOT NULL DEFAULT false;
-- base_address_* is required only when vendor has any package with location_mode='at_vendor'
-- (enforced in application layer, not DB constraint)

-- price_min, price_max stay until A5 cleanup
```

### 2.4 Computed view: vendor pricing band

```sql
CREATE OR REPLACE VIEW vendor_packages_price_band AS
SELECT
  vendor_profile_id,
  MIN(base_price_cents) AS min_price_cents,
  MAX(base_price_cents) AS max_price_cents,
  COUNT(*)              AS active_package_count
FROM packages
WHERE is_active = true
GROUP BY vendor_profile_id;
```

Used in vendor profile and search results to display "From $X" or "$X–$Y" band. Replaces the manual `vendor_profiles.price_min`/`price_max` (those are dropped in A5).

### 2.5 Trigger: keep `total_price_cents` synced

```sql
CREATE OR REPLACE FUNCTION sync_booking_total_price() RETURNS TRIGGER AS $$
DECLARE
  addons_sum integer;
BEGIN
  SELECT COALESCE(SUM((addon->>'price_delta_cents')::integer), 0)
  INTO addons_sum
  FROM jsonb_array_elements(NEW.selected_addons) AS addon;

  NEW.total_price_cents :=
    COALESCE(NEW.package_base_price_cents_snapshot, 0)
    + addons_sum
    + COALESCE(NEW.adjustment_amount_cents, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_booking_total_price_trigger
  BEFORE INSERT OR UPDATE OF
    package_base_price_cents_snapshot, selected_addons, adjustment_amount_cents
  ON bookings
  FOR EACH ROW EXECUTE FUNCTION sync_booking_total_price();
```

### 2.6 RLS policies

```sql
-- packages
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage own packages" ON packages
  FOR ALL TO authenticated
  USING (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()))
  WITH CHECK (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Anyone views active packages" ON packages
  FOR SELECT TO public
  USING (is_active = true);

-- package_addons
ALTER TABLE package_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage own package addons" ON package_addons
  FOR ALL TO authenticated
  USING (package_id IN (
    SELECT id FROM packages WHERE vendor_profile_id IN
      (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  ));

CREATE POLICY "Anyone views addons of active packages" ON package_addons
  FOR SELECT TO public
  USING (package_id IN (SELECT id FROM packages WHERE is_active = true));

-- booking_events (mirrors parent bookings access)
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple sees own booking events" ON booking_events
  FOR SELECT TO authenticated
  USING (booking_id IN (SELECT id FROM bookings WHERE couple_user_id = auth.uid()));

CREATE POLICY "Vendor sees their booking events" ON booking_events
  FOR SELECT TO authenticated
  USING (booking_id IN (
    SELECT b.id FROM bookings b
    JOIN vendor_profiles vp ON vp.id = b.vendor_profile_id
    WHERE vp.user_id = auth.uid()
  ));

CREATE POLICY "Couple inserts booking events on own bookings" ON booking_events
  FOR INSERT TO authenticated
  WITH CHECK (booking_id IN (SELECT id FROM bookings WHERE couple_user_id = auth.uid()));

-- booking_events are immutable after creation (snapshot semantics).
-- No UPDATE/DELETE policies needed; vendor or couple cannot edit post-creation.
```

### 2.7 Address visibility logic

Vendor's full `base_address_line_1`, `base_postal_code`, `base_google_place_id` are revealed to a couple only when:

1. `vendor_profiles.base_address_public = true` (always-public mode), OR
2. The couple has a `booking` referencing this vendor where `status = 'deposit_paid'` (or any later status).

`base_city` and `base_state` are always publicly readable. The application layer (`getVendorProfileForCouple()`) enforces this masking — the DB returns full columns, the service redacts in code.

---

## 3. Vendor-side surfaces

### 3.1 Package editor

**Route**: `/dashboard/profile/packages` (dedicated page, sibling of `/dashboard/profile`).

**Layout**:
- Header: "Your packages" + "Add Package" button.
- List of existing packages as cards (drag handles → reorders `display_order`). Each card shows featured image, name, base price, `is_active` toggle, edit/delete icons.
- Empty state: "Add your first package to go live. Couples can only book vendors with at least one active package."

**Package edit form** (modal OR `/dashboard/profile/packages/[id]` page — implementation choice in A2):

Required fields: `name`, `description`, `base_price_cents` (entered as dollars), `max_guests`, `duration_hours`, `featured_image_url`.
Optional fields: `events_count` (default 1; stepper 1–5), `included_items` (chip-list input), `gallery_image_urls` (0–2 additional), `vendor_notes_template` (textarea ≤1000 chars), `location_mode` (toggle: "Couple specifies" / "At my location"), add-ons (inline list editor: name + `$` delta, ±, max 8 per UX).

Image picker for `featured_image_url`: lets vendor pick from existing portfolio URLs OR upload fresh via existing UploadThing flow.

Submit → API call (see §8), redirect to list, revalidate.

**Package deletion rules** (enforced in API and surfaced in UI):

| Operation | Allowed when |
|---|---|
| **Deactivate** (`is_active=false`) | Vendor would still have **≥1 other active package** after the operation. Otherwise blocked. |
| **Hard delete** (permanent removal) | (a) Package has **no active bookings** (statuses `pending`, `accepted`, `adjusted_quote_sent`, `adjusted_quote_declined`, `deposit_paid`), AND (b) vendor would still have **≥1 other active package** after the operation. Only historical bookings (`completed`, `cancelled`) are allowed to reference a hard-deleted package — the FK on `bookings.package_id` switches to NULL on delete; the snapshot fields (`package_name_snapshot`, `package_base_price_cents_snapshot`, `selected_addons`) keep those bookings displayable. |

UI guidance in the editor when a delete/deactivate is blocked:
- *"This is your last active package. Vendors must have at least one active package to stay live in search. Add another package first, or pause your profile in settings."*
- *"This package has active bookings. Deactivate it instead — it'll be hidden from new couples but stay in place for current ones."*

Vendors who want to **go dark temporarily** (e.g. on vacation) use the **profile-level pause toggle** (see §3.3), not package deactivation.

### 3.2 Adjustment quote response

**Location**: vendor's bookings page action card for each `status='pending'` booking.

Two CTAs visible per pending booking:
- **"Accept at $X"** — where `$X = package_base_price_cents_snapshot + sum(selected_addons[].price_delta_cents)`. Click → `POST /api/bookings/[id]/accept`. Status → `accepted`. Couple receives email with deposit link. `expires_at` resets to `NOW() + 72h` so couple has 72h to pay.
- **"Adjust quote"** — opens form: numeric input for `new_total` (default = current total), reason dropdown (7 chips), `explanation` textarea (required when `reason = 'other'`). Submit → `POST /api/bookings/[id]/adjust`. Status → `adjusted_quote_sent`. `negotiation_round_count += 1`. `expires_at` resets.

**Re-quote flow**: when status is `adjusted_quote_declined` (couple just declined the previous adjustment), vendor's bookings page shows a single CTA: "Send revised quote" (opens the same adjustment form). Same `POST /api/bookings/[id]/adjust` endpoint. Status flips back to `adjusted_quote_sent`. Couple notified.

### 3.3 Onboarding gate + profile pause toggle

**Two separate flags govern vendor search visibility:**

1. **`vendor_profiles.is_active`** (existing column) — vendor-controlled pause toggle. Defaults `true`. Vendor flips to `false` to go dark temporarily (e.g. vacation, family event, capacity). Packages remain intact and editable; profile just doesn't appear in search.
2. **Derived: `count(active_packages) >= 1`** — onboarding gate. Vendor cannot save `vendor_profiles.is_active=true` while they have zero active packages.

**Search-visibility query** (used in `/vendors` listing + slug page):

```sql
WHERE vendor_profiles.is_active = true
  AND EXISTS (SELECT 1 FROM packages
              WHERE packages.vendor_profile_id = vendor_profiles.id
                AND packages.is_active = true)
```

**Vendor dashboard surfaces:**
- When `count(active_packages) = 0`: prominent CTA **"Add your first package to go live."** Other dashboard areas remain functional; only the search-visibility flag is gated.
- When `count(active_packages) >= 1` AND `is_active=false`: yellow banner **"Your profile is paused. You won't appear in search until you toggle it back on."** with a one-click resume CTA.
- Profile settings page: clear toggle for "Pause profile from search" with help copy: *"Your packages stay defined. Toggle off when you're ready to receive new bookings again."*

The full onboarding wizard (welcome → packages → Stripe path) is **Sub-project B**. A1–A4 only adds the gate + pause toggle, not the wizard.

### 3.4 Profile setup: base address + visibility

Vendor profile setup form (existing `VendorProfileForm` component) gains:

- **Base address** — Google Places Autocomplete input. Stores `base_address_line_1`, `base_city`, `base_state`, `base_postal_code`, `base_google_place_id`. Optional UNLESS vendor has packages with `location_mode='at_vendor'` (enforced application-side at save time).
- **Visibility toggle**: `base_address_public` (bool, default `false`). Help text: *"Most home-studio vendors keep this off — your full address is then only shared with couples who pay the deposit. Your city and state are always public."*

---

## 4. Couple-side surfaces

### 4.1 Vendor profile page

**Route**: `/vendors/[slug]` (existing).

Existing layout retained. Replace the old "Pricing range" UI block with **"Packages"** section in photo-forward grid (Layout C):

- Grid: 3 columns desktop, 2 columns tablet, 1 column mobile.
- Package card: featured image (~160px tall), name, summary line ("X hrs · up to Y guests · N events"), base price, "Select →" CTA.
- Card click → **modal** with: full description, `included_items` rendered as bulleted list, **add-on toggles** (checkbox + name + `$` delta; live total updates as toggled), gallery images, `vendor_notes_template` preview labeled *"After booking, vendor will send:"*.
- Modal footer: "Continue to booking" button (disabled until package state is valid; always valid for any selected package, add-ons optional).
- Selection handoff to booking form: **signed cookie** (server-side; expires in 30 min). Payload: `{package_id, selected_addons: [{addon_id, name, price_delta_cents}]}`.

### 4.2 Booking form

**Route**: `/vendors/[slug]/book`.

Single-page form with sections (NOT multi-step wizard):

1. **Section 1 — Package summary** (read-only): selected package name, photo, summary, selected add-ons with `$` deltas, calculated subtotal. Small "Edit selection" link → returns to vendor profile modal (preserves cookie).
2. **Section 2 — Events** (1..N rows, capped at `package.events_count`):
   - Defaults to 1 event row.
   - Fields per row: `event_date` (date picker), `event_start_time`, `event_end_time` (time pickers; computed timestamps with the date), `event_type_label` (autocomplete from seed list with free-text fallback), Location (per `package.location_mode`; see §4.3), optional `guest_count_override` (number).
   - "Add another event" button visible when `current_rows < package.events_count`.
   - For event 2..N: small **"Same as Event 1"** button next to the location input → one-click copies location_name + address_line_1 + city + state + postal_code + google_place_id from Event 1.
3. **Section 3 — Couple details**: `couple_full_name`, `couple_contact_phone`, total `guest_count` (default 50), `special_requests` (textarea).
4. **Section 4 — Sticky price panel** (right side desktop, bottom mobile): package base + each toggled add-on as a line item + estimated total. Footnote: *"Vendor may adjust the final price before deposit."*

Submit → `POST /api/bookings` → status `pending` → emails fire → redirect to booking detail.

### 4.3 Location handling per `location_mode`

For each event row in the booking form:

| `package.location_mode` | UI |
|---|---|
| `couple_provides` (default) | Google Places Autocomplete (label: *"Where will this event take place?"*) + optional `location_name` field below. |
| `at_vendor` | Pre-fills with vendor's base address visualized as: *"✓ Service at [Studio Name (if provided) + base_city, base_state]"*. Small link: **"Different location for this event"** → expands the Google Places input. Setting it flips `location_overridden = true`. Note: pre-deposit, couple sees only city+state (per visibility); full address appears in booking detail after deposit. |

### 4.4 Adjustment review

When the couple's booking is in `status='adjusted_quote_sent'`, the booking detail page shows:

- **Side-by-side**: original (`package_base + addons`) vs. adjusted (`+/- adjustment_amount`). Delta highlighted in green (discount) or red (increase).
- Reason chip (e.g. "Travel — distance"); if `reason='other'`, the `adjustment_explanation` text shown.
- Two CTAs: **"Accept adjusted quote"** → `POST /api/bookings/[id]/accept-adjusted` → status `accepted` → deposit checkout. **"Decline"** → `POST /api/bookings/[id]/decline-adjusted` → status `adjusted_quote_declined` → vendor notified, 72h to re-quote.

### 4.5 Pending / accepted / deposit_paid detail

- `pending`: shows package + add-ons summary, events list, "Waiting for vendor response (vendor has 72h)."
- `accepted`: shows package + add-ons summary, events list, "Pay deposit to confirm" CTA (Stripe checkout URL).
- `deposit_paid`: shows everything above plus vendor's full address (revealed at this milestone) and `vendor_notes` (filled from `vendor_notes_template` on accept; vendor can override).

---

## 5. Payment, adjustments, emails

### 5.1 Pricing model

`bookings.total_price_cents` is derived (in DB trigger) as:

```
total_price_cents
  = package_base_price_cents_snapshot
  + sum(selected_addons[].price_delta_cents)
  + adjustment_amount_cents
```

Constraints: `total_price_cents > 0` (check constraint blocks zero-priced bookings; for free promotional bookings, use a separate workflow — out of scope for v1).

Snapshot semantics: `package_base_price_cents_snapshot` is frozen at booking creation. `selected_addons` is a jsonb snapshot of `{addon_id, name, price_delta_cents}` per chosen add-on. Vendor renames/repricing of the source package or add-ons after the booking is created have **no effect** on this booking.

### 5.2 State machine

```
pending ──┬── accepted ──── deposit_paid ──── completed
          │
          └── adjusted_quote_sent ──┬── deposit_paid ──── completed
                    ▲                │
                    │                └── adjusted_quote_declined ──┐
                    │                                              │
                    └────────── (vendor re-quote) ─────────────────┤
                                                                   │
                                                        (72h timer) ── cancelled
```

- Every status transition: `expires_at = NOW() + 72h`.
- Existing `/api/cron/tick` extended: cancel bookings in (`pending`, `adjusted_quote_sent`, `adjusted_quote_declined`) where `expires_at < NOW()`.
- `negotiation_round_count` increments on each `adjusted_quote_sent` (use for observability; no v1 cap).
- Either party can `cancelled` at any time before `deposit_paid` (refund logic = Phase D, unchanged).

### 5.3 Stripe integration

- On `accepted` OR couple accepts `adjusted_quote_sent`: `createDepositCheckout(booking_id)` → generates Stripe Checkout URL with `amount = total_price_cents * 0.30`, sends via email + shows on couple's booking detail.
- Existing platform fee (30%) and vendor payout (70% of `total_price_cents`) — same Stripe pivot flow, just uses `total_price_cents` instead of `vendor_quote_amount`.
- Webhook (`/api/webhooks/stripe`): on `payment_intent.succeeded`, status → `deposit_paid`. Existing handler logic unchanged except for field name lookup.

### 5.4 Email triggers

All emails sent via `src/lib/email/resend.ts`. **NEW** functions added; existing functions updated as noted.

| Trigger | Recipient | Function | Status |
|---|---|---|---|
| Booking submitted (couple) | Vendor | `sendBookingRequestEmail` (updated: drops budget mention, includes package name + add-ons) | Existing |
| Booking submitted (couple) | Couple | `sendBookingReceiptEmail` (new) | New |
| Vendor accepts at base | Couple | `sendVendorAcceptedEmail` (new) | New |
| Vendor sends adjusted quote | Couple | `sendAdjustedQuoteEmail` (new) | New |
| Couple accepts adjusted quote | Vendor | `sendCoupleAcceptedAdjustedEmail` (new) | New |
| Couple declines adjusted quote | Vendor | `sendCoupleDeclinedEmail` (new) | New |
| Deposit paid | Vendor | `sendDepositConfirmationEmail` (updated: includes couple_contact reveal) | Existing |
| Deposit paid | Couple | `sendBookingConfirmedEmail` (new — includes vendor's full address since address now reveals here, plus `vendor_notes`) | New |
| 72h auto-cancel | Both | `sendBookingAutoCancelEmail` (new) | New |
| Event completion, funds released, review request | both | `sendCompletionEmails` (existing — minor copy update) | Existing |
| Cancellation | both | `sendCancellationEmail` (existing) | Existing |

**Important**: per the email P0 root-cause investigation, all email failures are currently swallowed by `console.error` in `sendEmail()`. While Sub-project F (notifications) is the dedicated fix, A4 should at minimum promote those `console.error` calls to `logger.error` so Sentry captures email send failures during the new flow.

---

## 6. Phasing & parallel-agent plan

### Phase A1 — Schema migrations + type regen (sequential, ~1–2 hours)

Single PR into `feat/sub-project-a-packages` umbrella.

- New migrations (one per topic for review clarity):
  - `00015_create_packages_and_addons.sql`
  - `00016_create_booking_events.sql`
  - `00017_rename_booking_requests_to_bookings.sql`
  - `00018_add_booking_columns_and_statuses.sql`
  - `00019_add_vendor_base_address.sql`
  - `00020_total_price_trigger_and_view.sql`
  - `00021_rls_packages_addons_booking_events.sql`
- Apply each migration to dev Supabase project (existing pattern: SQL editor, manual apply per `docs/runbook.md`).
- Regenerate TypeScript types: `npm run db:types` (or equivalent existing script).
- Old columns retained (drop in A5). Old code paths still work — important because A2/A3/A4 will live alongside.
- CI: lint + build + existing tests pass.

**Exit criteria**: schema applied to dev project, types regenerated, `npm run build` passes, existing E2E tests still pass.

### Phase A2 — Vendor side (parallel agent, ~3–4 days unattended)

Worktree: `a2/vendor-side` off umbrella. PR into umbrella when done.

- Package editor page `/dashboard/profile/packages` (list + edit form, see §3.1)
- API routes: `POST/PATCH/DELETE /api/packages`, `POST/PATCH/DELETE /api/packages/[id]/addons`, route handlers (see §8)
- Vendor adjustment-quote response UI on bookings list (see §3.2)
- Onboarding gate: `vendor_profiles.is_active` toggling logic + dashboard CTA when `count(active_packages)=0`
- Profile setup: base_address Google Places + visibility toggle (see §3.4)
- Update `VendorProfileForm` accordingly
- Tests: package CRUD, addon CRUD, adjustment endpoint

### Phase A3 — Couple side (parallel agent, ~3–4 days unattended)

Worktree: `a3/couple-side` off umbrella. PR into umbrella when done.

- Vendor profile `/vendors/[slug]`: photo-forward package grid (Layout C), package detail modal with add-on toggles (see §4.1)
- Booking form `/vendors/[slug]/book`: single-page sections, multi-event support, Google Places Autocomplete, "Same as Event 1" button, event_type autocomplete (see §4.2–§4.3)
- Couple booking detail page: status-aware rendering (pending / adjusted_quote_sent / accepted / deposit_paid / completed views, see §4.4–§4.5)
- Adjustment review page (see §4.4)
- Tests: end-to-end booking flow with package + add-ons + 3 events

### Phase A4 — Payment, emails (parallel agent, ~2 days unattended)

Worktree: `a4/payment-emails` off umbrella. PR into umbrella when done.

- `createDepositCheckout` updated to read `bookings.total_price_cents`
- Stripe webhook updated for new statuses (`accepted`, `adjusted_quote_sent`, `adjusted_quote_declined`) — mostly no-op pass-through; only `deposit_paid` triggers payment side effects
- New email functions in `src/lib/email/resend.ts`: `sendBookingReceiptEmail`, `sendVendorAcceptedEmail`, `sendAdjustedQuoteEmail`, `sendCoupleAcceptedAdjustedEmail`, `sendCoupleDeclinedEmail`, `sendBookingConfirmedEmail`, `sendBookingAutoCancelEmail` (see §5.4)
- Update existing: `sendBookingRequestEmail`, `sendDepositConfirmationEmail`, `sendCompletionEmails`, `sendCancellationEmail`
- Promote email failures from `console.error` to `logger.error` for Sentry capture
- `/api/cron/tick`: extend sweep to cover new statuses
- Tests: email content snapshot, deposit checkout creation, webhook → deposit_paid transition

### Phase A5 — Cleanup (sequential, ~0.5 day supervised)

- **Backfill `total_price_cents` for legacy rows**: `UPDATE bookings SET total_price_cents = COALESCE(vendor_quote_amount, 100) WHERE total_price_cents = 0;` (or purge test-data rows that have no clean derivation). Delete any rows the backfill can't rescue.
- **Add `total_price_positive` constraint**: `ALTER TABLE bookings ADD CONSTRAINT total_price_positive CHECK (total_price_cents > 0);` — only after backfill confirms no zero rows remain.
- Drop unused columns from `bookings`: `event_date`, `event_type`, `budget_min_cents`, `budget_max_cents`, `vendor_quote_amount`, `deposit_amount`
- Drop `vendor_profiles.price_min`, `vendor_profiles.price_max`
- Drop `event_type` enum type if no other tables use it
- Drop old `quoted` status value if unused (Postgres doesn't allow direct enum value removal — may require recreating the type with `ALTER TYPE ... RENAME` + a new enum then a column swap; decide during A5)
- Final RLS audit
- End-to-end smoke test in dev (one full vendor + couple multi-event booking)
- Umbrella PR → main

### Parallel fan-out plan

After A1 lands on `feat/sub-project-a-packages`:

```
feat/sub-project-a-packages (umbrella, contains A1 schema)
├── a2/vendor-side  (worktree, Agent X)
├── a3/couple-side  (worktree, Agent Y)
└── a4/payment-emails (worktree, Agent Z)
```

Each agent:
- Has its own worktree (existing pattern from email P0 / bug-sweep agents)
- Reads this spec + the implementation plan (writing-plans output)
- Codes to the API contracts pinned in §8
- Commits + tests in its worktree branch
- When done: opens PR into umbrella

Light coupling: all three reference §8 API contracts. As long as those contracts are accurate, agents don't step on each other.

After all three umbrella PRs merge: A5 cleanup runs supervised (it touches all surfaces).

---

## 7. Defaults locked

| Area | Default | Source |
|---|---|---|
| Package model | B-plus (lightly bounded + add-ons) | Q3 |
| Multi-day model | 1 booking → 1..N booking_events | Q5 |
| Photo-forward layout | Grid (Layout C) | Visual companion |
| Implementation approach | Phased ship (A1 → A2/A3/A4 parallel → A5) | Approach 3 |
| Add-on storage | jsonb snapshot in `bookings.selected_addons` | Section 2 callout |
| Table rename | `booking_requests → bookings` | Section 2 callout |
| `event_type_broad_category` | Dropped (compute in code) | Section 2 callout |
| Package editor placement | Dedicated `/dashboard/profile/packages` page | Section 3 callout |
| Adjustment reasons enum | 7 chips: travel / guest_count / peak_date / custom / setup_complexity / discount / other | Section 3 callout |
| Onboarding gate | Block from search until ≥1 active package | Section 3 callout |
| Booking form shape | Single-page with sections | Section 4 default |
| Package detail interaction | Modal | Section 4 default |
| Selection handoff | Signed cookie | Section 4 default |
| Decline ping-pong | Unlimited rounds, 72h timer reset on each transition | Q-decline |
| Location handling | Per-package `location_mode` (`couple_provides` / `at_vendor`); `location_name` optional; "Same as Event 1" button | Q-location |
| `base_address_public` | Default false; city+state always public; full address at `deposit_paid` | Q-address-visibility |
| `total_price_cents` | Denormalized, DB-trigger synced | §5 callout |
| Min total | `> 0` (zero-priced blocked) | §5 callout |
| Package deactivate / delete | Blocked when it would leave the vendor with 0 active packages (`LAST_ACTIVE_PACKAGE` error). Vendors go dark via the profile pause toggle, not by deleting their last package. | §3.1 / §3.3 |
| Package hard delete | Additionally blocked when any active booking references the package (`ACTIVE_BOOKINGS_EXIST` error). Only historical bookings (completed/cancelled) tolerate hard delete; `ON DELETE SET NULL` + snapshot fields keep them displayable. | §3.1 / §8.1 |
| Profile pause toggle | Vendor controls `vendor_profiles.is_active` directly. Going dark preserves packages. Setting `is_active=true` requires ≥1 active package. | §3.3 |

### Defaults that surface during implementation (no design impact)

- Per-package `location_prompt` text — deferred to v1.5
- Exact `events_count` UI control (number input vs. stepper vs. preset chips) — decide during A2
- Migration ordering within A1 (rename before or after new columns) — decide during A1

---

## 8. API contracts (pinned for parallel agents)

All routes return JSON. All write routes require auth (Supabase session cookie). Errors follow existing `withErrorBoundary` pattern (Phase B): `{ error: { code: string, message: string } }`.

### 8.1 Packages CRUD (used by Agent X — A2)

**`POST /api/packages`** — vendor creates a new package.

Request:
```json
{
  "name": "Wedding Day Coverage",
  "description": "Full-day photography coverage with edited gallery",
  "base_price_cents": 240000,
  "included_items": ["8 hours coverage", "200+ edited photos", "Online gallery"],
  "max_guests": 200,
  "duration_hours": 8.0,
  "events_count": 1,
  "featured_image_url": "https://...",
  "gallery_image_urls": [],
  "vendor_notes_template": "I'll arrive 30 min early...",
  "location_mode": "couple_provides",
  "addons": [
    {"name": "Drone footage", "price_delta_cents": 50000},
    {"name": "Second photographer", "price_delta_cents": 30000}
  ]
}
```

Response (201):
```json
{
  "package": { /* full row */ },
  "addons": [ /* array of addon rows */ ]
}
```

**`PATCH /api/packages/[id]`** — partial update. Same body shape as POST, all fields optional. Addons array, if provided, **replaces** the package's add-on list (delete missing IDs, upsert provided). Returns same shape.

**`PATCH /api/packages/[id]/is-active`** — toggle deactivation. Request: `{ "is_active": true|false }`. Server check: setting `is_active=false` requires `other_active_count >= 1` (else `409 LAST_ACTIVE_PACKAGE`). Setting `is_active=true` always allowed.

**`DELETE /api/packages/[id]`** — deactivates the package (`is_active=false`). Server-side checks:

1. Count vendor's other active packages (excluding this one): `other_active_count`.
2. If `other_active_count = 0` → respond `409 Conflict` with `{ error: { code: "LAST_ACTIVE_PACKAGE", message: "..." } }`. Vendor must add another package or pause their profile.
3. Else: set `is_active=false`, return the updated package row.

**`DELETE /api/packages/[id]?hard=true`** — permanent deletion. Server-side checks:

1. Count vendor's other active packages (excluding this one): `other_active_count`. If `0` → `409 LAST_ACTIVE_PACKAGE`.
2. Check for active bookings referencing this package (statuses `pending`, `accepted`, `adjusted_quote_sent`, `adjusted_quote_declined`, `deposit_paid`):
   ```sql
   SELECT 1 FROM bookings
   WHERE package_id = $1
     AND status IN ('pending','accepted','adjusted_quote_sent','adjusted_quote_declined','deposit_paid')
   LIMIT 1;
   ```
   If any → `409 ACTIVE_BOOKINGS_EXIST` with `{ error: { code, message, active_count: int } }`. Vendor must use soft-delete (deactivate) instead.
3. Else: `DELETE FROM packages WHERE id = $1`. FK `ON DELETE SET NULL` clears `bookings.package_id` on historical (completed/cancelled) bookings; their `package_name_snapshot` + price fields keep them displayable. CASCADE handles `package_addons`.

UI implication: the "Delete" button on a package card primarily does the soft delete. A secondary "Delete permanently" action (e.g. in a kebab menu) attempts the hard delete with the safety checks. Both return clear error messages when blocked.

### 8.2 Bookings (used by Agent Y — A3, and Agent Z — A4)

**`POST /api/bookings`** — couple creates a booking.

Request:
```json
{
  "vendor_profile_id": "uuid",
  "package_id": "uuid",
  "selected_addons": [
    {"addon_id": "uuid", "name": "Drone footage", "price_delta_cents": 50000}
  ],
  "guest_count": 150,
  "special_requests": "Vegetarian setup",
  "couple_full_name": "John & Jane Doe",
  "couple_contact_phone": "+1234567890",
  "events": [
    {
      "sequence": 1,
      "event_date": "2026-08-15",
      "event_start_time": "2026-08-15T16:00:00Z",
      "event_end_time": "2026-08-15T22:00:00Z",
      "event_type_label": "Wedding Ceremony",
      "location_name": "The Drake Hotel",
      "address_line_1": "140 E Walton Pl",
      "city": "Chicago",
      "state": "IL",
      "postal_code": "60611",
      "google_place_id": "ChIJ...",
      "location_overridden": false,
      "guest_count_override": null
    }
  ]
}
```

Server-side, in a single transaction:
1. Validate `events.length <= package.events_count`.
2. Snapshot `package.name` → `package_name_snapshot` AND `package.base_price_cents` → `package_base_price_cents_snapshot`. Both NOT NULL on new bookings (kept nullable in DB only for legacy rows; new code never inserts NULL).
3. Validate `selected_addons[].addon_id` actually belongs to `package_id`.
4. Insert booking + booking_events rows.
5. Set `expires_at = NOW() + 72h`, `status = 'pending'`, `negotiation_round_count = 0`.
6. Fire `sendBookingRequestEmail` (vendor) + `sendBookingReceiptEmail` (couple) — fire-and-forget with `logger.error` on failure.

Response (201):
```json
{
  "booking": {
    /* full booking row, includes total_price_cents (computed by trigger) */
  },
  "events": [ /* array of booking_events */ ]
}
```

**`POST /api/bookings/[id]/accept`** — vendor accepts at base.

Request: `{}`

Server:
1. Validate caller is the vendor for this booking and `status='pending'`.
2. Set `status='accepted'`, `adjustment_amount_cents=0`, `vendor_notes = package.vendor_notes_template`, `expires_at=NOW()+72h`.
3. Create Stripe deposit checkout (via existing `createDepositCheckout`).
4. Fire `sendVendorAcceptedEmail` (couple).

Response (200):
```json
{
  "booking": { /* updated row */ },
  "deposit_checkout_url": "https://checkout.stripe.com/..."
}
```

**`POST /api/bookings/[id]/adjust`** — vendor sends adjusted quote.

Request:
```json
{
  "adjustment_amount_cents": 20000,
  "reason": "guest_count",
  "explanation": null
}
```

Server:
1. Validate caller is the vendor and `status IN ('pending', 'adjusted_quote_declined')`.
2. Validate: `reason='other'` → `explanation IS NOT NULL`.
3. Set fields, status → `adjusted_quote_sent`, `negotiation_round_count += 1`, `expires_at = NOW() + 72h`.
4. Optionally set `vendor_notes = package.vendor_notes_template` if currently null.
5. Fire `sendAdjustedQuoteEmail` (couple).

Response (200): `{ "booking": { /* updated */ } }`

**`POST /api/bookings/[id]/accept-adjusted`** — couple accepts the adjustment.

Request: `{}`

Server:
1. Validate caller is the couple and `status='adjusted_quote_sent'`.
2. Set `status='accepted'`, `expires_at = NOW() + 72h`.
3. Create Stripe deposit checkout.
4. Fire `sendCoupleAcceptedAdjustedEmail` (vendor).

Response (200): `{ "booking": {...}, "deposit_checkout_url": "..." }`

**`POST /api/bookings/[id]/decline-adjusted`** — couple declines.

Request: `{}`

Server:
1. Validate caller is the couple and `status='adjusted_quote_sent'`.
2. Set `status='adjusted_quote_declined'`, `expires_at = NOW() + 72h`.
3. Fire `sendCoupleDeclinedEmail` (vendor).

Response (200): `{ "booking": {...} }`

**`POST /api/bookings/[id]/cancel`** — existing endpoint, unchanged behavior.

### 8.3 Vendor profile

**`PATCH /api/vendor-profile`** — existing, extended to accept `base_address_*` fields + `base_address_public` boolean. Validates: `base_address_*` required if any package has `location_mode='at_vendor'`.

---

## 9. Testing strategy

### A1 (schema)

- Migration applies cleanly on a fresh Supabase project (run on dev as the canonical test).
- Existing tests still pass (old columns retained).
- Type regen produces clean TypeScript types.

### A2 (vendor side)

- Unit tests for package CRUD endpoints (create, update, delete soft + hard, addon upsert/delete).
- Component tests for package editor form (validation, addon list editor).
- Integration test: create vendor → create package → verify `is_active` gate transitions, vendor appears in search.
- Adjustment flow: pending → adjust → status transitions, `negotiation_round_count` increments.

### A3 (couple side)

- Component tests for package detail modal (add-on toggle interactions, live total).
- Integration test: full booking submission with package + 2 add-ons + 3 events using Playwright. Verify booking row + 3 booking_events rows + total_price_cents computed correctly.
- Adjustment review page renders side-by-side correctly.

### A4 (payment + emails)

- Email snapshot tests for new templates.
- Stripe checkout creation with `total_price_cents`.
- Webhook handler verification for new statuses.
- Cron sweep test: stale bookings in new statuses are cancelled after 72h.

### A5 (cleanup)

- Smoke test: end-to-end from vendor sign-up → packages → couple browse → multi-event booking → vendor adjust → couple accept → deposit → completion → review request. All emails fire (verify via Resend logs).
- No production traffic affected (we're pre-launch).

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Migration breaks dev DB** | A1 applied manually to dev with SQL editor; tested before A2/A3/A4 fan-out. Rollback script in each migration file. |
| **Parallel agents collide on API contract** | Contracts pinned in §8. Agents code to these shapes; integration on umbrella branch verifies. |
| **Email failures still silent** | A4 adds `logger.error` promotion (still doesn't fix root cause if it's a config issue — that's the P0 email investigation track). |
| **Address visibility leak** | Application-layer redaction (`getVendorProfileForCouple` helper) tested explicitly for both `public=true` and `public=false` states pre/post `deposit_paid`. |
| **Snapshot drift** | Snapshot columns are NOT NULL on `bookings` (enforced at insert). Cannot accidentally save a booking without snapshotting. |
| **Cron sweep cancels live booking** | `expires_at` is updated on every status transition; sweep only acts on stale rows. Test coverage verifies this in A4. |
| **Bad cleanup migration in A5** | Drop columns one at a time per migration file; reversible until rollout. Each drop preceded by app-side audit that no code reads the column. |
| **Legacy bookings with `total_price_cents=0` block the `> 0` constraint** | Constraint deferred to A5 (after backfill). A1–A4 run without the constraint; new code always produces non-zero totals via the trigger. A5 backfills or purges legacy rows before adding the constraint. |

---

## 11. Open items deferred to implementation

These need decision but don't block design approval — they surface during specific phase implementation.

- `events_count` UI control (number input vs. stepper vs. preset chips 1/2/3) — A2 decision.
- Package edit form: modal vs. dedicated `/dashboard/profile/packages/[id]` page — A2 decision.
- Migration ordering within A1 (rename `booking_requests` before or after adding new columns) — A1 decision; doesn't affect downstream.
- `gallery_image_urls` UI: drag-drop multi-upload vs. one-at-a-time — A2 decision.
- Per-package `location_prompt` text — deferred to v1.5 (out of scope here, captured as future enhancement).

---

## 12. Glossary

- **Package** — a vendor's offering: a fixed-price unit with included items, duration, max guests, photos, optional add-ons, and event count.
- **Add-on** — an optional upsell attached to a package, with a positive or negative price delta.
- **Booking** — a contractual unit between one couple and one vendor for one package; contains 1..N events.
- **Booking event** — one deliverable day (date + time + location + event type) within a booking.
- **Adjustment** — vendor's modification to the package+add-ons total, with a structured reason.
- **Negotiation round** — one cycle of `adjusted_quote_sent → couple decides`. Tracked via `negotiation_round_count`.
- **Snapshot** — value frozen at booking creation, immune to upstream changes (e.g., `package_base_price_cents_snapshot`).
- **Location mode** — per-package declaration of who provides the event location (`couple_provides` or `at_vendor`).
