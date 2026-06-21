# Session State — 2026-06-20

End-of-session snapshot. Captures what shipped, what's live, what's queued, and what to revisit. Cross-reference with `git log --oneline -20` for ground truth.

---

## What shipped today

**Four feature buckets + three hygiene PRs**, in this order:

| PR  | Branch                            | What                                                                                                                                                                                                                                                                                                          | Migration                                                                                                      |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| #49 | docs/bucket-f-spec                | Bucket F design spec                                                                                                                                                                                                                                                                                          | —                                                                                                              |
| #50 | feat/bucket-f-payment-model       | **Bucket F implementation** — single 5%-only payment model; ripped Stripe Connect plumbing; reframed Money as attribution dashboard                                                                                                                                                                           | 00058 (DROP TABLE stripe_accounts CASCADE + DROP COLUMN payment_mode + stripe_account_id) — applied to prod    |
| #51 | docs/bucket-b-spec                | Bucket B design spec                                                                                                                                                                                                                                                                                          | —                                                                                                              |
| #52 | feat/bucket-b-ia-copy-brand       | **Bucket B implementation** — 7 threads: couple→customer rename; event types 6→20 with dual cultural labels; Spanish added; per-event guest count; vendor own-profile owner banner + view-as-customer toggle; hot-pink hover system; OnboardingGate relocated to /signup/success with mark-on-show + backfill | 00059 (CHECK constraint expansion on bookings.event_type + onboarding_completed_at backfill) — applied to prod |
| #53 | fix/ci-e2e-test-hygiene           | **CI hygiene part 1** — fixed env vars (E2E_SUPABASE_SERVICE_ROLE_KEY missing + E2E_SUPABASE_URL typo); P0-P3: schema drift in seed.ts; dead cash-vendor specs deleted; slug placeholder migration                                                                                                            | 00060 (vendor_profiles.slug → nullable + partial unique index) — applied to prod                               |
| #54 | fix/ci-e2e-hygiene-part-2         | **CI hygiene part 2** — orphan spec sweep (vendor-money + cash-vendor); notification-actions data-testid; walkthrough skip when seed absent; **toast-intercept fix in loginAs helper** (recovered 15 notification tests)                                                                                      | —                                                                                                              |
| #55 | fix/hotfix-payment-mode-prod-bugs | **Production hotfix** — 5 sites still selected `payment_mode` after Bucket F dropped the column. Booking detail page was 404 for every booking in prod. Also: money page dead branching, vendor-filters cashFriendly query error                                                                              | —                                                                                                              |

All merged to main. All migrations applied to dev AND prod.

---

## Production state right now

**Healthy.** Hotfix PR #55 deployed via Vercel within minutes of merge. As of session end:

- Booking detail pages render correctly (regression fixed)
- Money page renders attribution dashboard cleanly (no more cash/stripe branching)
- Marketplace filter `cashFriendly` is now a no-op accept (doesn't crash; filter UI surface still present, to be removed in follow-up)
- All 4 feature buckets active: D.1 (notifications) + A (wizard) + F (payments) + B (IA/copy)

**Brand state:** palette + typography locked; hover system shipped today; vendor thumbnail UX requirement still outstanding.

---

## CI E2E state

Estimated 75-80% pass rate after today's fixes. Confirmed locally:

- Bucket B suite: 4/4 pass
- Notification D.1 action buttons: 15/16 pass (was 1/16 before toast fix)

Remaining known failures:

- **`notifications.spec.ts:23`** — asserts `notif.body` contains literal "Wedding Coverage" but seed creates "E2E Package". One-line test fix; not a real bug. Hasn't been fixed yet.
- **`notifications-d1-counter-cap.spec.ts:109`** — was failing because of the payment_mode 404 bug (fixed in PR #55). Should pass now; not re-verified.
- **Brittle CSS locators in misc tests** — vendor-money, vendor-onboarding, etc. P4-P10 territory. Pace as needed.

CI environment fix lives in repo secrets (E2E_SUPABASE_SERVICE_ROLE_KEY added today; E2E_SUPABASE_URL corrected).

---

## What's queued

**Task ledger:**

- Task #86 — Per-vendor-type package templates (pending; predates today; never scoped)
- Bucket E "polish" — undefined; original sequencing slotted it after B. Needs a brainstorm session if pursued. Likely candidates:
  - Photo thumbnail selection UX (only locked memory item)
  - Money page surrounding sections cleanup (RecentUnlocks, PayoutHistory may have weird empty states)
  - Operations view polish
  - Private vendor notes / side panel friction (unknown)
  - Inbox filtering / sorting
- Bucket C "cleanup" — Sub-project A's "legacy budget flow co-exists; A-cleanup deferred" per memory. Never scoped.
- Marketplace `cashFriendly` filter UI removal — follow-up from PR #55 hotfix (filter is a no-op accept; UI element should be removed since it describes every vendor under single-mode now)

**Operational follow-ups:**

- E2E test orphan-detection: when a PR deletes a feature, also delete its specs (memory entry saved today: `delete_specs_with_features.md`)
- E2E CI's STRIPE_WEBHOOK_SECRET is a hardcoded placeholder — any test that triggers a Stripe webhook signature check will fail. Flag for future Stripe-flow tests.

---

## Lessons captured (saved to user memory)

- **`delete_specs_with_features.md`** — when a PR deletes a feature, delete its E2E specs in the same PR. Discovered after Bucket F left cash-vendor + vendor-money spec residue that masqueraded as CI regressions.

---

## Key file pointers

**Specs:**

- `docs/superpowers/specs/2026-06-19-bucket-f-payment-model-simplification-design.md`
- `docs/superpowers/specs/2026-06-20-bucket-b-ia-copy-brand-polish-design.md`

**Plans:**

- `docs/superpowers/plans/2026-06-19-bucket-f-payment-model-simplification.md`
- `docs/superpowers/plans/2026-06-20-bucket-b-ia-copy-brand-polish.md`

**Reports (ephemeral, in `.git/sdd/`):**

- `ci-e2e-triage-report.md` — root-cause analysis of CI E2E failures
- `ci-hygiene-fix-report.md` — PR #53 execution details
- `ci-hygiene-part-2-report.md` — PR #54 execution details
- Various `task-N-report.md` files from subagent runs

**Brand reference:**

- `docs/DESIGN.md` — palette, typography, hover system (added today)

---

## How to resume

If picking back up:

1. **For Bucket E:** start a brainstorm session — user has not yet identified specific pain points in the vendor CRM; need that input first
2. **For Task #86:** also needs scoping — what does "per-vendor-type package templates" mean? Likely: pre-fill different default packages for photographers vs DJs vs caterers when they hit the package editor
3. **For Bucket C:** Sub-project A's legacy budget flow audit + removal. Memory has the pointer.
4. **For "what should I do next":** check CI E2E results to see if today's hygiene fixes hit ~75-80% pass rate; investigate the remaining 25% if so or pace it later.

Most useful first command for a fresh session:

```bash
git log --oneline -10
gh pr list --state merged --limit 6
```

---

## Open questions / decisions deferred

- **CI test-hygiene philosophy:** how much of the suite do we tolerate failing? Today's stance: prioritize real bug discovery > full green. The CI failures DID find a real prod bug (booking detail 404) today.
- **Photo thumbnail UX timing:** locked as required but not scheduled. Slot into Bucket E if it happens.
- **Marketplace search filter audit:** `cashFriendly` removal triggers a thought — is the price-band filter also broken? Today's grep was narrow.
- **Email template visual rebrand:** Bucket F + Bucket B both touched email copy; no visual refresh yet.
