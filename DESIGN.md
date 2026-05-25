---
version: alpha
name: Baazar.io design system
description: South Asian wedding marketplace, Chicago. Modern editorial commerce base (Ssense / MR PORTER / Aimé Leon Dore / Cult Gaia lineage) with a textile-derived jewel-tone palette (M+ — Festival + Yellow Pop) and a hybrid free-now / paid-later typography plan (Spectral + Schibsted Grotesk Day 1, Gambarino + Apparat from Indian Type Foundry on v2). Cream canvas, ink display + CTA, indigo as system chrome, hot pink as italic display accent and save-state, haldi yellow as a highlighter-treatment scoped to one word per page. Bold-not-loud — every move on the page earns its weight; cultural anchoring lives in palette + typography + curation language, never in ornament.

colors:
  cream:         "#FBF6EC"
  cream-soft:    "#F4ECDC"
  indigo:        "#2E3DA3"
  indigo-soft:   "#5868C6"
  ink:           "#1B1414"
  hot-pink:      "#D1006C"
  haldi:         "#F2B92E"
  hairline:      "#E8DFC8"
  hairline-soft: "#EFE7D2"
  ink-muted:     "#5F5650"
  ink-soft:      "#8A8079"
  error:         "#B81628"
  on-ink:        "#FBF6EC"
  on-indigo:     "#FBF6EC"
  on-pink:       "#FBF6EC"
  on-haldi:      "#1B1414"
  scrim:         "#1B1414"

typography:
  display:           "'Spectral', Georgia, serif"
  body:              "'Schibsted Grotesk', system-ui, -apple-system, sans-serif"
  wordmark-deva:     "'Tiro Devanagari Hindi', serif"        # Hindi
  wordmark-nastaliq: "'Noto Nastaliq Urdu', serif"            # Urdu
  wordmark-naskh:    "'Amiri', serif"                          # Arabic
  wordmark-persian:  "'Markazi Text', serif"                   # Farsi / Persian
  mono:              "'DM Mono', ui-monospace, SFMono-Regular, monospace"

typography-import:
  google-fonts:  "https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,700&family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Tiro+Devanagari+Hindi:ital@0;1&family=Noto+Nastaliq+Urdu:wght@400;700&family=Amiri:ital,wght@0,400;0,700;1,400&family=Markazi+Text:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap"

# Token format: "font-size / font-weight / line-height / letter-spacing [/ transform]"
typography-scale:
  display-lg:    "clamp(48px, 7.5vw, 84px) / 800 / 0.92 / -0.025em"
  display-md:    "clamp(36px, 5vw, 60px) / 800 / 0.94 / -0.022em"
  display-sm:    "clamp(28px, 3.5vw, 44px) / 700 / 0.96 / -0.020em"
  title-md:      "26px / 700 / 1.10 / -0.012em"
  title-sm:      "20px / 600 / 1.20 / -0.005em"
  body-lg:       "18px / 400 / 1.55 / 0"
  body:          "16px / 400 / 1.55 / 0"
  body-sm:       "14px / 400 / 1.50 / 0"
  meta:          "13px / 500 / 1.45 / 0"
  caption:       "12px / 500 / 1.40 / 0"
  kicker:        "11px / 600 / 1.30 / 0.14em / uppercase"
  micro:         "10px / 600 / 1.30 / 0.06em / uppercase"
  mono-meta:     "12px / 500 / 1.40 / 0"

# 4px base with 2px micro step. Use named tokens; never inline magic numbers.
spacing:
  micro:   "2px"   # icon adjustments, inline tweaks
  xxs:     "4px"   # hair separators, dense table rows
  xs:      "8px"   # tight gaps between related items
  sm:      "12px"  # chip padding, card meta spacing
  base:    "16px"  # default — card padding, gap between siblings
  md:      "24px"  # card-to-card gutters, button vertical rhythm
  lg:      "32px"  # section-internal spacing
  xl:      "48px"  # between elements inside hero
  xxl:     "64px"  # section padding vertical (most marketplace bands)
  section: "96px"  # major page bands (hero, footer)
  hero:    "128px" # full-bleed hero padding (display-lg surfaces only)

# Editorial-commerce uses MINIMAL rounding. Most surfaces should have hard or near-hard corners.
radii:
  none:    "0"
  sm:      "4px"   # small surfaces, badge backgrounds
  md:      "6px"   # buttons, inline pills, "Sort: Most booked" controls
  lg:      "10px"  # cards, panels, modals
  full:    "9999px"# chips, hearts, circular icon buttons

# ONE elevation tier, period. Depth comes from hairlines + cream/white surface separation, not stacked shadows.
elevation:
  none:    "none"
  one:     "rgba(27,20,20,0.02) 0 0 0 1px, rgba(27,20,20,0.04) 0 2px 6px 0, rgba(27,20,20,0.10) 0 4px 8px 0"   # card hover-float, dropdowns, sticky reservation rail
  scrim:   "rgba(27,20,20,0.50)"   # modal backdrop fill

# Motion + timing. ease-out-quart is the system curve (no bounce, no elastic, per impeccable shared design laws).
motion:
  fast:       "200ms"
  medium:     "320ms"
  slow:       "600ms"
  cycle-hold: "3500ms"                        # wordmark steady-state cycle hold (per script)
  cycle-fade: "400ms"                         # wordmark crossfade between scripts
  ease-out:   "cubic-bezier(.22, 1, .36, 1)"  # ease-out-quart, the system default

# Named motion + interaction patterns. Component-level decisions, not just tokens.
components:
  vendor-card-hover:
    pattern:     "HV-B — lift + indigo arrow"
    lift:        "translateY(-3px)"
    photo-scale: "scale(1.04) inside overflow:hidden frame"
    arrow-orb:   "36px circle, colors.indigo fill, slides bottom-right from translateX(-8px) → 0"
    shadow:      "elevation.one on hover; border-color → transparent"
    timing:      "motion.medium / motion.ease-out"
    requires:    "vendor-selected single thumbnail (see Vendor portfolio note)"
  vendor-card:
    pattern:       "Editorial 4:5 portrait + indigo kicker + Spectral name + enriched meta row"
    photo:         "4:5 aspect, vendor-selected single thumbnail (see vendor portfolio note + build-time req)"
    badges:        "Verified pill top-left (indigo dot, cream-bg blur). Optional haldi 'Available {date}' pill below — only when ?date in URL AND vendor has no block on that date."
    body:          "Indigo uppercase kicker (category) → Spectral 21px name → meta row (neighborhood · indigo-dot Responds in Xh · X+ weddings) → 'From $X' price"
    save:          "Cream-bg heart top-right; outline ink unsaved, hot-pink filled saved"
    hover:         "HV-B (locked) — lift -3px + photo scale 1.04 + indigo arrow orb + elevation.one shadow"
    omissions:     "Wedding count omitted when <10. Response time omitted when SLA NULL. Date pill omitted when no search date or vendor blocked."
    cta:           "Implicit only — card click navigates to /vendors/[slug]; save heart captures separately. No explicit Inquire button on card (inquiry lives on profile page)."
  site-preloader:
    pattern:     "PL-A — accelerated wordmark cycle"
    duration:    "~1.5s first paint"
    cycle:       "600ms per script, no hold, 200ms crossfade between"
    progress:    "1px haldi hairline beneath, transform: scaleX(0 → 1) over duration"
    transition:  "settles to motion.cycle-hold cadence once page interactive"
  vendor-gallery:
    pattern:     "Three-surface composition — focal carousel + grid + shared lightbox"
    surfaces:    "(1) focal carousel (5-7 vendor-curated hero shots), (2) grid (12-24 photos), (3) shared full-screen lightbox modal"
    role-split:  "Carousel = editorial first impression. Grid = complete catalog (scan mode). Lightbox = immersive zoom (study mode)."
    state-model: "Single photo array on the vendor record. Both inline surfaces dispatch the same openLightbox(photoIndex) action."
    libraries:   "Embla + shadcn Carousel + Framer Motion (focal carousel); yet-another-react-lightbox (lightbox — pending lock); CSS grid (grid)"
    tokens:      "radii.lg max on all surfaces (override Skiper carousel's default 24px → 10px). Lightbox uses elevation.scrim backdrop, colors.cream chrome on scrim, motion.fast fade-in."
  button:
    pattern:       "Soft editorial — 6px corners, ink primary, -3px lift on hover"
    variants:      "primary (ink), secondary (outline-ink), tertiary (ghost), link (text + underline-on-hover), destructive (error)"
    sizes:         "sm (32px), md (40px default), lg (48px)"
    hover:         "translateY(-3px) + variant-tinted shadow + slight bg darken — shares -3px lift family with vendor-card-hover (HV-B)"
    focus:         "2px outline in colors.indigo at 2px offset (colors.error for destructive)"
    motion:        "220ms — slightly faster than motion.medium (320ms) for snappier interactive response"
    api:           "iconLeading + iconTrailing slots; asChild via Radix Slot; isLoading replaces children with inline spinner; backwards-compat aliases for default/outline/ghost variant names"
    accessibility: "WCAG AA on all variant×state combos. Icon-only requires aria-label."
    destructive:   "NEVER delete-on-first-click — consumers wire to a confirmation primitive (typed-confirm for high-stakes, single-tap for low-stakes)"
  tooltip:
    pattern:       "Radix-based, opt-in. Wraps icon-only Buttons (and any interactive element) when a hover-label is needed."
    surface:       "ink panel with cream text, 4px corners (tighter than buttons to signal a different layer)"
    typography:    "caption token — 12px / 500 / Schibsted Grotesk"
    timing:        "400ms open delay, 100ms close, 150ms fade-in (motion.ease-out)"
    api:           "<Tooltip content='...'>{trigger}</Tooltip>"
  search-bar:
    pattern:       "Segmented pill — When / Category / What + ink submit orb"
    interaction:   "Click segment → active state (ink-inset ring + cream-soft fill) + docked panel below. Click outside or Esc to close."
    pickers:       "When = react-day-picker, Category = vertical list with icons, What = free-text + typeahead popular queries"
    variants:      "hero (64px segments, hero placement) and sticky-header (52px segments, sticky on /vendors)"
    mobile:        "Collapses to single 'Search Chicago weddings' bar → Vaul bottom sheet with stacked sections + sticky ink Search button"
    submit:        "Always navigates to /vendors with URL params (?date=, ?category=, ?q=)"
    motion:        "200ms panel fade-in, 320ms sheet open. -1px lift on orb hover (lighter than button -3px since orb is smaller)"
    accessibility: "Full keyboard nav, aria-expanded + aria-controls on segments, role=dialog on panels, prefers-reduced-motion honored"
  filter-chip:
    pattern:       "5 variants — toggle, dropdown, with-count, applied-removable, all-filters trigger"
    surface:       "32px tall, pill-shaped (radii.full), ink fill on active, cream-soft fill on applied"
    interaction:   "Toggle = aria-pressed click flip. Dropdown = aria-expanded + docked panel. Applied = nested × button removes filter."
    motion:        "180ms hover bg, 200ms panel fade-in (motion.fast)"
    accessibility: "WCAG AA on all variant×state combos. Sheet uses focus trap; chip row keyboard-navigable."
  filter-sheet:
    pattern:       "Vaul side drawer (right desktop, bottom mobile) with sectioned filters + live-count footer CTA"
    sections:      "Trust · Price · Languages · Experience · Event types · Category-specific (conditional)"
    footer:        "Sticky — Clear-all link left, ink primary 'Show N vendors' CTA right with debounced live count"
    motion:        "320ms slide-in/out (motion.medium)"
  footer:
    pattern:      "Direction C — full-bleed editorial. Black hero band carries the 4-script cycling wordmark + in-hero newsletter signup; cream body band has 3 columns (brand blurb + For vendors + Company) and a legal row with static 4-script lang-dots."
    hero-band:    "bg-ink, py-section. Tagline 'MADE IN CHICAGO' top-right (Chicago in haldi — counts as one of the page's two haldi appearances). Wordmark cycles Devanagari → Nastaliq → Naskh → Persian on motion.cycle-hold + motion.cycle-fade, paused offscreen and under prefers-reduced-motion. Trailing dot always hot-pink."
    newsletter:   "In-hero, below wordmark + hairline. Label 'THE BAZAAR LETTER' kicker + Spectral italic 'monthly, no noise'. Email pill + 40px hot-pink arrow orb. POSTs to /api/newsletter/subscribe (idempotent — always returns {ok:true}). 5 states: default / submitting / success / error-format / error-server. Stub-only Day-1; Resend wire-up deferred."
    body-band:    "bg-cream, py-xxl. 3 cols at lg: brand blurb (1.5fr) + For vendors + Company. Column kickers indigo, links ink → indigo on hover. Mobile stacks to 1-col."
    legal-band:   "border-t hairline. Left: © Baazar 2026 + Terms/Privacy/Contact text-links (ink-soft → ink on hover). Right: 4 static lang-dots (Devanagari active, others ink-soft). No interactivity; title= attrs for AT."
    integration:  "Full-bleed; placed outside main's max-w-7xl wrapper in (marketplace)/layout.tsx. Each band has its own max-w-7xl inner wrapper for gutter alignment."
    accessibility:"WordmarkCycle h2 has stable aria-label='Baazar' (cycling glyphs aria-hidden). Newsletter form has visually-hidden label, aria-invalid + role='alert' on error. LangDots wrapper has aria-label='Scripts'. All focus-visible rings use hot-pink + ink offset on dark, cream offset on light."

# Future migration target (Indian Type Foundry — paid, ~$800/yr total)
typography-v2:
  display:       "'Gambarino', 'Spectral', Georgia, serif"
  body:          "'Apparat', 'Schibsted Grotesk', system-ui, sans-serif"
  wordmark-deva: "'Kohinoor Devanagari', 'Tiro Devanagari Hindi', serif"
  trigger:       "Swap once revenue positive. Tokens above are font-family aliases — every scale entry stays identical."
---

# Baazar.io — design system (alpha)

## Status

**Palette + typography locked as of 2026-05-22.** Spacing, elevation, component tokens, wordmark lockup, photography direction — still pending.

The Airbnb reference extraction that originally lived in this file is preserved at [`DESIGN-airbnb-reference.md`](./DESIGN-airbnb-reference.md). It remains useful as an anti-reference (we are not Airbnb) and as a vocabulary for component tokens.

## The palette — M+ "Festival + Yellow Pop"

**Lineage.** Modern editorial commerce base (Ssense / MR PORTER / Aimé Leon Dore / Cult Gaia restraint), with a textile-derived jewel-tone overlay drawn from real South Asian wedding palettes. Eleven directions explored; M+ won on three criteria: vendor cards survive over any wedding photography, the yellow gives the brand a recognizable pop without splitting brand voltage three ways, and the "yellow appears exactly twice per page" discipline prevents the maximalist trap.

### The five colors

| Token             | Hex       | OKLCH                  | Role                                                                                                                                                  |
| ----------------- | --------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors.cream`    | `#FBF6EC` | `oklch(0.97 0.018 90)` | Page canvas. Every floor.                                                                                                                             |
| `colors.indigo`   | `#2E3DA3` | `oklch(0.42 0.18 270)` | Chrome / system: kicker labels, filter chip outlines, links, focus rings, sort indicators.                                                            |
| `colors.ink`      | `#1B1414` | `oklch(0.18 0.005 30)` | Display headlines, body type, primary CTA. Never pure black.                                                                                          |
| `colors.hot-pink` | `#D1006C` | `oklch(0.57 0.24 0)`   | Italic display accent ("Quiet chaos"), save-heart filled state, category labels, wordmark accent.                                                     |
| `colors.haldi`    | `#F2B92E` | `oklch(0.81 0.15 80)`  | Highlighter treatment behind ONE word per page + small dot accents for time-sensitive markers. **Never a CTA. Never more than ~2 elements per page.** |

### Role discipline — the rules that keep M+ from collapsing

**Yellow.** Haldi yellow is the _rare_ color. The discipline:

- Used as a `background-color` highlighter behind exactly one word per page, padded `0 8px 4px 8px`, no border-radius. The "haldi treatment."
- May additionally appear as a 6–8px dot before a time-sensitive label ("12 days · Mehndi peak"). One marker per page max.
- **Never** a button background, an outline color, a link color, or a chrome color. If it stops being rare it stops being a brand move.

**Pink.** Hot pink is the _italic emphasis_ color, not an action color.

- The only italic accent inside display headlines (e.g., "Loud weddings. _Quiet chaos_.").
- The filled save-heart state on vendor cards (outline-only when unsaved, ink fill on hover, hot-pink fill when saved).
- Wordmark embellishment — a single character flourish only, never the whole mark.
- Category labels on vendor profile pages.
- **Never** a primary CTA. Ink owns CTAs.

**Indigo.** Indigo is the _system_ color — wherever the UI says "this is a control."

- Kicker labels at the top of every page section ("Baazar · Chicago weddings", "Filter by category").
- Filter chip outlines (default), filter chip fills (active state).
- Inline body links.
- Focus rings on text inputs, date pickers, all interactive elements.
- "Sort: Most booked" and similar sort/control labels.

**Ink.** Ink owns everything that needs to read as "the page itself."

- All display headline base color (with hot pink for italic emphasis).
- Body type, captions, metadata.
- Primary CTA background ("Browse vendors", "Reserve", "Inquire", "Continue").
- Star ratings on vendor cards.

**Cream.** Cream is the page; nothing else.

- Every page floor.
- Text color on ink CTAs, on indigo active filters, on hot-pink filled states.
- Hairline borders use the dedicated `hairline` / `hairline-soft` tokens, not cream itself.

### How M+ modulates into the vendor product surface

The vendor dashboard (`/vendors/*`) keeps the same tokens but **quiets the chrome** per PRODUCT.md principle 5 ("Brand modulates into product"):

- No haldi yellow highlighter on vendor surfaces — the "haldi treatment" is a marketing-register move.
- Hot pink reserved for the save-state and inquiry alert badges only. No italic display accents.
- Indigo continues to own chrome.
- Ink + cream + indigo carry 90%+ of vendor surfaces.

### Anti-references — what M+ deliberately is not

- **Not gold-on-burgundy.** No metallic gold, no burgundy. Haldi yellow is a flat-ink yellow, not a gradient or metallic.
- **Not bridal-pastel.** No dusty rose, no sage, no powder colors. Saturation stays at the jewel-tone end.
- **Not dark-mode marketplace.** Cream surface, never dark. Photography is the bright element on every page.
- **Not SaaS-cream-and-purple.** Indigo is a saturated cobalt-leaning blue, deliberately not the muted purples of Stripe / Linear / Vercel.
- **Not Airbnb Rausch.** The CTA is ink, not a hot color — that's the bigger move. Hot pink works _with_ ink as an emphasis color, not against it as a competing voltage.

## Typography — TY-C "ship free now, license ITF on v2"

**Decision.** Three voice words anchored the search: **Receipt** (matter-of-fact, transactional body), **Brass nameplate** (substantial display, not airy), **Loom-set** (hand-tuned character, not parametric). Two paid directions (Gambarino + Apparat from Indian Type Foundry; Migra + ABC Diatype from Pangram Pangram + Dinamo) and one free direction (Spectral + Schibsted Grotesk from Google Fonts) were rendered as full specimens.

**Hybrid path locked.** TY-C (free, Google Fonts) ships Day 1. TY-A (Gambarino + Apparat, Indian Type Foundry) is the v2 swap target once revenue is positive. The scale tokens are identical between versions; only `@font-face` declarations change. No component re-design needed at swap time.

### Day-1 families (TY-C)

| Role                        | Family                | Source                                                   | Weights used                    |
| --------------------------- | --------------------- | -------------------------------------------------------- | ------------------------------- |
| **Display**                 | Spectral              | Google Fonts (Production Type)                           | 500, 700, 800 + italic 500, 700 |
| **Body**                    | Schibsted Grotesk     | Google Fonts (Schibsted Foundry)                         | 400, 500, 600, 700, 800         |
| **Wordmark Devanagari**     | Tiro Devanagari Hindi | Google Fonts (John Hudson / Tiro Typeworks)              | 400 + italic 400                |
| **Mono (technical labels)** | DM Mono               | Google Fonts (Colophon Foundry, commissioned for Google) | 400, 500                        |

**Loader.** Single `@import` URL provided in frontmatter `typography-import.google-fonts`. Self-host equivalent via `fontsource` packages (`@fontsource-variable/spectral`, `@fontsource/schibsted-grotesk`, etc.) once the project moves past prototype.

### Why this picks clear the reflexes

- **Inter is out** (was placeholder in earlier mocks) — on the impeccable brand-register reflex-reject list.
- **Söhne is out** — not on the reject list, but it's the second-order Klim-Stripe-Notion reflex.
- **Fraunces, Playfair, Cormorant, DM Serif, Instrument Serif all out** — reject list.
- Spectral was commissioned by Google specifically as "an editorial serif for the web" — has more contrast and personality than the default Google serifs. Schibsted Grotesk is a Söhne-class workhorse without the Klim cost. Tiro Devanagari Hindi is John Hudson's modern Devanagari — high legibility, designed to pair with Latin serifs at display size.

### The type scale

| Token        | Size                       | Weight | Line-height | Tracking           | Use                                               |
| ------------ | -------------------------- | ------ | ----------- | ------------------ | ------------------------------------------------- |
| `display-lg` | `clamp(48px, 7.5vw, 84px)` | 800    | 0.92        | -0.025em           | Campaign hero, rare                               |
| `display-md` | `clamp(36px, 5vw, 60px)`   | 800    | 0.94        | -0.022em           | Homepage hero ("Loud weddings…")                  |
| `display-sm` | `clamp(28px, 3.5vw, 44px)` | 700    | 0.96        | -0.020em           | Vendor profile header, category hero              |
| `title-md`   | 26px                       | 700    | 1.10        | -0.012em           | Section header ("142 photographers near Chicago") |
| `title-sm`   | 20px                       | 600    | 1.20        | -0.005em           | Sub-section, card title                           |
| `body-lg`    | 18px                       | 400    | 1.55        | 0                  | Long-form intro, hero subhead                     |
| `body`       | 16px                       | 400    | 1.55        | 0                  | Default running text                              |
| `body-sm`    | 14px                       | 400    | 1.50        | 0                  | Card meta, descriptions                           |
| `meta`       | 13px                       | 500    | 1.45        | 0                  | CTAs, link text, "Sort: Most booked"              |
| `caption`    | 12px                       | 500    | 1.40        | 0                  | Filter chips, badges                              |
| `kicker`     | 11px                       | 600    | 1.30        | 0.14em (uppercase) | "Baazar · Chicago weddings"                       |
| `micro`      | 10px                       | 600    | 1.30        | 0.06em (uppercase) | "NEW" tag, micro-labels                           |
| `mono-meta`  | 12px                       | 500    | 1.40        | 0                  | Prices, technical codes, version tags (`DM Mono`) |

**Scale ratio.** Display steps are ≥1.25× apart (44 → 60 → 84 = 1.36×, 1.40×). Body steps tighten to 1.10–1.20× because reading-size differences need to be subtler. Per impeccable brand-register law.

**Italic accents.** Only one italic moment per display headline (e.g., "Loud weddings. _Quiet chaos_."). Italic body is reserved for vendor quote callouts. Both render in the display family's italic cut, not the body family's.

### Wordmark spec — the pan-cultural cycle

The mark is **the word "baazar" in cycling scripts** + Latin anchor. The cycle is the brand's signature motion. "Baazar" / "بازار" / "बाज़ार" is the same word across Hindi, Urdu, Persian, Arabic, Turkish, Pashto — a pan-cultural reality, not just a Hindi reference. The mark phases through four script settings to make that explicit.

**Structure.** `[CYCLING SCRIPT] — baazar`

- **Latin anchor**: "baazar" in `Spectral` 500, lowercase. Static, always visible. Lowercase intentional (Aimé Leon Dore / Cult Gaia editorial pattern).
- **Cycling pre-mark**: the non-Latin element rotates through four script settings. Always shows one at any moment; transitions are soft crossfades.
- **Separator**: em dash with hair-spaces (`—`), or — in compact contexts — a middot. Never a colon, never a slash.

**The four cycle steps** (in order):

| #   | Culture         | Script style                     | Glyphs | Face                        | x-height adjust                        |
| --- | --------------- | -------------------------------- | ------ | --------------------------- | -------------------------------------- |
| 1   | Hindi           | Devanagari                       | बाज़ार | `Tiro Devanagari Hindi` 400 | ~110% (headstroke clearance)           |
| 2   | Urdu            | Nastaliq (calligraphic, slanted) | بازار  | `Noto Nastaliq Urdu` 400    | ~115% (slanted descenders)             |
| 3   | Arabic          | Naskh editorial                  | بازار  | `Amiri` 400                 | ~105%                                  |
| 4   | Persian / Farsi | Modern Persian                   | بازار  | `Markazi Text` 500          | ~108% (designed to pair with Spectral) |

**Motion behavior.**

- Each script visible for **3.5 seconds**.
- Crossfade transition: **400ms** opacity cross-fade (no slide, no scale). Ease-out-quart.
- Cycle loops indefinitely on pages where the wordmark is visible. Resets to step 1 on page load.
- `prefers-reduced-motion: reduce` → motion disabled. The cycle picks **one of the four at random per page load** and stays static. Every script gets equal weight in the rotation so reduced-motion users still see all four cultures over time.

**Why this works.**

- The cultural anchor PRODUCT.md asks for is now _active_, not decorative — the brand is literally showing it's for all four cultures, not just Hindi (which would have been a regional flatten).
- The motion is rare on marketplace sites — most brands have static wordmarks. This is the kind of "what was that?" moment that gets noticed without being decorative for its own sake.
- The 3.5-second hold is long enough to read each one; the 400ms crossfade is short enough to not draw the eye away from the rest of the page.

**Pink accent.** A single dot embellishment may render in `hot-pink` — exactly one pink stroke per mark, max. Optional. Most natural placement: the dot of the second "a" in the Latin "baazar," static across all four cycle states.

**Future (v2).** On the swap to TY-A: Devanagari moves to `Kohinoor Devanagari` (ITF, designed by Satya Rajpurohit). The other three script faces stay on Google Fonts (Indian Type Foundry doesn't ship Nastaliq / Arabic / Persian comprehensively). Latin moves to `Gambarino` 500.

**Status.** Typographic skeleton + cycle behavior locked. Kerning, exact x-height alignment between scripts, the dot embellishment placement, lockup variants (horizontal / stacked / icon-only / mobile bar) — pending. Production cycle implementation (React state + `IntersectionObserver` to pause when off-screen + `prefers-reduced-motion` honoring) is a separate task.

### Migration to TY-A (v2)

**Trigger.** Swap once revenue is positive enough to absorb ~$800/yr typography licensing.

**What changes.** Two `@font-face` declarations and a tracking nudge:

```css
/* v2 — TY-A */
--font-display: 'Gambarino', 'Spectral', Georgia, serif;
--font-body: 'Apparat', 'Schibsted Grotesk', system-ui, sans-serif;
--font-deva: 'Kohinoor Devanagari', 'Tiro Devanagari Hindi', serif;
/* Gambarino runs ~3% wider than Spectral at display sizes;
   nudge display tracking from -0.022em to -0.026em. */
```

**What stays.** Every scale entry. Every component spec. Every accessibility ratio.

## Accessibility notes

### Color contrast (locked)

- Body type: `ink` `#1B1414` on `cream` `#FBF6EC` = ~14.5:1. WCAG AAA.
- CTA: `on-ink` `#FBF6EC` on `ink` `#1B1414` = same ratio inverted. AAA.
- Active filter chip: `on-indigo` `#FBF6EC` on `indigo` `#2E3DA3` = ~8.9:1. AAA.
- Highlighter: `on-haldi` `#1B1414` on `haldi` `#F2B92E` = ~10.3:1. AAA.
- Hot pink italic display accent on cream: `#D1006C` on `#FBF6EC` = ~5.2:1 — passes AA for ≥18pt text. Use only on large display type (≥24px), never on body.

### Typography accessibility

- Body line-height at 1.55 exceeds WCAG 1.5× recommendation.
- Minimum body size is `body-sm` 14px — never smaller for reading copy.
- `kicker` and `micro` (11px / 10px) carry semantic weight only at uppercase — they are labels, not reading copy.
- `prefers-reduced-motion`: no display-type animations on initial render except a fade-in (opacity 0 → 1 over 200ms). Keyframed letterform animation is reserved for campaign pages and respects the user preference.

## Spacing, radii, elevation

**Spacing.** 4px base with a 2px micro step. Use named tokens (`spacing.xs`, `spacing.base`, etc.); never inline magic numbers in components.

| Token             | Value | Use                                                |
| ----------------- | ----- | -------------------------------------------------- |
| `spacing.micro`   | 2px   | Icon adjustments, inline tweaks                    |
| `spacing.xxs`     | 4px   | Hair separators, dense table rows                  |
| `spacing.xs`      | 8px   | Tight gaps between related items                   |
| `spacing.sm`      | 12px  | Chip padding, card meta spacing                    |
| `spacing.base`    | 16px  | Default — card padding, sibling gap                |
| `spacing.md`      | 24px  | Card-to-card gutters, button vertical rhythm       |
| `spacing.lg`      | 32px  | Section-internal spacing                           |
| `spacing.xl`      | 48px  | Between elements inside hero                       |
| `spacing.xxl`     | 64px  | Section padding vertical (most marketplace bands)  |
| `spacing.section` | 96px  | Major page bands (hero, footer)                    |
| `spacing.hero`    | 128px | Full-bleed hero padding (display-lg surfaces only) |

**Vary spacing for rhythm.** Per impeccable shared design laws: same padding everywhere reads as monotony. Hero sections breathe at `spacing.section` / `spacing.hero`; vendor card grids tighten to `spacing.base` between cards. The contrast is intentional — "open hero, dense marketplace below."

**Radii.** Editorial-commerce uses minimal rounding. Most surfaces hard or near-hard.

| Token        | Value  | Use                                         |
| ------------ | ------ | ------------------------------------------- |
| `radii.none` | 0      | Body grid, tables, banner bands             |
| `radii.sm`   | 4px    | Small surfaces, badge backgrounds           |
| `radii.md`   | 6px    | Buttons, inline pills ("Sort: Most booked") |
| `radii.lg`   | 10px   | Cards, panels, modals                       |
| `radii.full` | 9999px | Chips, hearts, circular icons               |

**Note:** No `radii.xl` 14–20px. The MR PORTER / Aimé Leon Dore lineage uses hard or 6–10px corners; 14px+ slides into Airbnb / Stripe consumer-app territory.

**Elevation.** One tier, period.

| Token             | Value                                                                                             | Use                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `elevation.none`  | `none`                                                                                            | 95% of surfaces. Depth comes from hairlines + surface separation. |
| `elevation.one`   | `rgba(27,20,20,0.02) 0 0 0 1px, rgba(27,20,20,0.04) 0 2px 6px 0, rgba(27,20,20,0.10) 0 4px 8px 0` | Card hover-float, dropdowns, sticky reservation rail              |
| `elevation.scrim` | `rgba(27,20,20,0.50)`                                                                             | Modal backdrop fill                                               |

No progressive elevation tiers. The system either has the one shadow or none. Per Airbnb reference (which got this right) — but with ink `#1B1414` as the shadow color instead of pure black, so shadows pick up the same warm undertone as the rest of the palette.

## Motion + interaction patterns

Two named patterns lock the brand's motion identity. Both use only locked tokens (`motion.*`, `colors.*`, `elevation.*`) and respect `prefers-reduced-motion`.

### Vendor card hover — HV-B

**Lift + indigo arrow reveal.** On hover, the card translates up 3px, the photo scales to 1.04 inside its `overflow:hidden` frame, and an indigo orb (36px circle, `colors.indigo` fill with `colors.cream` arrow glyph) slides in from `translateX(-8px) → 0` at the bottom-right corner of the photo. `elevation.one` shadow applies; the border fades to transparent. All transitions run at `motion.medium` (320ms) on `motion.ease-out`.

The arrow orb is the **affordance**: it tells couples "this card is tappable." It uses indigo because that's the system-chrome role — tap signals are system signals, not brand-voltage signals.

**Reduced motion.** Disable photo scale and arrow slide. Keep shadow + border fade. Hover still communicates state, without movement.

**Why HV-B over HV-A (crossfade).** The crossfade pattern needed two vendor portfolio photos per card. HV-B uses just one — the **vendor's chosen thumbnail**. This puts the weight of the choice on the vendor: pick the single image that represents you. See "Vendor portfolio note" below.

### Site preloader — PL-A

**Accelerated wordmark cycle.** First paint shows the same multi-cultural wordmark cycle from the locked wordmark spec, accelerated: 600ms per script with no hold, 200ms crossfades, ~1.5s end-to-end. A 1px haldi-yellow hairline fills left-to-right beneath the wordmark as a loading-progress indicator (`transform: scaleX(0 → 1)`, never `width`).

Once the page becomes interactive, the wordmark transitions to its locked `motion.cycle-hold` (3.5s) cadence. The preloader is not a separate brand concept — it IS the wordmark, just at a different tempo.

**Reduced motion.** Disable the cycle. Show one of the four scripts at random, the static Latin "baazar," and the static haldi hairline.

### Vendor portfolio note (build-time requirement)

HV-B is the locked hover pattern, and it depends on a vendor-controlled thumbnail decision: which single photo represents the vendor in the marketplace grid. The choice is the single most important sales surface a vendor controls — couples scan grids fast and judge by first photo.

- **Onboarding (sub-project B)**: thumbnail selection should be a deliberate step in the wizard, not buried inside a multi-photo uploader. Either (a) the first photo uploaded auto-becomes thumbnail with an explicit "Change thumbnail" UI revealed, or (b) after upload, a separate step asks "which of these is your thumbnail?"
- **Vendor CRM (sub-project E)**: thumbnail change should be a first-class action on the business-profile surface, with a real preview of how it renders in the marketplace card hover state.
- **Backend**: `vendor_profiles` likely has a primary/cover photo concept; verify when implementing. If not, add `active_thumbnail_photo_id` pointing at a row in the photos table.
- **Fallback**: vendor-card component reads `vendor.thumbnail_photo_id`; falls back to first photo in portfolio if unset, with a soft warning to the vendor on next dashboard visit.

Production implementation is a separate task — captured in project memory.

## Page composition patterns

Composed surfaces — patterns made of multiple components working together on a page. Locked as architectural decisions, with sub-component specifics maturing as we design them.

### Vendor profile gallery — focal carousel + grid + shared lightbox

The vendor profile page is the conversion hinge of the marketplace — couples land here after the category grid and decide whether to inquire. The gallery is the highest-leverage UI on that page (weddings are visual purchases; couples judge a vendor almost entirely on photos). Three surfaces compose the gallery, each doing one job:

```
┌─────────────────────────────────────────────────────────────┐
│  VENDOR PROFILE — gallery composition                        │
├─────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌──────────────────────────────────────────────────────┐   │
│   │  1. FOCAL CAROUSEL  (5-7 vendor-curated hero shots)   │   │
│   │     ◀  [▒][▒][▓▓▓▓▓▓][▒][▒]  ▶                       │   │
│   │     "Sangeet at Drake Hotel" (active title)           │   │
│   └──────────────────────────────────────────────────────┘   │
│     ● ○ ○ ○ ○ ○ ○                                              │
│     ↑ editorial first impression                              │
│                                                                │
│   ─── full portfolio (12-24 photos) ───                       │
│                                                                │
│   ┌─────┐ ┌─────┐ ┌─────┐                                     │
│   │     │ │     │ │     │   2. GRID                            │
│   └─────┘ └─────┘ └─────┘   ↑ complete catalog,                │
│   ┌─────┐ ┌─────┐ ┌─────┐     scannable density                │
│   │     │ │     │ │     │                                     │
│   └─────┘ └─────┘ └─────┘                                     │
│   ... 12-18 more ...                                           │
│                                                                │
│   Click any photo (carousel OR grid) →                         │
│                                                                │
│   ╔═════════════════════════════════════════════════════════╗ │
│   ║  3. LIGHTBOX (full-screen modal)                         ║ │
│   ║     ◀   [   PHOTO 7 of 24   ]   ▶                        ║ │
│   ║     swipe / arrow keys / ESC to close                    ║ │
│   ╚═════════════════════════════════════════════════════════╝ │
└─────────────────────────────────────────────────────────────┘
```

**Why three surfaces, not one.** Couples do two distinct jobs in the same session: **scan** ("does this vendor's overall vibe interest me?") and **immerse** ("let me really study photo #14"). A focal carousel optimizes neither — too slow for scanning, not immersive enough for study. A grid alone misses the editorial first impression. A lightbox-only is too utilitarian and removes the vendor's ability to curate. The three surfaces map cleanly onto distinct jobs:

| Surface            | Job                                             | Information density                                      |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------- |
| **Focal carousel** | "Show me this vendor's best work, dramatically" | Low (1 dominant photo at a time) — high emotional weight |
| **Grid**           | "Show me everything they've shot"               | High (12+ visible per viewport) — fast scanning          |
| **Lightbox**       | "Let me study this one photo in detail"         | One photo, full-screen — maximum immersion               |

**State-sharing model.** One photo array on the `vendor` record powers all three surfaces. The carousel exposes 5-7 vendor-curated highlights (a `hero_photo_ids` ordering, vendor-controlled). The grid renders the complete portfolio. Both surfaces accept clicks and dispatch the same `openLightbox(photoIndex)` action — the lightbox opens at the clicked index and lets the user swipe through the **full portfolio**, not just the surface they entered from. This means clicking a hero shot in the carousel and then swiping right reveals the rest of the grid's photos in sequence.

**Focal carousel — surface spec.**

- **Pattern.** Skiper54-derived focal/peek carousel — center slide full-height, neighbors clip-path inset (15% top + bottom) to compress and de-emphasize.
- **Count.** 5-7 photos, vendor-selected as "hero shots." A new field on the vendor record (`hero_photo_ids: uuid[]`).
- **Tech.** Embla Carousel + Framer Motion (for the clip-path animation) + shadcn `Carousel` wrapper.
- **Token overrides from the Skiper reference.**
  - `rounded-3xl` (24px) → `radii.lg` (10px). Editorial commerce, not soft consumer.
  - Background → `colors.cream`.
  - Active pagination dot → `colors.ink`. Inactive → `colors.hairline`.
  - Nav arrow buttons → ghost-style ink chevrons (no filled black orb).
  - Active-slide title → `caption` (12px / 500 / `colors.ink-muted`), positioned below the image, not overlaid on it.
- **Heights.** `clamp(360px, 60vh, 560px)` — never the rigid `h-[500px]` from the reference.
- **Motion.** `motion.medium` (320ms) on `motion.ease-out`. Respects `prefers-reduced-motion` (disable clip-path animation; still allow slide change).
- **Autoplay.** Off by default. Vendors who upload < 5 hero shots → carousel hides and grid takes the full slot.

**Grid — surface spec.**

- **Layout.** CSS grid. Desktop: 3 columns. Tablet: 2 columns. Mobile: 2 columns, tighter gutters.
- **Tile aspect.** 4:5 portrait by default (matches South Asian wedding photography conventions where vertical orientation dominates). Vendor-uploaded landscapes get a `aspect: landscape` flag and span 2 grid columns when present.
- **Gutter.** `spacing.xs` (8px) — tight, almost-touching, museum-grid feel.
- **Tile hover.** Subtle: opacity 0.92 + scale 1.01. Cursor pointer. No lift, no shadow — the grid is dense and shouldn't move under hover.
- **Tile radius.** `radii.lg` (10px). Photos are rounded; the grid container itself is hard-cornered.
- **Pagination.** None on Day 1. Show all photos; if a vendor has > 30, lazy-load below the fold but render in DOM order.

**Lightbox — surface spec.**

- **Library candidate.** `yet-another-react-lightbox` (MIT, modern, plugin-based, restyleable). Lock pending a hands-on prototype.
- **Backdrop.** `elevation.scrim` (`rgba(27,20,20,0.50)`) — the locked scrim color.
- **Chrome.** `colors.cream` icons (close, prev, next, counter) at 36px hit-targets, 16px visual size. Positioned over scrim, never over the photo itself.
- **Counter.** Top-left, `mono-meta` (12px / 500 `DM Mono`): "7 / 24".
- **Caption.** Bottom-center, `caption` (12px / 500 `colors.cream` at 0.7 opacity). Photo title or empty.
- **Controls.** Swipe (mobile) + arrow keys + ESC to close + click outside to close. Pinch-to-zoom on touch; double-click to zoom on desktop.
- **Transition.** Fade-in over `motion.fast` (200ms) on `motion.ease-out`. No scale, no slide — the lightbox is a _presence_, not a _motion_.
- **Reduced motion.** Fade disabled — instant show.

**What this composition unlocks downstream.** Same three-surface pattern reuses for:

- **Category page hero band** — focal carousel of editor's-pick photos (no grid, no lightbox — just the carousel).
- **Package preview within vendor profile** — small focal carousel per package, 3-5 photos.
- **"Similar vendors" footer band on profile** — focal carousel of alternative vendors, each card = one vendor's hero shot.

**Build-time dependencies.**

- Vendor record needs a `hero_photo_ids: uuid[]` field (ordered list pointing at rows in the photos table).
- Vendor onboarding (sub-project B) needs a "select your hero shots" step after photo upload — analogous to the thumbnail-selection requirement but selecting 5-7 instead of 1. Worth designing the thumbnail-selection UX and the hero-shots-selection UX as one cohesive sub-flow.
- Vendor CRM (sub-project E) needs a "reorder hero shots" surface in the business-profile section.

## What's not decided yet

- **Remaining component tokens.** Buttons, search bar, vendor card layout (HV-B hover is locked; full layout spec — pending), filter chips, date picker, footer — pending. Foundation is now in place to design them.
- **Wordmark refinement.** Cycle behavior + script choices + preloader pattern locked above; kerning, exact x-height alignment between scripts, accent dot placement, lockup variants (horizontal / stacked / icon-only / mobile bar) — pending.
- **Photography direction.** Pending — but the palette + type assume real-event South Asian wedding photography (warm, saturated, mid-tone, peopled) as the dominant visual content.
- **Dark hero band variant.** The compromise position from the dark-vs-light exploration. Worth adding as a `hero.variant = "ink-band"` token once a real homepage hero is designed.
- **Thumbnail-selection surface (vendor onboarding + CRM).** See "Vendor portfolio note" above — production implementation pending.
- **Vendor gallery — sub-component specifics.** Three-surface composition is locked (focal carousel + grid + shared lightbox). Pending: final lightbox library lock (`yet-another-react-lightbox` vs `PhotoSwipe v5` — prototype both), carousel autoplay default (off-default proposed, needs vendor preference signal), grid lazy-load threshold (proposed: 30+ photos), and the hero-shots-selection UX in vendor onboarding (parallel to thumbnail selection — design as one cohesive sub-flow).

## Sub-brand surfaces

Reserved for later: if Baazar adds a luxury tier ("Baazar Edit"?) or a vendor pro tier, they'd get their own sub-palette / sub-type tokens at that point. For alpha, single palette + single type system.
