# Vendor onboarding nudge emails — design

**Date:** 2026-08-21
**Status:** approved (brainstorm), pending spec review → implementation plan

## Problem

Vendors sign up but don't finish onboarding, so they never get a live listing on the
marketplace. There is currently **no** nudge for this: the existing daily `tick` cron only
sends a 48-hour follow-up to vendors who **already** completed onboarding and published
(`vendor_profiles.onboarding_complete = true`). The signup→live gap is uncovered, including a
backlog of vendors who already signed up and abandoned setup.

## Goal

Automatically email vendors who signed up but never went live, at two steps (a first reminder
and a last-call), to recover the signup→live conversion gap. Handle both new signups going
forward **and** the existing backlog.

## Scope

**In scope:** two transactional reminder emails, driven by two new sweeps in the existing daily
`tick` cron, with per-vendor send-tracking to prevent duplicates.

**Out of scope:** in-app nudges, SMS, and a real unsubscribe system (none exists today; see
"Known gaps"). This spec matches the existing follow-up email pattern and does not build new
email-preference infrastructure.

## Target audience (who gets nudged)

A user is a nudge candidate when **all** of:

- `users.role = 'vendor'`
- **Email confirmed** — `auth.users.email_confirmed_at IS NOT NULL`. Email confirmation is ON
  (turned on 2026-08-17), so an unconfirmed vendor cannot log in to finish onboarding — a "finish
  your profile" nudge would be a dead-end. Unconfirmed vendors are excluded here; re-engaging
  never-confirmed signups is a separate concern (out of scope). Note: the `public.users` row is
  created by the `on_auth_user_created` trigger at signup, **before** confirmation, so row
  existence is not a confirmation proxy — the confirmation state must be read from `auth.users`.
  Likely implementation: cross-reference `supabase.auth.admin.listUsers({ perPage: 1000 })` (cheap
  at this scale) or a security-definer RPC; the implementation plan picks the mechanism.
- **Not live** — there is NO `vendor_profiles` row for the user with `onboarding_complete = true`.
  (Catches both "never opened the setup wizard" → no `vendor_profiles` row at all, and "started
  but abandoned" → row with `onboarding_complete = false`. A `vendor_profiles` row is created
  lazily by `getOrCreateWizardProfile` only when the vendor first enters setup, so detection is
  driven from `users`, not `vendor_profiles`.)
- The account is at least the step's minimum age (below)
- The step's nudge has not already been sent

**Stop condition:** the moment a vendor publishes (`onboarding_complete = true`), they are no
longer a candidate for any remaining step. No nudges are ever sent to a live vendor.

## Cadence & gating (lower-bound, not tight windows)

Tight "signed up 24–48h ago" windows would miss the existing backlog (a vendor who signed up 30
days ago is past the window forever). Instead gate on **minimum age + a per-step sent-marker**,
which handles the backlog and new signups uniformly.

**Step 1 — first reminder**

- Gate: `role = 'vendor'` AND not live AND `created_at <= now - 24h` AND
  `onboarding_nudge_24h_sent_at IS NULL`.
- On send: stamp `onboarding_nudge_24h_sent_at = now`.
- Backlog behavior: on the first cron run after deploy, every already-abandoned vendor (≥24h old,
  not live) qualifies and receives Step 1.

**Step 2 — last call**

- Gate: `role = 'vendor'` AND not live AND `onboarding_nudge_24h_sent_at IS NOT NULL` AND
  `onboarding_nudge_24h_sent_at <= now - 6 days` AND `onboarding_nudge_7d_sent_at IS NULL`.
- Gating Step 2 off **"6 days after Step 1 was sent"** (not "7 days after signup") keeps spacing
  clean for everyone: a fresh signup gets Step 2 ~7 days after joining (24h + 6d); a backlog
  vendor gets it ~6 days after their catch-up Step 1. No one receives two nudges a day apart.
- On send: stamp `onboarding_nudge_7d_sent_at = now`.

**Per-run batch cap:** each sweep processes at most **100** candidates per run. If the backlog
exceeds that, the daily cron drains it over subsequent days — polite for the still-warming
sending domain. At ≤500 vendors this typically clears in a single run. When a run hits the cap,
`log`/`console` the number skipped so silent truncation is visible.

## Emails

Two new react-email templates in `src/lib/email/templates/`, sent via the existing Resend module
(`src/lib/email/resend.tsx`), matching the existing follow-up template style (branded, inlined
styles, text wordmark, footer).

- **Copy is timing-agnostic** — never references "24 hours" or "7 days," because a nudge may land
  for a vendor who actually signed up long ago. Both emails say, in effect, _"Your Baazar profile
  isn't live yet — finish setting up to start getting booked."_
- **Step 1** — friendly reminder tone.
- **Step 2** — last-call tone ("this is the last reminder we'll send").
- **CTA:** "Finish your profile" → `/dashboard/profile/setup`.
- Reuses the existing unsubscribe-token argument pattern for signature consistency with
  `sendVendor48hFollowupEmail` (token = `user_id`).

New email senders in `resend.tsx`:
`sendVendorOnboardingNudge1(email, fullName, userId)` and
`sendVendorOnboardingNudge2(email, fullName, userId)`.

## Schema change

One migration adding two nullable timestamp columns to **`users`** (not `vendor_profiles`, since
a candidate may have no `vendor_profiles` row):

```sql
ALTER TABLE public.users
  ADD COLUMN onboarding_nudge_24h_sent_at timestamptz,
  ADD COLUMN onboarding_nudge_7d_sent_at  timestamptz;
```

Applied to dev first, then prod (per the project migration policy — Claude applies dev, user
applies prod). `database.types.ts` hand-patched with the two columns.

## Where it runs

Extend the existing daily `tick` cron (`src/app/api/cron/tick/route.ts`, `0 9 * * *`) with two
new sweeps — `runVendorOnboardingNudge24h()` and `runVendorOnboardingNudge7d()` — structured
exactly like the existing `runVendor48hFollowup()` (service-role client, candidate query,
per-candidate send + stamp, each wrapped so one failure doesn't block the others). No new cron
entry; no `vercel.json` change.

## Data flow

1. Daily cron `tick` fires (9am).
2. Step-1 sweep: query candidates (role=vendor, not live, ≥24h old, 24h-marker null), capped 100.
   For each: send Step-1 email, stamp `onboarding_nudge_24h_sent_at`.
3. Step-2 sweep: query candidates (role=vendor, not live, 24h-marker set ≥6 days ago, 7d-marker
   null), capped 100. For each: send Step-2 email, stamp `onboarding_nudge_7d_sent_at`.
4. A vendor who publishes at any point drops out of all future candidate queries (not-live
   condition fails).

The "not live" condition is implemented as a `NOT EXISTS` / anti-join against `vendor_profiles`
with `onboarding_complete = true` for that `user_id`. Because a vendor can have multiple business
profiles, "live" = **any** profile complete.

## Error handling

- Each sweep is wrapped in try/catch and logs failures without aborting the other sweep (mirrors
  the existing `customer 48h followup` / `vendor 48h followup` handling in `tick`).
- Per-candidate send failures are caught and skipped (no marker stamped on failure, so the next
  run retries that vendor) — but a permanently-failing address must not wedge the batch. Stamp
  the marker only on a successful send; a hard bounce simply gets retried on the next daily run
  (acceptable at this cadence).
- Missing email on a candidate → skip.

## Testing

Unit tests for the candidate-selection logic, mirroring how existing follow-ups are covered:

- **Step 1 selection:** includes a vendor with no `vendor_profiles` row (never started); includes
  a vendor with an incomplete profile; **excludes** a vendor with a completed/live profile;
  **excludes** a vendor <24h old; **excludes** a vendor already stamped `onboarding_nudge_24h_sent_at`;
  **excludes** an unconfirmed-email vendor.
- **Step 2 selection:** includes a vendor whose Step 1 was sent ≥6 days ago and still not live;
  **excludes** one whose Step 1 was <6 days ago; **excludes** one already stamped 7d; **excludes**
  one now live.
- **Batch cap:** a candidate set larger than the cap returns at most the cap and reports the
  remainder.
- **Stop condition:** a vendor who becomes live between Step 1 and Step 2 is excluded from Step 2.

## Known gaps (explicitly not addressed here)

- **No real unsubscribe system.** The existing follow-up emails pass an unsubscribe token but no
  route consumes it. This spec matches that pattern for consistency and does not build a real
  unsubscribe/opt-out flow. Tracked as a separate pre-launch item (CAN-SPAM compliance) — worth
  doing before large-scale sending, but out of scope for this feature.
- **Deliverability:** adds up to 2 emails per abandoned vendor on a still-warming domain. Fine at
  ≤500 vendors with the 100/run cap; revisit if volume grows.
