# Baazar Footer Design Spec

**Date:** 2026-05-24
**Component:** Site footer (#5 of 6 in Day-1 Baazar brand-work queue)
**Status:** Approved direction; ready for implementation plan

---

## Goal

Replace the shadcn-baseline `src/components/ui/Footer.tsx` with the Direction-C editorial footer: a full-bleed black hero band carrying the cycling 4-script wordmark + in-hero newsletter signup, sitting above a cream utility band with 2 link columns + brand blurb + legal row. Move the footer out of the `max-w-7xl` content wrapper so both bands can span the full viewport width. Add a `newsletter_signups` table + `POST /api/newsletter/subscribe` endpoint that idempotently captures emails without leaking subscription state.

## Non-goals

- **Newsletter sending infrastructure.** No Resend/Mailchimp wire-up. Form persists emails only; sending is a follow-up PR.
- **Locale switching.** The 4-script wordmark cycle and legal-row script glyphs are passive cultural signatures, not a locale switcher. No `i18n` infrastructure ships with this PR.
- **Aspirational link teasing.** No "Real weddings · soon", "Pricing · soon", "About · soon" placeholders. Footer ships only routes that exist.
- **Categories sub-routes.** `/vendors/photographers` etc. don't exist Day-1; the search-bar's category pill handles category filtering. No Discover/categories column in the footer.
- **Homepage hero footer.** This PR drops the footer into the `(marketplace)` layout group only. Dashboard + root layouts are out of scope until the homepage exists.
- **Newsletter unsubscribe / confirmation flow.** Day-1 is a one-way capture funnel. Unsubscribe + double-opt-in land when we wire actual sending.

---

## Architecture

Single `Footer` component composed of two visual bands and four logical regions.

```
<footer class="baazar-footer">                          full-bleed wrapper
  <div class="hero-band">                               bg-ink, py-section
    <div class="inner">                                 max-w-7xl, gutter
      <p class="tagline">Made in Chicago</p>            absolute top-right
      <h2 class="wordmark-cycle">बाज़ार.</h2>           4-script JS rotation
      <div class="nl-row">                              hairline-separated
        <NewsletterLabel />                             left: kicker + accent
        <NewsletterForm />                              right: input + orb
      </div>
    </div>
  </div>
  <div class="body-band">                               bg-cream, py-xxl
    <div class="inner">                                 max-w-7xl, gutter
      <div class="cols">                                3 cols / 1 col mobile
        <BrandBlurbColumn />
        <ForVendorsColumn />
        <CompanyColumn />
      </div>
      <div class="legal-band">                          border-t hairline
        <LegalLeft />                                   © + Terms/Privacy/Contact
        <LangDots />                                    4 static script glyphs
      </div>
    </div>
  </div>
</footer>
```

### Component decomposition

| Component                                                 | Type             | Responsibility                                                                                                                                                  |
| --------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/layout/Footer.tsx`                        | Server component | Top-level composition of HeroBand + BodyBand. No client state.                                                                                                  |
| `src/components/layout/footer/WordmarkCycle.tsx`          | Client component | The cycling 4-script wordmark. Owns interval timer + IntersectionObserver. Respects `prefers-reduced-motion`. Renders fallback static Devanagari pre-hydration. |
| `src/components/layout/footer/NewsletterForm.tsx`         | Client component | The in-hero email pill + arrow orb. Manages local form state (default / submitting / success / error). Posts to `/api/newsletter/subscribe`.                    |
| `src/components/layout/footer/LangDots.tsx`               | Server component | Static 4-script glyphs in legal row. `title=` attrs for screen readers, no interactivity.                                                                       |
| `src/app/api/newsletter/subscribe/route.ts`               | API route        | `POST` handler. Validates email (zod), upserts into `newsletter_signups`, always returns `{ok: true}` (idempotent for privacy).                                 |
| `supabase/migrations/00039_create_newsletter_signups.sql` | Migration        | New table `newsletter_signups (id, email citext UNIQUE, source, user_id?, created_at)` + insert-only RLS for anon + authenticated.                              |
| `src/app/(marketplace)/layout.tsx`                        | Modify           | Move `<Footer />` outside the `max-w-7xl` `<main>` wrapper so it can render full-bleed.                                                                         |
| `src/components/ui/Footer.tsx`                            | Delete           | Replaced. No other call sites (`grep` confirms only `(marketplace)/layout.tsx` imports it).                                                                     |

The footer subdirectory at `src/components/layout/footer/` groups the three new sub-components without polluting the broader `layout/` namespace.

---

## Black hero band

Full-bleed `bg-ink` (`#1B1414`). Vertical padding `pt-section pb-xl` (96 / 48). Inside, a `max-w-7xl mx-auto` inner container with horizontal gutter `px-xl md:px-xxl` (24 / 56).

### Tagline (top-right)

- Text: `MADE IN <span class="text-haldi">CHICAGO</span>`
- Typography token: `micro` (10px / 600 / uppercase / 0.06em tracking)
- Color: ink-soft, "Chicago" word in haldi
- Position: absolute top-0 right of inner container on desktop; static (above wordmark, left-aligned) under 720px
- The single haldi word here is one of the at-most-two haldi appearances per page allowed by the M+ palette rule (DESIGN.md). The Footer instance can never appear with a second haldi accent above it on the same page; the page-level haldi budget is the homepage's responsibility, not the footer's.

### Wordmark cycle

- Element: `<h2 class="wordmark-cycle" aria-label="Baazar">`
- Initial glyph (pre-hydration): `बाज़ार<span class="dot">.</span>` in Tiro Devanagari Hindi
- Size: `clamp(60px, 16vw, 200px)` font-size, weight 400, line-height 0.85, letter-spacing -0.03em
- Color: cream `#FBF6EC` for the word, hot-pink `#D1006C` for the trailing dot
- **Cycle sequence** (loops):
  1. `बाज़ार.` — Tiro Devanagari Hindi (Hindi)
  2. `بازار.` — Noto Nastaliq Urdu (Urdu) — `font-size: 0.85em` for visual parity
  3. `بازار.` — Amiri (Arabic Naskh)
  4. `بازار.` — Markazi Text (Persian / Farsi)
- **Timing:** 3.5s hold + 400ms crossfade (matches the locked PL-A preloader's wordmark-cycle timing, reuses motion tokens `duration.long` + cubic-bezier `(.22,1,.36,1)`)
- **Visibility-aware:** an IntersectionObserver (`threshold: 0.1`) pauses the cycle when the footer is offscreen and resumes on re-entry. Saves battery on long-scroll pages.
- **Reduced motion:** when `prefers-reduced-motion: reduce`, the cycle never starts; the wordmark stays on Devanagari permanently.
- **SSR/hydration:** the server renders the Devanagari frame statically. The client component takes over after hydration and begins cycling.
- **Accessibility:** outer `<h2>` has `aria-label="Baazar"` so AT users hear a single stable label regardless of which script is rendered. The cycling glyphs are decorative (`aria-hidden="true"` on the inner spans).

### Newsletter row (in-hero)

Sits directly below the wordmark, separated by `border-t border-cream/12` (`rgba(251,246,236,0.12)`) hairline + 24px gap. Flexbox row, justified.

#### Label (left)

- Layout: inline kicker + Spectral-italic accent on the same baseline
- Kicker: `The Bazaar Letter` (typography token `kicker`, color ink-soft)
- Accent: `monthly, no noise` (Spectral italic 500, 15px, color cream, leading space 12px)

#### Form (right)

- Element: `<form>` posting to `/api/newsletter/subscribe` (handled client-side via fetch, prevents default)
- Max-width 480px on desktop, full-width on mobile
- Email input: rounded pill (`rounded-full`), padding `12px 18px`, font-size 14px
  - Background: `bg-cream/6` (`rgba(251,246,236,0.06)`)
  - Border: 1px `border-cream/16`
  - Placeholder color: `cream/45`
  - Focus border: hot-pink `#D1006C`
- Submit button: 40px hot-pink circle ("orb"), right-arrow icon (lucide `ArrowRight`)
  - Hover: scale 1.06 with cubic-bezier `(.22,1,.36,1)`, 200ms
  - Active: scale 0.96
- Visually-hidden `<label htmlFor="footer-newsletter-email">Email address</label>` for screen readers

#### States (NewsletterForm client component)

| State            | Trigger                                            | Visual                                                                                                                     |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **default**      | Mount                                              | Empty input, arrow icon orb                                                                                                |
| **error-format** | Submit with empty or invalid email (client zod)    | Border haldi-tinted, inline helper text below input: `Doesn't look right — try again.` (haldi color, 12px)                 |
| **submitting**   | Submit with valid email                            | Input disabled (opacity 0.6), orb shows spinner (CSS keyframe rotate, 0.7s linear)                                         |
| **success**      | API returns `{ok: true}` (always after submitting) | Input value replaced with `Subscribed — keep an eye out.` (haldi color), orb shows checkmark. After 5s → reset to default. |
| **error-server** | Fetch fails (network) or non-2xx response          | Border haldi-tinted, helper text: `Something glitched — try once more.`                                                    |

Already-subscribed emails are treated as success (the API upserts and returns `{ok: true}` either way). This prevents the form from leaking which addresses are on the list.

---

## Newsletter API + data

### Migration `00039_create_newsletter_signups.sql`

```sql
-- newsletter_signups: capture-only table for "The Bazaar Letter" footer form
-- and any future signup surfaces (homepage hero, post-booking, etc.). Idempotent
-- on email; never reveals subscription state to clients (insert-only RLS).

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE newsletter_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'footer',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX newsletter_signups_created_at_idx ON newsletter_signups (created_at DESC);

ALTER TABLE newsletter_signups ENABLE ROW LEVEL SECURITY;

-- Anyone can INSERT (including anon visitors).
-- Nobody SELECTs/UPDATEs/DELETEs except service role.
CREATE POLICY "anyone can subscribe"
  ON newsletter_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
```

### API route `src/app/api/newsletter/subscribe/route.ts`

- Method: `POST`
- Request body: `{ email: string, source?: string }` (source defaults to `'footer'`, capped to ~64 chars allowlisted)
- Validation: zod schema; `email` is `z.string().email().max(254)`, `source` is `z.enum(['footer', 'hero', 'post-booking'])` defaulting to `'footer'`
- Auth: derives `user_id` from session cookie if present; null for anonymous
- Insert: `supabase.from('newsletter_signups').insert({ email, source, user_id }).select().single()` — uses the anon/authenticated client (RLS-bounded)
- On unique-violation (Postgres error code `23505`): swallow and return success — already subscribed
- On any other failure: log + return HTTP 500 with `{ok: false}` (triggers the client's `error-server` state)
- On success: HTTP 200 with `{ok: true}`
- Always logs an analytics event (`newsletter_signup_submitted`) for observability — even errors, to detect bot floods later

---

## Cream body band

Full-bleed `bg-cream` (page-default, no visual seam from main content). Vertical padding `pt-xxl pb-lg` (64 / 32). Inner `max-w-7xl mx-auto` with same gutter as hero band.

### Columns (top region)

Grid `lg:grid-cols-[1.5fr_1fr_1fr] grid-cols-1`, gap `xxl` (56px) on desktop, `xl` (48px) when stacked.

#### Brand-blurb column (left, takes 1.5fr)

```
<h4>baazar<span class="text-hot-pink">.</span></h4>
<p>Chicago's marketplace for South Asian wedding vendors. Discover,
   compare, and book with confidence.</p>
```

- Wordmark: Spectral 800, 24px, letter-spacing -0.01em
- Body copy: token `body-sm` (14px, color ink-muted, line-height 1.55, max-width 320px)
- Copy is identical to the existing footer's blurb — keeps content stable.

#### For-vendors column

| Label              | Route        |
| ------------------ | ------------ |
| List your business | `/signup`    |
| Vendor dashboard   | `/dashboard` |

The signup page has its own in-page role picker (Couple / Vendor), so the link doesn't need to pre-select the role. If we want vendor-prefill later, add `?as=vendor` here and a `useSearchParams()` hook in `src/app/(auth)/signup/page.tsx` — separate PR.

#### Company column

| Label   | Route                    |
| ------- | ------------------------ |
| Terms   | `/terms`                 |
| Privacy | `/privacy`               |
| Contact | `mailto:hello@baazar.io` |

- Column headers: typography token `kicker` (11px / 600 / uppercase / 0.14em tracking, color indigo)
- Links: 14px, color ink, 5px vertical padding (for a 14px-line target ≈ 24px tap target — slightly under the 44px ideal but acceptable for footer)
- Hover: link color → indigo, 150ms transition (matches DESIGN.md `link-hover` state for footer-class context)

### Legal band (bottom region, inside body band)

`border-t border-hairline pt-md` (24px gap above). Flex row, justified, vertically centered. Stacks to two left-aligned rows under 720px.

#### Left

`© 2026 Baazar Marketplace` + 18px gap + `Terms` · `Privacy` · `Contact` text-links (color ink-soft, hover ink, 12px). The links are duplicated from the Company column intentionally — convention for users who hunt for legal at the very bottom.

#### Right — language dots

Four script glyphs at 14px:

| Script  | Glyph    | Font                      | Title attr           |
| ------- | -------- | ------------------------- | -------------------- |
| Hindi   | `बाज़ार` | Tiro Devanagari Hindi     | `Hindi (Devanagari)` |
| Urdu    | `بازار`  | Noto Nastaliq Urdu (12px) | `Urdu (Nastaliq)`    |
| Arabic  | `بازار`  | Amiri                     | `Arabic (Naskh)`     |
| Persian | `بازار`  | Markazi Text (16px)       | `Persian / Farsi`    |

- 18px gap between glyphs
- Devanagari is the "active" one (ink color + weight 600); others are ink-soft
- Wrapper has `aria-label="Scripts"` for AT context
- No interactivity. No hover state. They are signage, not navigation.

---

## Mobile (under 720px)

- Hero band padding: `pt-xl pb-lg` (48 / 32)
- Tagline: not absolute — sits above wordmark, left-aligned, 16px gap
- Newsletter row: `flex-col`, gap 16px. Form takes full width, no max-width cap.
- Body band padding: `pt-xl pb-md` (48 / 24)
- Columns: stack to 1-col, gap `lg` (32px)
- Legal band: `flex-col`, gap 16px, both rows left-aligned

---

## Motion + accessibility

### Motion tokens

| Element              | Property         | Duration | Easing                      |
| -------------------- | ---------------- | -------- | --------------------------- |
| Wordmark cycle fade  | opacity          | 400ms    | `cubic-bezier(.22,1,.36,1)` |
| Newsletter orb hover | transform: scale | 200ms    | `cubic-bezier(.22,1,.36,1)` |
| Input focus border   | border-color     | 200ms    | linear                      |
| Body-band link hover | color            | 150ms    | linear                      |

All tokens already live in DESIGN.md's `motion:` block.

### Reduced motion

- Wordmark cycle: never starts. Stays on Devanagari.
- Newsletter orb hover: no scale transform; color only.

### Accessibility

- `<h2 aria-label="Baazar">` on the wordmark cycle (single stable label, cycling glyphs decorative)
- `<label>` for newsletter email input (visually hidden, not just placeholder)
- `aria-invalid="true"` + `aria-describedby="footer-newsletter-error"` on input in error state
- `aria-live="polite"` on the error/success message slot below the input
- All link/button focus states use `focus-visible:ring-2 focus-visible:ring-hot-pink focus-visible:ring-offset-2 focus-visible:ring-offset-ink` (in hero band) or `ring-offset-cream` (in body band)
- LangDots wrapper: `aria-label="Scripts"` + per-glyph `title` attrs

---

## Layout integration

### Before

```tsx
// src/app/(marketplace)/layout.tsx
<div className="flex min-h-screen flex-col">
  <Navbar />
  <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">{children}</main>
  <Footer /> {/* but Footer's content is also wrapped in max-w-7xl */}
</div>
```

Footer renders below `<main>` (outside the wrapper visually) but the OLD `Footer.tsx` constrained itself internally to `max-w-7xl`. The new Footer needs to be **truly full-bleed** so the black hero band spans the viewport.

### After

```tsx
// src/app/(marketplace)/layout.tsx
<div className="flex min-h-screen flex-col">
  <Navbar />
  <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">{children}</main>
  <Footer /> {/* full-bleed; each band has its own max-w-7xl inner wrapper */}
</div>
```

No JSX structural change — the existing `<Footer />` placement is already outside `<main>`. The only change is that the new `Footer` component renders `<footer>` at the root with no width constraint, so its `bg-ink` hero band paints edge-to-edge.

---

## Out of scope (deferred follow-ups)

- **Resend integration** — wire actual send + double-opt-in. Needs Resend audience config, confirmation email template, unsubscribe route. Track as separate PR.
- **Newsletter management** — admin view of signups, CSV export, segment by `source`. Service-role only; no current admin UI surface.
- **Locale switching** — actual i18n with route prefixes (`/hi/`, `/ur/`, etc.) and content translation. The 4-script signal in the footer is intentionally passive Day-1.
- **Footer in dashboard layout** — `src/app/dashboard/layout.tsx` does not currently use Footer. Adding it requires UX decision (full footer or shrunken variant?). Defer.
- **Footer in root layout (homepage)** — homepage doesn't exist yet; add when it does.
- **"Coming Soon" link affordance** — pattern for teasing routes that don't exist (greyed link with "soon" tag). Skip until we have a route worth teasing.
- **Sticky region awareness** — if the page is shorter than viewport, footer can float oddly. The `flex min-h-screen flex-col` wrapper already pins it to the bottom; no additional sticky logic needed Day-1.
- **Bot/abuse rate-limiting on newsletter endpoint** — a single POST per session is hard to flood, but we have no Upstash/edge rate limiter. If signups start showing spam in the table, add Cloudflare Turnstile or rate-limit middleware.

---

## Visual references

- Brainstorm mockups archived at `.superpowers/brainstorm/55066-1779426490/content/`:
  - `footer-directions.html` — original 3 directions (A Atlas / B Slab / C Wordmark Hero)
  - `footer-c-newsletter-v2.html` — newsletter placement A/B (strip vs in-hero)
  - `footer-live-preview.html` — interactive preview with cycle animation + form states (matches what ships)

---

## Open questions

None blocking. The Discover-column-drop decision was approved during the live-preview review. Categories link to a dedicated route can land later if/when the route exists.
