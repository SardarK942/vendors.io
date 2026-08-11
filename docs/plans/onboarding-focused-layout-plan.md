# Plan — Focused Onboarding Layout + Live Preview (P1)

Status: **planned, not started.** Scope: layout + live preview only. Not a visual redesign;
palette/type/chips unchanged. Derived from the onboarding UX critique (score 29/40 → "targeted
fixes, not a redesign").

## Goal

Replace the current double-navigation onboarding shell (global dashboard sidebar + wizard rail +
`max-w-2xl` form + ~40–50% dead canvas) with a **focused shell** (wizard nav only) whose empty
right half holds a **live listing preview** that fills in as the vendor completes each step.

## Confirmed decisions

- **D1** Preview = the compact marketplace `VendorCard` (full profile stays behind the existing
  "View as customer" dialog).
- **D2** Preview refreshes **on step-advance** (v1), reading the last-saved `vendor_profiles` row.
  Live-per-keystroke is an explicit fast-follow, not v1.
- **D3** The global dashboard sidebar is **suppressed** during onboarding — wizard rail becomes the
  only nav.
- **D4** Mobile: side preview hidden, replaced by a "Preview listing" toggle; sticky mobile header
  carries progress + Back + Save & exit (folds in the separate P2 mobile-wayfinding fix).

## Phases

### Phase 0 — Extract the preview (reuse, don't rebuild)

- New `src/components/onboarding/OnboardingPreview.tsx`: lift the `previewVendor` builder + the
  `<VendorCard vendor={...} />` currently inside `StepReview.tsx` (lines ~74, ~237). Input: the
  `vendor_profiles` row. Renders the sticky preview card + a skeleton/placeholder when fields are
  empty.
- `StepReview.tsx` then consumes the same component (no behavior change on Review).
- Acceptance: Review step looks identical; preview builder lives in one place.

### Phase 1 — Suppress the global sidebar for setup (kill the double-nav)

- Approach (recommended, lowest blast radius): `DashboardLayout` (`src/app/dashboard/layout.tsx`)
  reads a middleware-injected header (mirror the existing `x-wizard-mode` pattern in
  `updateSession`) and, for `/dashboard/profile/setup/*`, skips rendering `<SidebarNav>` and the
  `max-w-7xl` inset chrome.
- Alternative considered: move setup out of `/dashboard` into an `(onboarding)` segment with its own
  layout — cleaner separation but changes URLs and touches every link/redirect
  (`OnboardingGate`, `WizardStepper` hrefs, `signup/success`, `profile/setup/*` redirects). Deferred;
  not worth the blast radius for v1.
- Acceptance: no global workspace sidebar on any setup step; only one active-state system.

### Phase 2 — Rewrite `SetupLayout` as the focused shell

- `src/app/dashboard/profile/setup/layout.tsx`: three zones —
  - left rail: logo + `WizardStepper` + "Save & exit" + one-line "we save as you go" reassurance;
  - center: `{children}` (the step form, unchanged);
  - right: `<OnboardingPreview profile={profile} />`, sticky, fills the canvas.
- Acceptance: desktop shows form + live preview side by side; thin steps (Location/Online/Portfolio)
  no longer look barren.

### Phase 3 — Mobile (folds in P2)

- Sticky mobile header: progress ("Step X of 6"), Back chevron, "Save & exit" (relocated out of the
  `hidden md:block` rail).
- "Preview listing" toggle → bottom sheet rendering `OnboardingPreview`.
- Acceptance: on a phone, progress + Back + Save & exit are always reachable; preview is one tap away.

### Phase 4 — Consistency bundle (cheap, optional)

- Add a Back control on desktop.
- Unify the intermediate CTA label to "Next" (keep "Publish Profile" on Review). (This is the P3 CTA
  fix; trivial to include here.)

### Phase 5 — Verify

- Manual walk as a fresh vendor, desktop + mobile: preview populates on each advance; no global
  sidebar; Save & exit works on mobile; Back works.
- Run onboarding e2e + unit suites; add/adjust a layout test asserting `SidebarNav` is absent on
  setup routes.

## Files in play

- `src/app/dashboard/profile/setup/layout.tsx` (rewrite)
- `src/app/dashboard/layout.tsx` (conditional sidebar suppression) + middleware header
- `src/components/onboarding/OnboardingPreview.tsx` (new, extracted from `StepReview.tsx`)
- `src/components/onboarding/WizardStepper.tsx` (Back + mobile header)
- `src/components/onboarding/StepReview.tsx` (consume extracted preview)

## No schema changes. No new dependencies.

## Explicitly out of scope (separate items)

- **P0** Publish gate (block Publish until required fields pass) — highest-funnel correctness, tracked separately.
- **P3** Step rebalance (merge Location+Online; de-overlap Step-1 taxonomy).
- Live-per-keystroke preview (D2 fast-follow).
