# Vendor onboarding nudge emails — design

**Date:** 2026-08-21
**Status:** approved (brainstorm), pending spec review → implementation plan

## Problem

Vendors sign up but never get a live listing on the marketplace. Two distinct drop-offs exist,
neither currently nudged:

- **Segment A — unconfirmed:** signed up but never clicked the email confirmation link. With
  email confirmation ON (since 2026-08-17), these accounts **cannot even log in** — a fully lost
  signup. (Some never confirmed because early confirmation emails hit spam; see the Gmail
  "dangerous" flag history.)
- **Segment B — confirmed but didn't finish:** confirmed and logged in, but abandoned the setup
  wizard, so they never published a live profile.

The existing daily `tick` cron only sends a 48-hour follow-up to vendors who **already** completed
onboarding and published (`vendor_profiles.onboarding_complete = true`). Both drop-offs above —
including the existing backlog — are uncovered.

## Goal

Automatically recover both lost segments via email, driven by the existing daily `tick` cron:

- **Segment A:** re-send the (branded) email confirmation so they can activate their account.
- **Segment B:** remind them to finish setup so their profile goes live.

Handle both new signups going forward **and** the existing backlog. The two chain naturally: an
A-vendor who confirms becomes a B-candidate.

## Scope

**In scope:** three nudge sweeps added to the daily `tick` cron — one re-confirmation nudge
(Segment A) and two finish-your-profile nudges (Segment B) — with per-vendor send-tracking to
prevent duplicates.

**Out of scope:** in-app nudges, SMS, and a real unsubscribe system (none exists today; see "Known
gaps"). Matches the existing follow-up email pattern; builds no new email-preference
infrastructure.

## Segment A — unconfirmed vendors

**Candidate when all of:**

- `users.role = 'vendor'`
- `auth.users.email_confirmed_at IS NULL` (never confirmed)
- `users.created_at <= now - 24h`
- `users.confirm_nudge_sent_at IS NULL` (not already re-nudged)

**Action:** re-send the confirmation email via `supabase.auth.resend({ type: 'signup', email })`
(anon client in the cron). This reuses the existing **branded confirm-signup template** and custom
SMTP — no new template, no link generation. On success, stamp `confirm_nudge_sent_at = now`.

**Cadence:** a **single** re-confirmation nudge (one shot). Repeatedly asking to confirm is
spammy and low-yield; a single warmer-domain, branded resend is the high-value move. (Can become
multi-step later if data warrants — deferred.)

**Reading confirmation state:** PostgREST does not expose the `auth` schema, and the `public.users`
row is created by the `on_auth_user_created` trigger at signup (before confirmation), so row
existence is not a confirmation proxy. The sweep reads confirmation state via
`supabase.auth.admin.listUsers({ perPage: 1000 })` and cross-references by user id — cheap at this
scale (≤ a few thousand users). (Alternative: a security-definer view/RPC exposing
`email_confirmed_at`; rejected to avoid widening access to `auth.users`. The implementation plan
may revisit.)

**Stop condition:** once confirmed, an A-vendor drops out of A and becomes eligible for B.

## Segment B — confirmed but didn't finish onboarding

**Candidate when all of:**

- `users.role = 'vendor'`
- **Email confirmed** (`auth.users.email_confirmed_at IS NOT NULL`) — an unconfirmed vendor can't
  log in to finish, so B's "finish your profile" CTA would dead-end; those belong to Segment A.
- **Not live** — NO `vendor_profiles` row for the user with `onboarding_complete = true`. Catches
  both "never opened the wizard" (no `vendor_profiles` row — it's created lazily by
  `getOrCreateWizardProfile` only on first entry to setup) and "started but abandoned"
  (`onboarding_complete = false`). Because a vendor can have multiple business profiles, "live" =
  **any** profile complete.
- The account meets the step's minimum age (below)
- The step's nudge has not already been sent

**Stop condition:** the moment any profile reaches `onboarding_complete = true`, the vendor is no
longer a B-candidate. No B-nudge is ever sent to a live vendor.

### Cadence & gating (lower-bound, not tight windows)

Tight "signed up 24–48h ago" windows would miss the existing backlog (a vendor who signed up 30
days ago is past the window forever). Gate on **minimum age + a per-step sent-marker**, which
covers backlog and new signups uniformly.

**Step 1 — first reminder**

- Gate: role=vendor AND confirmed AND not live AND `created_at <= now - 24h` AND
  `onboarding_nudge_24h_sent_at IS NULL`.
- On send: stamp `onboarding_nudge_24h_sent_at = now`.
- Backlog: on the first cron run after deploy, every already-abandoned confirmed vendor qualifies
  and receives Step 1.

**Step 2 — last call**

- Gate: role=vendor AND confirmed AND not live AND `onboarding_nudge_24h_sent_at IS NOT NULL` AND
  `onboarding_nudge_24h_sent_at <= now - 6 days` AND `onboarding_nudge_7d_sent_at IS NULL`.
- Gating Step 2 off **"6 days after Step 1 was sent"** (not "7 days after signup") keeps spacing
  clean for everyone: a fresh signup gets Step 2 ~7 days after joining (24h + 6d); a backlog
  vendor ~6 days after their catch-up Step 1. No one gets two nudges a day apart.
- On send: stamp `onboarding_nudge_7d_sent_at = now`.

## Per-run batch cap

Each of the three sweeps processes at most **100** candidates per run. If a backlog exceeds that,
the daily cron drains it over subsequent days — polite for the still-warming sending domain. At
≤500 vendors this typically clears in a single run. When a run hits the cap, log the number
skipped so silent truncation is visible.

## Emails

- **Segment A:** no new template — `auth.resend` re-sends the existing branded confirm-signup
  email through custom SMTP.
- **Segment B:** two new react-email templates in `src/lib/email/templates/`, sent via the
  existing Resend module (`src/lib/email/resend.tsx`), matching the existing follow-up style
  (branded, inlined styles, text wordmark, footer).
  - **Copy is timing-agnostic** — never references "24 hours" / "7 days," since a nudge may land
    for a vendor who signed up long ago. Both say, in effect, _"Your Baazar profile isn't live yet
    — finish setting up to start getting booked."_
  - **Step 1** friendly reminder; **Step 2** last-call ("the last reminder we'll send").
  - **CTA:** "Finish your profile" → `/dashboard/profile/setup`.
  - Reuses the existing unsubscribe-token argument pattern (token = `user_id`) for signature
    consistency with `sendVendor48hFollowupEmail`.
  - New senders in `resend.tsx`: `sendVendorOnboardingNudge1(email, fullName, userId)` and
    `sendVendorOnboardingNudge2(email, fullName, userId)`.

## Schema change

One migration adding three nullable timestamp columns to **`users`** (not `vendor_profiles`,
since a candidate may have no `vendor_profiles` row):

```sql
ALTER TABLE public.users
  ADD COLUMN confirm_nudge_sent_at        timestamptz,
  ADD COLUMN onboarding_nudge_24h_sent_at timestamptz,
  ADD COLUMN onboarding_nudge_7d_sent_at  timestamptz;
```

Applied to dev first, then prod (per the migration policy — Claude applies dev, user applies
prod). `database.types.ts` hand-patched with the three columns.

## Where it runs

Extend the daily `tick` cron (`src/app/api/cron/tick/route.ts`, `0 9 * * *`) with three new sweeps
— `runUnconfirmedVendorNudge()`, `runVendorOnboardingNudge24h()`, `runVendorOnboardingNudge7d()` —
each structured like the existing `runVendor48hFollowup()` (service-role client, candidate query,
per-candidate send + stamp) and each wrapped so one failure doesn't block the others. No new cron
entry; no `vercel.json` change.

## Data flow

1. Daily cron `tick` fires (9am).
2. **Segment A sweep:** candidates = role=vendor, ≥24h old, `confirm_nudge_sent_at` null (cap 100);
   intersect with unconfirmed set from `admin.listUsers`. For each: `auth.resend` + stamp
   `confirm_nudge_sent_at`.
3. **Segment B Step-1 sweep:** candidates = role=vendor, confirmed, not live, ≥24h old,
   `onboarding_nudge_24h_sent_at` null (cap 100). For each: send Step-1 email + stamp.
4. **Segment B Step-2 sweep:** candidates = role=vendor, confirmed, not live,
   `onboarding_nudge_24h_sent_at` ≥6 days old, `onboarding_nudge_7d_sent_at` null (cap 100). For
   each: send Step-2 email + stamp.
5. A vendor who confirms moves from A into B eligibility; a vendor who publishes drops out of B.

The "not live" condition is a `NOT EXISTS` anti-join against `vendor_profiles` where
`onboarding_complete = true` for that `user_id`.

## Error handling

- Each sweep is wrapped in try/catch and logs failures without aborting the others (mirrors the
  existing `customer/vendor 48h followup` handling in `tick`).
- Per-candidate failures are caught and skipped; the marker is stamped **only on a successful
  send**, so a transient failure is retried on the next daily run. A hard bounce simply gets one
  retry per run (acceptable at this cadence).
- Missing email → skip.

## Testing

Unit tests for candidate-selection logic, mirroring existing follow-up coverage:

- **Segment A:** includes an unconfirmed vendor ≥24h old with null marker; **excludes** a confirmed
  vendor; **excludes** one <24h old; **excludes** one already stamped `confirm_nudge_sent_at`.
- **Segment B Step 1:** includes a vendor with no `vendor_profiles` row (never started); includes
  one with an incomplete profile; **excludes** a completed/live vendor; **excludes** one <24h old;
  **excludes** one already stamped 24h; **excludes** an unconfirmed vendor.
- **Segment B Step 2:** includes a vendor whose Step 1 was sent ≥6 days ago and still not live;
  **excludes** one whose Step 1 was <6 days ago; **excludes** one already stamped 7d; **excludes**
  one now live.
- **Batch cap:** a candidate set larger than the cap returns at most the cap and reports the
  remainder.
- **Chaining:** an A-vendor who confirms between runs becomes a B Step-1 candidate.

## Known gaps (explicitly not addressed here)

- **No real unsubscribe system.** Existing follow-up emails pass an unsubscribe token but no route
  consumes it. This spec matches that pattern and does not build a real opt-out flow. Tracked as a
  separate pre-launch item (CAN-SPAM) — worth doing before large-scale sending.
- **Deliverability:** adds up to 3 emails per lost vendor on a still-warming domain. Fine at ≤500
  vendors with the 100/run cap; revisit if volume grows. Segment A resends specifically may still
  hit spam for addresses that spam-filed the original — accepted risk.
