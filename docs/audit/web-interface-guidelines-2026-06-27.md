# Web Interface Guidelines audit — 2026-06-27

**Rules source:** [vercel-labs/web-interface-guidelines/command.md](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) (fetched 2026-06-27)
**Scope:** every `page.tsx` / `layout.tsx` / `error.tsx` / `loading.tsx` under `src/app/` (38 pages, 12 layouts/errors/loadings) + every client component under `src/components/` (≈131 files).
**Coverage approach:** 16 parallel review agents (6 pages + 10 client components), each applying the full Web Interface Guidelines checklist plus a "poor design / UX" pass.
**Findings volume:** ≈700 individual items.

## How to use this document

1. **Start with [Systemic patterns](#systemic-patterns).** Each is a single fix that resolves dozens of findings. Mark these P0 before triaging individual lines.
2. **Then triage [Per-file findings](#per-file-findings).** Each finding is a checkbox with `path:line - issue` — clickable in VS Code / Cursor.
3. **Skip rules that don't apply** to your slice. A `## file ✓ pass` line means the agent saw nothing material.
4. **Caveats** at the bottom list what was _not_ reviewed.

Suggested priority tagging:

- **P0** = guideline rule violations affecting a11y, security, or correctness (focus traps, escape keys, hydration, destructive-without-confirm, autocomplete on auth, missing labels).
- **P1** = systemic UX/polish (typography, Intl formatting, URL state, focus-visible rings).
- **P2** = pure design polish (Title Case, hover hierarchy, weak affordances).

---

## Systemic patterns

Each pattern below is hit by many files. Fixing once = fixing many findings. Sorted by suggested priority.

### P0 — correctness / safety / accessibility

- [ ] **Destructive actions without confirmation or undo** (`PauseProfileToggle`, `PackageActiveToggle`, `BookingActions.MarkComplete` uses native `window.confirm`, `CancelDialog` no typed-confirm, `DisputeDialog` single-click filing, `CalendarHoldsList.Unblock`, `ExternalCalendarSyncCard.Disconnect`/`RotateURL`, `PhotoUploaderDrawer.Remove`, `PhotoThumbnailGrid.Remove`, `AdjustmentReview.Decline`, `VendorBookingActions.Accept`, `BackfillBanner.dismiss` optimistic w/ no rollback, `VendorOnboarding` ESC submits with `skipped:true`, `CoupleOnboarding` outside-click bounces to `/vendors`).
- [ ] **Modals missing `overscroll-behavior: contain` + focus trap + scroll lock + focus restore** (`CounterModal`, `CancelDialog`, `DepositDialog`, `DisputeDialog`, `ReviewForm`, `PanelShell`, `StaggeredMenu`, `AllFiltersSheet`, `MobileSearchSheet`, `FamilyDrawerContent`, `ConnectCalendarModal`). `PanelShell` declares `role="dialog" aria-modal="true"` but has no trap/lock — pick page-y OR modal, not both.
- [ ] **Inputs missing `autocomplete` / `inputMode` / `spellCheck`** site-wide. Auth forms missing `current-password`/`new-password`/`email`/`name`. Wizard `StepOnline` missing `spellCheck={false}` + `autoCapitalize="none"` on IG handle. `StepLocation` GooglePlaces missing `street-address`. `OwnThisBusinessModal` email missing `email` + `inputmode="email"`.
- [ ] **`<label>` without `htmlFor` / control association** (`BookingForm`, `EventRow`, `BlockDateForm`, `CapacityField`, `OwnThisBusinessModal`, `ClaimVendorProfile`, `VendorAdjustQuoteForm`, `CancelDialog`, `CustomRequestForm`, every wizard step).
- [ ] **Combobox/listbox/autocomplete components missing required ARIA** (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-activedescendant`, arrow-key nav, Escape close) — `EventTypeAutocomplete` (bare `<datalist>`), `GooglePlacesAutocomplete`, `WhatPicker`, `CategoryPicker`, `LanguagesDropdown`, `PriceDropdown`, `BusinessSwitcher`, `BookingBottomBar` package list. Also: `WhatSuggestions` not linked to `SearchBar` input via `aria-activedescendant`.
- [ ] **Submit button disabled until valid (anti-pattern).** Guidelines say submit stays enabled until request starts; show inline errors instead. Hit by `signup-form`, `CoupleOnboarding`, `StepDetails`, `StepPortfolio`, `ResetPasswordForm`, `AllFiltersSheet`, `EventCardGrid` empty state.
- [ ] **Hydration-mismatch risks**: `new Date().toISOString()` in render (`BookingForm:56`, `EventCard:31`, `EventRow:138`/`152`, `date-picker:50`). `timeAgo` computing off `Date.now()` in render (`ExternalCalendarSyncCard:20`, `NotificationCard:26`). Recompute in `useEffect`.
- [ ] **Native `alert()` / `window.confirm()` for financial actions** (`AdjustmentReview:85,89`, `BookingActions:107` releases funds!) — replace with styled confirmation.
- [ ] **Nested interactive elements (invalid HTML, breaks tab order)** — `Chip:76-127` (role="button" span inside `<button>`), `EventCard:101` (Link inside role="button" div), `NotificationCard:71` (Links inside outer Link/button), `signup-form` button-inside-button.
- [ ] **Errors fire as toast only; no inline error + no focus-first-error** — `LoginForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `VendorAdjustQuoteForm`, `CounterModal`, `BookingActions`, `BlockDateForm`, `DisputeDialog`, `BookingForm`, `CustomRequestForm`, `VendorProfileForm`, `PackageEditorForm`, every wizard step.
- [ ] **External `target="_blank"` missing `rel="noopener noreferrer"`** — `signup-form` Terms+Privacy, marketplace home footer external links, `StaggeredMenu` social links.
- [ ] **No `aria-live` for async UI changes** — auth success states, toggle status, char counters, "Saving…", notification arrivals, calendar selection state, search result count.
- [ ] **Status conveyed by color only** — `AvailabilityCalendar` (haldi for partial), `CalendarHoldsList`, `ConflictWarning`, `EventCard` status dot, `NotificationCard` unread dot, `AdjustmentReview` delta. Add icon or text label.

### P1 — sitewide polish

- [ ] **State (filter/tab/search/collapse/date) in `useState`, not URL** — breaks deep-linking, browser back/forward, shareable links. Adopt `nuqs` (or equivalent) as a sitewide pattern across: `SearchBar`, `EventCardFilters`, `EventCardGrid`, `NotificationsPageClient`, `BookingsArchive`, `EarningsCard`, `AvailabilityCalendar`, `BlockDateForm`, `MobileSearchSheet`, every wizard step.
- [ ] **Hardcoded `'en-US'` locale + manual ISO date strings + hand-written timeAgo** → `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat`. Hit by `EventCard`, `EarningsCard`, `dashboard/page`, `BookingForm`, `EventRow`, `AvailabilityCalendar`, `VendorProfile`, `SearchBar`, `privacy/page`, `terms/page`.
- [ ] **`$` + `.toLocaleString()` instead of `Intl.NumberFormat(... { style: 'currency', currency: 'USD' })`** — `BookingForm`, `BookingStickyCard`, `PackageGrid`, `PackageDetailModal`, `VendorBookingActions`, `VendorAdjustQuoteForm`, `AdjustmentReview`, `CounterModal`, `EarningsCard`, packages list page, `VendorCard`.
- [ ] **Number columns missing `font-variant-numeric: tabular-nums`** — every price, count, time, rating column.
- [ ] **Placeholders missing `…`** (use `…` not `...`/`.`/no trailing) — ~25 components.
- [ ] **Straight `'` `"` instead of curly `'` `"`** — `not-found.tsx`, `LoginForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `signup-form`, `ScrapedVendorMatchPrompt`, `VendorNotesEditor`, `NewsletterForm`, `CustomerWelcomeBanner`, `EarningsCard`, `OwnThisBusinessModal`, `ClaimVendorProfile`, `BookingBottomBar`, `BookingStickyCard`, multiple.
- [ ] **Brand wordmarks + business names + IG handles missing `translate="no"`** — `Navbar`, `HomepageWordmarkPanel`, `WordmarkCycle`, `StaggeredMenu` logo, `VendorCard`, `VendorProfile`, `UnclaimedVendorProfile`, `BookingStickyCard`, `PostFirstBookingPrompt`, `ScrapedVendorMatchPrompt`, `(auth)/layout`, `dev/staggered-menu`.
- [ ] **Buttons & links missing `focus-visible:ring-*`** — pervasive. Establish a unified `focus-visible:` token site-wide.
- [ ] **`transition-all` / `transition` shorthand anti-pattern** — `Chip`, `SegmentButton`, `SearchBar`, `OwnerBanner`, `ExitPreviewPill`, `SidebarNav`, `BookingsArchive`, `ReviewForm`, `ui/onboarding`, `EventCard`, `PhotoCarouselHero`. Replace with explicit `transition-[transform,opacity,background-color]`.
- [ ] **`prefers-reduced-motion` not honored** — `StaggeredMenu` GSAP, `HeartConfetti`, `FirstBookingCelebration`, `SpotlightCard`, `Silk` (continuous shader, no pause off-screen), `WordmarkCycle` (explicitly ignores), `EventCard` 3D flip, `FamilyDrawerAnimatedContent`, every `animate-pulse` skeleton, `BioAssistCard` cursor, `CategoryHoverExpand` smooth scroll, `PhotoCarouselHero` `scroll-smooth`, `ui/onboarding` dot scaling.
- [ ] **No `beforeunload` / unsaved-changes guard on long forms** — every wizard step, `VendorProfileForm`, `PackageEditorForm`, `BookingForm`, `CustomRequestForm`, `VendorNotesEditor` mid-save.
- [ ] **iOS `env(safe-area-inset-*)` missing on sticky/fixed surfaces** — `BookingBottomBar`, `ExitPreviewPill`, `OwnerBanner`, `AllFiltersSheet` footer, `MobileSearchSheet` (footer + use `dvh` not `vh`), `FamilyDrawerContent`, marketplace hero with `-mx-*`.
- [ ] **Decorative icons not `aria-hidden="true"`** — pervasive (Sidebar lucide, BusinessSwitcher, BookingStickyCard ★⚡✓, NotificationBell, Navbar Menu/X, ConflictWarning, every emoji in banners).
- [ ] **Virtualization missing on potentially large lists** — `NotificationsPageClient`, `BookingsArchive`, `EventCardGrid`, `VendorGrid`, `BusinessSwitcher`, `CalendarHoldsList`, packages grid.
- [ ] **Click-outside only on `mousedown` — touch path missing** — `SearchBar`, `FilterChipRow`, `StaggeredMenu`, `NotificationDropdown`. Use `pointerdown` or also bind `touchstart`.
- [ ] **Toggle components not `role="switch"` + `aria-checked`** — `PauseProfileToggle`, `PackageActiveToggle`.
- [ ] **Star rating without `role="radiogroup"` + arrow-key nav** — `ReviewForm`; preset to 5★ also biases ratings.

### P2 — copy / design polish

- [ ] **Generic CTA copy** ("Continue", "Submit", "Cancel", "OK", "Got it", "Next") — `CoupleOnboarding`, `BookingActions`, `signup-form`, `OwnThisBusinessModal`, `VendorOnboarding`, `CounterModal`, `CancelDialog`, `DisputeDialog`, `ReviewForm`, every wizard step, `FirstBookingCelebration`. Use specific labels per guideline.
- [ ] **Title Case violations** — "Try again", "Back to dashboard", "Browse vendors", "Add a package to go live", "Quick actions", "Continue to booking", "Block a date", "Connect calendar", and ~15 more.
- [ ] **Heading hierarchy broken** — `dashboard/error.tsx` h2 with no h1, `saved/page.tsx` empty-state h2 only, `setup/error.tsx` should be h1, `OwnerBanner`/`CustomerWelcomeBanner`/`BackfillBanner` h2 placement depends on host, `dev/email-previews/*` all start at h2, `VendorOnboarding` modal starts at h2, `WizardStepper` no step announcement.
- [ ] **No skip-link / no `<main id>` landmark** — root layout, dashboard layout, marketplace layout, auth layout, setup layout all missing.
- [ ] **Headings missing `text-pretty` / `text-wrap: balance`** — almost every `<h1>` on dashboard + marketplace pages.
- [ ] **Headings missing `scroll-margin-top` + stable `id` anchors** — privacy + terms.
- [ ] **Number copy uses words instead of numerals** — "eight more" on marketplace home.
- [ ] **Non-breaking spaces missing** — "72 hours", "5% deposit", "10 MB"-style units, "3 business days".
- [ ] **Very small typography below 12px** — `date-picker.tsx` weekday `text-[9px]`, day cell `text-[12px]`, `Chip` chevrons, `BookingBottomBar` `text-[10px]` "▲ Hide", `NotificationBell` badge `text-[10px]`.
- [ ] **Color/contrast risks needing manual verification** — `saved/page.tsx` hot-pink bg on cream text, `dashboard/profile/packages` h3 hot-pink kicker, `PackageGrid:88` hot-pink on cream-soft 10px, `ExternalCalendarSyncCard:237` indigo-900 + ink/60 cascade ambiguity, all `text-yellow-600`/`text-red-600` hardcoded (no dark mode).

---

## Per-file findings

### Root + Auth pages

#### src/app/layout.tsx

- [ ] src/app/layout.tsx:94 - missing skip link to main content
- [ ] src/app/layout.tsx:94 - no `<main>` landmark wrapping children
- [ ] src/app/layout.tsx:70-86 - metadata missing themeColor (mobile browser chrome)
- [ ] src/app/layout.tsx:94 - lang="en" hardcoded — site renders Devanagari/Urdu/Arabic wordmarks; consider Accept-Language detection or `translate="no"` on brand spans

#### src/app/not-found.tsx

- [ ] src/app/not-found.tsx:10 - `&apos;` → curly apostrophe `'`
- [ ] src/app/not-found.tsx:8 - "Page not found" is the real page title — should be `<h1>`, not the 404 numeral
- [ ] src/app/not-found.tsx:13 - "Go Home" → more specific label ("Back to Homepage")
- [ ] src/app/not-found.tsx:9 - error copy lacks fix/next step

#### src/app/(auth)/layout.tsx

- [ ] src/app/(auth)/layout.tsx:17 - shared `<h1>baazar.</h1>` conflicts with child auth pages' own `<h1>`
- [ ] src/app/(auth)/layout.tsx:43,47 - decorative "·" separators need `aria-hidden="true"`
- [ ] src/app/(auth)/layout.tsx:34 - no `<main>` landmark
- [ ] src/app/(auth)/layout.tsx:10 - full-bleed min-h-screen lacks `env(safe-area-inset-*)` (notch on iOS)
- [ ] src/app/(auth)/layout.tsx:14 - "MADE IN CHICAGO" hardcoded all-caps — use Title Case + `uppercase` class
- [ ] src/app/(auth)/layout.tsx:20 - inline clamp() heading lacks text-wrap: balance

#### src/app/(auth)/{forgot-password,login,reset-password,signup}/page.tsx

✓ pass (thin server wrappers; meaningful UI in `<Form>` client components — see Auth forms below)

#### src/app/(auth)/signup/success/page.tsx

- [ ] src/app/(auth)/signup/success/page.tsx:31 - sr-only announcement needs `aria-live="polite"`
- [ ] src/app/(auth)/signup/success/page.tsx:31 - "Account created" should be an `<h1>`

#### src/components/auth/LoginForm.tsx

- [ ] src/components/auth/LoginForm.tsx:78 - email missing `spellCheck={false}`
- [ ] src/components/auth/LoginForm.tsx:81 - placeholder must end with `…`
- [ ] src/components/auth/LoginForm.tsx:39 - errors toast-only; no inline + focus-first-error
- [ ] src/components/auth/LoginForm.tsx:97 - password lacks show/hide toggle + caps-lock indicator
- [ ] src/components/auth/LoginForm.tsx:117 - "Continue with Google" vague; mirror primary CTA copy
- [ ] src/components/auth/LoginForm.tsx:121 - "Don't" → curly `'`
- [ ] src/components/auth/LoginForm.tsx:69 - h1 lacks text-pretty

#### src/components/auth/ForgotPasswordForm.tsx

- [ ] src/components/auth/ForgotPasswordForm.tsx:104 - email missing `spellCheck={false}`
- [ ] src/components/auth/ForgotPasswordForm.tsx:108 - placeholder needs `…`
- [ ] src/components/auth/ForgotPasswordForm.tsx:44 - error toast-only
- [ ] src/components/auth/ForgotPasswordForm.tsx:60 - `{sent}` email lacks break-words/min-w-0; needs `translate="no"`
- [ ] src/components/auth/ForgotPasswordForm.tsx:66 - "Didn't" → curly `'`
- [ ] src/components/auth/ForgotPasswordForm.tsx:53 - success card needs `aria-live="polite"`
- [ ] src/components/auth/ForgotPasswordForm.tsx:67 - "try a different address" no focus-visible ring

#### src/components/auth/ResetPasswordForm.tsx

- [ ] src/components/auth/ResetPasswordForm.tsx:30 - 'pending' state: disabled fields with no spinner; user confused
- [ ] src/components/auth/ResetPasswordForm.tsx:107 - validation toast; need inline + focus
- [ ] src/components/auth/ResetPasswordForm.tsx:112 - mismatch toast; need inline + focus to confirm field
- [ ] src/components/auth/ResetPasswordForm.tsx:156 - "Don't" → curly `'`
- [ ] src/components/auth/ResetPasswordForm.tsx:164 - new password lacks strength meter / show toggle / caps-lock warn
- [ ] src/components/auth/ResetPasswordForm.tsx:176 - no live mismatch validation
- [ ] src/components/auth/ResetPasswordForm.tsx:186 - submit disabled until `sessionReady === 'ok'` with no visible reason
- [ ] src/components/auth/ResetPasswordForm.tsx:88 - arbitrary 5s timeout flips legitimate links to "expired" on slow mobile

#### src/app/(auth)/signup/signup-form.tsx

- [ ] src/app/(auth)/signup/signup-form.tsx:107 - "Creating account..." → `…`
- [ ] src/app/(auth)/signup/signup-form.tsx:235 - submit disabled until role+agreed selected (anti-pattern)
- [ ] src/app/(auth)/signup/signup-form.tsx:158 - 🎉 needs `aria-hidden`
- [ ] src/app/(auth)/signup/signup-form.tsx:170 - 🏪 needs `aria-hidden`
- [ ] src/app/(auth)/signup/signup-form.tsx:171 - "I'm" → curly `'`
- [ ] src/app/(auth)/signup/signup-form.tsx:149 - role buttons lack `aria-pressed` + focus-visible:ring
- [ ] src/app/(auth)/signup/signup-form.tsx:198 - fullName missing `autoComplete="name"`; placeholder needs `…`
- [ ] src/app/(auth)/signup/signup-form.tsx:202 - email missing `autoComplete="email"` + `spellCheck={false}`
- [ ] src/app/(auth)/signup/signup-form.tsx:206 - password missing `autoComplete="new-password"`; no strength meter
- [ ] src/app/(auth)/signup/signup-form.tsx:216 - checkbox lacks focus-visible
- [ ] src/app/(auth)/signup/signup-form.tsx:225,229 - Terms/Privacy `target="_blank"` missing `rel="noopener noreferrer"`
- [ ] src/app/(auth)/signup/signup-form.tsx:144 - "tell us who you are" should be fieldset/legend; required asterisk needs `aria-label="required"`

#### src/components/onboarding/OnboardingGate.tsx

- [ ] src/components/onboarding/OnboardingGate.tsx:33 - mark-on-show error only `console.error`'d; silent failure
- [ ] src/components/onboarding/OnboardingGate.tsx:37 - no abort on unmount

#### src/components/onboarding/CoupleOnboarding.tsx

- [ ] src/components/onboarding/CoupleOnboarding.tsx:70 - heading lacks text-pretty/balance
- [ ] src/components/onboarding/CoupleOnboarding.tsx:111 - date input missing id/name/aria-label/min (allows past dates)
- [ ] src/components/onboarding/CoupleOnboarding.tsx:119 - "Categories (max 3)" not fieldset/legend; chips need `aria-pressed`
- [ ] src/components/onboarding/CoupleOnboarding.tsx:124 - chips lack focus-visible:ring
- [ ] src/components/onboarding/CoupleOnboarding.tsx:133 - silently swallows clicks once 3 selected
- [ ] src/components/onboarding/CoupleOnboarding.tsx:162 - "Continue →" vague; submit disabled (anti-pattern)
- [ ] src/components/onboarding/CoupleOnboarding.tsx:188 - "Loading vendors..." → `…`; conflates loading vs empty
- [ ] src/components/onboarding/CoupleOnboarding.tsx:175 - outside-click triggers `submitOnboarding(false)` + nav to `/vendors` with no undo
- [ ] src/components/onboarding/CoupleOnboarding.tsx:196 - "Start exploring →" stays unchanged while submitting; no spinner
- [ ] src/components/onboarding/CoupleOnboarding.tsx:30 - non-2xx vs network errors not distinguished
- [ ] src/components/onboarding/CoupleOnboarding.tsx:152 - "Back" plain text — weak affordance

#### src/components/onboarding/ScrapedVendorMatchPrompt.tsx

- [ ] src/components/onboarding/ScrapedVendorMatchPrompt.tsx:15 - h3 may break hierarchy; verify
- [ ] src/components/onboarding/ScrapedVendorMatchPrompt.tsx:20 - business_name/category lack truncate/break-words
- [ ] src/components/onboarding/ScrapedVendorMatchPrompt.tsx:22 - @{handle} needs `translate="no"`
- [ ] src/components/onboarding/ScrapedVendorMatchPrompt.tsx:25 - "it's" → curly `'`
- [ ] src/components/onboarding/ScrapedVendorMatchPrompt.tsx:32 - link-as-button: `hover:opacity-90` no transition declared, no focus-visible
- [ ] src/components/onboarding/ScrapedVendorMatchPrompt.tsx:21 - "category unknown"/"unknown city" reads like debug

### Marketplace (public)

#### src/app/(marketplace)/layout.tsx

- [ ] src/app/(marketplace)/layout.tsx:8 - `<main>` lacks id for skip-link target; no skip-link rendered
- [ ] src/app/(marketplace)/layout.tsx:8 - `<main>` missing `tabIndex={-1}` so skip link can land focus

#### src/app/(marketplace)/loading.tsx

- [ ] src/app/(marketplace)/loading.tsx:7 - skeleton missing `aria-live="polite"`/`role="status"`
- [ ] src/app/(marketplace)/loading.tsx:7 - animate-pulse needs prefers-reduced-motion fallback

#### src/app/(marketplace)/error.tsx

- [ ] src/app/(marketplace)/error.tsx:13 - error region missing `role="alert"`/`aria-live="assertive"`
- [ ] src/app/(marketplace)/error.tsx:16 - "An unexpected error occurred." gives no fix/next step
- [ ] src/app/(marketplace)/error.tsx:20 - "Try Again" generic — prefer "Reload Page"

#### src/app/(marketplace)/page.tsx

- [ ] src/app/(marketplace)/page.tsx:34 - full-bleed hero `-mx-*` lacks `env(safe-area-inset-*)` on notched devices
- [ ] src/app/(marketplace)/page.tsx:60 - "Photography, mehndi, catering, and eight more." → use "8 more"
- [ ] src/app/(marketplace)/page.tsx:60 - hero copy missing text-pretty/balance
- [ ] src/app/(marketplace)/page.tsx:75,79 - external `<a target="_blank">` missing `noreferrer` + "(opens in new tab)" cue + focus-visible:ring
- [ ] src/app/(marketplace)/page.tsx:105 - "72 hours" needs `72&nbsp;hours`
- [ ] src/app/(marketplace)/page.tsx:56 - inline clamp() `<h1>` lacks text-wrap: balance

#### src/app/(marketplace)/privacy/page.tsx

- [ ] src/app/(marketplace)/privacy/page.tsx:11 - hardcoded date "2026-04-18" → `Intl.DateTimeFormat`
- [ ] src/app/(marketplace)/privacy/page.tsx:18 - `<h2>` sections missing `scroll-margin-top` + id anchors
- [ ] src/app/(marketplace)/privacy/page.tsx:70,87 - email addresses not `mailto:` links
- [ ] src/app/(marketplace)/privacy/page.tsx:13 - inline `[LAWYER REVIEW]` note missing `role="note"` semantic

#### src/app/(marketplace)/terms/page.tsx

- [ ] src/app/(marketplace)/terms/page.tsx:11 - hardcoded date → `Intl.DateTimeFormat`
- [ ] src/app/(marketplace)/terms/page.tsx:18 - `<h2>` headings lack `scroll-margin-top` + id anchors
- [ ] src/app/(marketplace)/terms/page.tsx:20,51 - "the Platform" / "vendor fault" — straight quotes → curly
- [ ] src/app/(marketplace)/terms/page.tsx:26 - "5% deposit" needs `5%&nbsp;deposit`
- [ ] src/app/(marketplace)/terms/page.tsx:102 - email not a `mailto:` link

#### src/app/(marketplace)/vendors/loading.tsx

- [ ] src/app/(marketplace)/vendors/loading.tsx:5 - skeleton region missing `aria-live`/`role="status"`
- [ ] src/app/(marketplace)/vendors/loading.tsx:7 - animate-pulse lacks prefers-reduced-motion

#### src/app/(marketplace)/vendors/page.tsx

- [ ] src/app/(marketplace)/vendors/page.tsx:112 - `{totalCount}` not formatted via `Intl.NumberFormat`
- [ ] src/app/(marketplace)/vendors/page.tsx:120 - pagination renders ALL totalPages numbers (no truncation) — breaks layout/a11y at scale
- [ ] src/app/(marketplace)/vendors/page.tsx:122 - pagination links missing `aria-label="Go to page N"` + `aria-current="page"`
- [ ] src/app/(marketplace)/vendors/page.tsx:125 - pagination URL drops filters except category+page — breaks URL-reflects-state
- [ ] src/app/(marketplace)/vendors/page.tsx:129 - pagination `<a>` missing focus-visible:ring
- [ ] src/app/(marketplace)/vendors/page.tsx:120 - missing `<nav aria-label="Pagination">` wrapper
- [ ] src/app/(marketplace)/vendors/page.tsx:117 - large vendor `.map()` rendered without `content-visibility: auto`

#### src/app/(marketplace)/vendors/[slug]/page.tsx

- [ ] src/app/(marketplace)/vendors/[slug]/page.tsx:127 - `vendor.bio?.slice(0, 160)` clips mid-word; truncate on word boundary + `…`
- [ ] src/app/(marketplace)/vendors/[slug]/page.tsx:125 - metadata title interpolates user-generated `business_name` without length cap

#### src/app/(marketplace)/vendors/[slug]/book/page.tsx

- [ ] src/app/(marketplace)/vendors/[slug]/book/page.tsx:77 - h1 "Book {business_name}" lacks truncate/break-words + min-w-0
- [ ] src/app/(marketplace)/vendors/[slug]/book/page.tsx:79 - "72 hours" → `72&nbsp;hours`
- [ ] src/app/(marketplace)/vendors/[slug]/book/page.tsx:75 - container missing scroll/safe-area handling for mobile keyboard

#### src/app/(marketplace)/vendors/[slug]/request/page.tsx

- [ ] src/app/(marketplace)/vendors/[slug]/request/page.tsx:40 - h1 lacks text-wrap: balance + break-words/min-w-0
- [ ] src/app/(marketplace)/vendors/[slug]/request/page.tsx:43 - no `translate="no"` on `{vendor.business_name}` brand interpolation

### Couple booking + custom request forms

#### src/components/forms/BookingForm.tsx

- [ ] src/components/forms/BookingForm.tsx:56 - today from `new Date().toISOString()` in render → hydration mismatch
- [ ] src/components/forms/BookingForm.tsx:60-61 - hardcoded T16/22:00:00Z mixes UTC with local-clock semantics
- [ ] src/components/forms/BookingForm.tsx:182,189,196,341,348,355 - hardcoded `$` + `toLocaleString`
- [ ] src/components/forms/BookingForm.tsx:200 - `<a href>` for in-app nav should be `<Link>`
- [ ] src/components/forms/BookingForm.tsx:243 - Full Name missing htmlFor/id/name/`autoComplete="name"`
- [ ] src/components/forms/BookingForm.tsx:253 - phone missing htmlFor/id/name/`autoComplete="tel"`/`inputMode="tel"`/validation
- [ ] src/components/forms/BookingForm.tsx:248,259,313 - placeholders don't end with `…`
- [ ] src/components/forms/BookingForm.tsx:272-280,291-304 - number inputs missing `inputMode="numeric"`/max/`autoComplete="off"`
- [ ] src/components/forms/BookingForm.tsx:310 - textarea label missing htmlFor; no maxLength
- [ ] src/components/forms/BookingForm.tsx:321 - error banner missing `role="alert"`/`aria-live`; no focus-first-error
- [ ] src/components/forms/BookingForm.tsx:327 - "Submitting..." → `…` + spinner missing
- [ ] src/components/forms/BookingForm.tsx:140,152 - "Please try again." no specificity; no beforeunload guard

#### src/components/forms/EventRow.tsx

- [ ] src/components/forms/EventRow.tsx:99,108,131,145,162,213 - labels lack htmlFor (orphan)
- [ ] src/components/forms/EventRow.tsx:118 - date input no `min={today}`; allows past dates
- [ ] src/components/forms/EventRow.tsx:132-156 - time inputs UTC Z but displayed as local; end<start allowed
- [ ] src/components/forms/EventRow.tsx:85 - `<h4>` may break hierarchy
- [ ] src/components/forms/EventRow.tsx:87 - Remove button no `aria-label="Remove Event N"`; no focus-visible
- [ ] src/components/forms/EventRow.tsx:170 - "Different location" non-reversible (no path back)
- [ ] src/components/forms/EventRow.tsx:181 - "Same as Event 1" not propagated if Event 1 changes later
- [ ] src/components/forms/EventRow.tsx:191 - GooglePlaces uncontrolled; "Same as Event 1" text doesn't sync
- [ ] src/components/forms/EventRow.tsx:199,217 - placeholders don't end with `…`
- [ ] src/components/forms/EventRow.tsx:201 - confirmed address has no edit/clear affordance
- [ ] src/components/forms/EventRow.tsx:215 - venue name missing name/autoComplete/htmlFor
- [ ] src/components/forms/EventRow.tsx:138,152 - `new Date().toISOString()` fallback → hydration risk

#### src/components/forms/EventTypeAutocomplete.tsx

- [ ] src/components/forms/EventTypeAutocomplete.tsx:45 - `<datalist>` lacks combobox a11y
- [ ] src/components/forms/EventTypeAutocomplete.tsx:45 - missing id/name/`autoComplete="off"`; label association left to caller (broken in EventRow:99)
- [ ] src/components/forms/EventTypeAutocomplete.tsx:45 - no spellCheck decision (cultural names get squiggled)
- [ ] src/components/forms/EventTypeAutocomplete.tsx:49 - placeholder doesn't end with `…`
- [ ] src/components/forms/EventTypeAutocomplete.tsx:43 - no arrow/Escape/click-outside handlers
- [ ] src/components/forms/EventTypeAutocomplete.tsx:34 - canonical+alias merge produces duplicate-shaped options
- [ ] src/components/forms/EventTypeAutocomplete.tsx:42 - no empty-state suggestion / "Use as custom"
- [ ] src/components/forms/EventTypeAutocomplete.tsx:51 - no debounce/match feedback
- [ ] src/components/forms/EventTypeAutocomplete.tsx:16 - cultural aliases need `translate="no"`

#### src/components/forms/GooglePlacesAutocomplete.tsx

- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:84 - input lacks combobox a11y
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:84 - missing name/`autoComplete="street-address"`/inputMode/label association
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:89 - defaultValue makes uncontrolled → "Same as Event 1" doesn't reflect (real bug)
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:81 - effect deps include onChange ref → re-init on every render
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:42 - silently degrades to plain text when key missing
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:53 - `country:'us'` hardcoded (i18n blocker)
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:62 - partial address-component results not surfaced
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:88 - placeholder doesn't end with `…`
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:50 - `any` casts; no error handler for importLibrary rejection
- [ ] src/components/forms/GooglePlacesAutocomplete.tsx:78 - cleanup doesn't run if importLibrary still pending

#### src/components/booking/CustomRequestForm.tsx

- [ ] src/components/booking/CustomRequestForm.tsx:132 - error region has `role="alert"` but no `aria-live`; copy no next-step
- [ ] src/components/booking/CustomRequestForm.tsx:142 - "Events" is `<label>` labels nothing; use h3/fieldset/legend
- [ ] src/components/booking/CustomRequestForm.tsx:150 - DatePicker label missing htmlFor/id
- [ ] src/components/booking/CustomRequestForm.tsx:172,194,250 - `focus:outline-none` without focus-visible replacement (anti-pattern)
- [ ] src/components/booking/CustomRequestForm.tsx:191 - `Number(e.target.value)||1` silently coerces empty → 1
- [ ] src/components/booking/CustomRequestForm.tsx:199 - "Event type" label not associated with EventTypePicker
- [ ] src/components/booking/CustomRequestForm.tsx:215 - destructive "Remove this event" hot-pink (palette says ink-CTA, pink sparing)
- [ ] src/components/booking/CustomRequestForm.tsx:248 - placeholder ends with period not `…`
- [ ] src/components/booking/CustomRequestForm.tsx:252 - "{n} / 1000" no `aria-live`
- [ ] src/components/booking/CustomRequestForm.tsx:62 - errors don't focus first invalid field
- [ ] src/components/booking/CustomRequestForm.tsx:257 - submit missing spinner
- [ ] src/components/booking/CustomRequestForm.tsx:43 - no beforeunload guard; no URL deep-link for draft

#### src/components/marketplace/vendor-profile/BookingBottomBar.tsx

- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:30,50 - sticky bar lacks `touch-action: manipulation`
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:34 - "hasn't" straight apostrophe → curly
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:55 - price needs `font-variant-numeric: tabular-nums`
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:60 - SheetTrigger missing aria-label/aria-expanded/aria-haspopup
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:65 - "▲" decorative needs aria-hidden
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:65 - text-[10px] below readable minimum
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:74 - package list lacks role="listbox"/option, no arrow nav
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:81 - selected state no focus-visible:ring
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:64 - " · most popular" → Title Case
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:100 - SheetContent missing overscroll-behavior: contain
- [ ] src/components/marketplace/vendor-profile/BookingBottomBar.tsx:30 - fixed bar overlays content; no bottom-padding spacer

#### src/components/marketplace/vendor-profile/BookingStickyCard.tsx

- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:78,82,84 - price text lacks tabular-nums
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:82 - `<b>` → `<strong>`
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:96 - "compare all" should be `<a href="#packages">` for Cmd-click/deep-link
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:104 - hover-pink-text no focus-visible:ring
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:125 - @handle needs `translate="no"`
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:147,153,159 - ★/⚡/✓ emoji iconography; no aria-label units
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:147 - `.toFixed(1)` ignores locale decimal
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:153 - "{n}h" needs nbsp
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:159 - "Events" label ambiguous
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:65 - sticky top-6 z-30 collides w/ anchored nav
- [ ] src/components/marketplace/vendor-profile/BookingStickyCard.tsx:42 - "hasn't" straight apostrophe

#### src/components/ui/EventTypePicker.tsx

- [ ] src/components/ui/EventTypePicker.tsx:25 - placeholder doesn't end with `…`
- [ ] src/components/ui/EventTypePicker.tsx:39 - cultural group has no SelectLabel; asymmetric labeling
- [ ] src/components/ui/EventTypePicker.tsx:35 - no name propagation for form submission

### Marketplace cards + vendor profile

#### src/components/marketplace/VendorCard.tsx

- [ ] src/components/marketplace/VendorCard.tsx:86 - business_name elsewhere needs `translate="no"`
- [ ] src/components/marketplace/VendorCard.tsx:96 - decorative `<Camera>` lacks aria-hidden
- [ ] src/components/marketplace/VendorCard.tsx:53 - "{h}h" needs nbsp
- [ ] src/components/marketplace/VendorCard.tsx:178 - h3 business_name missing `translate="no"`; no line-clamp-2/truncate
- [ ] src/components/marketplace/VendorCard.tsx:166 - card body no min-w-0
- [ ] src/components/marketplace/VendorCard.tsx:73 - hover-lift-card may be `transition: all`; Link no focus-visible:ring
- [ ] src/components/marketplace/VendorCard.tsx:142 - heart hover lacks distinct hover color (saved state)
- [ ] src/components/marketplace/VendorCard.tsx:213 - price helper — verify uses `Intl.NumberFormat`
- [ ] src/components/marketplace/VendorCard.tsx:215 - "From " needs nbsp
- [ ] src/components/marketplace/VendorCard.tsx - no rating/review count on card; weak signal density

#### src/components/marketplace/VendorGrid.tsx

- [ ] src/components/marketplace/VendorGrid.tsx:30 - `vendors.map` no virtualization
- [ ] src/components/marketplace/VendorGrid.tsx:21 - empty state no CTA/clear-filters

#### src/components/marketplace/vendor-profile/VendorProfile.tsx

- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:90 - breadcrumb `<nav>` no `aria-label="Breadcrumb"`
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:97 - business_name needs `translate="no"`
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:192 - rating: stars not aria-hidden; review count not Intl; missing combined aria-label
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:224 - `toLocaleDateString` hardcoded; hydration risk
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:62 - toast no aria-live (sonner — verify)
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:188 - "Reviews" hierarchy unclear
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:189 - no `scroll-margin-top` on anchor ids
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx:217 - per-review stars no aria-label "Rated X of 5"
- [ ] src/components/marketplace/vendor-profile/VendorProfile.tsx - no share/save at profile level; reviews not sortable/paginated; no first-review prompt

#### src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx

- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:43 - missing `aria-roledescription="carousel"` + aria-label
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:50 - slides missing `aria-roledescription="slide"` + `aria-label="X of N"`
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:43 - no aria-live announcing slide changes
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:43 - no prev/next buttons; no arrow keys
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:78 - dots inert `<span>`; should be `<button aria-label>`
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:64 - heart no focus-visible:ring
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:69 - transition shorthand — verify
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:47 - `scroll-smooth` ignores prefers-reduced-motion
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:43 - no pinch-zoom / fullscreen affordance
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:74 - "1 / 3" no nbsp around `/`
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:67 - disabled state no visual treatment
- [ ] src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:69 - bg-ink/70 dots + text-red-500 heart contrast

#### src/components/marketplace/PackageGrid.tsx

- [ ] src/components/marketplace/PackageGrid.tsx:142 - h3 no line-clamp
- [ ] src/components/marketplace/PackageGrid.tsx:92 - description no line-clamp-3 → variable card heights
- [ ] src/components/marketplace/PackageGrid.tsx:144 - "{n} guests" no plural for 1
- [ ] src/components/marketplace/PackageGrid.tsx:149 - currency `toLocaleString` → `Intl.NumberFormat`
- [ ] src/components/marketplace/PackageGrid.tsx:152 - "Book {name} →" no truncate; arrow not aria-hidden
- [ ] src/components/marketplace/PackageGrid.tsx:101 - "Request a quote →" + "Custom" italic typography
- [ ] src/components/marketplace/PackageGrid.tsx:118 - `<button>` opens modal; no custom focus-visible
- [ ] src/components/marketplace/PackageGrid.tsx:65 - preview-mode Cmd+click bypasses toast
- [ ] src/components/marketplace/PackageGrid.tsx:88 - hot-pink kicker on cream-soft 10px contrast

#### src/components/marketplace/PackageDetailModal.tsx

- [ ] src/components/marketplace/PackageDetailModal.tsx:73 - DialogContent verify `overscroll-behavior: contain`
- [ ] src/components/marketplace/PackageDetailModal.tsx:178 - "Please wait..." → `…`
- [ ] src/components/marketplace/PackageDetailModal.tsx:91 - "{n}h" needs nbsp + plural
- [ ] src/components/marketplace/PackageDetailModal.tsx:92 - "up to {n} guests" no singular
- [ ] src/components/marketplace/PackageDetailModal.tsx:104 - gallery `key={idx}`
- [ ] src/components/marketplace/PackageDetailModal.tsx:118 - alt "Gallery N" non-descriptive
- [ ] src/components/marketplace/PackageDetailModal.tsx:141 - native checkbox no focus ring
- [ ] src/components/marketplace/PackageDetailModal.tsx:149 - addon price `toLocaleString`
- [ ] src/components/marketplace/PackageDetailModal.tsx:175 - total `toLocaleString` + "$" hardcoded
- [ ] src/components/marketplace/PackageDetailModal.tsx:46 - non-ok silently swallowed; loading stuck
- [ ] src/components/marketplace/PackageDetailModal.tsx:177 - "Continue to booking" → Title Case
- [ ] src/components/marketplace/PackageDetailModal.tsx:102 - "What's included" straight apostrophe
- [ ] src/components/marketplace/PackageDetailModal.tsx:165 - `vendor_notes_template` no escaping audit
- [ ] src/components/marketplace/PackageDetailModal.tsx:73 - no focus restore guarantee documented
- [ ] src/components/marketplace/PackageDetailModal.tsx - no carousel keyboard/touch for gallery

#### src/components/marketplace/CategoryHoverExpand.tsx

- [ ] src/components/marketplace/CategoryHoverExpand.tsx:52 - motion.div animates flex value (layout property, jank)
- [ ] src/components/marketplace/CategoryHoverExpand.tsx:57 - onMouseEnter only; no onFocus (keyboard users)
- [ ] src/components/marketplace/CategoryHoverExpand.tsx:64 - Link onClick swallows nav on first click of collapsed tile
- [ ] src/components/marketplace/CategoryHoverExpand.tsx:129 - `href="#newsletter"` + `scrollIntoView({behavior:'smooth'})` ignores prefers-reduced-motion
- [ ] src/components/marketplace/CategoryHoverExpand.tsx:84,91,107 - opacity transitions not motion-reduce gated
- [ ] src/components/marketplace/CategoryHoverExpand.tsx:97 - rotated label no motion-reduce
- [ ] src/components/marketplace/CategoryHoverExpand.tsx:147 - "{n} {plural}" no `Intl.NumberFormat`; "1 photographers" possible

#### src/components/marketplace/CategoryHoverExpandMobile.tsx

- [ ] src/components/marketplace/CategoryHoverExpandMobile.tsx:71 - "{n} in Chicago" no Intl
- [ ] src/components/marketplace/CategoryHoverExpandMobile.tsx:73 - "Browse {plural}" English-only

#### src/components/marketplace/HomepageWordmarkPanel.tsx

- [ ] src/components/marketplace/HomepageWordmarkPanel.tsx:65 - `aria-label="Baazar"` should `translate="no"`
- [ ] src/components/marketplace/HomepageWordmarkPanel.tsx:81 - script wordmarks need `translate="no"`
- [ ] src/components/marketplace/HomepageWordmarkPanel.tsx:68 - `<h2>` only if h1 exists upstream
- [ ] src/components/marketplace/HomepageWordmarkPanel.tsx:38 - prefersReducedMotion defaults false SSR → first paint flash
- [ ] src/components/marketplace/HomepageWordmarkPanel.tsx:88 - script row labels no `translate="no"`
- [ ] src/components/marketplace/HomepageWordmarkPanel.tsx:34 - 2.5s cycle quick

#### src/components/marketplace/UnclaimedVendorProfile.tsx

- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:38 - raw `<img>` with eslint-disable; missing width/height (CLS); use next/image
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:51 - h1 business_name needs `translate="no"`
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:54 - "{city}, {state}" hardcoded
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:26 - "Unclaimed listing" weak visual hierarchy
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:70 - "Show on Instagram" no focus-visible
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:62 - external IG link no aria-label
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:85 - primary CTA small/lonely
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx:36 - only first photo; rest discarded
- [ ] src/components/marketplace/UnclaimedVendorProfile.tsx - no "Tell a vendor" CTA / no email-capture

#### src/components/marketplace/UnclaimedVendorRoute.tsx — ✓ pass (orchestration only)

#### src/components/marketplace/OwnThisBusinessModal.tsx

- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:148 - email missing autocomplete/inputmode/spellCheck
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:159 - name missing `autocomplete="name"`
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:168 - "Reason" should be `<textarea>`
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:212 - IG handle no `autocomplete="off"`/`spellCheck=false`; placeholder no `…`
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:223 - email (claim view) missing autocomplete/inputmode/spellCheck
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:148 - no `<form>` wrapper; required meaningless; no Enter-submit
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:46 - non-ok responses swallowed; no error toast
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:68 - success message no aria-live
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:78 - "We'll" straight apostrophe
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:189 - "Continue" generic
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:118 - buttons no focus-visible:ring
- [ ] src/components/marketplace/OwnThisBusinessModal.tsx:67 - max-w-md truncates long IG/reason

#### src/components/marketplace/OwnerBanner.tsx

- [ ] src/components/marketplace/OwnerBanner.tsx:12 - sticky no safe-area-inset
- [ ] src/components/marketplace/OwnerBanner.tsx:27 - transition-all
- [ ] src/components/marketplace/OwnerBanner.tsx:21 - "View as customer" no focus-visible
- [ ] src/components/marketplace/OwnerBanner.tsx:18 - "Edit profile"/"View as customer" → Title Case
- [ ] src/components/marketplace/OwnerBanner.tsx - no edit-mode badge

#### src/components/marketplace/ExitPreviewPill.tsx

- [ ] src/components/marketplace/ExitPreviewPill.tsx:12 - transition-all
- [ ] src/components/marketplace/ExitPreviewPill.tsx:12 - fixed bottom-6 right-6 ignores safe-area
- [ ] src/components/marketplace/ExitPreviewPill.tsx:12 - no focus-visible:ring
- [ ] src/components/marketplace/ExitPreviewPill.tsx:14 - "Exit preview" → Title Case
- [ ] src/components/marketplace/ExitPreviewPill.tsx - may overlap BookingBottomBar on mobile

#### src/components/dashboard/ClaimVendorProfile.tsx

- [ ] src/components/dashboard/ClaimVendorProfile.tsx:27 - `createClient()` every render → effect re-runs (potential infinite loop)
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:82 - `<label>` not associated; add htmlFor/id
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:86 - placeholder "..." → `…`
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:83 - missing `autocomplete="off"`/`spellCheck=false`/`inputmode="search"`
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:93 - "Searching..." → `…`
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:124 - "Claiming..." → `…`
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:99 - `"{query}"` → curly quotes
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:36 - magic threshold 2 — surface as constant
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:42 - data null silent
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:114 - business name no `translate="no"`
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:119 - `service_area.join(', ')` — use `Intl.ListFormat`
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:123 - "This is me" vague
- [ ] src/components/dashboard/ClaimVendorProfile.tsx:93 - status no `aria-live="polite"`
- [ ] src/components/dashboard/ClaimVendorProfile.tsx - no security/verification microcopy

### Marketplace search + filters

#### src/components/marketplace/SearchBar.tsx

- [ ] src/components/marketplace/SearchBar.tsx:24 - "Pick a date" should end with `…`
- [ ] src/components/marketplace/SearchBar.tsx:26 - hardcoded `'en-US'` locale
- [ ] src/components/marketplace/SearchBar.tsx:62 - click-outside only mousedown
- [ ] src/components/marketplace/SearchBar.tsx:167,217 - transition-all anti-pattern
- [ ] src/components/marketplace/SearchBar.tsx:180 - combobox missing role/aria-autocomplete/expanded/activedescendant; no arrow-key nav; no name/`autocomplete="off"`
- [ ] src/components/marketplace/SearchBar.tsx:193 - straight quotes; missing `…`
- [ ] src/components/marketplace/SearchBar.tsx:253 - `role="dialog"` + `aria-modal="false"` wrong for listbox panel
- [ ] src/components/marketplace/SearchBar.tsx:107 - no URL sync for in-progress state
- [ ] src/components/marketplace/SearchBar.tsx:150 - placeholder brand-y string ("Bollywood DJ") needs `translate="no"`

#### src/components/marketplace/filters/AllFiltersSheet.tsx

- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:63 - `direction="right"` hardcoded (claims "bottom on mobile" but isn't)
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:66 - missing `overscroll-behavior: contain` + `touch-action: pan-y`
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:80 - heading is `<h4>` (should be `<h2>`)
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:94 - scrollable body missing overscroll-behavior
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:107 - sticky footer no `env(safe-area-inset-bottom)`
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:108 - "Clear all" tiny underline link; destructive without confirm
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:58 - handleClear doesn't push URL
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:124 - dynamic count no `Intl.NumberFormat`/tabular-nums; aria-live placement wrong
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:121 - disabling Apply when count===0 traps user
- [ ] src/components/marketplace/filters/AllFiltersSheet.tsx:34 - debounced fetch no AbortController

#### src/components/marketplace/filters/Chip.tsx

- [ ] src/components/marketplace/filters/Chip.tsx:49 - transition-all anti-pattern
- [ ] src/components/marketplace/filters/Chip.tsx:76 - applied variant nests `role="button"` span inside `<button>` (invalid HTML)
- [ ] src/components/marketplace/filters/Chip.tsx:46 - missing `touch-action: manipulation`
- [ ] src/components/marketplace/filters/Chip.tsx:64 - all-filters variant no aria-label/count badge
- [ ] src/components/marketplace/filters/Chip.tsx:96 - chevron transitions need prefers-reduced-motion if added

#### src/components/marketplace/filters/FilterChipRow.tsx

- [ ] src/components/marketplace/filters/FilterChipRow.tsx:171 - `getBoundingClientRect` in useLayoutEffect every update (layout reads in render)
- [ ] src/components/marketplace/filters/FilterChipRow.tsx:184 - scroll listener with `capture:true` no rAF throttle
- [ ] src/components/marketplace/filters/FilterChipRow.tsx:198 - portal panel `role="dialog"` wrong for listbox
- [ ] src/components/marketplace/filters/FilterChipRow.tsx:79 - overflow-x-auto no scroll-snap / no fade mask
- [ ] src/components/marketplace/filters/FilterChipRow.tsx:147 - "All filters" no count badge of active filters
- [ ] src/components/marketplace/filters/FilterChipRow.tsx - no row-level "Clear all"
- [ ] src/components/marketplace/filters/FilterChipRow.tsx:33 - click-outside mousedown only

#### src/components/marketplace/filters/FilterShell.tsx

- [ ] src/components/marketplace/filters/FilterShell.tsx:20 - `sticky top-16` magic offset; use CSS var

#### src/components/marketplace/filters/LanguagesDropdown.tsx

- [ ] src/components/marketplace/filters/LanguagesDropdown.tsx:28 - `role="listbox"` no arrow nav/activedescendant/initial focus
- [ ] src/components/marketplace/filters/LanguagesDropdown.tsx:38 - tap targets borderline 32px (<44px iOS)
- [ ] src/components/marketplace/filters/LanguagesDropdown.tsx - no search/filter
- [ ] src/components/marketplace/filters/LanguagesDropdown.tsx - no in-dropdown Clear
- [ ] src/components/marketplace/filters/LanguagesDropdown.tsx:50 - English labels hardcoded; "Hindi"/"Punjabi" need `translate="no"`

#### src/components/marketplace/filters/PriceDropdown.tsx

- [ ] src/components/marketplace/filters/PriceDropdown.tsx:20 - `role="listbox"` no arrow nav/activedescendant
- [ ] src/components/marketplace/filters/PriceDropdown.tsx:38 - font-mono; should be tabular-nums + Intl currency
- [ ] src/components/marketplace/filters/PriceDropdown.tsx - bands-only; no custom min/max with `inputMode="numeric"`
- [ ] src/components/marketplace/filters/PriceDropdown.tsx:29 - selected-state delta only bg shade

#### src/components/marketplace/search/CategoryPicker.tsx

- [ ] src/components/marketplace/search/CategoryPicker.tsx:20 - `role="listbox"` no arrow nav/activedescendant/auto-focus
- [ ] src/components/marketplace/search/CategoryPicker.tsx:36 - tap target ~36px (<44px)
- [ ] src/components/marketplace/search/CategoryPicker.tsx - no selected-state checkmark
- [ ] src/components/marketplace/search/CategoryPicker.tsx:43 - decorative Icon missing aria-hidden
- [ ] src/components/marketplace/search/CategoryPicker.tsx:45 - static English labels; no i18n

#### src/components/marketplace/search/MobileSearchSheet.tsx

- [ ] src/components/marketplace/search/MobileSearchSheet.tsx:54 - aria-label conflicts with visible text — drop aria-label
- [ ] src/components/marketplace/search/MobileSearchSheet.tsx:64 - "Search Chicago weddings" city hardcoded
- [ ] src/components/marketplace/search/MobileSearchSheet.tsx:69 - missing overscroll-behavior + touch-action; `h-[75vh]` doesn't use `dvh` (keyboard pushes content)
- [ ] src/components/marketplace/search/MobileSearchSheet.tsx:121 - straight quotes; needs `…`
- [ ] src/components/marketplace/search/MobileSearchSheet.tsx:140 - sticky footer no `env(safe-area-inset-bottom)`
- [ ] src/components/marketplace/search/MobileSearchSheet.tsx:126 - WhatPicker autofocus violates mobile autoFocus rule
- [ ] src/components/marketplace/search/MobileSearchSheet.tsx:83 - body scroll missing overscroll-behavior
- [ ] src/components/marketplace/search/MobileSearchSheet.tsx - no URL sync for in-progress mobile selections

#### src/components/marketplace/search/SegmentButton.tsx

- [ ] src/components/marketplace/search/SegmentButton.tsx:40 - transition-all anti-pattern
- [ ] src/components/marketplace/search/SegmentButton.tsx:32 - `focus-visible:outline-none` with no replacement (rule violation)
- [ ] src/components/marketplace/search/SegmentButton.tsx:37 - `aria-expanded` always set even without panelId

#### src/components/marketplace/search/WhatPicker.tsx

- [ ] src/components/marketplace/search/WhatPicker.tsx:23 - unconditional autofocus on mobile (anti-pattern)
- [ ] src/components/marketplace/search/WhatPicker.tsx:42 - combobox missing role/aria-autocomplete/expanded/controls/activedescendant
- [ ] src/components/marketplace/search/WhatPicker.tsx:48 - straight `"` + no `…`
- [ ] src/components/marketplace/search/WhatPicker.tsx:58 - empty state when `suggestions.length===0` renders nothing
- [ ] src/components/marketplace/search/WhatPicker.tsx - no aria-live for result count

#### src/components/marketplace/search/WhatSuggestions.tsx

- [ ] src/components/marketplace/search/WhatSuggestions.tsx:30 - empty state no reset CTA (dead end)
- [ ] src/components/marketplace/search/WhatSuggestions.tsx:31 - no `aria-live="polite"`
- [ ] src/components/marketplace/search/WhatSuggestions.tsx:43 - buttons inside `<ul>`; need `role="listbox"/"option"` + aria-activedescendant
- [ ] src/components/marketplace/search/WhatSuggestions.tsx - no keyboard arrow-down from input

#### src/components/marketplace/search/WhenPicker.tsx

- [ ] src/components/marketplace/search/WhenPicker.tsx - pass-through; verify DatePicker implements `role="grid"`, aria-selected, arrow nav, ≥44px taps, Intl, prefers-reduced-motion

### Vendor onboarding wizard

#### src/app/dashboard/profile/setup/layout.tsx

- [ ] src/app/dashboard/profile/setup/layout.tsx:46 - WizardStepper hidden `md:block`; mobile users get no step context
- [ ] src/app/dashboard/profile/setup/layout.tsx:52 - `<main>` has no skip-link target / no skip-link rendered
- [ ] src/app/dashboard/profile/setup/layout.tsx:55 - first-person "your next business" inside `<strong>`; consider `translate="no"` or rephrase
- [ ] src/app/dashboard/profile/setup/layout.tsx:49 - inconsistent voice between mobile aside and main banner

#### src/app/dashboard/profile/setup/error.tsx

- [ ] src/app/dashboard/profile/setup/error.tsx:20 - top-level heading should be `<h1>`
- [ ] src/app/dashboard/profile/setup/error.tsx:23 - error region needs `aria-live="polite"` (or `role="alert"`)
- [ ] src/app/dashboard/profile/setup/error.tsx:24 - "An unexpected error occurred." passive + non-actionable
- [ ] src/app/dashboard/profile/setup/error.tsx:20 - "We hit a snag…" first-person ("We") — guidelines want second person
- [ ] src/app/dashboard/profile/setup/error.tsx:31,34 - Title Case "Try Again" / "Back to Dashboard"
- [ ] src/app/dashboard/profile/setup/error.tsx:27 - "Error reference:" — `translate="no"` on digest token

#### src/app/dashboard/profile/setup/{page,basics,details,location,online,portfolio}/page.tsx — ✓ pass (wrappers; rules apply to Step\* client components below)

#### src/app/dashboard/profile/setup/payment-mode/page.tsx

- [ ] src/app/dashboard/profile/setup/payment-mode/page.tsx:4 - immediate server-side redirect; step still appears in URL/stepper — remove from WizardStepper + nextIncompleteStep if deprecated

#### src/app/dashboard/profile/setup/review/page.tsx

- [ ] src/app/dashboard/profile/setup/review/page.tsx:28 - silent redirect when `!profile`; no feedback (toast / `?reason=`)
- [ ] src/app/dashboard/profile/setup/review/page.tsx:29 - verify StepReview finalize action requires explicit confirmation

#### src/components/onboarding/VendorOnboarding.tsx

- [ ] src/components/onboarding/VendorOnboarding.tsx:50 - ESC silently submits `skipped:true`; destructive without undo
- [ ] src/components/onboarding/VendorOnboarding.tsx:52 - modal h2 with no h1
- [ ] src/components/onboarding/VendorOnboarding.tsx:53 - "1-5" should be en-dash 1–5
- [ ] src/components/onboarding/VendorOnboarding.tsx:59 - multi-select chip lacks aria-pressed
- [ ] src/components/onboarding/VendorOnboarding.tsx:67 - silent failure when 6th chip tapped after 5
- [ ] src/components/onboarding/VendorOnboarding.tsx:72 - chip no focus-visible ring
- [ ] src/components/onboarding/VendorOnboarding.tsx:81 - step 1 submit has no spinner
- [ ] src/components/onboarding/VendorOnboarding.tsx:87 - "Continue →" no nbsp join, no aria-label
- [ ] src/components/onboarding/VendorOnboarding.tsx:102 - `key={i}` index keys
- [ ] src/components/onboarding/VendorOnboarding.tsx:106 - date/guest/budget concatenated with · ; unlocalized strings
- [ ] src/components/onboarding/VendorOnboarding.tsx:112 - step 2 button missing loading copy "Submitting…"
- [ ] src/components/onboarding/VendorOnboarding.tsx - no focus management when step 1→2
- [ ] src/components/onboarding/VendorOnboarding.tsx - no back button on step 2

#### src/components/onboarding/WizardStepper.tsx

- [ ] src/components/onboarding/WizardStepper.tsx:27 - `<nav>` lacks `aria-label="Progress"`
- [ ] src/components/onboarding/WizardStepper.tsx:32 - missing `aria-current="step"`
- [ ] src/components/onboarding/WizardStepper.tsx:33 - completed/current/incomplete is color-only for SR
- [ ] src/components/onboarding/WizardStepper.tsx:55 - `<Check>` missing aria-hidden + visually-hidden "completed"
- [ ] src/components/onboarding/WizardStepper.tsx:63 - reachable Link doesn't preserve `?next=true`; user jumps modes mid-wizard
- [ ] src/components/onboarding/WizardStepper.tsx:64 - unreachable steps: no aria-disabled, no tooltip
- [ ] src/components/onboarding/WizardStepper.tsx:38 - rounded link no focus-visible:ring
- [ ] src/components/onboarding/WizardStepper.tsx:71 - "Save & exit" misleading — doesn't autosave
- [ ] src/components/onboarding/WizardStepper.tsx:73 - underline link no focus-visible
- [ ] src/components/onboarding/WizardStepper.tsx - no aria-live when step advances

#### src/components/onboarding/StepBasics.tsx

- [ ] src/components/onboarding/StepBasics.tsx:107 - "X fields need attention" missing aria-live; threshold ≥2 is arbitrary
- [ ] src/components/onboarding/StepBasics.tsx:113 - businessName missing `autoComplete="organization"`/name/required
- [ ] src/components/onboarding/StepBasics.tsx:119 - placeholder needs `…`
- [ ] src/components/onboarding/StepBasics.tsx:122 - error `<p>` not linked via aria-describedby/aria-invalid; submit doesn't focus first error
- [ ] src/components/onboarding/StepBasics.tsx:136 - SelectValue placeholder needs `…`
- [ ] src/components/onboarding/StepBasics.tsx:165 - dismiss missing focus-visible:ring
- [ ] src/components/onboarding/StepBasics.tsx:176 - bio Textarea missing name/maxLength/aria-describedby
- [ ] src/components/onboarding/StepBasics.tsx:185 - char counter missing tabular-nums + aria-live; no over-limit color
- [ ] src/components/onboarding/StepBasics.tsx:183 - placeholder lacks `…`
- [ ] src/components/onboarding/StepBasics.tsx:200 - server error not focused/announced
- [ ] src/components/onboarding/StepBasics.tsx - no beforeunload guard; no autosave indicator

#### src/components/onboarding/StepDetails.tsx

- [ ] src/components/onboarding/StepDetails.tsx:102 - languages Label has no htmlFor; chip group not fieldset/legend
- [ ] src/components/onboarding/StepDetails.tsx:108 - chips missing aria-pressed
- [ ] src/components/onboarding/StepDetails.tsx:112 - chip no focus-visible ring
- [ ] src/components/onboarding/StepDetails.tsx:138 - number input missing `inputMode="numeric"`/`autoComplete="off"`/name
- [ ] src/components/onboarding/StepDetails.tsx:155 - "How quickly do you respond?" not fieldset/legend
- [ ] src/components/onboarding/StepDetails.tsx:161 - radio input no focus-visible
- [ ] src/components/onboarding/StepDetails.tsx:97 - "X fields need attention" no aria-live
- [ ] src/components/onboarding/StepDetails.tsx:182 - server error no aria-live
- [ ] src/components/onboarding/StepDetails.tsx:185 - submit `disabled={!isValid}` (anti-pattern)
- [ ] src/components/onboarding/StepDetails.tsx:186 - "Continue"/"Save" vague label
- [ ] src/components/onboarding/StepDetails.tsx - no beforeunload guard

#### src/components/onboarding/StepLocation.tsx

- [ ] src/components/onboarding/StepLocation.tsx:87 - "Base address" Label no htmlFor; Google input unlabeled
- [ ] src/components/onboarding/StepLocation.tsx:98 - placeholder uses `...` not `…`
- [ ] src/components/onboarding/StepLocation.tsx:111 - skip-address checkbox no focus-visible
- [ ] src/components/onboarding/StepLocation.tsx:132 - disabling autocomplete on skip is silent (no SR)
- [ ] src/components/onboarding/StepLocation.tsx:148 - magic `pl-[calc(...)]` for switch indent — brittle
- [ ] src/components/onboarding/StepLocation.tsx:154 - serverError no aria-live
- [ ] src/components/onboarding/StepLocation.tsx:84 - "fields need attention" no aria-live
- [ ] src/components/onboarding/StepLocation.tsx:102 - preview city/state/postal not aria-describedby
- [ ] src/components/onboarding/StepLocation.tsx:157 - "Next" not specific
- [ ] src/components/onboarding/StepLocation.tsx - no beforeunload guard
- [ ] src/components/onboarding/StepLocation.tsx - "Address public" Switch has no preview of what becomes visible

#### src/components/onboarding/StepOnline.tsx

- [ ] src/components/onboarding/StepOnline.tsx:65 - IG Input missing `spellCheck={false}`/`autoComplete="off"`/`autoCapitalize="none"`/inputMode/name
- [ ] src/components/onboarding/StepOnline.tsx:64 - leading "@" + typed "@" yields "@@yourhandle" until blur
- [ ] src/components/onboarding/StepOnline.tsx:73 - placeholder needs `…`
- [ ] src/components/onboarding/StepOnline.tsx:23 - URL-style paste not stripped (only leading @)
- [ ] src/components/onboarding/StepOnline.tsx:88 - URL Input missing `inputMode="url"`/`autoComplete="url"`/`spellCheck={false}`/name
- [ ] src/components/onboarding/StepOnline.tsx:94 - URL placeholder needs `…`
- [ ] src/components/onboarding/StepOnline.tsx:58 - "fields need attention" no aria-live
- [ ] src/components/onboarding/StepOnline.tsx:101 - serverError no aria-live
- [ ] src/components/onboarding/StepOnline.tsx:104 - "Next" not specific
- [ ] src/components/onboarding/StepOnline.tsx - no beforeunload; no explicit "I don't have one" skip; no IG handle preview link

#### src/components/onboarding/StepPortfolio.tsx

- [ ] src/components/onboarding/StepPortfolio.tsx:51 - "fields need attention" no aria-live
- [ ] src/components/onboarding/StepPortfolio.tsx:55 - error `<p>` no aria-live + no aria-describedby on uploader
- [ ] src/components/onboarding/StepPortfolio.tsx:60 - amber banner no `role="status"`/aria-live
- [ ] src/components/onboarding/StepPortfolio.tsx:62 - "2×" / "—" rendered as HTML entities not literals
- [ ] src/components/onboarding/StepPortfolio.tsx:46 - "Show your work" gives no rules (format/count/size)
- [ ] src/components/onboarding/StepPortfolio.tsx:81 - submit disabled when `images.length===0` (anti-pattern)
- [ ] src/components/onboarding/StepPortfolio.tsx - drag-and-drop a11y lives in PhotoUploaderDrawer (see below)
- [ ] src/components/onboarding/StepPortfolio.tsx - no beforeunload guard
- [ ] src/components/onboarding/StepPortfolio.tsx - no per-photo alt/caption editor
- [ ] src/components/onboarding/StepPortfolio.tsx - no progress/error region for UploadThing
- [ ] src/components/onboarding/StepPortfolio.tsx - "Step 5 of 6" hard-coded

#### src/components/onboarding/StepReview.tsx

- [ ] src/components/onboarding/StepReview.tsx:95 - "Edit" link not specific; no aria-label
- [ ] src/components/onboarding/StepReview.tsx:111 - "Missing" not actionable
- [ ] src/components/onboarding/StepReview.tsx:131 - address concat with ", " — not locale-aware
- [ ] src/components/onboarding/StepReview.tsx:159 - @handle missing `translate="no"`
- [ ] src/components/onboarding/StepReview.tsx:170 - external link no external-link affordance
- [ ] src/components/onboarding/StepReview.tsx:197 - every portfolio Image uses `alt="Portfolio"`
- [ ] src/components/onboarding/StepReview.tsx:223 - "Click to see the full profile" — should be touch-agnostic
- [ ] src/components/onboarding/StepReview.tsx:227 - `<button>` wrapping `<VendorCard>` has no aria-label
- [ ] src/components/onboarding/StepReview.tsx:234 - full-screen dialog missing `overscroll-behavior` + `env(safe-area-inset)`
- [ ] src/components/onboarding/StepReview.tsx:251 - `h-[calc(100vh-49px)]` magic offset
- [ ] src/components/onboarding/StepReview.tsx:260 - "fields need attention" no aria-live
- [ ] src/components/onboarding/StepReview.tsx:263 - publishError no aria-live/`role="alert"`
- [ ] src/components/onboarding/StepReview.tsx:288 - "Publish profile" → Title Case + spinner icon

#### src/components/onboarding/BioAssistCard.tsx

- [ ] src/components/onboarding/BioAssistCard.tsx:31 - "✨ Draft with AI" emoji in button label; no aria-label disambig
- [ ] src/components/onboarding/BioAssistCard.tsx:118 - global window keydown ESC; closes card even when focus elsewhere
- [ ] src/components/onboarding/BioAssistCard.tsx:131 - trigger button no focus-visible
- [ ] src/components/onboarding/BioAssistCard.tsx:138 - "Drafting…" no aria-live state-change
- [ ] src/components/onboarding/BioAssistCard.tsx:142 - generated card no `role="region"`/aria-label
- [ ] src/components/onboarding/BioAssistCard.tsx:145 - `<Sparkles>` missing aria-hidden
- [ ] src/components/onboarding/BioAssistCard.tsx:157 - streamed `<p>` no `aria-live="polite"` / `aria-atomic="false"`
- [ ] src/components/onboarding/BioAssistCard.tsx:160 - animate-pulse cursor ignores prefers-reduced-motion
- [ ] src/components/onboarding/BioAssistCard.tsx:158 - error vs streaming visually identical; no `role="alert"`
- [ ] src/components/onboarding/BioAssistCard.tsx:166 - "Use this" vague; should be "Use This Bio"
- [ ] src/components/onboarding/BioAssistCard.tsx:175 - "Keep mine" vague
- [ ] src/components/onboarding/BioAssistCard.tsx - no Regenerate affordance; long bio no max-height/scroll; no in-card Cancel

#### src/components/ui/onboarding.tsx

- [ ] src/components/ui/onboarding.tsx:31 - transition-all (anti-pattern)
- [ ] src/components/ui/onboarding.tsx:34 - dot animates size (layout property, not compositor-friendly)
- [ ] src/components/ui/onboarding.tsx:71 - `role="progressbar"` + each dot `aria-current="step"` — overlapping patterns
- [ ] src/components/ui/onboarding.tsx:78 - no prefers-reduced-motion honor for dot
- [ ] src/components/ui/onboarding.tsx:269 - root container no color-scheme
- [ ] src/components/ui/onboarding.tsx:309 - empty interface (eslint-disable) — refactor
- [ ] src/components/ui/onboarding.tsx:416 - `<fieldset>` used for nav buttons (semantically wrong)
- [ ] src/components/ui/onboarding.tsx:423,434,443 - aria-label duplicates visible text (redundant accessible name)
- [ ] src/components/ui/onboarding.tsx:586 - sr-only radio inside `<label>`; label has no `:focus-within` ring
- [ ] src/components/ui/onboarding.tsx:732 - keyboard FeatureCarousel missing Home/End
- [ ] src/components/ui/onboarding.tsx:809 - `<ol>` markers reset; numbering invisible without consumer CSS
- [ ] src/components/ui/onboarding.tsx:778 - TipsList `<ol>` no visual fallback

### Package + profile forms + toggles

#### src/app/dashboard/profile/page.tsx

- [ ] src/app/dashboard/profile/page.tsx:28 - `<h1>` lacks text-pretty
- [ ] src/app/dashboard/profile/page.tsx:31 - "Search visibility" label not associated with toggle (no `<label>`/aria-labelledby on PauseProfileToggle)
- [ ] src/app/dashboard/profile/page.tsx:34 - "Active — visible in search" status should be in `aria-live="polite"`
- [ ] src/app/dashboard/profile/page.tsx:26 - header flex can collapse on narrow screens; right column lacks min-w-0/responsive wrap

#### src/app/dashboard/profile/calendar/page.tsx

- [ ] src/app/dashboard/profile/calendar/page.tsx:78 - `<h1>` lacks text-pretty
- [ ] src/app/dashboard/profile/calendar/page.tsx:27 - guard `NEXT_PUBLIC_APP_URL` fallback against hydration mismatch in ExternalCalendarSyncCard

#### src/app/dashboard/profile/packages/page.tsx

- [ ] src/app/dashboard/profile/packages/page.tsx:44 - emoji "🎉" needs `aria-hidden="true"`
- [ ] src/app/dashboard/profile/packages/page.tsx:42 - just-onboarded banner missing `role="status"`/`aria-live="polite"`
- [ ] src/app/dashboard/profile/packages/page.tsx:59 - "+ Add Package" — leading "+" should be aria-hidden icon span
- [ ] src/app/dashboard/profile/packages/page.tsx:98 - PackageCard lacks `hover:` state on the card surface
- [ ] src/app/dashboard/profile/packages/page.tsx:104 - `<Image fill>` lacks `sizes` prop (poor responsive image selection)
- [ ] src/app/dashboard/profile/packages/page.tsx:102 - `pkg.featured_image_url` may be empty/null — no fallback for Next/Image
- [ ] src/app/dashboard/profile/packages/page.tsx:111 - long pkg.name not clamped (line-clamp-2 / break-words)
- [ ] src/app/dashboard/profile/packages/page.tsx:110 - flex row `<h3>` lacks min-w-0 to allow truncation next to Inactive pill
- [ ] src/app/dashboard/profile/packages/page.tsx:117 - `$` + `toLocaleString` → `Intl.NumberFormat(locale, {style:'currency', currency:'USD'})`
- [ ] src/app/dashboard/profile/packages/page.tsx:117 - price lacks `font-variant-numeric: tabular-nums`
- [ ] src/app/dashboard/profile/packages/page.tsx:120 - "{n}h" needs `{n}&nbsp;h`
- [ ] src/app/dashboard/profile/packages/page.tsx:113 - "Inactive" pill — consider `role="status"` or visually-hidden "Status: " prefix
- [ ] src/app/dashboard/profile/packages/page.tsx:76 - grid `.map()` unbounded; virtualize once >50
- [ ] src/app/dashboard/profile/packages/page.tsx:124 - "Edit" generic — include package name via aria-label

#### src/app/dashboard/profile/packages/new/page.tsx

- [ ] src/app/dashboard/profile/packages/new/page.tsx:22 - `<h1>` lacks text-pretty

#### src/app/dashboard/profile/packages/[id]/page.tsx

- [ ] src/app/dashboard/profile/packages/[id]/page.tsx:30 - `<h1>` lacks text-pretty; consider including package name ("Edit {pkg.name}")
- [ ] src/app/dashboard/profile/packages/[id]/page.tsx:30 - verify PackageEditorForm guards delete with a confirmation modal

#### src/components/forms/PackageEditorForm.tsx

- [ ] src/components/forms/PackageEditorForm.tsx:132 - name missing `autocomplete="off"`
- [ ] src/components/forms/PackageEditorForm.tsx:138,152 - placeholders lack/use `...` not `…`
- [ ] src/components/forms/PackageEditorForm.tsx:159 - price missing `inputMode="decimal"`/step=0.01 (blocks cents); no Intl preview; "$" hardcoded
- [ ] src/components/forms/PackageEditorForm.tsx:168,173,189 - number fields missing inputMode/autoComplete
- [ ] src/components/forms/PackageEditorForm.tsx:201 - "1–5" no inline error/live announce
- [ ] src/components/forms/PackageEditorForm.tsx:211 - "Mehndi + Shaadi + Walima" needs `translate="no"`
- [ ] src/components/forms/PackageEditorForm.tsx:218 - "Featured Image \*" label no htmlFor; uploader no programmatic label
- [ ] src/components/forms/PackageEditorForm.tsx:233 - radio group no `role="radiogroup"`/aria-labelledby
- [ ] src/components/forms/PackageEditorForm.tsx:236 - location_mode_radio name pollutes FormData; missing `autocomplete="off"`
- [ ] src/components/forms/PackageEditorForm.tsx:262 - included_items textarea no name (not in FormData); placeholder no `…`
- [ ] src/components/forms/PackageEditorForm.tsx:271 - "≤1000 chars" no live count
- [ ] src/components/forms/PackageEditorForm.tsx:278 - placeholder no `…`
- [ ] src/components/forms/PackageEditorForm.tsx:286 - addons editor not in fieldset/legend
- [ ] src/components/forms/PackageEditorForm.tsx:62 - error toast copy inaccurate ("paste a URL" — uploader has no paste input)
- [ ] src/components/forms/PackageEditorForm.tsx:108 - no inline errors / focus-first-error
- [ ] src/components/forms/PackageEditorForm.tsx:115 - silent catch
- [ ] src/components/forms/PackageEditorForm.tsx:128 - no beforeunload guard
- [ ] src/components/forms/PackageEditorForm.tsx:290 - "Saving..." → `…`
- [ ] src/components/forms/PackageEditorForm.tsx:292 - Cancel uses `router.back()` unsafe; no unsaved-changes confirm
- [ ] src/components/forms/PackageEditorForm.tsx:288 - no inline preview

#### src/components/forms/PackageAddonsEditor.tsx

- [ ] src/components/forms/PackageAddonsEditor.tsx:48 - Label no htmlFor; not fieldset/legend
- [ ] src/components/forms/PackageAddonsEditor.tsx:52 - `key={i}` breaks identity on reorder/remove
- [ ] src/components/forms/PackageAddonsEditor.tsx:55 - placeholder no `…`
- [ ] src/components/forms/PackageAddonsEditor.tsx:57 - name input no aria-label
- [ ] src/components/forms/PackageAddonsEditor.tsx:61 - hardcoded "$"; not associated with input
- [ ] src/components/forms/PackageAddonsEditor.tsx:64 - `inputMode="numeric"` blocks decimals; should be "decimal" step="0.01"
- [ ] src/components/forms/PackageAddonsEditor.tsx:62 - price input no aria-label
- [ ] src/components/forms/PackageAddonsEditor.tsx:68 - controlled type instability ('' vs number); typing "1." traps caret
- [ ] src/components/forms/PackageAddonsEditor.tsx:77 - remove drops focus
- [ ] src/components/forms/PackageAddonsEditor.tsx:80 - × glyph could be aria-hidden
- [ ] src/components/forms/PackageAddonsEditor.tsx:87 - after "+ Add-on" click, focus not moved to new row
- [ ] src/components/forms/PackageAddonsEditor.tsx:42 - empty name silently passes
- [ ] src/components/forms/PackageAddonsEditor.tsx:46 - no aria-live on add/remove
- [ ] src/components/forms/PackageAddonsEditor.tsx:48 - max-reached state silently hides add button

#### src/components/forms/VendorProfileForm.tsx

- [ ] src/components/forms/VendorProfileForm.tsx:134 - businessName missing `autocomplete="organization"`
- [ ] src/components/forms/VendorProfileForm.tsx:140 - placeholder no `…`; brand name not `translate="no"`
- [ ] src/components/forms/VendorProfileForm.tsx:162 - bio no character count; no maxLength
- [ ] src/components/forms/VendorProfileForm.tsx:167 - placeholder uses `...` → `…`
- [ ] src/components/forms/VendorProfileForm.tsx:174 - IG handle missing spellCheck/autoCapitalize/autoCorrect/inputMode/`autocomplete="off"`; no @ affordance
- [ ] src/components/forms/VendorProfileForm.tsx:183 - website missing `autocomplete="url"`/`inputMode="url"`; placeholder `...` → `…`
- [ ] src/components/forms/VendorProfileForm.tsx:188 - placeholder `...` → `…`
- [ ] src/components/forms/VendorProfileForm.tsx:195 - sla missing `inputMode="numeric"`/`autocomplete="off"`
- [ ] src/components/forms/VendorProfileForm.tsx:208 - "Base Address" h3 hierarchy
- [ ] src/components/forms/VendorProfileForm.tsx:215 - "Street Address" Label no htmlFor; autocomplete no aria-labelledby
- [ ] src/components/forms/VendorProfileForm.tsx:216 - GooglePlaces missing `autocomplete="street-address"` internally
- [ ] src/components/forms/VendorProfileForm.tsx:220 - `outline-none focus-visible:outline-none` redundant
- [ ] src/components/forms/VendorProfileForm.tsx:223 - "{city}, {state} {postal_code}" hardcoded format
- [ ] src/components/forms/VendorProfileForm.tsx:228 - checkbox no focus ring guarantee; no shared hit target
- [ ] src/components/forms/VendorProfileForm.tsx:90 - error parsing inconsistent; no inline field errors; no focus-first-error
- [ ] src/components/forms/VendorProfileForm.tsx:108 - INSERT path bypasses zod
- [ ] src/components/forms/VendorProfileForm.tsx:130 - no beforeunload guard
- [ ] src/components/forms/VendorProfileForm.tsx:246 - "Saving..." → `…`
- [ ] src/components/forms/VendorProfileForm.tsx:71 - `service_area: ['Chicago']` hardcoded
- [ ] src/components/forms/VendorProfileForm.tsx:144 - Radix Select with `name="category"` may not appear in FormData — **VERIFY**

#### src/components/dashboard/PackageActiveToggle.tsx

- [ ] src/components/dashboard/PackageActiveToggle.tsx:41 - not `role="switch"` + aria-checked
- [ ] src/components/dashboard/PackageActiveToggle.tsx:44 - no optimistic UI
- [ ] src/components/dashboard/PackageActiveToggle.tsx:47 - "..." → `…`; no aria-busy/spinner
- [ ] src/components/dashboard/PackageActiveToggle.tsx:49 - error message no aria-live
- [ ] src/components/dashboard/PackageActiveToggle.tsx:17 - deactivate destructive (hides package); no confirm/undo
- [ ] src/components/dashboard/PackageActiveToggle.tsx:28 - error has no fix guidance

#### src/components/dashboard/PauseProfileToggle.tsx

- [ ] src/components/dashboard/PauseProfileToggle.tsx:40 - not `role="switch"` + aria-checked
- [ ] src/components/dashboard/PauseProfileToggle.tsx:40 - no optimistic UI/no confirm for high-impact
- [ ] src/components/dashboard/PauseProfileToggle.tsx:41 - "..." → `…`; no aria-busy
- [ ] src/components/dashboard/PauseProfileToggle.tsx:43 - error `<p>` needs aria-live/`role="status"`
- [ ] src/components/dashboard/PauseProfileToggle.tsx:27 - json.error may be object — non-string slip
- [ ] src/components/dashboard/PauseProfileToggle.tsx:39 - no helper text describing consequence
- [ ] src/components/dashboard/PauseProfileToggle.tsx:38 - inverted variant logic (Resume = default CTA when paused) may mislead

#### src/components/dashboard/BusinessSwitcher.tsx

- [ ] src/components/dashboard/BusinessSwitcher.tsx:59 - trigger missing aria-label when active undefined; add `type="button"`
- [ ] src/components/dashboard/BusinessSwitcher.tsx:60 - no focus-visible:ring
- [ ] src/components/dashboard/BusinessSwitcher.tsx:63,67,81 - decorative icons missing aria-hidden
- [ ] src/components/dashboard/BusinessSwitcher.tsx:64 - max-w-[180px] truncates with no tooltip
- [ ] src/components/dashboard/BusinessSwitcher.tsx:70 - w-64 dropdown clips long names
- [ ] src/components/dashboard/BusinessSwitcher.tsx:74 - large lists not virtualized; no search/filter
- [ ] src/components/dashboard/BusinessSwitcher.tsx:81 - `aria-current="true"` missing on item
- [ ] src/components/dashboard/BusinessSwitcher.tsx:48 - failed switch silent (`console.error` only)
- [ ] src/components/dashboard/BusinessSwitcher.tsx:53 - no focus restore guarantee during `startTransition`
- [ ] src/components/dashboard/BusinessSwitcher.tsx:38 - no toast on switch
- [ ] src/components/dashboard/BusinessSwitcher.tsx:43 - no optimistic UI/spinner
- [ ] src/components/dashboard/BusinessSwitcher.tsx:88 - "Add another business" needs visual separation
- [ ] src/components/dashboard/BusinessSwitcher.tsx:65 - "Switch business" misleading fallback when active undefined

### Vendor booking actions + dialogs

#### src/components/booking/VendorBookingActions.tsx

- [ ] src/components/booking/VendorBookingActions.tsx:126 - "Accepting..." → `…`
- [ ] src/components/booking/VendorBookingActions.tsx:122 - Accept fires immediately; no confirm/undo
- [ ] src/components/booking/VendorBookingActions.tsx:127 - currency via `toLocaleString`; need Intl + tabular-nums
- [ ] src/components/booking/VendorBookingActions.tsx:108 - "Respond to this booking" sentence case
- [ ] src/components/booking/VendorBookingActions.tsx:136 - "Cancel" ambiguous; "Close" or "Don't adjust"
- [ ] src/components/booking/VendorBookingActions.tsx:79,97 - errors toast-only
- [ ] src/components/booking/VendorBookingActions.tsx:104 - no context (which couple/event)

#### src/components/booking/VendorAdjustQuoteForm.tsx

- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:89 - currency input missing `inputMode="decimal"`/`autoComplete="off"`/name
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:102 - Label no htmlFor for Select
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:105 - "Select a reason..." → `…`
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:126,141 - placeholder needs `…`
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:147 - "Sending..." → `…`
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:44,49 - validation toasts; need inline + focus
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:97 - "Current: $X" hardcoded
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:84 - no before/after delta
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:120,135 - textareas missing spellCheck + `autoComplete="off"`
- [ ] src/components/booking/VendorAdjustQuoteForm.tsx:147 - no preview step

#### src/components/booking/AdjustmentReview.tsx

- [ ] src/components/booking/AdjustmentReview.tsx:85,89 - native `alert()` — replace with toast/inline
- [ ] src/components/booking/AdjustmentReview.tsx:81 - `window.location.reload()` instead of `router.refresh()`
- [ ] src/components/booking/AdjustmentReview.tsx:132 - "Decline" fires immediately; needs confirm modal
- [ ] src/components/booking/AdjustmentReview.tsx:100 - "Vendor sent an adjusted quote" sentence case
- [ ] src/components/booking/AdjustmentReview.tsx:105,112,124 - currency via `toLocaleString`
- [ ] src/components/booking/AdjustmentReview.tsx:110 - color-only delta cue; add ± or icon
- [ ] src/components/booking/AdjustmentReview.tsx:155 - "72 hours" needs nbsp
- [ ] src/components/booking/AdjustmentReview.tsx:102 - 2-col grid needs responsive collapse
- [ ] src/components/booking/AdjustmentReview.tsx:99 - missing aria-live busy state
- [ ] src/components/booking/AdjustmentReview.tsx:155 - escalation path unclear

#### src/components/bookings/CounterModal.tsx

- [ ] src/components/bookings/CounterModal.tsx:73 - missing `overscroll-behavior: contain`
- [ ] src/components/bookings/CounterModal.tsx:91 - currency input `step="1"` blocks cents; missing inputMode/autoComplete/name; no tabular-nums
- [ ] src/components/bookings/CounterModal.tsx:97 - `Number(e.target.value)` on empty → 0
- [ ] src/components/bookings/CounterModal.tsx:90 - no before/after price comparison
- [ ] src/components/bookings/CounterModal.tsx:108 - textarea missing `autoComplete="off"`/spellCheck
- [ ] src/components/bookings/CounterModal.tsx:117 - char counter no aria-live
- [ ] src/components/bookings/CounterModal.tsx:121 - hardcoded `#D1006C` inline style; bypasses theme tokens
- [ ] src/components/bookings/CounterModal.tsx:69 - backdrop/Escape discards typed counter without dirty warn
- [ ] src/components/bookings/CounterModal.tsx:74 - DialogTitle doesn't show vendor/event context
- [ ] src/components/bookings/CounterModal.tsx:97 - re-open useEffect reset can race focus
- [ ] src/components/bookings/CounterModal.tsx:127 - submit doesn't show delta vs current

#### src/components/dashboard/BookingActions.tsx

- [ ] src/components/dashboard/BookingActions.tsx:107 - native `window.confirm()` for "Mark complete" (releases funds!)
- [ ] src/components/dashboard/BookingActions.tsx:159 - "Processing..." → `…`
- [ ] src/components/dashboard/BookingActions.tsx:172 - "Cancel"/"Decline" generic; should include booking
- [ ] src/components/dashboard/BookingActions.tsx:161 - "Report an issue" → Title Case
- [ ] src/components/dashboard/BookingActions.tsx:178 - "under review" no aria-live
- [ ] src/components/dashboard/BookingActions.tsx:131 - "Pay Deposit" doesn't show amount inline
- [ ] src/components/dashboard/BookingActions.tsx:43 - `countersLeft` no rejection visual indicator
- [ ] src/components/dashboard/BookingActions.tsx:121 - "Booking marked complete." toast lacks undo on non-reversible $$$ action
- [ ] src/components/dashboard/BookingActions.tsx:115 - error path no aria-live

#### src/components/dashboard/CancelDialog.tsx

- [ ] src/components/dashboard/CancelDialog.tsx:158 - "Cancelling..." → `…`
- [ ] src/components/dashboard/CancelDialog.tsx:97 - destructive without typed-confirm
- [ ] src/components/dashboard/CancelDialog.tsx:101 - title doesn't identify which booking
- [ ] src/components/dashboard/CancelDialog.tsx:112 - Label no htmlFor for Select
- [ ] src/components/dashboard/CancelDialog.tsx:114 - SelectValue no placeholder fallback
- [ ] src/components/dashboard/CancelDialog.tsx:133 - textarea missing `autoComplete="off"`/spellCheck
- [ ] src/components/dashboard/CancelDialog.tsx:137 - placeholder missing trailing `…` and example pattern
- [ ] src/components/dashboard/CancelDialog.tsx:34 - "100% refund" repeated without differentiation
- [ ] src/components/dashboard/CancelDialog.tsx:147 - "5%" needs nbsp
- [ ] src/components/dashboard/CancelDialog.tsx:99 - missing `overscroll-behavior: contain`
- [ ] src/components/dashboard/CancelDialog.tsx:77 - error has no fix/next-step
- [ ] src/components/dashboard/CancelDialog.tsx:154 - confirm focus order — Tab lands destructive first?

#### src/components/dashboard/DepositDialog.tsx

- [ ] src/components/dashboard/DepositDialog.tsx:126 - "Processing..." → `…`
- [ ] src/components/dashboard/DepositDialog.tsx:100 - checkbox missing focus-visible
- [ ] src/components/dashboard/DepositDialog.tsx:80 - "Baazar charges" third-person; prefer second
- [ ] src/components/dashboard/DepositDialog.tsx:71 - "Deposit (5%)" needs nbsp + tabular-nums
- [ ] src/components/dashboard/DepositDialog.tsx:60 - missing `overscroll-behavior: contain`
- [ ] src/components/dashboard/DepositDialog.tsx:53 - error no aria-live
- [ ] src/components/dashboard/DepositDialog.tsx:69 - rounded box no aria-label/heading

#### src/components/dashboard/DisputeDialog.tsx

- [ ] src/components/dashboard/DisputeDialog.tsx:84 - "Filing..." → `…`
- [ ] src/components/dashboard/DisputeDialog.tsx:59 - "Report an issue" sentence case
- [ ] src/components/dashboard/DisputeDialog.tsx:68 - textarea missing `autoComplete="off"`/explicit spellCheck
- [ ] src/components/dashboard/DisputeDialog.tsx:76 - char counter no aria-live
- [ ] src/components/dashboard/DisputeDialog.tsx:29 - validation toast; inline + focus instead
- [ ] src/components/dashboard/DisputeDialog.tsx:55 - single-click filing (no confirmation/summary)
- [ ] src/components/dashboard/DisputeDialog.tsx:80 - "Cancel" generic
- [ ] src/components/dashboard/DisputeDialog.tsx:60 - description doesn't surface escalation timeline/emergency contact
- [ ] src/components/dashboard/DisputeDialog.tsx:57 - missing `overscroll-behavior: contain`
- [ ] src/components/dashboard/DisputeDialog.tsx:43 - error no next-step
- [ ] src/components/dashboard/DisputeDialog.tsx:48 - "3 business days" needs nbsp

#### src/components/dashboard/ReviewForm.tsx

- [ ] src/components/dashboard/ReviewForm.tsx:39 - stars no `role="radiogroup"` / arrow-key nav
- [ ] src/components/dashboard/ReviewForm.tsx:44 - aria-label lacks category context
- [ ] src/components/dashboard/ReviewForm.tsx:43 - `transition` shorthand
- [ ] src/components/dashboard/ReviewForm.tsx:39 - stars missing focus-visible:ring
- [ ] src/components/dashboard/ReviewForm.tsx:133 - "Submitting..." → `…`
- [ ] src/components/dashboard/ReviewForm.tsx:101 - vendor name not interpolated
- [ ] src/components/dashboard/ReviewForm.tsx:117 - textarea missing `autoComplete="off"`/explicit spellCheck
- [ ] src/components/dashboard/ReviewForm.tsx:121 - placeholder "?…" lacks example
- [ ] src/components/dashboard/ReviewForm.tsx:83 - `res.json()` not wrapped in catch — silent
- [ ] src/components/dashboard/ReviewForm.tsx:35 - preset 5★ biases ratings
- [ ] src/components/dashboard/ReviewForm.tsx:97 - missing `overscroll-behavior: contain`; no length warning on 4000-char comment
- [ ] src/components/dashboard/ReviewForm.tsx:39 - no prefers-reduced-motion on fill transition

#### src/components/dashboard/VendorNotesEditor.tsx

- [ ] src/components/dashboard/VendorNotesEditor.tsx:59 - Textarea no `<Label htmlFor>` / aria-label
- [ ] src/components/dashboard/VendorNotesEditor.tsx:66 - placeholder missing `…`
- [ ] src/components/dashboard/VendorNotesEditor.tsx:78 - status region missing aria-live
- [ ] src/components/dashboard/VendorNotesEditor.tsx:62 - onBlur always fires `save()` — duplicate calls
- [ ] src/components/dashboard/VendorNotesEditor.tsx:43 - no beforeunload during 'saving'
- [ ] src/components/dashboard/VendorNotesEditor.tsx:80 - "Saved · just now" never refreshes
- [ ] src/components/dashboard/VendorNotesEditor.tsx:29 - in-flight `save()` races; no abort/sequence guard
- [ ] src/components/dashboard/VendorNotesEditor.tsx:59 - no `autoComplete="off"`; spellCheck not explicit
- [ ] src/components/dashboard/VendorNotesEditor.tsx:61 - silently drops paste >5000 chars
- [ ] src/components/dashboard/VendorNotesEditor.tsx:73 - text-red-600/yellow-600 hardcoded; no dark mode
- [ ] src/components/dashboard/VendorNotesEditor.tsx:88 - "Couldn't save — retry" awkward split for AT
- [ ] src/components/dashboard/VendorNotesEditor.tsx:38 - error message discarded

### Calendar + availability

#### src/components/marketplace/AvailabilityCalendar.tsx

- [ ] src/components/marketplace/AvailabilityCalendar.tsx:37 - "Loading availability…" lacks aria-live/`role="status"`
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:37 - no skeleton; layout shift
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:33 - fetch error silent; no retry
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:43 - color-only encoding (haldi) for partial — fails colorblind
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:49 - selectedBusy panel no `role="status"`/aria-live
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:60 - "Limited availability:" doesn't name the date
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:62 - raw times without `Intl.DateTimeFormat`
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:18 - selection not in URL
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:53 - no "Today" jump; no month label announcement
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:41 - `toLocalDate(iso)` → SSR/CSR mismatch risk
- [ ] src/components/marketplace/AvailabilityCalendar.tsx:60 - hardcoded haldi color carries meaning

#### src/components/ui/date-picker.tsx

- [ ] src/components/ui/date-picker.tsx:23 - DEFAULT_DISABLED at module load; stale baseline overnight
- [ ] src/components/ui/date-picker.tsx:50 - `new Date(\`${selected}T00:00:00\`)` in render; hydration risk
- [ ] src/components/ui/date-picker.tsx:75 - `weekStartsOn={0}` hardcoded
- [ ] src/components/ui/date-picker.tsx:93 - day cell lacks `touch-action: manipulation`
- [ ] src/components/ui/date-picker.tsx:95 - `day_button` has hover but no focus-visible:ring
- [ ] src/components/ui/date-picker.tsx:96 - `today: ''` — today not visually distinguished
- [ ] src/components/ui/date-picker.tsx:98 - outside/disabled by opacity only
- [ ] src/components/ui/date-picker.tsx:25 - unavailable/partial legend never surfaced
- [ ] src/components/ui/date-picker.tsx:68 - DayPicker root no aria-label
- [ ] src/components/ui/date-picker.tsx:91 - `text-[9px]` weekday < readable minimum (1.4.4)
- [ ] src/components/ui/date-picker.tsx:94 - `text-[12px]` day cell small
- [ ] src/components/ui/date-picker.tsx - no tabular-nums on day cells

#### src/components/dashboard/BlockDateForm.tsx

- [ ] src/components/dashboard/BlockDateForm.tsx:42 - "Block a date" → Title Case
- [ ] src/components/dashboard/BlockDateForm.tsx:45 - native `type="date"` TZ inconsistency; no Intl preview
- [ ] src/components/dashboard/BlockDateForm.tsx:60 - no validation `end_time > start_time`
- [ ] src/components/dashboard/BlockDateForm.tsx:65,75 - time inputs no `inputMode="numeric"`
- [ ] src/components/dashboard/BlockDateForm.tsx:81 - error `<p>` no `role="alert"`/aria-live; not focused
- [ ] src/components/dashboard/BlockDateForm.tsx:82 - "Block this date" no confirm modal/undo
- [ ] src/components/dashboard/BlockDateForm.tsx:54 - Switch+Label single hit zone via htmlFor?
- [ ] src/components/dashboard/BlockDateForm.tsx:36 - no inline confirmation toast / aria-live
- [ ] src/components/dashboard/BlockDateForm.tsx:18 - no bulk-block flow (range/recurrence)
- [ ] src/components/dashboard/BlockDateForm.tsx:41 - form no aria-labelledby
- [ ] src/components/dashboard/BlockDateForm.tsx:54 - Switch resets on every mount
- [ ] src/components/dashboard/BlockDateForm.tsx:11 - date not URL-synced

#### src/components/dashboard/CalendarHoldsList.tsx

- [ ] src/components/dashboard/CalendarHoldsList.tsx:46 - large lists not virtualized
- [ ] src/components/dashboard/CalendarHoldsList.tsx:48 - raw ISO date rendered
- [ ] src/components/dashboard/CalendarHoldsList.tsx:24 - raw HH:mm without locale
- [ ] src/components/dashboard/CalendarHoldsList.tsx:20 - `parseRange` returns "?" — broken UI
- [ ] src/components/dashboard/CalendarHoldsList.tsx:60 - color-only status
- [ ] src/components/dashboard/CalendarHoldsList.tsx:66 - "Unblock" destructive, no confirm/undo
- [ ] src/components/dashboard/CalendarHoldsList.tsx:33 - fetch failures silent
- [ ] src/components/dashboard/CalendarHoldsList.tsx:35 - removed item no aria-live
- [ ] src/components/dashboard/CalendarHoldsList.tsx:53 - no `<time dateTime>`
- [ ] src/components/dashboard/CalendarHoldsList.tsx:39 - empty state no next-step CTA
- [ ] src/components/dashboard/CalendarHoldsList.tsx:44 - h2 inside list — host hierarchy risk
- [ ] src/components/dashboard/CalendarHoldsList.tsx:56 - no tabular-nums

#### src/components/dashboard/ConflictWarning.tsx

- [ ] src/components/dashboard/ConflictWarning.tsx:11 - missing `role="alert"`/`aria-live="assertive"`
- [ ] src/components/dashboard/ConflictWarning.tsx:14 - AlertTriangle missing aria-hidden
- [ ] src/components/dashboard/ConflictWarning.tsx:18 - numbers not via `Intl.NumberFormat`
- [ ] src/components/dashboard/ConflictWarning.tsx:16 - "Heads up —" casual for hard blocker
- [ ] src/components/dashboard/ConflictWarning.tsx:20 - only resolution "View calendar"; no decline/override
- [ ] src/components/dashboard/ConflictWarning.tsx:20 - "→" not aria-hidden
- [ ] src/components/dashboard/ConflictWarning.tsx:17 - `<p>` lacks text-pretty/balance

#### src/components/dashboard/CapacityField.tsx

- [ ] src/components/dashboard/CapacityField.tsx:39 - `<label>` no htmlFor; Input no id/aria-label — unlabeled
- [ ] src/components/dashboard/CapacityField.tsx:45 - `Number(e.target.value)` → NaN on empty
- [ ] src/components/dashboard/CapacityField.tsx:46 - max=50 silent; no inline error
- [ ] src/components/dashboard/CapacityField.tsx:48 - sentence fragmented for SR
- [ ] src/components/dashboard/CapacityField.tsx:50 - no saving state — multi-click possible
- [ ] src/components/dashboard/CapacityField.tsx:50 - no spinner / "Saving…"
- [ ] src/components/dashboard/CapacityField.tsx:54 - error `<p>` no `role="alert"`/aria-live
- [ ] src/components/dashboard/CapacityField.tsx:34 - "Default 1." → "Default: 1."
- [ ] src/components/dashboard/CapacityField.tsx:33 - Title Case "Concurrent Capacity"
- [ ] src/components/dashboard/CapacityField.tsx:50 - no success confirmation
- [ ] src/components/dashboard/CapacityField.tsx:40 - number input no `inputMode="numeric"`/`autocomplete="off"`

#### src/components/dashboard/calendar/ConnectCalendarModal.tsx

- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:37 - overlay missing `overscroll-behavior: contain`
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:38 - Dialog.Content no aria-describedby
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:43 - close uses raw "×" no aria-label; tiny target
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:94 - full secret feed URL — needs redaction + Reveal toggle
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:96 - "Copied ✓" no aria-live
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:31 - setTimeout not cleared; races on rapid clicks
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:99 - ✓ not aria-hidden
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:139 - "↗" not aria-hidden
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:132 - hover changes border opacity (subtle)
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:127 - `<a>` rows no focus-visible styling
- [ ] src/components/dashboard/calendar/ConnectCalendarModal.tsx:43 - close button missing `type="button"`

#### src/components/dashboard/calendar/DashboardCalendarNudge.tsx

- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:40 - 📅 not aria-hidden
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:42 - Title Case
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:49,58 - buttons missing `type="button"`
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:50 - no loading state while `ensureFeedUrl` runs
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:21 - no error handling on POST
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:31 - optimistic hide; no rollback on POST fail
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:66 - modal only opens when feedUrl truthy; intent POST fail = nothing happens
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:38 - no responsive stack on mobile
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:49 - "Connect" → "Connect Calendar"
- [ ] src/components/dashboard/calendar/DashboardCalendarNudge.tsx:13 - no aria-live on appearance

#### src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx

- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:134 - 📲 in heading not aria-hidden
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:113 - animate-pulse ignores prefers-reduced-motion
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:102 - state pill color-only; needs aria-live
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:180 - feed URL rendered with token (no redact/reveal)
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:183 - copy button no aria-label/no "Copied" feedback (inconsistent w/ modal)
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:191 - "Cancel — disconnect" destructive without confirm
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:224 - "Rotate URL" breaks subscriptions; needs explicit confirm
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:230 - "Disconnect" destructive, no confirm/undo
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:218 - "Copy feed URL" no copied-state aria-live
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:237 - text-indigo-900 + text-ink/60 cascade ambiguity
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:212 - stats no tabular-nums
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:20 - timeAgo hardcoded plurals → use `Intl.RelativeTimeFormat`; computes off `Date.now()` in render (hydration)
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:154 - "→" not aria-hidden
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:283 - FetchIntentAndOpen no error handling; eslint-disable
- [ ] src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx:40 - 10s polling never backs off

#### src/components/dashboard/calendar/PostFirstBookingPrompt.tsx

- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:56 - ✓ not aria-hidden
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:43 - dismiss in localStorage only — cross-device lost
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:25 - prompt flashes for one paint before dismiss
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:63,72 - buttons missing `type="button"`
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:64 - "Connect calendar" no loading state; double-click races
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:31 - ensureFeedUrl swallows errors silently
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:50 - banner appears without aria-live
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:53 - "flex-wrap" can land actions above text
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:55 - "Baazar" needs `translate="no"`
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:70 - Title Case
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:74 - "Dismiss" generic; "Not now"/"Hide"
- [ ] src/components/dashboard/calendar/PostFirstBookingPrompt.tsx:17 - unused bookingId param

### Dashboard chrome + notifications

#### src/app/dashboard/layout.tsx

- [ ] src/app/dashboard/layout.tsx:34 - missing skip-to-main-content link
- [ ] src/app/dashboard/layout.tsx:43 - hover-only state on hamburger; no focus-visible:ring replacement
- [ ] src/app/dashboard/layout.tsx:45 - hover bg change without explicit transition-colors
- [ ] src/app/dashboard/layout.tsx:61 - `<main>` lacks `id="main"` anchor for skip link

#### src/app/dashboard/loading.tsx

- [ ] src/app/dashboard/loading.tsx:4 - skeleton wrapper missing `role="status"` + `aria-live="polite"` + `aria-label="Loading…"`
- [ ] src/app/dashboard/loading.tsx:11 - decorative skeletons should be `aria-hidden="true"`

#### src/app/dashboard/error.tsx

- [ ] src/app/dashboard/error.tsx:13 - error container missing `role="alert"`/`aria-live="assertive"`
- [ ] src/app/dashboard/error.tsx:14 - starts at `<h2>` with no `<h1>` above (hierarchy)
- [ ] src/app/dashboard/error.tsx:15 - lacks fix/next step
- [ ] src/app/dashboard/error.tsx:18 - "Try Again" → "Reload Dashboard"

#### src/app/dashboard/page.tsx

- [ ] src/app/dashboard/page.tsx:59 - hardcoded 'en-US' locale in `toLocaleDateString` → `Intl.DateTimeFormat` with `navigator.languages`
- [ ] src/app/dashboard/page.tsx:54 - hardcoded date math; not locale-aware; potential hydration mismatch
- [ ] src/app/dashboard/page.tsx:132,206 - h1 missing text-wrap: balance/text-pretty
- [ ] src/app/dashboard/page.tsx:138 - "Browse vendors →" ASCII arrow + lowercase ("Browse Vendors")
- [ ] src/app/dashboard/page.tsx:213 - "Add a package to go live" → Title Case
- [ ] src/app/dashboard/page.tsx:222 - "+ Add Package" link reads as button; lacks aria-label clarifying destination

#### src/app/dashboard/analytics/page.tsx

- [ ] src/app/dashboard/analytics/page.tsx:5 - "coming soon." → "coming soon…"
- [ ] src/app/dashboard/analytics/page.tsx:5 - no specific next step or ETA
- [ ] src/app/dashboard/analytics/page.tsx:4 - h1 missing text-pretty

#### src/app/dashboard/bookings/page.tsx

- [ ] src/app/dashboard/bookings/page.tsx:48 - h1 missing text-pretty
- [ ] src/app/dashboard/bookings/page.tsx:55 - empty-state CTA missing (only prose, no `<Link>` to /vendors)
- [ ] src/app/dashboard/bookings/page.tsx:61 - bookings.map() unbounded — virtualize once >50
- [ ] src/app/dashboard/bookings/page.tsx:131 - "All bookings, filterable." vague — active voice + specifics
- [ ] src/app/dashboard/bookings/page.tsx:138 - "Quick actions" → Title Case
- [ ] src/app/dashboard/bookings/page.tsx:139 - verify VendorBookingActions guards decline/cancel with confirm modal
- [ ] src/app/dashboard/bookings/page.tsx:41 - couple branch has no URL state for filtering/tabs

#### src/app/dashboard/bookings/[id]/page.tsx

- [ ] src/app/dashboard/bookings/[id]/page.tsx:64 - empty catch swallows errors silently
- [ ] src/app/dashboard/bookings/[id]/page.tsx:18 - sp['welcome'] === 'true' accepts only literal "true"

#### src/app/dashboard/@panel/(.)bookings/[id]/page.tsx

- [ ] src/app/dashboard/@panel/(.)bookings/[id]/page.tsx:18 - verify PanelShell modal/drawer has `overscroll-behavior: contain`, focus trap, Escape-to-close, inert on background

#### src/app/dashboard/money/page.tsx

- [ ] src/app/dashboard/money/page.tsx:29 - h1 missing text-pretty
- [ ] src/app/dashboard/money/page.tsx:30 - description doesn't communicate that vendor handles 95% off-platform

#### src/app/dashboard/notifications/page.tsx

- [ ] src/app/dashboard/notifications/page.tsx:24 - h1 missing text-pretty
- [ ] src/app/dashboard/notifications/page.tsx:24 - no count badge/live region on page header
- [ ] src/app/dashboard/notifications/page.tsx:20 - 150-row initial fetch — verify list inside client virtualizes

#### src/app/dashboard/saved/page.tsx

- [ ] src/app/dashboard/saved/page.tsx:19 - empty-state `<h2>` with no `<h1>` — hierarchy broken
- [ ] src/app/dashboard/saved/page.tsx:26 - `<Link>` styled as button missing focus-visible:ring + transition-colors
- [ ] src/app/dashboard/saved/page.tsx:26 - hover bg-ink→bg-hot-pink — verify WCAG AA contrast on cream text
- [ ] src/app/dashboard/saved/page.tsx:30 - "Browse vendors" → Title Case
- [ ] src/app/dashboard/saved/page.tsx:38 - "Your saved vendors" → Title Case + text-pretty
- [ ] src/app/dashboard/saved/page.tsx:23 - "Heart vendors to remember them." jargon-y; no aria-label clarifying the save mechanism
- [ ] src/app/dashboard/saved/page.tsx:39 - VendorGrid may need virtualization once saved >50

#### src/components/dashboard/SidebarNav.tsx

- [ ] src/components/dashboard/SidebarNav.tsx:30 - `<nav>` no aria-label
- [ ] src/components/dashboard/SidebarNav.tsx:31 - links no `aria-current="page"`
- [ ] src/components/dashboard/SidebarNav.tsx:25 - transition shorthand → transition-colors
- [ ] src/components/dashboard/SidebarNav.tsx:32-57 - lucide icons missing aria-hidden
- [ ] src/components/dashboard/SidebarNav.tsx:26 - no focus-visible:ring
- [ ] src/components/dashboard/SidebarNav.tsx:26 - active vs inactive hover bg identical → weak contrast
- [ ] src/components/dashboard/SidebarNav.tsx - no mobile collapse strategy

#### src/components/dashboard/PanelShell.tsx

- [ ] src/components/dashboard/PanelShell.tsx:36 - backdrop div onClick → `<button aria-label>` or proper role + key handler
- [ ] src/components/dashboard/PanelShell.tsx:40 - missing aria-labelledby pointing to `<h2>`
- [ ] src/components/dashboard/PanelShell.tsx - no focus trap
- [ ] src/components/dashboard/PanelShell.tsx - no focus restoration to opener
- [ ] src/components/dashboard/PanelShell.tsx:55 - scroll container missing `overscroll-behavior: contain`
- [ ] src/components/dashboard/PanelShell.tsx - body scroll not locked
- [ ] src/components/dashboard/PanelShell.tsx - `role="dialog"` + `aria-modal="true"` without trap/lock/restore — pick one paradigm
- [ ] src/components/dashboard/PanelShell.tsx:18 - `router.replace` during render-cycle effect causes flash before redirect
- [ ] src/components/dashboard/PanelShell.tsx:47 - close button no focus-visible + no touch-action

#### src/components/dashboard/EventCard.tsx

- [ ] src/components/dashboard/EventCard.tsx:66 - `<div role="button">` with click — use `<button>`; missing keyDown Space/Enter
- [ ] src/components/dashboard/EventCard.tsx:72 - flipped state no aria-expanded/aria-pressed
- [ ] src/components/dashboard/EventCard.tsx:73 - back side rendered (not inert/aria-hidden); SR reads both sides
- [ ] src/components/dashboard/EventCard.tsx:30 - hardcoded 'en-US'
- [ ] src/components/dashboard/EventCard.tsx:31 - `+ 'T12:00:00Z'` hydration risk
- [ ] src/components/dashboard/EventCard.tsx:41 - – no nbsp around dash
- [ ] src/components/dashboard/EventCard.tsx:44 - status color-only
- [ ] src/components/dashboard/EventCard.tsx:77 - `<img>` missing width/height + `loading="lazy"`
- [ ] src/components/dashboard/EventCard.tsx:94 - inline style instead of CSS module
- [ ] src/components/dashboard/EventCard.tsx:101 - inner Link inside outer `role="button"` (invalid nesting)
- [ ] src/components/dashboard/EventCard.tsx - no prefers-reduced-motion for 3D flip
- [ ] src/components/dashboard/EventCard.tsx:67 - flip on container click — touch tap misfires; no `touch-action: manipulation`

#### src/components/dashboard/EventCardFilters.tsx

- [ ] src/components/dashboard/EventCardFilters.tsx:25 - tab buttons missing `role="tab"`/aria-selected
- [ ] src/components/dashboard/EventCardFilters.tsx:14 - filter state not URL-synced
- [ ] src/components/dashboard/EventCardFilters.tsx:25 - pills no focus-visible:ring
- [ ] src/components/dashboard/EventCardFilters.tsx:41 - "Category:" label not associated with Select
- [ ] src/components/dashboard/EventCardFilters.tsx:42 - SelectValue no placeholder
- [ ] src/components/dashboard/EventCardFilters.tsx:29 - inactive pill no hover state

#### src/components/dashboard/EventCardGrid.tsx

- [ ] src/components/dashboard/EventCardGrid.tsx:14 - filters not URL-synced
- [ ] src/components/dashboard/EventCardGrid.tsx:33 - "No upcoming events yet" stale when `timeFilter==='past'`
- [ ] src/components/dashboard/EventCardGrid.tsx:57 - flex flex-wrap unstable — use grid
- [ ] src/components/dashboard/EventCardGrid.tsx:53 - no "Clear filters" CTA on empty
- [ ] src/components/dashboard/EventCardGrid.tsx:58 - no virtualization

#### src/components/dashboard/EarningsCard.tsx

- [ ] src/components/dashboard/EarningsCard.tsx:25 - hardcoded 'en-US' + 'USD'
- [ ] src/components/dashboard/EarningsCard.tsx:85,89,93 - no tabular-nums
- [ ] src/components/dashboard/EarningsCard.tsx:67 - segmented range no aria-pressed/aria-current
- [ ] src/components/dashboard/EarningsCard.tsx:68 - no focus-visible:ring
- [ ] src/components/dashboard/EarningsCard.tsx:67 - active range no loading state on click
- [ ] src/components/dashboard/EarningsCard.tsx:46 - "Loading…" full-block on every range change — flashy
- [ ] src/components/dashboard/EarningsCard.tsx:34 - range not URL-synced
- [ ] src/components/dashboard/EarningsCard.tsx:105 - "$1" mixes hardcoded currency
- [ ] src/components/dashboard/EarningsCard.tsx:53 - straight quotes vs curly elsewhere
- [ ] src/components/dashboard/EarningsCard.tsx:101 - "ROI multiple of 5x" — aria-label for SR

#### src/components/dashboard/BookingsArchive.tsx

- [ ] src/components/dashboard/BookingsArchive.tsx:82 - `<Input placeholder="Search customer name…">` no label/aria-label
- [ ] src/components/dashboard/BookingsArchive.tsx:83 - no `type="search"`/`inputMode="search"`/`autoComplete="off"`/`spellCheck=false`
- [ ] src/components/dashboard/BookingsArchive.tsx:43,51 - q not URL-synced
- [ ] src/components/dashboard/BookingsArchive.tsx:90 - tab buttons no `role="tab"`/aria-selected/aria-current
- [ ] src/components/dashboard/BookingsArchive.tsx:96 - transition shorthand
- [ ] src/components/dashboard/BookingsArchive.tsx:95 - `disabled={isPending}` disables ALL tabs during transition
- [ ] src/components/dashboard/BookingsArchive.tsx:103 - badge counts no tabular-nums
- [ ] src/components/dashboard/BookingsArchive.tsx:108 - empty-state CTA copy doesn't match cause (q vs no-bookings)
- [ ] src/components/dashboard/BookingsArchive.tsx:60 - loadMore no loading/disabled state
- [ ] src/components/dashboard/BookingsArchive.tsx:62 - URL builds with no encoding (activeTab raw)
- [ ] src/components/dashboard/BookingsArchive.tsx - >50 not virtualized

#### src/components/dashboard/BackfillBanner.tsx

- [ ] src/components/dashboard/BackfillBanner.tsx:31 - missing `role="status"`/aria-live
- [ ] src/components/dashboard/BackfillBanner.tsx:35,57 - icons no aria-hidden
- [ ] src/components/dashboard/BackfillBanner.tsx:47 - CTA/dismiss no focus-visible
- [ ] src/components/dashboard/BackfillBanner.tsx:22 - optimistic dismiss + POST fail → reappears next load
- [ ] src/components/dashboard/BackfillBanner.tsx:54 - "Dismiss" generic; "Dismiss profile completion banner"

#### src/components/dashboard/CrossBusinessActionToast.tsx

- [ ] src/components/dashboard/CrossBusinessActionToast.tsx:46 - "Switch" generic; "Switch to {name}"
- [ ] src/components/dashboard/CrossBusinessActionToast.tsx:49 - 8000ms unconditional; respect prefers-reduced-motion for slide-in
- [ ] src/components/dashboard/CrossBusinessActionToast.tsx:52 - Switch awaits fetch silently; no failure feedback
- [ ] src/components/dashboard/CrossBusinessActionToast.tsx - rely on global `<Toaster>` safe-area + aria-live; verify

#### src/components/dashboard/CustomerWelcomeBanner.tsx

- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:30 - missing `role="region"` aria-labelledby / aria-live
- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:35 - daysUntilEvent plural-naive ("1 days away") — use `RelativeTimeFormat`
- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:35 - "—" no nbsp
- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:42 - chips no focus-visible / no aria-label
- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:53 - `<X>` no aria-hidden; dismiss no focus-visible
- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:22 - dismiss state flashes
- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:27 - `return <></>` → `return null`
- [ ] src/components/dashboard/CustomerWelcomeBanner.tsx:35 - "that's" straight apostrophe

#### src/components/notifications/NotificationBell.tsx

- [ ] src/components/notifications/NotificationBell.tsx:96 - button no focus-visible:ring
- [ ] src/components/notifications/NotificationBell.tsx:96 - missing aria-expanded/aria-haspopup/aria-controls
- [ ] src/components/notifications/NotificationBell.tsx:102 - `<Bell>` no aria-hidden
- [ ] src/components/notifications/NotificationBell.tsx:104 - badge color-only; no tabular-nums; text-[10px] small
- [ ] src/components/notifications/NotificationBell.tsx:99 - no active/pressed feedback
- [ ] src/components/notifications/NotificationBell.tsx:53 - realtime toast spam; no coalesce
- [ ] src/components/notifications/NotificationBell.tsx:63 - `window.location.href` full reload — use `router.push`
- [ ] src/components/notifications/NotificationBell.tsx - no escape-to-close in bell itself

#### src/components/notifications/NotificationCard.tsx

- [ ] src/components/notifications/NotificationCard.tsx:9 - emoji as type indicator (color/icon-only encoding)
- [ ] src/components/notifications/NotificationCard.tsx:26 - custom timeAgo instead of `Intl.RelativeTimeFormat`
- [ ] src/components/notifications/NotificationCard.tsx:91 - `aria-label="unread"` on `<span>` ignored without role
- [ ] src/components/notifications/NotificationCard.tsx:56 - read/unread color + font-weight + dot (dot color-only)
- [ ] src/components/notifications/NotificationCard.tsx:71 - inner action Links inside outer Link/button (invalid nesting)
- [ ] src/components/notifications/NotificationCard.tsx:97 - outer wrapper alternates Link/button; click triggers both
- [ ] src/components/notifications/NotificationCard.tsx:35 - mixed locale i18n
- [ ] src/components/notifications/NotificationCard.tsx:58 - failure indicator ⚠ + title only (title not keyboard-accessible)
- [ ] src/components/notifications/NotificationCard.tsx:100 - bg-blue-50/50 doesn't match cream theme
- [ ] src/components/notifications/NotificationCard.tsx:79 - destructive variant low affordance

#### src/components/notifications/NotificationDropdown.tsx

- [ ] src/components/notifications/NotificationDropdown.tsx:48 - `role="dialog"` no Escape handler (only click-outside closes)
- [ ] src/components/notifications/NotificationDropdown.tsx:67 - max-h-96 overflow-y-auto missing `overscroll-behavior: contain`
- [ ] src/components/notifications/NotificationDropdown.tsx:26 - click-outside mousedown only
- [ ] src/components/notifications/NotificationDropdown.tsx:57 - "Mark all read" no focus-visible; → Title Case
- [ ] src/components/notifications/NotificationDropdown.tsx:73 - slice(0,10) silent
- [ ] src/components/notifications/NotificationDropdown.tsx:69 - empty state no illustration/recovery
- [ ] src/components/notifications/NotificationDropdown.tsx - no keyboard focus management when opened

#### src/components/notifications/NotificationsPageClient.tsx

- [ ] src/components/notifications/NotificationsPageClient.tsx:55 - tab not URL-synced
- [ ] src/components/notifications/NotificationsPageClient.tsx:56 - collapsed groups not URL-synced
- [ ] src/components/notifications/NotificationsPageClient.tsx:95 - tabs no `role="tab"`/aria-selected
- [ ] src/components/notifications/NotificationsPageClient.tsx:100 - no focus-visible:ring
- [ ] src/components/notifications/NotificationsPageClient.tsx:131 - "30 days" needs nbsp
- [ ] src/components/notifications/NotificationsPageClient.tsx:108 - count badge no tabular-nums / aria-label
- [ ] src/components/notifications/NotificationsPageClient.tsx:140 - collapse buttons no aria-expanded/aria-controls
- [ ] src/components/notifications/NotificationsPageClient.tsx:137 - "Booking {uuid-prefix}…" shows raw UUID
- [ ] src/components/notifications/NotificationsPageClient.tsx:113 - "Mark all read" no confirm/undo
- [ ] src/components/notifications/NotificationsPageClient.tsx - no virtualization

#### src/components/ui/Navbar.tsx

- [ ] src/components/ui/Navbar.tsx:95 - brand link no `aria-label="Baazar — Home"` + `translate="no"`
- [ ] src/components/ui/Navbar.tsx:102 - `<nav>` no aria-label
- [ ] src/components/ui/Navbar.tsx:107 - active link color-only; no `aria-current="page"`
- [ ] src/components/ui/Navbar.tsx:112 - `duration-[180ms]` no prefers-reduced-motion
- [ ] src/components/ui/Navbar.tsx:127 - user button truncates email but no full-email aria-label
- [ ] src/components/ui/Navbar.tsx:161 - mobile menu trigger no `aria-label="Open menu"/"Close menu"`
- [ ] src/components/ui/Navbar.tsx:164 - Menu/X icons no aria-hidden
- [ ] src/components/ui/Navbar.tsx:168 - mobile underline animation on hover even on touch
- [ ] src/components/ui/Navbar.tsx:88 - `window.location.href='/'` → use `router.push` + refresh
- [ ] src/components/ui/Navbar.tsx:38 - `getUser()` effect no abort guard
- [ ] src/components/ui/Navbar.tsx:60 - re-fetch on every pathname change adds latency
- [ ] src/components/ui/Navbar.tsx:182 - mobile "Dashboard" no aria-current

### Animation + drawer + footer

#### src/components/ui/StaggeredMenu.jsx

- [ ] src/components/ui/StaggeredMenu.jsx:16 - default logoUrl '/src/assets/...' won't resolve in production
- [ ] src/components/ui/StaggeredMenu.jsx:48 - GSAP animations missing prefers-reduced-motion guard
- [ ] src/components/ui/StaggeredMenu.jsx:191 - busyRef blocks toggle mid-animation (not interruptible)
- [ ] src/components/ui/StaggeredMenu.jsx:337 - no Escape key handler
- [ ] src/components/ui/StaggeredMenu.jsx:414 - panel no focus trap
- [ ] src/components/ui/StaggeredMenu.jsx:325 - on close, no focus restore
- [ ] src/components/ui/StaggeredMenu.jsx:309 - no body scroll lock
- [ ] src/components/ui/StaggeredMenu.jsx:309 - route change doesn't close menu
- [ ] src/components/ui/StaggeredMenu.jsx:351 - click-away only mousedown
- [ ] src/components/ui/StaggeredMenu.jsx:414 - aria-hidden when closed but children still tabbable → add inert
- [ ] src/components/ui/StaggeredMenu.jsx:420 - panel links no `role="menuitem"`; parent `ul role="list"` won't announce as menu
- [ ] src/components/ui/StaggeredMenu.jsx:439 - external social links missing "opens in new tab" cue + `translate="no"` on brand wordmarks
- [ ] src/components/ui/StaggeredMenu.jsx:376 - aria-label on non-interactive div ignored
- [ ] src/components/ui/StaggeredMenu.jsx:380 - logo `alt="Logo"` non-descriptive
- [ ] src/components/ui/StaggeredMenu.jsx:426 - empty-state placeholder aria-hidden

#### src/components/celebration/HeartConfetti.tsx

- [ ] src/components/celebration/HeartConfetti.tsx:18 - no prefers-reduced-motion short-circuit
- [ ] src/components/celebration/HeartConfetti.tsx:36 - container missing `aria-hidden="true"`
- [ ] src/components/celebration/HeartConfetti.tsx:55 - inline `<style>` per instance — GC inefficient
- [ ] src/components/celebration/HeartConfetti.tsx:91 - ❤️ emoji not aria-hidden; curly apostrophe elsewhere
- [ ] src/components/celebration/HeartConfetti.tsx:96 - `window.location.href` instead of `router.push`
- [ ] src/components/celebration/HeartConfetti.tsx:21 - onComplete in deps with parent inline callback would re-arm timeout

#### src/components/celebration/FirstBookingCelebration.tsx

- [ ] src/components/celebration/FirstBookingCelebration.tsx:39 - 🎉 inside `<h2>` needs aria-hidden wrapper
- [ ] src/components/celebration/FirstBookingCelebration.tsx:41 - eventDate raw string; format via Intl
- [ ] src/components/celebration/FirstBookingCelebration.tsx:46 - "{n} hours" no nbsp
- [ ] src/components/celebration/FirstBookingCelebration.tsx:50 - "You'll" → curly `'`
- [ ] src/components/celebration/FirstBookingCelebration.tsx:60 - `hover:-translate-y-px` no transition-transform — jumps
- [ ] src/components/celebration/FirstBookingCelebration.tsx:62 - "Got it →" generic
- [ ] src/components/celebration/FirstBookingCelebration.tsx:31 - `new URL(window.location.href)` missing SSR guard

#### src/components/ui/SpotlightCard.tsx

- [ ] src/components/ui/SpotlightCard.tsx:19 - mouse-tracking no prefers-reduced-motion guard
- [ ] src/components/ui/SpotlightCard.tsx:22 - `getBoundingClientRect` per mousemove (layout read every frame)
- [ ] src/components/ui/SpotlightCard.tsx:19 - touch devices no fallback
- [ ] src/components/ui/SpotlightCard.tsx:31 - hover-only visuals; no focus equivalent

#### src/components/Silk.tsx

- [ ] src/components/Silk.tsx:146 - `frameloop="always"` runs continuously; no IntersectionObserver pause
- [ ] src/components/Silk.tsx:130 - no prefers-reduced-motion fallback
- [ ] src/components/Silk.tsx:146 - dpr=[1,2] runs shader at 2x — clamp for low-end GPUs
- [ ] src/components/Silk.tsx:130 - no WebGL fallback when GL context fails
- [ ] src/components/Silk.tsx:109 - uTime accumulates indefinitely (precision drift)
- [ ] src/components/Silk.tsx:146 - Canvas no aria-hidden
- [ ] src/components/Silk.tsx:130 - no prefers-reduced-data

#### src/components/ui/PhotoUploaderDrawer.tsx

- [ ] src/components/ui/PhotoUploaderDrawer.tsx:81 - button doubles as drop-zone; click after drop may trigger file picker
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:67 - upload error `console.error` only; no user-facing error/retry/aria-live
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:59 - isUploading no per-file progress with aria-live
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:70 - no client-side size validation against maxSizeMb
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:108 - "max {n} MB" no nbsp
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:105 - "Drop photos here"/"or click to browse" no Title Case
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:97 - disabled removes focus ring
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:237 - thumb `<img>` missing width/height (CLS)
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:231 - closed strip no `touch-action: pan-x` / scroll snap
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:101 - Upload icon needs aria-hidden
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:111 - input `type="file"` no name; `className="hidden"` (use sr-only)
- [ ] src/components/ui/PhotoUploaderDrawer.tsx:139 - remove no undo

#### src/components/ui/PhotoThumbnailGrid.tsx

- [ ] src/components/ui/PhotoThumbnailGrid.tsx:57 - `<img>` missing width/height
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:57 - `alt=""` for user photos; should be "Photo {n+1}"
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:63 - reorder/primary/remove opacity-0 group-hover → invisible to keyboard (add focus-visible:opacity-100)
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:67 - `aria-label="Reorder"` needs position context
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:77,87 - Star/X icons need aria-hidden
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:42 - during drag no `user-select: none` / inert
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:85 - remove immediate; no undo/confirm
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:116 - returns null on empty — weak empty state
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:45 - verify dnd-kit transition isn't `transition: all`
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:121 - grid-cols-3 regardless of viewport — tiny thumbs on phone
- [ ] src/components/ui/PhotoThumbnailGrid.tsx:103 - no SR announcement of reorder (aria-live for dnd-kit screenReaderInstructions)

#### src/components/ui/family-drawer/FamilyDrawerRoot.tsx — ✓ pass (vaul handles trap/escape/scroll-lock)

#### src/components/ui/family-drawer/FamilyDrawerTrigger.tsx — ✓ pass

#### src/components/ui/family-drawer/FamilyDrawerContent.tsx

- [ ] src/components/ui/family-drawer/FamilyDrawerContent.tsx:6 - outline-none without focus-visible replacement
- [ ] src/components/ui/family-drawer/FamilyDrawerContent.tsx:6 - missing `overscroll-behavior: contain`
- [ ] src/components/ui/family-drawer/FamilyDrawerContent.tsx:6 - missing `padding-bottom: env(safe-area-inset-bottom)`
- [ ] src/components/ui/family-drawer/FamilyDrawerContent.tsx:7 - drag handle no aria-hidden, no cursor-grab
- [ ] src/components/ui/family-drawer/FamilyDrawerContent.tsx:6 - no aria-label/aria-labelledby

#### src/components/ui/family-drawer/FamilyDrawerOverlay.tsx

- [ ] src/components/ui/family-drawer/FamilyDrawerOverlay.tsx:5 - no fade animation
- [ ] src/components/ui/family-drawer/FamilyDrawerOverlay.tsx:5 - missing aria-hidden (verify vaul applies)

#### src/components/ui/family-drawer/FamilyDrawerAnimatedContent.tsx

- [ ] src/components/ui/family-drawer/FamilyDrawerAnimatedContent.tsx:5 - AnimatePresence without prefers-reduced-motion guard
- [ ] src/components/ui/family-drawer/FamilyDrawerAnimatedContent.tsx:5 - `mode="popLayout"` — ensure FamilyDrawerContent has fixed min-height

#### src/components/layout/footer/NewsletterForm.tsx

- [ ] src/components/layout/footer/NewsletterForm.tsx:33 - "Doesn't" straight apostrophe
- [ ] src/components/layout/footer/NewsletterForm.tsx:71 - email missing `spellCheck={false}` + `inputMode="email"`
- [ ] src/components/layout/footer/NewsletterForm.tsx:71 - missing `name="email"`
- [ ] src/components/layout/footer/NewsletterForm.tsx:75 - placeholder no `…`
- [ ] src/components/layout/footer/NewsletterForm.tsx:33 - on validation error, focus not moved to email input
- [ ] src/components/layout/footer/NewsletterForm.tsx:96 - "Bazaar" brand needs `translate="no"`
- [ ] src/components/layout/footer/NewsletterForm.tsx:112 - error region positioned absolute → can overlap footer on narrow widths

#### src/components/layout/footer/WordmarkCycle.tsx

- [ ] src/components/layout/footer/WordmarkCycle.tsx:28 - intentionally ignores prefers-reduced-motion (rule violation)
- [ ] src/components/layout/footer/WordmarkCycle.tsx:88 - `<h2>` may break hierarchy
- [ ] src/components/layout/footer/WordmarkCycle.tsx:90 - `aria-label="Baazar"` needs `translate="no"` on `<h2>`
- [ ] src/components/layout/footer/WordmarkCycle.tsx:50 - setInterval drifts under tab throttling
- [ ] src/components/layout/footer/WordmarkCycle.tsx:67 - resets opacity to 1 mid-fade → jarring snap
- [ ] src/components/layout/footer/WordmarkCycle.tsx:108 - "." after script glyph should be aria-hidden
- [ ] src/components/layout/footer/WordmarkCycle.tsx:104 - inline fontFamily swap can FOIT; preload all four families

### Claim + dev previews

#### src/app/claim/[token]/page.tsx

- [ ] src/app/claim/[token]/page.tsx:16 - "Sign in instead." references action but no actual link to /login
- [ ] src/app/claim/[token]/page.tsx:42 - empty/error state: no retry / sign-in / contact-support CTA
- [ ] src/app/claim/[token]/page.tsx:42 - full-bleed `<main>` dead-end has no return-home link

#### src/app/dev/email-previews/couple-countered/page.tsx

- [ ] src/app/dev/email-previews/couple-countered/page.tsx:20 - heading is `<h2>` with no `<h1>`
- [ ] src/app/dev/email-previews/couple-countered/page.tsx:23 - iframe lacks explicit width/height (CLS)
- [ ] src/app/dev/email-previews/couple-countered/page.tsx:8 - straight apostrophes in sample copy (dev tool — email body, informational)

#### src/app/dev/email-previews/custom-request/page.tsx

- [ ] src/app/dev/email-previews/custom-request/page.tsx:23 - heading is `<h2>` with no `<h1>`
- [ ] src/app/dev/email-previews/custom-request/page.tsx:9 - hardcoded eventDate '2026-09-20' — `Intl.DateTimeFormat` in renderer (dev tool — email body)
- [ ] src/app/dev/email-previews/custom-request/page.tsx:27 - iframe lacks width/height attrs

#### src/app/dev/email-previews/event-completed/page.tsx

- [ ] src/app/dev/email-previews/event-completed/page.tsx:23 - two `<h2>` with no `<h1>`
- [ ] src/app/dev/email-previews/event-completed/page.tsx:21 - side-by-side flex children lack min-w-0
- [ ] src/app/dev/email-previews/event-completed/page.tsx:26 - iframes lack explicit width/height

#### src/app/dev/email-previews/review-received/page.tsx

- [ ] src/app/dev/email-previews/review-received/page.tsx:19 - heading is `<h2>` with no `<h1>`
- [ ] src/app/dev/email-previews/review-received/page.tsx:22 - iframe lacks explicit width/height

#### src/app/dev/staggered-menu/page.tsx

- [ ] src/app/dev/staggered-menu/page.tsx:57 - "Sardar's" straight apostrophe → `'`
- [ ] src/app/dev/staggered-menu/page.tsx:58,70 - decorative ChevronDown / Bell icons missing `aria-hidden="true"`
- [ ] src/app/dev/staggered-menu/page.tsx:91 - fixed top-4 bar lacks `env(safe-area-inset-top)` (notch overlap)
- [ ] src/app/dev/staggered-menu/page.tsx:94 - tab toggles lack focus-visible:ring
- [ ] src/app/dev/staggered-menu/page.tsx:97 - demo state in useState only; tab state should sync to URL (`?as=anon|couple|vendor`)
- [ ] src/app/dev/staggered-menu/page.tsx:114 - straight "Menu" → curly "Menu"
- [ ] src/app/dev/staggered-menu/page.tsx:21,32 - "Sign Out" modeled as `<a href="#sign-out">`; should be `<button>` (action, not nav)
- [ ] src/app/dev/staggered-menu/page.tsx:52,66 - hover state without focus-visible:ring on switcher pill + bell
- [ ] src/app/dev/staggered-menu/page.tsx:43,111 - "baazar" wordmark — `translate="no"`
- [ ] src/app/dev/staggered-menu/page.tsx:89 - verify StaggeredMenu component honors prefers-reduced-motion

---

## Caveats / skipped scope

- **Shadcn UI primitives skipped**: `form.tsx`, `label.tsx`, `select.tsx`, `switch.tsx`, `tabs.tsx`, `toast.tsx`, `toaster.tsx`, `sonner.tsx`, `tooltip.tsx`, `avatar.tsx`, `separator.tsx`, `dropdown-menu.tsx`, `dialog.tsx`, `sheet.tsx`. These are mostly Radix wrappers; can be passed over in a follow-up.
- **Hooks-only files skipped**: `use-search-state.ts`, `use-filter-state.ts`, `useFamilyDrawer.ts`, `SavedVendorsProvider.tsx` (state provider).
- **Sub-shadcn subcomponents skipped**: `FamilyDrawerClose.tsx`, `FamilyDrawerPortal.tsx`, `FamilyDrawerViewContent.tsx`, `FamilyDrawerAnimatedWrapper.tsx` — all tiny wrappers.
- Several findings call out **verification points** inside child Radix components (e.g. `Select.name` propagation to FormData, `vaul` Drawer.Overlay defaults). Worth a follow-up Radix-behavior pass.
- **`src/app/signout/page.tsx` doesn't exist in main `src/app/`** — only in the `.claude/worktrees/staggered-menu-chrome/` worktree.
- **`.claude/worktrees/staggered-menu-chrome/`** was skipped as a duplicate of `src/`.
- All findings include `file:line` so they should be VS Code / Cursor jump-friendly.
- Total subagent tokens spent producing this audit: ~520k.
