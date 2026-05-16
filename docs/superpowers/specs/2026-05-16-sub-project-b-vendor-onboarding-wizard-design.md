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
  - **AI bio assistant** (see §5a) — `✨ Help me write this` button beside the textarea. Generates a starter draft from `business_name + category` when the field is empty; polishes the wording when text is already present. Vendor can accept (replaces textarea content) or dismiss.
- On Next: UPSERT vendor_profiles row (creates if missing, updates otherwise). Slug derived from business_name on first INSERT only — preserved on subsequent edits.

### Step 2 — Location — `/dashboard/profile/setup/location`
- **Base address** via Google Places Autocomplete (same component as today). Required: line_1, city, state, postal_code, google_place_id.
- **Public/private toggle** (`base_address_public`, defaults `false`).
- Helper text: "Couples see your city + state always. Full address shown only after they pay the deposit, unless you make it public here."
- On Next: UPDATE vendor_profiles.

### Step 3 — Online presence — `/dashboard/profile/setup/online`
- **Instagram handle** (text, **required**) — primary distribution channel for the marketplace; couples expect to see one. Validation: strips leading `@`, allows letters/digits/dots/underscores per Instagram username rules.
- **Website URL** (url, optional)
- On Next: UPDATE vendor_profiles.

### Step 4 — Portfolio — `/dashboard/profile/setup/portfolio`
- UploadThing `portfolioImage` route (already wired in repo).
- Grid of uploaded images with delete (X) button per tile.
- Required: ≥1 image to advance. Soft suggestion in the UI: "Vendors with 3+ photos get 2× more clicks — add more if you have them."
- On Next: UPDATE vendor_profiles.portfolio_images (full array replace).

### Step 5 — Review & publish — `/dashboard/profile/setup/review`
- Read-only card showing all fields collected in steps 1–4.
- Live vendor-card preview (uses the same `VendorCard` component the marketplace uses).
- "Publish profile" button — gated client-side and server-side by:
  - business_name, category, bio non-empty (bio length 50–500)
  - base address line_1 + city + state + postal_code present
  - instagram_handle non-empty
  - portfolio_images.length >= 1
- On Publish: UPDATE vendor_profiles SET onboarding_complete = true, is_active = true, updated_at = now(). Redirect to `/dashboard/profile/packages?just_onboarded=1` which shows a "🎉 Profile live — now create your first package to start receiving bookings" banner.

## 5a. AI bio assistant

A small AI helper attached to the bio textarea in Step 1. Two modes, one endpoint, one button.

**Trigger:** `✨ Help me write this` button beside the textarea. While the request is in-flight, button shows a spinner and is disabled.

**Modes (server picks based on input):**
- **Draft mode** — textarea is empty or <20 chars. The assistant generates a 2–3 sentence starter draft from `business_name`, `category`, and (if present) `instagram_handle`.
- **Polish mode** — textarea has substantive content (≥20 chars). The assistant rewrites for clarity, warmth, and SEO without changing meaning. Returns a single polished version.

**UI flow:**
1. Vendor clicks the button.
2. Modal opens showing two columns: "Your text" (left, dimmed if empty) and "Suggested" (right, streaming token-by-token via `text/event-stream`).
3. When stream completes, two buttons: **Use this** (replaces textarea content, closes modal) and **Cancel** (closes modal, no change).
4. Vendor can edit the suggested text in-place inside the modal before clicking **Use this**.

**Endpoint:** `POST /api/ai/bio-assist`
- Auth: `requireUser` — vendor only (`role = vendor`). Couples can't call this.
- Body: `{ businessName: string, category: string, instagramHandle?: string, draft?: string }`
- Response: `text/event-stream` with Claude's streamed completion. Final event includes `{ done: true, usage: {input_tokens, output_tokens} }`.

**Model:** `claude-haiku-4-5-20251001` — fast, cheap (~$1/M input, $5/M output), totally sufficient for 100-token vendor bios. ~$0.001 per call.

**Rate limiting:** Cap at 10 calls per user per 24h. Tracked via a lightweight `ai_bio_assist_calls` table or via a `last_ai_calls` jsonb column on `users`. Simple per-user counter; reset on first call after 24h since last call. Returns 429 with retry-after when exceeded.

**Prompts** (locked in `src/lib/ai/prompts.ts`):

```typescript
export const BIO_DRAFT_SYSTEM = `You write short, warm vendor bios for a Desi/South Asian wedding marketplace called Baazar.io. Bios are 50–500 characters, 2–3 sentences, written in first person plural (we/our). Focus on what the vendor does, who they serve, and one specific quality. Avoid clichés ("passionate", "experienced") and superlatives ("the best"). Don't mention pricing.`;

export const BIO_POLISH_SYSTEM = `You polish vendor bios for a Desi/South Asian wedding marketplace. Preserve the vendor's meaning and voice. Improve clarity, warmth, and flow. Keep the polished version under 500 characters. Don't add facts the vendor didn't state. Output only the polished bio, no preamble.`;
```

User prompts:
- Draft: `Vendor: {businessName}\nCategory: {category}\n${instagramHandle ? \`Instagram: @${instagramHandle}\n\` : ''}\nWrite a starter bio for this vendor.`
- Polish: `Vendor: {businessName}\nCategory: {category}\n\nOriginal bio:\n{draft}\n\nPolish it.`

**Dependencies:**
- New: `@anthropic-ai/sdk` (npm install)
- New env var: `ANTHROPIC_API_KEY` (added to `.env.local` + Vercel production by user before merge)

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
  online    → if instagram_handle empty
  portfolio → if portfolio_images.length < 1
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
- `src/components/onboarding/BioAssistButton.tsx` — `✨ Help me write this` button + modal that streams the AI suggestion
- `src/app/api/vendor-profile/setup/[step]/route.ts` — per-step PATCH endpoints (or a single PATCH route taking a step param)
- `src/app/api/vendor-profile/publish/route.ts` — Publish handler (server-side validation + flip flags)
- `src/app/api/ai/bio-assist/route.ts` — Claude Haiku streaming endpoint for bio draft/polish (vendor-only, rate-limited)
- `src/lib/ai/anthropic.ts` — Anthropic client singleton
- `src/lib/ai/prompts.ts` — locked system + user prompts for bio assistant
- `src/lib/ai/rate-limit.ts` — per-user 10/24h counter
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
- `00032_ai_bio_assist_calls.sql` — small table for AI rate limiting: `(user_id uuid PRIMARY KEY, calls_24h int NOT NULL DEFAULT 0, window_started_at timestamptz NOT NULL DEFAULT now())`. Or store as a jsonb column on `users` to avoid a new table — implementer's choice.

## 12. Testing

**Unit:**
- `src/__tests__/lib/onboarding/resume.test.ts` — exhaustive table-driven tests of `nextIncompleteStep` (~10 cases covering each gap + the all-done case)
- `src/__tests__/lib/onboarding/validation.test.ts` — Zod schema tests per step (~15 cases)
- `src/__tests__/api/vendor-profile-publish.test.ts` — Publish endpoint: rejects incomplete profiles (each missing-field permutation), accepts complete one, sets both flags
- `src/__tests__/api/ai-bio-assist.test.ts` — auth gate (couples get 403), rate-limit (11th call in 24h → 429), draft vs polish branch selection (mock Anthropic client)
- `src/__tests__/lib/ai/rate-limit.test.ts` — counter increments, window reset after 24h, returns retry-after correctly

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
- **B4.5** — AI bio assistant: Anthropic SDK install, rate-limit table, `/api/ai/bio-assist` streaming endpoint, `BioAssistButton` UI integrated into StepBasics.
- **B5** — Polish: live preview card on review step, "🎉 just_onboarded" banner on packages page, dashboard CTA redirect, post-claim redirect.
- **B6** — E2E spec.

## 14. Decisions log (resolved 2026-05-16)

1. **Portfolio minimum** — ≥1 image (low-friction MVP). UI shows a soft "3+ photos get 2× clicks" nudge.
2. **Bio length** — 50–500 chars. AI bio assistant (§5a) integrated to help vendors draft from scratch or polish what they wrote — addresses the "blank textarea" problem and the "I'm not a writer" problem.
3. **Online presence** — Instagram **required**, Website optional. Insta is the primary distribution channel for Desi wedding vendors.
4. **Scraper integration** — Designed to handle prefilled rows but no real scraper required for B (sub-project K's problem). E2E test 2 seeds a prefilled row directly to verify the prefill-aware paths.
5. **Test data wipe** — Handled ad-hoc at launch via a one-off SQL deletion; no migration in this sub-project.
