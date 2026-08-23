# PostHog product analytics — design

**Date:** 2026-08-22
**Status:** approved (brainstorm), pending spec review → implementation plan

## Problem

There is no product analytics. We can't see where users get stuck or drop off — the vendor
onboarding abandonment that motivated the nudge feature was inferred from DB state, not observed.
We need funnels + session replay to see _where_ and _why_ users drop off across signup, vendor
onboarding, and booking.

## Goal

Integrate PostHog (Cloud, US region) for pageview funnels, custom-event funnels, and session
replay across the three core funnels, with a privacy-friendly, no-consent-banner posture and the
legal safeguards below. Dormant when unconfigured so it can ship before the key is set.

## Decisions (from brainstorm)

- **PostHog Cloud, US region.** Not self-hosted (ops), not server-only (loses replay/autocapture).
- **No consent banner.** Privacy-friendly config + policy update instead. See "Privacy & legal."
- **Session replay ON, with PII masking.**
- **All 3 funnels** instrumented with custom events (autocapture also on).

## Architecture

### A. Core wiring

1. **`PostHogProvider`** — client component wrapping the app in `src/app/layout.tsx`. Initializes
   `posthog-js` in a `useEffect`. **Dormant when `NEXT_PUBLIC_POSTHOG_KEY` is unset** (mirrors the
   Sentry pattern): no init, all `track()` calls become no-ops. So local dev / previews without the
   key are completely inert and analytics can never break the app.
   - Init config: `api_host: '/ingest'` (reverse proxy), `ui_host: 'https://us.posthog.com'`,
     `capture_pageview: false` (we capture manually — App Router requirement),
     `autocapture: true`, `respect_dnt: true` (honors Do-Not-Track / GPC),
     `session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' }`,
     `person_profiles: 'always'` (so anonymous signup-funnel steps are captured).

2. **Reverse proxy** — `/ingest/:path*` rewrite → `https://us.i.posthog.com/:path*` (and
   `/ingest/static/:path*` → `https://us-assets.i.posthog.com/static/:path*`), so ad-blockers
   don't drop events. **Requires resolving the duplicate `next.config.js` + `next.config.mjs`**
   (one is silently ignored — pre-existing bug). Consolidate to a single `next.config.mjs` (the
   ESM one, matching the project's module style), fold in any config from the ignored file, delete
   the other, and add `rewrites()` there.

3. **`PostHogPageView`** — tiny client component using `usePathname()` + `useSearchParams()` to
   `posthog.capture('$pageview')` on route change. Wrapped in `<Suspense>` (useSearchParams needs
   it). This alone yields the onboarding-step funnel (each step is a route).

4. **Identify on auth** — a small client effect (co-located with the existing Supabase browser
   client usage, e.g. a new `PostHogIdentify` component or folded into an existing provider) that
   subscribes to `supabase.auth.onAuthStateChange`: on `SIGNED_IN` → `posthog.identify(user.id,
{ role })`; on `SIGNED_OUT` → `posthog.reset()`. Identify by **user.id only** (no email as
   distinct_id). Links the anonymous pre-signup session to the known user so funnels survive the
   signup boundary.

### B. Custom events (all 3 funnels)

A typed helper `src/lib/analytics/track.ts` exporting `track(event, props?)` and an `AnalyticsEvent`
string-union/const map — so event names are consistent, greppable, and typo-proof. `track()` guards
on `posthog.__loaded` and wraps in try/catch (never throws into the app).

Events, placed at real call sites:

| Funnel     | Event                                   | Where                                    |
| ---------- | --------------------------------------- | ---------------------------------------- |
| Signup     | `signup_started`                        | signup form mount / first field focus    |
| Signup     | `signup_submitted` `{role}`             | `signup-form.tsx` on successful `signUp` |
| Signup     | `signup_confirmation_sent`              | when the "check your inbox" state shows  |
| Onboarding | `onboarding_step_completed` `{step}`    | each wizard step's "Next"/save           |
| Onboarding | `onboarding_publish_blocked` `{reason}` | `StepReview` when publish gate rejects   |
| Onboarding | `onboarding_published`                  | `StepReview` on successful publish       |
| Booking    | `vendor_profile_viewed` `{slug}`        | vendor profile page (client)             |
| Booking    | `quote_request_started`                 | quote modal open                         |
| Booking    | `quote_request_submitted`               | quote submit success                     |
| Booking    | `deposit_started`                       | deposit/checkout begin                   |
| Booking    | `deposit_completed`                     | deposit success                          |

Autocapture covers incidental clicks; these events make the non-page conversion moments precise.

### C. Privacy & legal

Not legal advice; safeguards to lower the (low-but-real) risk, chiefly around session replay:

- **Privacy policy update (required):** rewrite the `/privacy` line that currently says "no
  advertising, tracking, or analytics cookies at this time" to disclose PostHog product analytics
  - session replay, what's collected (usage events, masked recordings — no form input values), and
    how to opt out (browser DNT/GPC, or contacting support).
- **PII masking:** `maskAllInputs: true` in replay; add a `data-ph-mask` marker (or
  `ph-no-capture` class) to any element that renders sensitive data (payment fields, full emails,
  addresses). Identify by `user.id`, never email as distinct_id.
- **Respect DNT/GPC:** `respect_dnt: true` — users signaling "don't track" are not captured or
  recorded.
- **Lightweight notice (RECOMMENDED, not a gate):** a small dismissible banner — "We use cookies &
  analytics to improve Baazar. Learn more →" linking to `/privacy`. Non-blocking (analytics runs
  regardless), sets a `localStorage` dismiss flag. This is the cheapest thing that helps against
  "session-replay wiretapping" claims (demonstrates notice) while preserving the no-consent-gate
  decision. If the user opts to drop it, core analytics is unaffected.

### D. Configuration

- Env: `NEXT_PUBLIC_POSTHOG_KEY` (project key), `NEXT_PUBLIC_POSTHOG_HOST` (default
  `https://us.i.posthog.com`, used as the rewrite target / configurable). Added to `.env.example`.
- Dormant when key unset. Added to Vercel env by the user when ready (build + merge can precede it).

## Data flow

browser → `posthog-js` → same-origin `/ingest/*` → Next rewrite → PostHog Cloud (US). `identify()`
stitches anonymous → known user on login. Funnels/replays are then built/viewed in the PostHog UI
(config, not code).

## Error handling

- Dormant when unconfigured (no key → no init → `track()` no-ops).
- `track()` wrapped in try/catch; a PostHog failure/exception never propagates into app code.
- Reverse-proxy rewrite is additive; if PostHog is unreachable the app is unaffected (events just
  don't send).

## Testing

- **Unit** (`src/__tests__/lib/analytics/track.test.ts`): `track()` no-ops safely when PostHog is
  not loaded; passes correct `(event, props)` through when loaded (mock `posthog`); event-name
  constants are stable/unique.
- **Manual smoke:** with a dev PostHog key, verify `$pageview` + a custom event land in PostHog's
  live "Activity" feed, and that a replay is captured with inputs masked. (Done in the live browser
  during implementation.)
- Existing unit suite + `tsc` stay green; the config consolidation must not change build output.

## Out of scope (v1)

Server-side capture (`posthog-node`), feature flags, A/B experiments, cohorts, building
dashboards/funnels inside PostHog (a suggested-funnels list is handed off, not coded), and a
blocking consent banner.

## Prerequisites

A PostHog Cloud (US) project → **Project API key**. Build + merge can happen first (dormant); the
key goes into Vercel env to activate.

## Suggested funnels to build in PostHog (hand-off, post-merge)

1. **Vendor onboarding:** `/signup` pageview → `signup_submitted{role:vendor}` →
   `signup_confirmation_sent` → first `/dashboard/profile/setup/*` pageview →
   `onboarding_step_completed` (×steps) → `onboarding_published`.
2. **Signup:** landing → `signup_started` → `signup_submitted` → `signup_confirmation_sent`.
3. **Booking:** `vendor_profile_viewed` → `quote_request_started` → `quote_request_submitted`
   (and the deposit branch → `deposit_completed`).
