# Vendor Profile Redesign Design

**Status:** Approved (brainstorm) · awaiting implementation plan
**Date:** 2026-06-24
**Author:** Claude (with Sardar)
**Sequencing:** Customer-facing vendor profile page at `/vendors/[slug]` only. Doesn't touch booking form, custom request form, packages editor, or onboarding wizard.

---

## 1. Why this exists

The current `VendorProfile.tsx` (254 lines) has two real UX problems plus one outright bug:

- **The "Request Booking" CTA only renders when the vendor has zero packages.** Code at line 207: `{packages.length === 0 && (... <Button>Request Booking</Button>)}`. Most vendors have packages, so most visitors see no global booking CTA at all — they have to click into a specific package card to find an action.
- **The "About / Bio" section is buried.** Sequence today: portfolio photos → packages grid → name + meta → about → reviews. Customers scroll past everything before learning who the vendor is.
- **No persistent CTA on scroll.** Even when the conditional CTA does render, it lives in a non-sticky right sidebar. Customers reading the bio or reviews have to scroll all the way back up to act.

The right sidebar (when packages exist) is also barely used — just Instagram link + website link + booking count. Wasted above-the-fold real estate on desktop.

This redesign solves all of that by adopting the **Airbnb-style split layout**: photo gallery on the left, persistent booking card on the right with the featured package, total cost, 5% deposit math, trust signals, and a single primary CTA. Bio and identity move directly under the photos. Packages get a dedicated comparison section below. Reviews stay below packages. Mobile gets a sticky bottom bar.

---

## 2. Scope (in / out)

### In scope

**Desktop layout (≥ 768px):**

- Above-the-fold hero: 2-column grid. Left (60%): photo gallery in current 2×3 mosaic (1 large + 4 small). Right (40%): sticky booking card.
- Sticky booking card content (variant i):
  - "Most popular" tag
  - Featured package name + duration subtitle
  - Total price (large)
  - Deposit line: `Pay $X deposit today · $Y due to vendor at event`
  - Primary CTA: `Request Booking →` (ink fill, hot-pink hover from Bucket B)
  - Secondary link: `or compare all 3 packages ↓` (smooth-scrolls to packages section)
  - Trust row at bottom (rating · response time · total events)
- Below the hero: identity panel (name + verified badge + meta row with category, location, languages, years in business)
- About section directly under the identity panel (NOT below packages)
- Packages comparison section (full-width below bio): 3-column grid, featured package marked with pink "Most popular" badge, each card has own `Book [name] →` CTA, custom-request link below grid
- Reviews section unchanged in structure: rating hero, review cards, "See all X reviews →" link

**Mobile layout (< 768px):**

- Photo carousel hero (swipeable), heart save button overlay (existing Bucket J `SavedVendorsProvider`), photo count + dot indicators
- Identity block: name + verified badge + category + location + languages + rating + response time in one compact section
- About section: bio + chips (currently just `languages` rendered as chips; other chips like "ADA-accessible" and "Insured" deferred — see §10)
- Packages stacked vertically: featured with pink badge first, each has its own CTA
- Reviews: rating hero + 2-3 review cards + "See all" link
- **Sticky bottom bar** (always visible on scroll): `From $1,200` + `Pay $60 deposit today` + currently-selected package pink line + `Request Booking →` button. Tap the package name to expand a quick picker drawer.

**Behavior:**

- Sticky card stays anchored to the **featured (cheapest) package** for the entire scroll. It does NOT sync to whichever package the customer is viewing in the comparison section — the package cards have their own CTAs for that.
- "compare all packages ↓" link smooth-scrolls to packages section via `element.scrollIntoView({ behavior: 'smooth' })` and adds a brief 1.5s pulse highlight on the featured package card.
- Owner banner from Bucket B T13/T14 still renders above the hero when `isOwner === true && !previewMode`. The view-as-customer toggle still works.
- Saved (heart) button on mobile carousel uses existing `useSavedVendors` hook (Bucket J).
- Customer-request fallback link (`Don't see what you need? Send a custom request →`) appears below the packages grid, routing to `/vendors/[slug]/request` (already exists).

### Out of scope (deferred to future work)

- **Detail chips beyond languages** — "ADA-accessible," "Liability insured," "Indoor & outdoor" etc. were shown in mockups but require new data fields. Skip for v1; add when we have a vendor-attributes schema.
- **Featured package selection by vendor** — v1 uses cheapest package as "Most popular." A vendor-selectable `is_featured` flag is a separate small feature (column + admin UI).
- **Booking form, custom-request form, packages editor** — separate screens, separate concerns.
- **Fullscreen photo gallery (lightbox)** — current 2×3 mosaic is the v1 surface; tap-to-expand can come later.
- **Side-by-side package comparison matrix** (feature checklist table) — the 3-column card grid is the v1 surface.
- **Live availability calendar in sticky card** — calendar component exists (`AvailabilityCalendar.tsx`) but lives further down the page; integrating into sticky card is a follow-up.
- **Reviews filtering / sorting** — out of scope, current static list stands.
- **Vendor's own profile (owner mode)** — the redesign respects the existing owner banner + preview mode but doesn't redesign the owner experience itself.

---

## 3. Architecture details

### 3.1 Component structure

Today's monolithic 254-line `VendorProfile.tsx` becomes 5 focused files:

```
src/components/marketplace/vendor-profile/
├── VendorProfile.tsx              # Top-level layout + owner banner + responsive switch
├── PhotoGalleryHero.tsx           # Desktop 2×3 mosaic
├── PhotoCarouselHero.tsx          # Mobile swipeable carousel
├── BookingStickyCard.tsx          # Desktop right-side sticky card
├── BookingBottomBar.tsx           # Mobile sticky bottom bar
└── IdentityPanel.tsx              # Name + verified + meta row + about/bio
```

`VendorProfile.tsx` orchestrates. Sub-components are pure presentational with clear props.

The existing `OwnerBanner`, `ExitPreviewPill`, `PackageGrid`, and review rendering stay where they are; this redesign just changes how `VendorProfile.tsx` composes them.

### 3.2 Layout — desktop (≥ md / 768px)

```
[ OwnerBanner (if owner) ]
[ breadcrumb: Category · City · Vendor name ]

┌─────────────────────────┬───────────────────┐
│ <PhotoGalleryHero />    │ <BookingSticky    │
│ (2×3 mosaic, max-h 480) │   Card />         │
│                         │ (sticky: top-6,   │
│                         │  z-30)            │
└─────────────────────────┴───────────────────┘

[ <IdentityPanel />: name + verified + meta row ]
[ About: bio prose + (future) detail chips        ]
                                                       ← sticky card still visible
[ ──── Choose your package ──── ]
[ <PackageGrid> (existing, 3-col) ]
[ Send a custom request → ]                            ← sticky card still visible

[ ──── Reviews ──── ]
[ rating hero · review cards · See all X reviews ]     ← sticky card still visible
```

Container max width: `max-w-6xl` (1152px). Grid columns: `grid-cols-[1.6fr_1fr]` for the hero row. The sticky card uses `position: sticky; top: 24px` and gets the entire right column from hero down to the end of the page.

### 3.3 Layout — mobile (< 768px)

```
[ top nav (Navbar) ]

[ <PhotoCarouselHero /> — full-width, 220px tall   ]
[   heart button (top-right), dots (bottom), count ]

[ <IdentityPanel /> compact mode:
  name + verified + meta in one block               ]

[ About: bio + language chips                       ]

[ ──── Choose your package ──── ]
[ <PackageGrid stack /> (vertical stack)            ]

[ ──── Reviews ──── ]
[ rating + review cards + see all                   ]

[ ════════════════════════════════════════════ ]
[ <BookingBottomBar /> sticky bottom:
  From $X · Pay $Y deposit · [Standard ▲]
                              · Request Booking →   ]
```

`BookingBottomBar` uses `position: sticky; bottom: 0` and `z-50`. Tapping the "Standard ▲" pill opens a small `<Sheet>` drawer (existing shadcn component) with the package list — same as the desktop dropdown variant we discussed but only on demand.

### 3.4 Sticky card content (desktop)

```tsx
<aside data-testid="vendor-sticky-card" className="sticky top-6 z-30">
  <div className="rounded-lg border-2 border-ink bg-white p-5 shadow-md">
    <span className="badge-pink-soft">Most popular</span>
    <h3>{featured.name}</h3>
    <p className="muted">{featured.durationLine}</p>

    <p className="price-xl">{formatPrice(featured.total)}</p>
    <p className="muted">Total cost (everything included)</p>

    <div className="deposit-line">
      Pay <b className="text-hot-pink">{formatPrice(deposit)}</b> deposit today ·{' '}
      {formatPrice(remaining)} due to vendor at event
    </div>

    <Button size="lg" className="w-full" onClick={handleRequestBooking}>
      Request Booking →
    </Button>
    <a onClick={scrollToPackages} className="block-center underline">
      or compare all {packages.length} packages ↓
    </a>

    <div className="trust-row mt-4 border-t pt-4">
      <TrustItem big="★ 4.9" small="47 reviews" />
      <TrustItem big="⚡ 2h" small="Response time" />
      <TrustItem big="✓ 3,012" small="Events" />
    </div>
  </div>
</aside>
```

`featured` = `packages.find(p => p.id === <cheapest>) ?? packages[0]`. The featured package is determined by `Math.min(p.base_price_cents)` — simplest rule for v1. (Future: add `is_featured` column for vendor-controlled selection.)

If `packages.length === 0` (vendor hasn't added any), the sticky card shrinks to a minimum-content variant: vendor name + trust row + "Request a custom booking →" CTA routing to `/vendors/[slug]/request`.

If `packages.length === 1`, the "or compare all packages ↓" alt-link is hidden.

### 3.5 "Compare all packages ↓" behavior

```tsx
function scrollToPackages() {
  const el = document.getElementById('packages-section');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Pulse the featured card briefly
  const featuredCard = el.querySelector('[data-pkg-featured]');
  if (featuredCard) {
    featuredCard.classList.add('pulse-pink');
    setTimeout(() => featuredCard.classList.remove('pulse-pink'), 1500);
  }
}
```

`pulse-pink` is a new utility class in Tailwind: 1.5s pink box-shadow pulse animation, respecting `prefers-reduced-motion` (no animation, just a static brief border-pink-500 outline).

### 3.6 Identity panel

Replaces the in-line `<h1>` + meta row at the top of the existing component. New shape:

```tsx
<section data-testid="identity-panel">
  <div className="flex items-center gap-3">
    <h1 className="font-spectral text-3xl">{vendor.business_name}</h1>
    {vendor.verified && <Badge>Verified</Badge>}
  </div>
  <div className="meta-row mt-2">
    <MetaItem icon={CategoryIcon}>{categoryLabel}</MetaItem>
    <MetaItem icon={MapPin}>{vendor.service_area?.join(', ') ?? 'Chicago'}</MetaItem>
    <MetaItem icon={Languages}>{vendor.languages?.join(', ')}</MetaItem>
    <MetaItem icon={CalendarDays}>{vendor.years_in_business} years in business</MetaItem>
  </div>
</section>
```

The bio sits directly below (in its own `<section>` with the same `<h2>About</h2>` pattern as today). Detail chips for v1 = vendor's `languages` array rendered as pills (already in data). Future chips deferred to §10.

### 3.6.1 Owner banner integration

Existing behavior preserved verbatim from Bucket B T13/T14:

- If `isOwner === true && !previewMode`: `<OwnerBanner />` renders above the breadcrumb (same position as today)
- If `isOwner === true && previewMode === true`: `<ExitPreviewPill />` renders bottom-right (same as today)
- Sticky card's `Request Booking` button respects `interactive === false` — shows toast `Preview mode — bookings disabled.` instead of routing

### 3.7 Mobile sticky bottom bar

```tsx
<div
  data-testid="vendor-bottom-bar"
  className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink bg-white px-4 py-2.5 shadow-lg md:hidden"
>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-base font-bold">From {formatPrice(featured.total)}</p>
      <p className="muted text-xs">Pay {formatPrice(deposit)} deposit today</p>
      <button
        onClick={openPackagePicker}
        className="mt-0.5 text-[10px] font-semibold uppercase text-hot-pink"
      >
        {featured.name} · most popular ▲
      </button>
    </div>
    <Button onClick={handleRequestBooking}>Request Booking →</Button>
  </div>
</div>
```

`openPackagePicker` opens a shadcn `<Sheet side="bottom">` with a stacked package list — each row taps to select that package + auto-routes to `/book` with the package cookie set.

Bottom-bar padding accounts for iOS home-bar safe area: `pb-[env(safe-area-inset-bottom)]`.

### 3.8 Packages comparison section

Section heading:

```
Choose your package
Compare side-by-side. All prices include setup, breakdown, and one attendant.
```

Uses the existing `<PackageGrid>` component with one new prop: `featuredPackageId` so the grid can render the pink "Most popular" badge + thicker border on the right card.

If only 1 package exists: render as a single centered card, not a 3-column grid.

If `packages.length === 0`: the entire packages section is hidden, custom-request link surfaces in the sticky card and identity panel instead.

Below the grid:

```
Don't see what you need? Send a custom request →
```

Routes to existing `/vendors/[slug]/request` page.

### 3.9 Reviews section

Structure unchanged from today. Only style polish:

- Rating row uses Spectral 28px for the number, amber star row, count in muted
- Review cards keep current 3-cards-then-See-all-link pattern

Add an explicit `id="reviews-section"` so future-deep-links can scroll there (not used by anything yet but cheap to add).

### 3.10 Responsive switch

Single `<VendorProfile>` component branches on viewport:

- `md:hidden` wrapper around `<PhotoCarouselHero />` + `<BookingBottomBar />`
- `hidden md:block` (or `md:grid`) wrapper around `<PhotoGalleryHero />` + `<BookingStickyCard />`
- Identity panel + bio + packages + reviews render once and adapt via Tailwind responsive classes (text size, spacing)

No JS-based viewport detection — pure CSS. The hero images load on both surfaces but with `lazy` loading.

---

## 4. Data + props

No schema changes required for v1. All data already exists on `vendor_profiles`:

- `business_name`, `verified`, `category`, `service_area`, `languages`, `years_in_business`, `response_sla_hours`, `average_rating`, `review_count`, `total_bookings`, `portfolio_images`, `bio`, `instagram_handle`, `website_url`

`PackageWithAddons[]` already provided to the component (existing prop).

Featured-package selection is computed on the client: `packages.reduce(min by base_price_cents)`.

Deposit math uses existing `DEPOSIT_RATE = 0.05` from `src/lib/utils.ts`.

---

## 5. Locked verbatim copy

### 5.1 Sticky card

- Badge: `Most popular`
- Total price label: `Total cost (everything included)`
- Deposit line: `Pay [X] deposit today · [Y] due to vendor at event`
- Primary CTA: `Request Booking →`
- Alt link: `or compare all [N] packages ↓`
- Trust row labels: `[N] reviews` · `Response time` · `Events`

### 5.2 Packages section

- Heading: `Choose your package`
- Subhead: `Compare side-by-side. All prices include setup, breakdown, and one attendant.`
- Featured badge: `Most popular`
- Per-card CTA: `Book [package name] →`
- Custom request link: `Don't see what you need? Send a custom request →`

### 5.3 Mobile bottom bar

- Price label: `From [X]`
- Deposit line: `Pay [Y] deposit today`
- Package pill: `[name] · most popular ▲`
- CTA: `Request Booking →`

### 5.4 Empty / fallback states

- Zero packages: `This vendor hasn't listed packages yet. Send them a custom request to ask about availability and pricing.`
- Zero reviews: `No reviews yet — be the first to book and leave a review.`
- Preview mode CTA toast: `Preview mode — bookings disabled.` (existing copy from Bucket B T14)

---

## 6. Testing approach

### 6.1 Unit tests

- `BookingStickyCard` — renders featured package, correct deposit math (5% of total), trust row values, "compare all N packages" link hidden when only 1 package
- `BookingBottomBar` — sticky positioning class, opens picker drawer on package-pill click
- `PhotoGalleryHero` — handles 0, 1, 5, 6+ images
- `PhotoCarouselHero` — swipeable + dot count + heart button calls `toggle()` from `useSavedVendors`
- `IdentityPanel` — verified badge conditional, meta items hidden when source data is null

### 6.2 E2E specs (3 new)

- `vendor-profile-desktop-flow.spec.ts` — visit profile → sticky card visible → click "compare all packages" → page smooth-scrolls → featured card pulsed → click package CTA → routes to `/book`
- `vendor-profile-mobile-flow.spec.ts` — visit profile on mobile viewport → bottom bar visible → tap "Request Booking" → routes to `/book`
- `vendor-profile-zero-packages.spec.ts` — vendor with no packages → sticky card shows fallback → CTA routes to `/request` (custom)

### 6.3 Manual smoke

- Desktop scroll: sticky card stays visible from above the fold all the way through reviews
- Mobile scroll: bottom bar always visible; tap "package pill" opens picker; tap package selects + routes
- Owner mode: banner above, sticky card still works, "Request Booking" toast fires in preview mode
- Vendor with 1 package: no "compare all" link
- Vendor with 0 packages: sticky card shows custom-request fallback

---

## 7. Effort estimate

- Component decomposition (5 new files, refactor existing): ~0.5 day
- Desktop layout + sticky card: ~0.5 day
- Mobile carousel + sticky bottom bar: ~0.5 day
- Packages section refactor (featured badge): ~0.25 day
- Owner banner integration + preview mode: ~0.25 day (mostly preserved behavior)
- Pulse animation utility + smooth scroll: ~0.25 day
- Tests (5 unit + 3 E2E): ~0.5 day
- Buffer + design polish: ~0.5 day

**Total: ~3 working days.** Single PR.

---

## 8. Deploy sequencing

1. PR opens with all components + tests
2. CI green
3. Apply zero migrations (none needed)
4. Merge → Vercel auto-deploys
5. Manual smoke on prod with one of the 4 photobooth claim vendors

Zero-downtime: pure UI change, no API contracts shift.

---

## 9. Success criteria

When this redesign ships:

- "Request Booking" CTA is ALWAYS visible — either in the sticky card (desktop) or sticky bottom bar (mobile) — regardless of whether the vendor has packages
- About / Bio is the second section a customer reads (right after photo gallery + identity), NOT below packages
- Customer can act in one click from the sticky card without scrolling
- Mobile customers see a persistent bottom-bar CTA at all times
- "Compare all packages ↓" smooth-scrolls to packages section with a brief pulse on the featured card
- Owner banner + view-as-customer toggle still work end-to-end
- Zero new schema or migrations
- No regression in existing E2E specs (`bucket-b-vendor-own-profile.spec.ts`, etc.)

---

## 10. Deferred follow-ups (out of scope for v1)

- **Detail chips for "ADA-accessible," "Insured," "Indoor & outdoor," etc.** — need a `vendor_attributes text[]` column or vendor-tags table. Add when we have the data model.
- **`is_featured` package flag** — small new column + admin UI to let vendors mark their preferred lead package. v1 uses cheapest.
- **Fullscreen photo lightbox** — tap to expand the photo gallery into a fullscreen swipeable viewer.
- **Live availability calendar in sticky card** — small monthly calendar showing booked vs available dates. `AvailabilityCalendar.tsx` exists but isn't integrated.
- **Side-by-side package comparison matrix** — feature checklist table (Standard ✓ ✓ ✗, Premium ✓ ✓ ✓) below the package grid.
- **Reviews filtering / sorting** — by rating, by date, by event type.
- **Sticky card content sync on scroll** (variant B from brainstorm) — magical but moderate complexity; revisit after we see real customer usage of v1.
