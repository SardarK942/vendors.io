# Homepage + Auth (Login + Signup) Figma Redesign — Design Spec

**Date:** 2026-08-04
**Branch:** `feat/homepage-signup-redesign` (homepage work already in progress here; auth work adds only `(auth)/` files → no collision)
**Figma source:** editable draft copy `QX0FCLvf8nTx8DVljzwv7t` ("Bazzar.io (Copy)")

- Homepage frame: `113:86` ("Landing Page", 1920×5823)
- Signup frame: `210:1488` ("Signup", 1440-wide, two-column)
  **Fidelity:** "Figma as loose reference" — direction/structure from Figma; conversion best-practices + locked brand tokens win over exact pixels.

## Locked decisions (this session)

1. **CTA color:** hot-pink `#D1006C` primary CTAs now permitted (palette lock amended 2026-08-04). Signup submit = pink; homepage buttons stay ink as the Figma shows.
2. **Signup scope:** re-skin only. Two-column visual layout, but keep existing fields (email, full name, password, terms) + Google OAuth + role picker + claim banner. **No** new fields (business name/phone/category/location/confirm-pw), **no** Apple button, **no** schema/backend work.
3. **Testimonials:** build styled card row, seed with curated static wedding quotes (drafted here), swap to a data source later.

## Auth decisions (2026-08-04, resume session — these supersede the S1/S2 layout notes below)

4. **Split BOTH auth pages.** The Figma two-column split now applies to **login _and_ signup** so auth stays unified (login was just redesigned in #65; leaving it centered while signup went split would look inconsistent). The shared `(auth)/layout.tsx` — today a centered `max-w-md` shell with a wordmark header + footer — is slimmed to a **full-bleed passthrough**; its chrome is absorbed into the split panels.
5. **Shared `AuthBrandPanel` (left, ~55%), Figma-faithful with illustration.** Cream→haldi gradient (`#fbf7ee`→`#fff2d5`), static `baazar.` wordmark (hot-pink period), an **inline brand SVG illustration** committed to the repo — **NOT** the Figma export (it expires in ~7 days and would burn the scarce ~3-remaining monthly MCP reads; swap to the exact Figma export later if pixel-match is wanted), plus a context-aware **heading + 3 benefit chips**. Hidden below `lg`; mobile shows a compact wordmark+tagline above the form.
6. **Forms are behavior-preserving re-skins**, moved into the right column (~45%), primary CTAs → hot-pink. Only `(auth)/` files change → **no collision** with the concurrent homepage work on `page.tsx` / `HomepageHero.tsx`. Same branch `feat/homepage-signup-redesign` so homepage + auth ship in unison.

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

## AUTH — split-screen, `login` + `signup` unified

Files touched (only these — no overlap with the homepage work):
`src/app/(auth)/layout.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/signup/signup-form.tsx`, `src/app/(auth)/login/page.tsx`, `src/components/auth/LoginForm.tsx`, plus new shared components under `src/components/auth/`.

### A0. Preserved behaviors (hard requirements — re-skin, not re-wire)

**Signup** (`signup-form.tsx`):

- Role picker (couple 🎉 / vendor 🏪) — hidden & locked when `prefilledRole` came from a claim token (role forced vendor).
- "Claiming your business" context banner (claim-token decode via service role, in `signup/page.tsx`).
- Continue-with-Google OAuth (role persisted via cookie round-trip).
- Email / full-name / password (min 8) + Terms agreement gate.
- `return_to` + `?role=` handling; claim token wins over `?role=`.

**Login** (`LoginForm.tsx`):

- Email / password sign-in; `redirect` query → post-login destination.
- Forgot-password link (preserves `redirect`); signup link (preserves `return_to`).
- Continue-with-Google OAuth. `Suspense` wrapper (uses `useSearchParams`).

### A1. Shared shell — `AuthSplitLayout` + `AuthBrandPanel`

- **`(auth)/layout.tsx`** → slim full-bleed passthrough: `min-h-screen bg-cream` (or the brand-panel gradient bleeds full-bleed and the form column is white). Remove the centered `max-w-md` wordmark header + footer chrome — it moves into the split.
- **`AuthSplitLayout`** (new, `src/components/auth/AuthSplitLayout.tsx`): CSS grid — left brand panel `~55%` (`lg:grid-cols-[1.1fr_0.9fr]` or similar), right form column `~45%` white, centered form `max-w-md`. Stacks to single column under `lg` (form first). Accepts `brand` content + `children` (the form).
- **`AuthBrandPanel`** (new, `src/components/auth/AuthBrandPanel.tsx`): cream→haldi gradient bg, `baazar.` serif wordmark (hot-pink period, mirrors `(auth)/layout.tsx`'s current mark), inline **brand SVG illustration**, then a **context-aware `heading` + `subcopy` + 3 `chips`** (all props with brand defaults). `hidden lg:flex`. A **compact wordmark+tagline header** renders above the form on mobile (shared small component so the brand still shows when the panel is hidden).
- **Illustration:** new inline SVG committed at `src/components/auth/AuthBrandIllustration.tsx` (or an `.svg` asset) — on-brand cream/haldi/pink celebratory motif. No external/expiring dependency. (Follow-up: swap to exact Figma handshake export for pixel-match.)

### A2. Signup right panel — re-skin, same fields

- Wrap `SignupForm` via `AuthSplitLayout`. `signup/page.tsx` passes claim/role context into both the brand panel (copy) and the form (unchanged props).
- **Brand panel copy is role-aware:**
  - vendor (or claim / `?role=vendor`): heading "Join Baazar as a Vendor" · chips: No listing fees · Verified leads (pre-committed deposit) · Culture-focused marketplace.
  - couple (default / picker visible): heading "Plan your celebration with Baazar" · chips: Verified vendors · Secure 5% deposit · Your whole celebration in one place.
  - When the picker is visible (no prefill), default couple copy; swap panel copy on role toggle (front-end, optional nicety).
- **Form keeps existing fields only:** Full Name, Email, Password, Terms → primary submit relabeled **"Create Account"** in **hot-pink**, "or" divider, **Google** button (keep), footer terms line. **Drop** Figma's Business Name / Phone / Category / Service Location / Confirm Password / Apple. Field surfaces styled to the Figma register (`#f6f8fa` fill, `#e5e7eb` border, ~12px radius) mapped to our tokens. The outer shadcn `Card` chrome may be dropped since the form now sits in its own column — keep primitives (`Button`/`Input`/`Label`/`Separator`).

### A3. Login right panel — re-skin, same logic

- Wrap `LoginForm` via `AuthSplitLayout`. Brand panel uses **default (couple-leaning) brand copy** in a "Welcome back" register — heading "Welcome back" · subcopy about the marketplace · same default chips.
- Keep all form logic from #65 (email/password, forgot-password, Google, `redirect`). Primary "Sign in" → hot-pink. Drop/loosen the outer `Card` to match signup's column treatment so the two pages are visually identical minus the form body.

### Auth build order

A1 shared shell (`AuthSplitLayout` + `AuthBrandPanel` + illustration + slim `layout.tsx`) → A2 signup form re-skin → A3 login form re-skin. Verify A0 behaviors for **both** pages (run existing signup + login e2e) before merge.

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
- **Auth A1 split-screen shell** → search "split screen auth" / "authentication layout" / "sign up split" (adapt one shared `AuthSplitLayout` used by both login + signup).
- **Auth A2/A3 forms** → reuse existing shadcn Button/Input/Label/Separator (already in repo); no new form library.
  Existing repo components to reuse (do not rebuild): `HomepageHero`, `CategoryHoverExpand(+Mobile)`, `SignupForm`, `LoginForm`, `GoogleIcon`, shadcn primitives.

## Out of scope / flagged follow-ups

- Real "Trusted by" partner logos (H1) — placeholder for now.
- `testimonials` data source (H4) + `is_featured` vendor flag (H5) — static now, schema later.
- Richer vendor signup form + Apple OAuth — deferred (already partly covered by the 6-step onboarding wizard).
- Exact Figma handshake illustration export — using an inline brand SVG now; swap for pixel-match later.
- `DESIGN.md` update to record the pink-CTA amendment.
- Mobile frames not in Figma — derive responsive behavior ourselves (single-column stacks, hero search full-width, auth brand panel hidden under `lg`).

## Verification

- Homepage: role-aware vendor CTA still hides for couples; category counts still live; trust trio intact.
- Signup: role picker + claim banner + Google OAuth + terms gate + return_to/role params all functional (run existing signup e2e).
- Login: email/password sign-in + forgot-password link + Google OAuth + `redirect` param + signup link all functional (run existing login e2e).
- Both auth pages responsive: brand panel hidden under `lg`, form single-column with compact wordmark header; no horizontal scroll.
- Full CI green before merge (incl. e2e) per [[merge-rule-full-ci-green]]. Delete any specs for removed UI in the same PR ([[delete-specs-with-features]]).
