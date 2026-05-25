# Pending Issues

Living list of follow-ups, deferred work, and known gaps. Started 2026-05-25 after the Day-1 brand component queue closed (PRs #17–#22). Last updated 2026-05-25 after PR #23 + prod migrations 00039–00041.

---

## 🔴 Blockers / immediate

### ~~1. `VendorAdjustQuoteForm` doesn't handle `pending_quote` status~~ — FIXED, PR #23 PENDING MERGE

**Resolution:** PR #23 patches 4 surfaces (booking.service `VALID_TRANSITIONS` + `adjustBookingQuote` guard, `VendorBookingActions` render gate + new "Send quote" CTA, `BookingDetail` outer gate) and adds 2 tests. End-to-end flow verified: pending_quote → adjusted_quote_sent → standard deposit pipeline.

**Status:** awaiting review/merge.

### 2. 3 pre-existing test failures on main

**Tests:**

- `src/__tests__/api/vendor-profile-publish.test.ts` — 2 tests assert 200 but get 400
- `src/__tests__/lib/onboarding/validation.test.ts` — `publishGateSchema accepts a complete profile` returns false

**Root cause:** Tests + publish API reference `vendor_profiles.is_active` and `vendor_profiles.onboarding_complete` columns that don't exist in the production schema. Either:

- (a) Add the columns via migration (+ wire whatever populates them), or
- (b) Remove the dead test assertions + API code paths

**Predates:** every recent PR; failures have been on main since at least the vendor-card branch.

**Impact:** CI shows red on every PR. We've been merging despite this because the failures are pre-existing — but it's noise.

---

## ✅ Pending prod migrations — APPLIED 2026-05-25

All 3 applied directly to prod (`obpdgihdskbxzgyctaib`) via psql:

- ~~00039 `create_newsletter_signups.sql`~~ — CREATE EXTENSION + TABLE + INDEX + ALTER TABLE + CREATE POLICY ✅
- ~~00040 `bookings_pending_quote.sql`~~ — 5 × ALTER TABLE ✅
- ~~00041 `notifications_custom_request_type.sql`~~ — 2 × ALTER TABLE ✅

`/api/newsletter/subscribe` and `/api/bookings/custom-request` are live on prod.

---

## 🟠 Deferred features (planned, not built)

### Save heart persistence (vendor card)

- **State:** Local React Set in `VendorGrid` — resets on page navigation
- **Needs:** `saved_vendors` table (user_id, vendor_profile_id, created_at) + insert/delete API + auth-gated UI
- **PR ref:** #20

### Vendor-selected thumbnail UX

- **State:** Card falls back to `portfolio_images[0]`; vendors can't pick which photo represents them on the card
- **Needs:** UI in onboarding wizard + CRM for vendor to flag a hero shot; new `vendor_profiles.card_thumbnail_url` (or reuse `portfolio_images[0]` by reordering)
- **Memory:** `[[baazar-vendor-thumbnail-selection-requirement]]`
- **PR ref:** #20 (deferred)

### Resend wire-up for newsletter signup

- **State:** Stub-only — emails persist to `newsletter_signups` but no confirmation, no welcome series, no actual sends
- **Needs:** Resend audience config + double-opt-in flow + unsubscribe route + confirmation email template
- **PR ref:** #21

### Resend wire-up for Custom Request notification

- **State:** In-app notification only via existing bell/dropdown
- **Needs:** Email template + Resend integration in `notifyCustomRequestReceived`
- **PR ref:** #22

### Date picker range mode (multi-day events)

- **State:** Single-select only Day-1. Multi-day events (Saturday + Sunday) go in the description field.
- **Needs:** `<DatePicker>` props for `mode='range'`, consumer updates in CustomRequestForm + any future booking flows
- **PR ref:** #22

### Vendor disabling the Custom Request card

- **State:** Virtual = appended for every vendor unconditionally
- **Needs:** Promote to a real `packages` row with `is_custom` + `is_enabled` flags + dashboard toggle UI
- **Defer signal:** Wait for vendor feedback that they want to opt out
- **PR ref:** #22

### Capacity-aware availability on vendor card

- **State:** Day-1 check is binary "has block / no block" via `vendor_calendar_holds`
- **Needs:** Integrate with `concurrent_capacity` so a 2-team vendor shows "Available" until 2 bookings overlap
- **PR ref:** #20 (deferred)

---

## 🟢 Tech debt

### Vendor card pagination uses legacy shadcn tokens

- **Where:** `src/app/(marketplace)/vendors/page.tsx` (pagination block at bottom)
- **What:** Uses `border-primary`, `bg-primary`, `text-muted-foreground` — pre-M+ tokens
- **Fix:** Port to `border-ink`, `bg-ink`, `text-ink-muted`
- **Flagged in:** PR #20 final review

### Couples can't filter vendors by price at DB level

- **Where:** `src/lib/vendor-filters.ts` price-band filter
- **What:** `vendor_packages_price_band` is a VIEW; PostgREST can't resolve FK joins on views (PGRST200)
- **Workaround:** URL params accepted but the DB query ignores price filters; price band fetched separately and merged client-side
- **Fix options:** (a) materialize the view, (b) add a derived `min_price_cents` / `max_price_cents` column to `vendor_profiles` via trigger, (c) RPC function with price-band JOIN
- **Flagged in:** PR #19 (filter chips)

### `.next/types` cached error

- **What:** Stale build cache reports an error in `.next/types/app/...` that doesn't actually exist
- **Fix:** `rm -rf .next` and rebuild
- **Impact:** Cosmetic only; doesn't block typecheck since the real `src/` typecheck passes

### Custom Request: couple_name in notification body uses `user.email`

- **Where:** `src/app/api/bookings/custom-request/route.ts`
- **What:** Notification body reads `"{user.email ?? 'A couple'} sent a request..."`. Should read full name.
- **Fix:** Look up `users.full_name` (or whatever stores the couple's display name) and use that instead
- **Flagged in:** PR #22 implementer notes (`// refined when we wire user.full_name lookup`)

---

## 🔒 Security: secrets rotation pending — UPDATED 2026-05-25

Per `[[secrets-rotation-pending-2026-05-21]]` memory, these credentials have been exposed in transcripts and should be rotated:

1. **Stripe live secret key** (`sk_live_51T78VM...`) — exposed 2026-05-21 during E backfill. Currently in Vercel as `STRIPE_SECRET_KEY`. Rotate via Stripe dashboard → roll → update Vercel → redeploy.
2. **Prod Supabase service-role key** (`sb_secret_6RJwL...`) — same exposure. Currently in Vercel as `SUPABASE_SERVICE_ROLE_KEY`. Rotate via prod Supabase project → Settings → API.
3. **Dev Supabase DB password** (multiple values exposed across sessions). Used by Claude's psql sessions only, not in any deployed env var. Lower urgency.
4. **Prod Supabase DB password** — exposed 2026-05-24 during 00037/00038 prod apply, **AND re-exposed 2026-05-25 during 00039/00040/00041 prod apply**. Not in any deployed env var. **Higher urgency** because (a) it's prod and (b) it's been in two separate session transcripts now.

---

## ✅ Recently shipped / closed

For context — these are no longer pending:

- ~~PR #17 buttons~~ — merged
- ~~PR #18 search bar~~ — merged
- ~~PR #19 filter chips~~ — merged
- ~~PR #20 vendor card~~ — merged; migrations 00037+00038 prod-applied 2026-05-24
- ~~PR #21 footer~~ — merged 2026-05-25; migration 00039 prod-applied 2026-05-25
- ~~PR #22 custom request + date picker primitive~~ — merged 2026-05-25; migrations 00040+00041 prod-applied 2026-05-25
- PR #23 VendorAdjustQuoteForm pending_quote branch — **open**, awaiting review/merge

---

## Next phase (per [[sub-project-sequencing]] memory)

1. **Homepage hero in code** — first real production component using all locked foundation tokens (palette + typography + spacing + motion + wordmark cycle).
2. **K sub-project (scraper)** — intentionally LAST in the sub-project sequence; don't dispatch early.
