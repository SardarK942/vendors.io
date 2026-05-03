# Product notes — your hand-curated punch list

A running list of faults, missing features, UX gaps, and ideas you've noticed
while using the product. Phase J ("walk-through + punch list") is the formal
session where we sit down, screen-share through every page, and triage these.

**Use this file freely.** Drop a note any time something feels off — even half-
formed thoughts. Future-you (or future-Claude) will read this when planning
work. The Phase J session triages each entry into one of:

- **fix-now** — block soft launch
- **fix-soon** — first 2 weeks after soft launch
- **someday** — backlog, not blocking
- **no** — explicitly rejected, with reason

---

## How to use

When you notice something, add an entry under "Open" with whatever shape works:

```
- [page or area] short description.
  more context if needed.
  why it bothers you / what you'd want instead.
```

Don't worry about format consistency. Don't pre-triage. The goal is capture, not
design. Triage happens later.

---

## Open

<!-- drop notes below this line -->

### Pre-soft-launch loose ends (found during 2026-05-03 live-money smoke test)

- **Vercel Cron not configured** — `/api/cron/tick` only runs when curled manually. Need a daily trigger (Vercel Cron in `vercel.json`, or external like cron-job.org). Without it: platform-fee recognition + auto-completion + PII redaction never run; vendor funds stay stuck in `recognized`, past-event bookings never close out. Single highest-priority pre-launch item.

- **Connected account "Paused soon" warning** — the smoke-test vendor's account (`acct_1TSnrS54NFWy7748`) shows "Paused soon" for Payouts and Transfers in Stripe Dashboard. Need to investigate what's missing in the connected-account profile before real vendors hit it post-KYC. Likely a business-profile field mismatch or missing verification document.

- **Orphan Stripe Connect accounts in live mode** — `acct_1TSieg9fQONIeIHd` (Restricted, sardarhousefinance@gmail.com) is leftover from earlier deleted signups. Cleanup via Stripe API. Establish a pattern: when we delete a user from our DB, also delete (or close) their Stripe Connect account.

- **Test booking + accounts in prod DB** — the smoke-test data (couple `sardarm.khan942@gmail.com`, vendor `sardarhousefinance@gmail.com`/gochoTacos, booking `2ff977e0-5cad-45f0-898d-db125b8086e4` with refunded transaction `3cd342fe-1731-4f5d-b2b4-6d5990c799c7`) is still in prod. Delete or anonymize before real users land — otherwise a refunded "wedding" booking is visible somewhere accidentally.

- **CI E2E tests** — the E2E GitHub Action is gated on secrets being set (per recent commit `53de86b`). Confirm it's actually executing on PRs against the dev DB rather than skipping. If skipped, every PR ships untested.

---

## Triaged (fix-now)

<!-- moved here during Phase J session -->

---

## Triaged (fix-soon)

<!-- moved here during Phase J session -->

---

## Triaged (someday)

<!-- moved here during Phase J session -->

---

## Triaged (no)

<!-- moved here with a one-line "why not" -->
