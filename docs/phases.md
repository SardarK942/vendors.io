# Phases — single source of truth

This is the canonical list of work phases. Update it as phases complete or
scope changes. If you're wondering "what's done" or "what's left", look here
first — not at memory, not at git history, not at the runbook.

Status legend: ✅ done · 🚧 in progress · ⏳ not started · 🟡 partial / blocked

---

## ✅ Phase A — Money safety

Idempotency on Stripe-touching writes, single-writer ledger discipline, fix
concurrent-cancel race, transfer reversal on refund. Foundational; everything
financial assumes this is correct.

## ✅ Phase B — API boundary hardening

`withErrorBoundary`, `requireUser` / `requireBookingAccess` helpers, Zod input
validation on every route. Pushes auth + validation to the edges so service
code can trust its inputs.

## ✅ Phase C — Observability

Health check route, `cron_runs` + `stripe_events` audit tables, structured
`logger` that forwards errors to Sentry, deduped webhook handling.

## ✅ Phase D — Product gaps

Dispute flow, vendor-fault flag, onboarding-pending UI, cancellation policy
dialog, Terms of Service + Privacy Policy pages.

## ✅ Phase E — Email domain

Rolled into H5 (Resend domain verification on `baazar.io`). Transactional emails
now send from `noreply@baazar.io` with SPF/DKIM/DMARC verified.

## ✅ Phase F — Schema hygiene

4 composite indexes for hot query paths, RLS holes closed on `stripe_accounts`

- `transactions` (the latter caused two bugs we patched in May 2026), and
  `redact_stale_booking_pii` SECURITY DEFINER function for cron.

## ✅ Phase G — E2E tests

Playwright suite, 16 tests covering smoke / auth / booking / cancel / dispute /
review. `seedBooking` helper for fixture creation. CI-gated; runs on PRs
against the dev Supabase project.

## ✅ Stripe deferred-onboarding pivot

**Not lettered — slotted between G and H.** Full pivot from Standard Connect +
upfront onboarding to Custom controller + deferred onboarding + 30/70
platform/vendor split + 24h grace + reviews. Decided 2026-04-17, merged via
PR #1 (`feat/deferred-stripe-reviews`).

## ✅ Phase H — Launch ops

External service wiring + go-live work.

- ✅ H1 Sentry — code wired + DSN set in Vercel
- ✅ H2 Upstash rate limiting — wired + Redis creds in Vercel
- ✅ H3 Supabase prod/dev split — `.env.local` → dev, Vercel → prod
- ✅ H4 Stripe live mode — activated, both webhook endpoints (account events +
  Connect events) configured with separate signing secrets
- ✅ H5 Resend domain — `baazar.io` verified
- ✅ H6 Custom domain — `www.baazar.io` live (apex 307s to www; **never use
  apex for webhook URLs**)
- ✅ H7 Runbook — `docs/runbook.md` written
- ⏳ H8 **Soft launch** — UNBLOCKED by everything above + smoke test, but
  gated on you hand-picking 5–10 vendors and 2–3 couples for screen-share
  walkthroughs. No code work.

## ✅ Live-money smoke test (2026-05-03)

Verified end-to-end on prod with real $5: signup → booking → deposit → cron
recognition → completion → vendor KYC → auto-transfer → refund → reversal.
Surfaced six bugs, all fixed.

## ⏳ Phase H+1 — Pre-launch maintenance pass

Loose ends found during the smoke test. See `docs/product_notes.md` "Open"
section for the live list. Currently includes:

- Vercel Cron not configured (highest priority — without it, fee recognition
  - auto-completion never run)
- Connected-account "Paused soon" warning (investigate before vendors hit it)
- Orphan Stripe Connect accounts (cleanup pattern)
- Smoke-test data still in prod (delete before real users)
- CI E2E tests gated on secrets — confirm running

## ⏳ Phase I — UI polish

3–5 days. Styling, copy tightening, empty / loading / error states, mobile
pass. Doesn't gate H8 — can run during or after soft launch.

## ⏳ Phase J — Walk-through + punch list triage

Sit-down session: screen-share through every page, triage entries from
`docs/product_notes.md` Open list into `fix-now` / `fix-soon` / `someday` /
`no`. Triggered after soft launch has produced a meaningful punch list.

## ⏳ Phase K — Vendor sourcing at scale

GTM work: vendor outreach, claim flow polish, partnerships, content. Out of
scope for engineering until soft-launch cohort completes a full booking
cycle without incident.

---

## How to keep this current

When a phase status changes:

1. Edit this file (one-line edit per phase).
2. If a new phase emerges, add it in the right slot — don't renumber the
   others. Use H+1 / H+2 if it's a maintenance pass, or pick a new letter
   for substantive work.
3. Mirror the high-level status into `~/.claude/projects/.../memory/deployment_runbook_state.md`
   so future-Claude sessions see consistent state.

Things this file is NOT:

- Not the launch checklist — that's `docs/launch-checklist.md` (step-by-step
  for H-phase external service setup)
- Not the punch list — that's `docs/product_notes.md` (capture surface for
  Phase J)
- Not the runbook — that's `docs/runbook.md` (on-call procedures)
