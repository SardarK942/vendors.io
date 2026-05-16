# Sub-project B — Vendor Onboarding Wizard

**Date:** 2026-05-16
**Status:** Design (pending user review)
**Predecessors:** A (packages model), F (notifications). Both shipped to main 2026-05-16.

---

## 1. Goal

Replace the current single-page `/dashboard/profile` setup with a guided **5-step full-page wizard** that walks vendors from claim/sign-up through to a publishable, search-visible listing. Wire the marketplace gate so half-finished profiles do not appear in search.

## 2. Non-goals

- No SMS/Twilio invites (deferred per memory).
- No portfolio image cropping/editing (out of scope; UploadThing handles the upload).
- No "first package" flow inside the wizard — packages stay at `/dashboard/profile/packages` and the wizard ends with a clear handoff.
- No quality/completeness % scoring beyond the binary `onboarding_complete` flag.
- No re-ranking based on profile completeness (today's `verified` + `total_bookings` ordering stays).
- Scraper integration (sub-project K) is separate; B only requires that a pre-existing `vendor_profiles` row prefill the wizard naturally.

## 3. Context

- All current vendors on the site are fake test data. They will be wiped via a launch-time data purge (out of scope for this sub-project; ad-hoc SQL is fine). No existing-vendor migration UX is needed.
- The real onboarding model: scraper (sub-project K) creates pre-filled `vendor_profiles` rows from public Instagram/website data. Outreach goes out via Instagram DM/email with a personalized claim link (e.g. `/vendors/<slug>/claim?token=<token>`). Vendor claims → wizard → publish.
- A direct sign-up path also exists (`/signup` with role=vendor) for organic discovery; that vendor starts the wizard with an empty `vendor_profiles` row.
- Both paths converge on the same wizard.

## 4. Schema usage (no new columns)

`vendor_profiles` already has everything we need:

| Column | Use |
|---|---|
| `business_name` (NOT NULL) | Step 1 |
| `category` (NOT NULL) | Step 1 |
| `bio` (nullable text) | Step 1 — vendor description, will be required-by-app to publish |
| `base_address_line_1`, `base_city`, `base_state`, `base_postal_code`, `base_google_place_id` (nullable) | Step 2 — required-by-app to publish |
| `base_address_public` (bool) | Step 2 — toggle |
| `instagram_handle`, `website_url` (nullable) | Step 3 — at least one required-by-app to publish |
| `portfolio_images` (text[]) | Step 4 — `length >= 3` required-by-app to publish |
| `onboarding_complete` (bool, default `false`) | Flipped to `true` by Step 5's Publish button |
| `is_active` (bool) | Pause/unpause toggle, independent of onboarding |

`business_name`, `category`, `slug` are NOT NULL at the DB level. Step 1 must INSERT the row with all three populated. `slug` is auto-derived from business_name (existing logic).

## 5. The 5 steps

### Step 1 — Basics — `/dashboard/profile/setup/basics`
- **Business name** (text, required)
- **Category** (select, required — same enum as today)
- **Bio / description** (textarea, required, 50–500 chars, char counter)
- On Next: UPSERT vendor_profiles row (creates if missing, updates otherwise). Slug derived from business_name on first INSERT only — preserved on subsequent edits.

### Step 2 — Location — `/dashboard/profile/setup/location`
- **Base address** via Google Places Autocomplete (same component as today). Required: line_1, city, state, postal_code, google_place_id.
- **Public/private toggle** (`base_address_public`, defaults `false`).
- Helper text: "Couples see your city + state always. Full address shown only after they pay the deposit, unless you make it public here."
- On Next: UPDATE vendor_profiles.

### Step 3 — Online presence — `/dashboard/profile/setup/online`
- **Instagram handle** (text, optional individually)
- **Website URL** (url, optional individually)
- App-level rule: at least one of the two must be present to advance.
- On Next: UPDATE vendor_profiles.

### Step 4 — Portfolio — `/dashboard/profile/setup/portfolio`
- UploadThing `portfolioImage` route (already wired in repo).
- Grid of uploaded images with delete (X) button per tile.
- Required: ≥3 images to advance.
- On Next: UPDATE vendor_profiles.portfolio_images (full array replace).

### Step 5 — Review & publish — `/dashboard/profile/setup/review`
- Read-only card showing all fields collected in steps 1–4.
- Live vendor-card preview (uses the same `VendorCard` component the marketplace uses).
- "Publish profile" button — gated client-side and server-side by:
  - business_name, category, bio non-empty
  - base address line_1 + city + state + postal_code present
  - At least one of instagram_handle / website_url
  - portfolio_images.length >= 3
- On Publish: UPDATE vendor_profiles SET onboarding_complete = true, is_active = true, updated_at = now(). Redirect to `/dashboard/profile/packages?just_onboarded=1` which shows a "🎉 Profile live — now create your first package to start receiving bookings" banner.

## 6. Wizard shell

- **Route structure:** `/dashboard/profile/setup/[step]` — server component for each step.
- **Shared layout** at `/dashboard/profile/setup/layout.tsx`:
  - Reads the user's vendor_profiles row server-side.
  - If `onboarding_complete = true`, redirect to `/dashboard/profile` (edit form, not wizard).
  - Sticky left side stepper showing all 5 steps with check / current / pending indicators.
  - Mobile: collapses to a top progress bar.
- **Resume logic:** On `/dashboard/profile/setup` (no step), redirect to the first incomplete step:
  ```
  basics    → if business_name OR category OR bio empty
  location  → if base_address_line_1 OR base_city OR base_state OR base_postal_code empty
  online    → if both instagram_handle AND website_url empty
  portfolio → if portfolio_images.length < 3
  review    → otherwise
  ```
- **Save & exit:** A "Save & exit" link in the stepper sidebar links to `/dashboard`. Since each step's Next button already persists, there is nothing extra to save. The user sees the same wizard, picked up at the same incomplete step, next time.
- Each step has [Back] and [Next] buttons. [Next] is disabled until the step's required fields validate.
- The stepper allows jumping to any completed step (jump-back to edit) but not forward (a step is "completed" only when its required fields are present in the DB).

## 7. Marketplace gate

Today's marketplace query at `src/app/(marketplace)/vendors/page.tsx:26-31` returns ALL vendor_profiles regardless of `is_active` or `onboarding_complete`. This sub-project adds two filters:

```typescript
.eq('is_active', true)
.eq('onboarding_complete', true)
```

Apply the same filters to:
- The vendor profile detail page (`/vendors/[slug]`) — if `onboarding_complete = false`, return 404 to non-owners. The owning vendor's own session can still see their own pre-publish profile via `/dashboard/profile`.
- The vendor profile booking page (`/vendors/[slug]/book`) — same 404 rule.
- The `vendor_packages_price_band` view — already filters by package `is_active`; add a JOIN-level filter so packages from unpublished vendors don't pollute the price band view. (May need a view rebuild migration.)

## 8. Claim flow integration

The existing `POST /api/vendors/claim` route already pairs a user to a pre-existing `vendor_profiles` row by setting `user_id`. No changes needed there. After claim succeeds, redirect to `/dashboard/profile/setup` — the resume logic will land them on the first incomplete step. The wizard will see whatever the scraper pre-filled (business_name, category, instagram, maybe portfolio images) and skip those steps.

## 9. Sign-up flow

After `/signup` with role=vendor, the user lands on `/dashboard`. We update the "Set up your profile" CTA on the dashboard overview to link to `/dashboard/profile/setup` instead of `/dashboard/profile`. The vendor lands in the wizard with no vendor_profiles row — step 1 creates it on first Next.

## 10. Edge cases

- **Vendor visits `/dashboard/profile` directly mid-onboarding:** If `onboarding_complete = false`, redirect to `/dashboard/profile/setup`. The edit form is only for completed profiles. The "claim/create" toggle (current ProfileSetup component) becomes dead code and is removed.
- **Vendor visits a wizard step directly (e.g. `/setup/portfolio`) before completing prior steps:** Shared layout enforces ordering by checking required-field presence; if a prior step has missing fields, redirect to that prior step.
- **Vendor clicks Publish but server-side validation fails (e.g. someone deleted a portfolio image between the client check and the request):** Server returns 400 with the missing field; client shows the error and offers a "Go to that step" link.
- **Slug collision:** Existing logic appends a numeric suffix; preserved.
- **Vendor pauses their account (`is_active = false`) after publishing:** Stays out of marketplace. They can re-enable from `/dashboard/profile`. No interaction with `onboarding_complete`.

## 11. Components & files

**New files:**
- `src/app/dashboard/profile/setup/layout.tsx` — shared shell + resume logic
- `src/app/dashboard/profile/setup/page.tsx` — redirector to first incomplete step
- `src/app/dashboard/profile/setup/basics/page.tsx`
- `src/app/dashboard/profile/setup/location/page.tsx`
- `src/app/dashboard/profile/setup/online/page.tsx`
- `src/app/dashboard/profile/setup/portfolio/page.tsx`
- `src/app/dashboard/profile/setup/review/page.tsx`
- `src/components/onboarding/WizardStepper.tsx` — left sidebar stepper
- `src/components/onboarding/StepBasics.tsx`
- `src/components/onboarding/StepLocation.tsx`
- `src/components/onboarding/StepOnline.tsx`
- `src/components/onboarding/StepPortfolio.tsx`
- `src/components/onboarding/StepReview.tsx`
- `src/app/api/vendor-profile/setup/[step]/route.ts` — per-step PATCH endpoints (or a single PATCH route taking a step param)
- `src/app/api/vendor-profile/publish/route.ts` — Publish handler (server-side validation + flip flags)
- `src/lib/onboarding/resume.ts` — pure function `nextIncompleteStep(profile) → 'basics' | 'location' | 'online' | 'portfolio' | 'review'`
- `src/lib/onboarding/validation.ts` — Zod schemas per step

**Modified files:**
- `src/app/(marketplace)/vendors/page.tsx` — add `.eq('is_active', true).eq('onboarding_complete', true)`
- `src/app/(marketplace)/vendors/[slug]/page.tsx` — 404 if not published, unless owner
- `src/app/(marketplace)/vendors/[slug]/book/page.tsx` — 404 if not published
- `src/app/dashboard/profile/page.tsx` — redirect to `/setup` if `onboarding_complete = false`
- `src/app/dashboard/page.tsx` — vendor-side "Set up profile" CTA now links to `/setup`
- `src/app/api/vendors/claim/route.ts` — after claim, redirect target is `/dashboard/profile/setup`

**Deleted files:**
- `src/components/dashboard/ProfileSetup.tsx` — claim/create toggle, no longer needed; the wizard subsumes both flows
- `src/components/forms/VendorProfileForm.tsx` — kept actually, since edit-mode (post-onboarding) still uses it. Confirm before deleting.

**Possible migration:**
- `00031_filter_price_band_view_unpublished.sql` — rebuild `vendor_packages_price_band` view to JOIN-filter `onboarding_complete = true`. Pending verification of view definition.

## 12. Testing

**Unit:**
- `src/__tests__/lib/onboarding/resume.test.ts` — exhaustive table-driven tests of `nextIncompleteStep` (~10 cases covering each gap + the all-done case)
- `src/__tests__/lib/onboarding/validation.test.ts` — Zod schema tests per step (~15 cases)
- `src/__tests__/api/vendor-profile-publish.test.ts` — Publish endpoint: rejects incomplete profiles (each missing-field permutation), accepts complete one, sets both flags

**E2E:**
- `tests/e2e/vendor-onboarding.spec.ts`:
  - **Test 1:** Fresh signup → wizard step 1 → fill all 5 steps → Publish → assert profile appears in marketplace and detail page renders.
  - **Test 2:** Seed a pre-filled vendor_profiles row (mimics scraper output) → claim → wizard skips to portfolio step → upload images → Publish → marketplace visibility.
  - **Test 3:** Mid-wizard exit → log out → log back in → land on the same step.
  - **Test 4:** Unpublished profile not visible in marketplace (`/vendors` list count) and `/vendors/<slug>` returns 404.

## 13. Phasing

Single PR, sequential phases inside it:

- **B1** — Schema verification + price-band view filter (if needed). Marketplace gate filters (4 modified files). Hide unpublished profiles from search.
- **B2** — Resume function + Zod validation schemas + unit tests.
- **B3** — Wizard shell (layout, stepper, redirector page) + per-step routes (basics/location/online/portfolio/review with minimum-viable UIs).
- **B4** — Per-step PATCH endpoints + publish endpoint with server-side validation.
- **B5** — Polish: live preview card on review step, "🎉 just_onboarded" banner on packages page, dashboard CTA redirect, post-claim redirect.
- **B6** — E2E spec.

## 14. Open questions for user review

1. **Portfolio minimum (3 images)** — too strict? Should we accept 1 for a low-friction MVP and tighten later?
2. **Bio length (50–500 chars)** — reasonable? Some categories (DJ, photographer) might want longer.
3. **At-least-one-of (instagram OR website)** — strict requirement, or both optional in the spirit of "ship the wizard fast and let the marketplace figure it out"?
4. **Sub-project K (scraper)** dependency — the wizard is designed to handle prefilled rows, but no real scraper exists yet. Is that acceptable, or should we mock the prefill end-to-end to flush out integration bugs?
5. **Test data wipe** — should B include a `00031_purge_fake_vendors.sql` migration to clear the fake test vendors, or handle that ad-hoc at launch?
