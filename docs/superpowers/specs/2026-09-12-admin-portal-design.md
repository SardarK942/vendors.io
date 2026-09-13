# Admin / Developer Portal — Design

**Date:** 2026-09-12
**Status:** approved (in-chat), phased delivery

## Goal

An internal `/admin` portal for the Baazar team to see unfinished vendor profiles
and other launch metrics, usable for marketing and onboarding follow-ups. Read-only
with client-side CSV export + copy-email-list for each cohort.

## Access model

- New route group `src/app/admin/` (sibling of `dashboard/`).
- Gated to `users.role = 'admin'`. This is the FIRST admin gate in app code — the
  `admin` role exists in the type + RLS but nothing in-app checks it yet.
- `src/app/admin/layout.tsx` fetches the session + role and `redirect('/dashboard')`
  for non-admins, `redirect('/login')` for logged-out.
- `/admin` added to the middleware guard (`src/lib/supabase/middleware.ts`) for the
  logged-out redirect; the definitive role check stays in the layout (middleware
  can't cheaply read role).
- `requireAdmin()` added to `src/lib/api/auth.ts` for any future `/api/admin/*`.
- Cross-user aggregates use `createServiceRoleClient()` (bypasses RLS).

## Architecture

- Every metric is a **pure function** in `src/lib/admin/` (mirrors the
  `nudge-candidates.ts` selector pattern) — unit-tested, no I/O. Server components
  fetch rows, call the pure functions, pass results to presentational components.
- Reuse `getPublishBlockers()` (`src/lib/onboarding/publish-checklist.ts`) for the
  "which fields are missing" logic — single source of truth with the publish gate.
- Reuse `nudge-candidates.ts` selectors for the lifecycle cohorts.
- No email is sent from the portal; no email list leaves the browser (export/copy
  are client-side over data already rendered).

## Panels (phased)

### PR-A — shell + Unfinished Profiles (the core ask)

- Admin shell (layout + auth gate + simple admin nav) + `/admin` landing.
- **Unfinished Profiles** table: business name, email, created, days stalled,
  missing publish-gate fields (via `getPublishBlockers`), profile completeness %.
- Shared client utilities: `Export CSV` + `Copy emails` buttons.
- Add shadcn `table` primitive (none exists yet).

### PR-B — Onboarding funnel + cohorts

- Funnel counts: signed up → email-confirmed → started profile → published (+ %).
- Nudge cohorts A (unconfirmed) / B1 / B2 with last-nudge-sent dates.
- Email-confirmed status via `supabase.auth.admin.listUsers()` (service role).

### PR-C — Marketplace health + Bookings/revenue

- Live vendors by category, carts breakdown, vendors missing/stale embeddings,
  multi-business accounts, verified count.
- Booking counts by status, deposits collected (5% platform fee), 7-day deltas.

## Pure functions to unit-test (PR-A)

- `toCsv(headers: string[], rows: (string|number)[][]): string` — RFC-4180-ish
  escaping (quotes, commas, newlines).
- `buildUnfinishedRow(profile, user, nowMs)` → `{ businessName, email, createdAt,
daysStalled, missingFields: string[], missingCount, completeness }`.
- `emailList(rows)` → deduped, comma-joined emails for copy.

## Admin bootstrap

Set the first admin:

```sql
UPDATE users SET role = 'admin' WHERE email = 'sardarm.khan942@gmail.com';
```

Applied to dev by Claude (if the account exists there); applied to prod by the user
(migration/prod policy).

## Out of scope (v1)

- Sending email from the portal / triggering nudges on demand.
- Charts / time-series (numeric tiles + tables only).
- Editing vendor data from the portal (read-only).
