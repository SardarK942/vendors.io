# Package Model — Locked Per-Category Decisions

**Purpose:** Capture the finalized, per-category package-model decisions from the design session, so the phased build has a single authoritative source of truth per vendor category.

**Status:** decided 2026-09-17; supersedes the proposal in `2026-09-15-package-model-per-category-audit.md`.

---

## 1. Archetype groups

| Archetype            | Definition / pricing math                                                                               | Categories                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Time-based**       | Hide `max_guests`; loose display attributes; rich add-ons. Model: flat `base_price` + `duration_hours`. | photography, videography, content_creation, dj, photobooth, live_music                                                                                      |
| **Per-unit rail**    | `total = base_flat + per_unit × qty`, with a minimum.                                                   | catering (per_guest), hair_makeup party (per_face), carts (per_serving), invitations (per_item), gifts (per_unit) — plus mehndi party (per_person, instant) |
| **Flat / relabeled** | Standard model, no new pricing math.                                                                    | venue (per_day; `max_guests`→capacity), decor (turnkey + quantified-inclusion rentals)                                                                      |
| **Deferred**         | Not built in v1.                                                                                        | mehndi event (structured quote — but see per-category), bridal_wear (future store project)                                                                  |

---

## 2. Per-category locked spec

### Photography

- **Archetype:** time-based.
- **pricing_unit(s):** flat `base_price` + `duration_hours`.
- **Fields kept/hidden/relabeled:** reuse name / description / base_price / `duration_hours` (relabel "Coverage hours") / `events_count` / location_mode / add-ons / is_featured; HIDE `max_guests`.
- **Display attributes (loose):** photographers (int), edited_photos (loose text), raw_files (bool), online_gallery (bool), album (bool), turnaround (sneak-peek days + gallery weeks).
- **Add-ons:** engagement/bridal shoot, drone, extra hours, 2nd shooter, same-day slideshow, extra edits.
- **Taxonomy / notes:** Combo "Photo+Video" flag with loose video deliverables shown only if `services` includes videography.

### Videography

- **Archetype:** time-based (mirror photography).
- **pricing_unit(s):** flat `base_price` + `duration_hours`.
- **Fields kept/hidden/relabeled:** mirror photography; HIDE `max_guests`.
- **Display attributes (loose):** videographers (int), highlight_film (loose), full_ceremony_edit (bool), raw_footage (bool), drone (bool/add-on), live_stream (bool), turnaround (weeks).
- **Add-ons:** as photography (extra hours, drone, etc.).
- **Taxonomy / notes:** mirrors photography.

### Content Creation

- **Archetype:** time-based.
- **pricing_unit(s):** flat `base_price` + `duration_hours`.
- **Fields kept/hidden/relabeled:** HIDE `max_guests`.
- **Display attributes (loose):** num_reels (loose), turnaround (leads, fast), platforms (loose), raw_clips (bool).
- **Add-ons:** —
- **Taxonomy / notes:** NO creator count, NO same-day teaser.

### DJ

- **Archetype:** time-based.
- **pricing_unit(s):** flat `base_price` + `duration_hours`.
- **Fields kept/hidden/relabeled:** HIDE `max_guests`.
- **Display attributes (loose):** hours (`duration_hours`), equipment_included (loose), mc_included (bool), genres/languages (loose).
- **Add-ons:** dhol, uplighting, cold sparks/fog, dance floor, extra hours, MC, photobooth.
- **Taxonomy / notes:** —

### Photo Booth

- **Archetype:** time-based rental.
- **pricing_unit(s):** flat `base_price` + `duration_hours`.
- **Fields kept/hidden/relabeled:** HIDE `max_guests`.
- **Display attributes (loose):** rental_hours (`duration_hours`), unlimited_prints (bool), digital_copies (bool), attendant_included (bool), custom_backdrop (loose), props (bool).
- **Add-ons:** extra hours, backdrop, scrapbook/guestbook, idle-hour fee.
- **Taxonomy / notes:** NO booth-type taxonomy (explicitly dropped).

### Live Music

- **Archetype:** time-based (mirror DJ).
- **pricing_unit(s):** flat `base_price` + `duration_hours`.
- **Fields kept/hidden/relabeled:** HIDE `max_guests`.
- **Display attributes (loose):** ensemble (solo/duo/band/dhol/qawwali), num_performers (int), sound_included (bool), hours/sets (`duration_hours`), genres (loose).
- **Add-ons:** extra hours, additional musicians, dhol, MC, PA. (travel_fee as add-on.)
- **Taxonomy / notes:** mirrors DJ.

### Catering

- **Archetype:** per-unit rail (by subcategory).
- **pricing_unit(s):** full_service = per_guest (× guest count, `min_guests`, "feeds up to X"); cakes = flat (per tier); dessert_tables = per_serving; grazing_charcuterie = flat (board size).
- **Fields kept/hidden/relabeled:** multi-event → capture guest count PER EVENT (reuse existing per-event `guest_count_override`).
- **Display attributes:** menu (loose), staff_included (bool), rentals_included (loose), tasting_included (bool).
- **Add-ons:** bar, live/chef station, extra course, servers, delivery/setup.
- **Taxonomy / notes:** NO service-style facet (mostly buffet).

### Hair & Makeup

- **Archetype:** per-unit rail.
- **pricing_unit(s):** service types (flat-rate): Bridal Makeup, Party Makeup, Bridal Hair, Party Hair. Bridal = flat per-bride; Party = per_face × quantity of faces (captured at booking).
- **Fields kept/hidden/relabeled:** trial_included (bool), on_location (location_mode), travel_fee (add-on); HIDE `max_guests`, `duration_hours`.
- **Display attributes:** service type; bridal add-ons (lashes, dupatta/veil set).
- **Add-ons:** travel_fee, lashes, dupatta/veil set. Needs add-on quantity + per-face quantity.
- **Taxonomy / notes:** keep existing hair/makeup AND-match taxonomy.

### Carts

- **Archetype:** per-unit rail OR flat.
- **pricing_unit(s):** flat (service block + serving cap) OR per_serving (× qty).
- **Fields kept/hidden/relabeled:** keep `max_guests` as serving cap.
- **Display attributes:** cart_type, attendant_included (bool), servings/capacity, menu/flavors (loose), setup_included (bool).
- **Add-ons:** extra hours, extra servings, premium toppings, additional flavors.
- **Taxonomy / notes:** taxonomy exists — dessert/beverage/appetizer/favor_gift.

### Venue

- **Archetype:** flat/relabeled (Coming Soon).
- **pricing_unit(s):** per_day; base_price = per-day/event rate.
- **Fields kept/hidden/relabeled:** `max_guests` → "Max capacity" (KEPT, meaningful hard cap); `duration_hours` = rental hours; included_items = inclusions.
- **Display attributes:** capacity, rental_basis (per-day/event/hourly), in_house_catering (in-house/external allowed/both), inclusions.
- **Add-ons:** extra hours, cleaning, AV, in-house catering.
- **Taxonomy / notes:** standard 5% deposit; security/cleaning deposit OFF-platform. Peak/off-peak → separate packages or custom-quote (native date-pricing deferred).

### Decor

- **Archetype:** hybrid (Coming Soon).
- **pricing_unit(s):** full_decor = flat turnkey package; florals/signage = flat or custom-quote; rentals = FLAT package with QUANTIFIED INCLUSIONS.
- **Fields kept/hidden/relabeled:** included_items entries gain optional quantity: {item, qty}, e.g. "100 chairs, 10 tables".
- **Display attributes:** inclusions with quantity.
- **Add-ons:** —
- **Taxonomy / notes:** self-serve rental catalog DROPPED.

### Invitations

- **Archetype:** per-unit rail (Coming Soon).
- **pricing_unit(s):** printed = per_item (× qty, MOQ `min_order`) + flat design base; e-invites/digital = flat design fee; bespoke = custom-quote.
- **Fields kept/hidden/relabeled:** `min_order` (MOQ).
- **Display attributes:** design_type (semi-custom/fully custom/digital), suite_includes (loose), print_options (loose), proofs_revisions (loose), turnaround.
- **Add-ons:** calligraphy, wax seals, envelope liners, extra inserts, rush.
- **Taxonomy / notes:** —

### Bridal Wear

- **Archetype:** DEFERRED to a future dedicated project.
- **pricing_unit(s):** n/a.
- **Fields kept/hidden/relabeled:** n/a.
- **Display attributes:** n/a.
- **Add-ons:** n/a.
- **Taxonomy / notes:** a full bridal-STORE revamp (product catalog — multiple stores, their pieces, direct purchase). Does NOT fit package machinery (product + appointment). No v1 build; logged as its own solution.

### Mehndi / Henna

- **Archetype:** per-unit rail (party) + flat (bridal) + deferred structured quote (event).
- **pricing_unit(s):** bridal = flat per coverage tier; party = per_person per design tier; event = structured custom-quote.
- **Fields kept/hidden/relabeled:** reuses `featured_image_url` for portfolio-backed pricing.
- **Display attributes:** bridal coverage (hands / hands+feet / full arms+legs); party design size/length.
- **Add-ons:** —
- **Taxonomy / notes:** taxonomy — bridal/party/event.
  - **Bridal** = flat per coverage tier, portfolio-backed (each coverage option = priced card w/ image), attribute coverage (hands / hands+feet / full arms+legs), INSTANT.
  - **Party** = per_person per design tier, portfolio-backed (design/length options as priced cards), attribute design size/length, INSTANT.
  - **Event** = STRUCTURED CUSTOM-QUOTE (show indicative "$X/hour per artist"; couple submits hours + estimated guests getting henna + # artists → artist confirms total via adjustment flow). Booking inquiry fields: date/time + location + event type (existing) + hours, estimated # guests getting henna, # artists, design preferences.
  - (Sourced from a real henna artist interview.)

### Gifts & Favors

- **Archetype:** per-unit rail — MIRROR CARTS (NOT invitations).
- **pricing_unit(s):** flat (batch covering up to N pieces) OR per_unit.
- **Fields kept/hidden/relabeled:** min/capacity.
- **Display attributes:** personalization (loose/bool), contents (loose), min/capacity, setup.
- **Add-ons:** custom printing, ribbon/wrapping, gift cards, assembly.
- **Taxonomy / notes:** taxonomy item_type (favors / hampers / mithai boxes / welcome bags). NOT flagged Coming Soon (live-ready once per-unit rail exists).

---

## 3. Cross-cutting model changes

1. Make `max_guests` + `duration_hours` nullable + archetype-gated (hide for time-based/goods; KEEP+relabel for venue = "capacity" hard cap and carts/food).
2. Generalize `capacity_unit` → **`pricing_unit`** enum: flat / per_hour / per_person / per_guest / per_serving / per_item / per_day. Display label always; price-bearing for the per-unit variants.
3. Per-unit pricing build: `total = base_flat + per_unit_price × qty (+ addon deltas + adjustment)`, with a minimum quantity; snapshot per_unit_price + qty onto the booking; rewrite the `sync_booking_total_price` trigger (migration 00020) to multiply.
4. Per-event quantity for multi-event catering (reuse existing per-event `guest_count_override`).
5. Add-ons gain a **quantity** dimension (MUA per-face, extra servings).
6. `included_items[]` gains optional **quantity** per entry (decor quantified inclusions).
7. Per-archetype structured **`attributes` JSONB** on packages, rendered as display chips.
8. New taxonomies: mehndi (bridal/party/event); gifts item_type. (Photo-booth booth_type was considered and DROPPED.)
9. Portfolio-backed packages (mehndi) reuse `featured_image_url`.

---

## 4. Phasing

- **Phase 1 (no pricing-math change, helps LIVE categories now):** nullable/archetype-gated `max_guests`/`duration_hours`; `pricing_unit` label (display-only first); per-archetype `attributes` JSONB; `included_items` quantity; new taxonomies; archetype-gated package editor.
- **Phase 2 (deep, gated):** per-unit pricing (base + per_unit×qty + minimum) — trigger rewrite + booking quantity capture (incl. per-event guest counts + add-on quantity) + deposit + price-band ("from $X /unit"). Serves catering, MUA-party, carts (per_serving), invitations, gifts.
- **Phase 3 (separate projects):** bridal-wear store catalog. (Decor self-serve rental catalog was dropped, not scheduled.)

---

## 5. Blast-radius constraints respected

We deliberately kept price a single scalar per package everywhere except the single-line per-unit build (`base + per_unit×qty`) — no multi-line/line-item booking is required (decor rentals use quantified inclusions, not a cart; bridal store is a separate project). Deposit stays 5% of the computed total. Per-event uses the existing `guest_count_override`. The Phase-2 touch points are migration 00020 (the `sync_booking_total_price` trigger) and `payment.service.ts` (deposit).
