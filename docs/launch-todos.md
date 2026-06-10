# Launch TODOs

Living list of pending work, grouped by urgency. Last updated 2026-06-10.

---

## 🔴 Immediate (this week)

### Send the 4 vendor outreach messages

Tokens expire **2026-06-16** (7 days from 2026-06-09). Copy in chat history; URLs minted on prod.

| Vendor                                 | Channel                                                 | Sent? |
| -------------------------------------- | ------------------------------------------------------- | ----- |
| Epic Events Photo Booth Rental Chicago | contact form epiceventsbooth.com or call (630) 656-9372 | ☐     |
| PhotoxUSA                              | email photobootheventsonline@gmail.com or DM @photoxusa | ☐     |
| GLAMBOT®                               | contact form getglambot.com or call (855) 452-6268      | ☐     |
| Chicago Photo Booth Rental             | IG DM @chiboothrental                                   | ☐     |

### Configure Stripe Dashboard branding

Assets ready on Desktop:

- `/Users/sardarkhan/Desktop/baazar-naskh-logo.png` (Stripe Logo)
- `/Users/sardarkhan/Desktop/baazar-naskh-icon-square.png` (Stripe Icon)

Stripe Dashboard → Settings → Branding:

- ☐ Logo upload
- ☐ Icon upload
- ☐ Primary color `#1B1414`
- ☐ Accent color `#D1006C`
- ☐ Public business name `Baazar`
- ☐ Statement descriptor `BAAZAR`

### Hard-refresh prod + verify shipped work

Vercel deploys should be live after PRs #38–#42. Verify on `baazar.io`:

- ☐ Browser tab favicon shows بازار + pink dot (not Vercel/Next default)
- ☐ Homepage hero shows cultural category photos (no broken images, no Western couples)
- ☐ Footer wordmark cycles through 4 scripts every ~4s
- ☐ Login page says "Sign in to your Baazar account"
- ☐ OG share preview (test by sharing the link in iMessage) shows the wordmark card

---

## 🟡 Short-term (within 2 weeks)

### Track each vendor's claim status

- ☐ Watch for vendors landing on `/dashboard/profile/setup` for the first time
- ☐ If a vendor hasn't claimed by 2026-06-15 (1 day before expiry), follow up
- ☐ Re-mint tokens for any unclaimed vendors after 2026-06-16

### Per-vendor-type packages (Task #86)

Discussion planned **2026-06-11 (tomorrow night)**. User researching: WeddingWire / The Knot vendor profile templates + real Chicago vendors (photobooth, DJ, catering, mehndi). Decide between (a) smart prompts UI-only, (b) structured fields schema additions, (c) defer.

### Onboarding observability

- ☐ Confirm Sentry catches errors during first real vendor signup
- ☐ Set up alert for first booking event
- ☐ Verify Resend email delivery succeeds for each vendor's signup confirmation

### Polish items found during walkthrough

- ☐ "Films" → "Filters" typo on `/vendors` filter chip row
- ☐ Bio cleanup on existing chai cart rows (raw IG hashtag soup, e.g. ChiTown Chai Cart's listing)

---

## 🟢 Quality / polish (when time)

### Chai cart photos decision

12 IG-scraped chai cart vendors on prod with broken or empty photo arrays:

- 9 have empty `photos` array (never scraped successfully)
- 3 have `cdninstagram.com` URLs that returned 403 (expired)

Options when ready to onboard chai cart vendors:

- **(a)** Re-scrape via GHA workflow (~$5–10 Apify, will pull noise needing cleanup)
- **(b)** Targeted re-scrape script for just those 12 handles (~$1–2)
- **(c)** Skip — vendors upload portfolio at claim time

### UI polish (Phase I from `docs/phases.md`)

Styling, copy tightening, empty/loading/error states, mobile pass. Doesn't gate first cohort. 3–5 days when convenient.

### H+1 pre-launch maintenance (from `docs/phases.md`)

- ☐ Orphan Stripe Connect accounts cleanup pattern
- ☐ Delete remaining smoke-test data from prod
- ☐ Confirm CI E2E tests running with prod secrets

---

## 🔵 Future / deferred

### Phase J — Walk-through + punch list triage

Triggered after soft launch produces a real punch list. Screen-share through every page, triage `docs/product_notes.md` entries.

### Phase K — Vendor sourcing at scale

GTM work: outreach, partnerships, content. Out of scope until first cohort completes a full booking cycle without incident.

### Sub-project M — Exhaustive e2e tests

Cross-flow coverage beyond current per-feature specs. Not blocking launch.

### Embedded Stripe Checkout

Currently couples redirect to `checkout.stripe.com` for deposits. Could swap to embedded mode (`checkout.baazar.io` lives inside our pages). ~1 day swap, defer until signal demands it.

### Wordmark NotoNaskh font lock

The icon/OG images use system Arabic fonts via fallback. For pixel-perfect typography across all platforms, flatten the SVG `<text>` to outlines in Figma/Illustrator and re-export. Cosmetic; defer.

---

## How to use this file

When something here is done, check the box (`☐` → `☑`) or strike it through (`~~done thing~~`). When a new TODO surfaces during work, add it to the right priority bucket. Re-prioritize freely.

When a TODO graduates from "planned" to "in progress", **also create a tracked task** via the harness — this file is for context, the task list is for active work.
