# Homepage + Signup Figma Redesign — Design Spec

**Date:** 2026-08-04
**Branch:** `feat/customer-events` (redesign work will branch fresh off `main` per git-workflow lock)
**Figma source:** editable draft copy `QX0FCLvf8nTx8DVljzwv7t` ("Bazzar.io (Copy)")

- Homepage frame: `113:86` ("Landing Page", 1920×5823)
- Signup frame: `210:1488` ("Signup", 1440-wide, two-column)
  **Fidelity:** "Figma as loose reference" — direction/structure from Figma; conversion best-practices + locked brand tokens win over exact pixels.

## Locked decisions (this session)

1. **CTA color:** hot-pink `#D1006C` primary CTAs now permitted (palette lock amended 2026-08-04). Signup submit = pink; homepage buttons stay ink as the Figma shows.
2. **Signup scope:** re-skin only. Two-column visual layout, but keep existing fields (email, full name, password, terms) + Google OAuth + role picker + claim banner. **No** new fields (business name/phone/category/location/confirm-pw), **no** Apple button, **no** schema/backend work.
3. **Testimonials:** build styled card row, seed with curated static wedding quotes (drafted here), swap to a data source later.

## Brand token mapping (Figma → ours)

Figma used placeholder fonts; map to the locked type system ([[baazar-typography-locked-ty-c-hybrid]]):

- `PolySans Trial` (Slim/Neutral/Median/Bulky) → **Schibsted Grotesk** (our sans), weight-matched.
- `Geist` (signup form) → **Schibsted Grotesk**.
- `Spectral` (wordmark, serif) → **Spectral** (already ours) — keep for wordmark + serif display headings.
- `Markazi Text` / `El Messiri` (Devanagari/Arabic wordmark बाज़ार / بازار) → **Tiro Devanagari** + existing Arabic face.
- `Inter` / `IBM Plex Mono` (testimonial cards) → body = Schibsted Grotesk; mono label = **DM Mono**.

Colors already align with the locked palette: `#fbf7ee`≈cream, `#1a1a1a`≈ink, `#d1006c`=hot-pink, `#f2b92e`/`#ffec1f`≈haldi (stars), `#f5eee0` cream-tint, `#f0f0f0` neutral surface.

---

## HOMEPAGE — section-by-section

Current file: `src/app/(marketplace)/page.tsx` (server component). Preserve-behaviors below are **hard requirements**.

### H0. Preserved behaviors (must not break)

- `HomepageHero` role-aware "List your business" CTA — hidden for `role === 'couple'` (server reads `users.role`).
- `CategoryHoverExpand` + `CategoryHoverExpandMobile`, fed by live `getCategoryVendorCounts()` + `CATEGORIES_FEATURED`.
- Trust trio (Verified / Secure Deposits / Fast Response) already exists at the bottom.

### H1. Hero — re-skin `HomepageHero`

Figma: white rounded hero card over a photo bg; wordmark top-left, hamburger top-right; big serif headline **"Planning your [rotating word] starts here."** where the rotating word cycles `dream wedding` / `Birthday Event` / `Celebration` in hot-pink; kicker "Discover. Compare. Book."; a **glassmorphic search bar** ("Search About Venders for your events"); an inline **3-step mini-flow** (01 Share Your Event · 02 Receive Quotes · 03 Secure Your Date); a **"Trusted by" logo strip** (black bar) at the base.
Plan:

- Re-skin existing `HomepageHero` (keep its role-aware CTA prop). Add the rotating headline word (CSS/JS cycle, front-end only).
- **Search bar** = new front-end bit → routes to existing search (`/vendors` or search route) with the query param. No backend.
- 3-step mini-flow = static presentational strip (shares content with H4 cards).
- "Trusted by" logo strip = static logos (placeholder marks until real press/partners exist — flag).
- Fix Figma copy typo "Venders" → "Vendors".

### H2. "Browse Everything You Need" — keep `CategoryHoverExpand`

Figma has a fancy rotated-label image rail (13 categories). We already ship `CategoryHoverExpand` (Skiper UI, registry-first, live data). **Keep it** — restyle the section heading/subcopy to the Figma register; do NOT rebuild the rail. Registry-first rule ([[feedback-registry-first-components]]) + it's already data-fed. Match copy: heading "Browse Everything You Need" / sub "Discover verified cultural wedding vendors, compare services, and book with confidence — all in one place."

### H3. "Book your perfect vendor in three simple steps" — NEW section

Three cards (Figma `Group131/130/129`): **Share Your Event** / **Receive Quotes** / **Secure Your Date**, each with step number + description. White cards, soft shadow, ellipse icon. Static presentational. Build with existing Card primitive.

- Copy (from Figma): Step 01 "Tell us about your event, preferred date, location, budget, and the services you need. We'll instantly notify the right vendors." · Step 02 "Verified vendors review your request, confirm availability, and send personalized quotes." · Step 03 "Choose your favorite vendor and pay a 5% upfront booking deposit to lock your date; remaining balance paid to the vendor later." (5% deposit matches [[payment-model-current]].)

### H4. "Why Couples Choose Baazar" + testimonials row — NEW (shell + curated content)

Heading "Why Couples Choose Baazar" + sub "Loved by couples across Chicago…" + "Learn More" (ink button) + horizontal row of testimonial cards.

- **Replace the placeholder tech-company quotes** (David Rossi/Cigna etc.) with curated wedding testimonials (draft 4–6 short couple quotes: name + city + event type). Static array in the component now; swap to a `testimonials` source later. Card: avatar, quote, name (mono uppercase), role/context line.

### H5. "Vendor Spotlight — Featured Vendor of the Week" — NEW

Dark `#171717` rounded panel: "VENDOR SPOTLIGHT" (hot-pink) + "Featured Vendor of the Week", vendor name, category, star rating "5.0 (128 Reviews)", photo + thumbnail strip, "Learn More".

- Data option: pull one real featured vendor from existing vendor data (front-end query) OR static-curate until a "featured" flag exists. **Recommend static-curate now** (no schema flag for "featured of the week"); flag a future `is_featured` follow-up.

### H6. "Why Customers Trust Us" — re-skin EXISTING trust trio

Cream `#f5eee0` rounded-top section, three columns: **Verified Vendors** / **Secure Deposits** / **Fast Response** with circular icons + descriptions. This maps to the current trust section — re-skin to match (copy already close: "Every vendor is verified…", "Small hold deposits powered by Stripe. Full refund if vendor doesn't confirm.", "Vendors must respond within 72 hours…").

### Homepage build order

H1 hero → H6 trust re-skin (lowest risk, existing) → H3 steps → H2 heading restyle → H5 spotlight → H4 testimonials. Ship incrementally; each section is independent.

---

## SIGNUP — `src/app/(auth)/signup/page.tsx` + `signup-form.tsx`

### S0. Preserved behaviors (must not break)

- Role picker (couple 🎉 / vendor 🏪) — hidden & locked when `prefilledRole` came from a claim token (role forced vendor).
- "Claiming your business" context banner (claim-token decode via service role).
- Continue-with-Google OAuth (role persisted via cookie round-trip).
- Email / full-name / password (min 8, `PasswordInput`) + Terms agreement gate.
- `return_to` + `?role=` handling; claim token wins over `?role=`.

### S1. Layout — two-column split (re-skin)

Figma `210:1488`: left **brand panel** (~57%) cream→haldi gradient (`#fbf7ee`→`#fff2d5`), wordmark, big serif heading, supporting paragraph, illustration, "Get Started with Us" + **3 benefit chips**; right **form panel** (~43%) white, form card.
Plan:

- Wrap `SignupForm` in a two-column shell (stacks to single column < lg; form on top on mobile).
- **Left panel is role-aware:**
  - `role === 'vendor'` (or claim/`?role=vendor`): "Join Baazar as a Vendor" + vendor benefit chips (1. No Listing Fees · 2. Verified leads with pre-committed deposit · 3. Culture-focused vendor marketplace) + handshake illustration.
  - `role === 'couple'` (default): couple-oriented heading + benefit chips (draft: 1. Verified vendors · 2. Secure 5% deposit · 3. One place for your whole celebration).
  - When role picker is visible (no prefill), default to couple copy; optionally swap panel copy on role toggle (front-end).
- Illustration/wordmark assets: download-and-commit the Figma-exported handshake + brand marks (assets expire in 7 days) OR substitute an existing brand illustration. Flag asset sourcing.

### S2. Form card — re-skin, same fields

Right panel keeps the **existing** fields only: Full Name, Email, Password (`PasswordInput`), Terms checkbox → primary submit **"Create Account"** (hot-pink `#D1006C`), "Or" divider, **Google** button (keep), footer terms line. **Drop** Figma's Business Name / Phone / Category / Service Location / Confirm Password / Apple button (out of scope). Header text: "Create Your Account" / role-aware sub.

- Keep shadcn Card/Button/Input/PasswordInput/Label/Separator ([[feedback-registry-first-components]]).
- Field surface styling to match Figma (`#f6f8fa` fill, `#e5e7eb` border, 12px radius, 14px label) mapped to our tokens.

### Signup build order

S1 shell + role-aware left panel → S2 form re-skin. Verify all S0 behaviors via the existing e2e signup path before merge.

---

## Component sourcing — REGISTRY-FIRST (hard rule)

Per [[feedback-registry-first-components]]: before building ANY new UI piece below, search the registries (shadcn MCP `search_items_in_registries` / `get_item_examples_from_registries`, 21st.dev) and adopt/adapt a match. Hand-roll only when nothing fits. Candidate searches per new piece:

- **H1 rotating headline word** → search "rotating text" / "text rotate" / "word swap" / "animated headline".
- **H1 glassmorphic search bar** → search "search bar" / "search input" / "command search" (adapt existing shadcn `input`/`command`).
- **H1 "Trusted by" logo strip** → search "logo cloud" / "marquee" / "logo ticker".
- **H3 3-step cards** → search "steps" / "how it works" / "timeline" / "feature cards" (or reuse shadcn `card`).
- **H4 testimonials row** → search "testimonials" / "testimonial carousel" / "review cards".
- **H5 vendor spotlight** → search "feature spotlight" / "showcase card" / "product highlight".
- **H6 trust trio** → already exists; reuse in place.
- **Signup S1 split-screen** → search "split screen auth" / "authentication layout" / "sign up split".
- **Signup S2 form** → reuse existing shadcn Card/Button/Input/PasswordInput/Label/Separator (already in repo).
  Existing repo components to reuse (do not rebuild): `HomepageHero`, `CategoryHoverExpand(+Mobile)`, `SignupForm`, `PasswordInput`, shadcn primitives.

## Out of scope / flagged follow-ups

- Real "Trusted by" partner logos (H1) — placeholder for now.
- `testimonials` data source (H4) + `is_featured` vendor flag (H5) — static now, schema later.
- Richer vendor signup form + Apple OAuth — deferred (already partly covered by the 6-step onboarding wizard).
- `DESIGN.md` update to record the pink-CTA amendment.
- Mobile frames not in Figma — derive responsive behavior ourselves (single-column stacks, hero search full-width).

## Verification

- Homepage: role-aware vendor CTA still hides for couples; category counts still live; trust trio intact.
- Signup: role picker + claim banner + Google OAuth + terms gate + return_to/role params all functional (run existing signup e2e).
- Full CI green before merge (incl. e2e) per [[merge-rule-full-ci-green]]. Delete any specs for removed UI in the same PR ([[delete-specs-with-features]]).
