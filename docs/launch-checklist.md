# Launch checklist (Phase H external steps)

Code-only items (H1 Sentry, H2 rate limiting, H7 runbook) are already shipped
but **dormant** — they do nothing until the env vars below are set.

Walk this list top to bottom. Each item tells you (1) what to do in the
third-party UI, (2) which env vars to add to Vercel, (3) how to verify it works.

---

## H1 — Sentry (error visibility)

**Purpose:** Get paged when prod throws. Without this, errors vanish into Vercel logs.

1. Sign up at https://sentry.io (free tier is plenty).
2. Create a project → pick **Next.js** platform.
3. Copy the DSN (looks like `https://<hash>@<org>.ingest.us.sentry.io/<id>`).
4. (Optional, for source-map upload) generate an **Organization Auth Token** at `https://sentry.io/settings/account/api/auth-tokens/`.
5. Add to Vercel → Settings → Environment Variables (Production + Preview):
   ```
   NEXT_PUBLIC_SENTRY_DSN=<dsn>
   SENTRY_DSN=<same dsn>
   SENTRY_ORG=<your-org-slug>         # optional, for source-map upload
   SENTRY_PROJECT=<your-project-slug> # optional
   SENTRY_AUTH_TOKEN=<token>          # optional
   ```
6. Redeploy.
7. **Verify:** hit a route that throws (e.g. a bad request, or temporarily add `throw new Error('sentry test')` to a route, deploy, hit it, revert). The error shows up in Sentry within 60s.

Code already wired: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `next.config.mjs` wrapper, `logger.error` forwards to `captureException`.

---

## H2 — Upstash rate limiting (abuse protection)

**Purpose:** Stop one abuser from burning your OpenAI bill / flooding DB / tripping Stripe rate limits.

1. Sign up at https://upstash.com (free tier = 10k requests/day — plenty for MVP).
2. Create a **Redis** database → region closest to your Vercel deploy (usually us-east-1).
3. Copy from the database page:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Add both to Vercel env (Production + Preview) → redeploy.
5. **Verify:** `for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<base-url>/api/ai/search -H 'content-type: application/json' -d '{"query":"test"}'; done` — around the 31st iteration you should start seeing `429`.

Already wired via `checkRateLimit` in `src/lib/rate-limit.ts` (Upstash-backed; dormant until env vars set):

- `POST /api/bookings` — `booking:create` — 10/min per user
- `POST /api/bookings/[id]/cancel` — `booking:cancel` — 5/min per user
- `POST /api/ai/search` — `ai:search` — 30/min per IP (anonymous allowed)
- `POST /api/users/me/active-business` — `active-business` — 30/min per user
- `PATCH /api/booking-events/[id]/notes` — `vendor-notes` — 10/min per user

Separate Postgres-backed limiter (`src/lib/ai/rate-limit.ts`, always live — no Upstash dependency):

- `POST /api/ai/bio-assist` — 10 calls / 24 h per user, tracked in `ai_bio_assist_calls`

Separate Postgres-backed IP-hash limiter (also always live):

- `GET /api/cal/[token]` — 600 polls / hour per (vendor, IP-hash), tracked in `vendor_calendar_feed_polls`

Fail-open: if Upstash is unreachable, `checkRateLimit` allows the request through (logged to `console.error`). A rate limiter that takes the site down is worse than none.

Not yet protected — see the follow-up rate-limit sweep in the `feat/enable-rate-limiting` PR notes for the prioritized list (Phase B): public POSTs (`/api/newsletter/subscribe`, `/api/scraped-vendors/[id]/request`), auth wrappers around Supabase flows, `/api/bookings/[id]/deposit`, `/api/bookings/custom-request`, the booking state-machine POSTs, and the `/api/uploadthing` core (missing auth check).

---

## H3 — Supabase prod/dev split

**Current state:** `.env.local` points at the **prod** project (`obpdgihdskbxzgyctaib`). The dev project (`lquvhjedlzubqusnfaak`) exists but is unused.

**Purpose:** Stop testing against the DB that will hold real users' deposit money. Migrations, seed data, debug queries should all land on dev first.

1. Open `.env.local`. Swap the active `NEXT_PUBLIC_SUPABASE_URL` + keys to point at the **dev** project. Keep the prod values as commented lines for easy switching.
2. **Re-apply every migration** to the dev project: run migrations `00001` through `00013` via Supabase SQL editor (dev project) or psql.
3. Vercel env stays pointed at **prod** — production deploys hit production data. That's the split.
4. `tests/e2e/helpers/seed.ts` reads from `.env.local` → your E2E runs now hit dev, not prod. Confirm by running `npm run test:e2e` after the switch.
5. (Future) write a `scripts/reseed-dev.ts` that wipes + reseeds the dev DB for fast local iteration.

Risk: if a migration works against dev but fails against prod (data-dependent constraint, etc.), you catch it with one extra step — dev → prod promotion — rather than one destructive deploy.

---

## H4 — Stripe live mode

**Purpose:** Real money.

1. Stripe dashboard → **Activate** your account: provide EIN/SSN, bank account, business info.
2. Once activated, toggle the dashboard from **Test mode** → **Live mode**.
3. In live mode, create a new **webhook endpoint** at `https://<prod-base-url>/api/webhooks/stripe`. Subscribe to the same 4 events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `charge.refunded`.
4. Copy the new `whsec_...`.
5. Grab live-mode **Publishable** + **Secret** keys (Developers → API keys, live mode selected).
6. On Vercel (Production scope only — keep Preview on test keys):
   ```
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_... (live)
   ```
7. Redeploy prod. **Verify** by running one real booking with a real card (yours) at a small quote amount. Refund yourself after.

---

## H5 — Email domain (Phase E, deferred to here)

**Purpose:** Emails currently send from `onboarding@resend.dev` sandbox — Resend only delivers to your own account email. Real users never see your signup / quote / cancellation emails.

1. Buy a domain (Namecheap, Cloudflare, Porkbun — whoever you prefer). Assume `baazar.io` going forward.
2. Resend dashboard → **Domains → Add** → enter `baazar.io`.
3. Resend gives you DNS records: SPF (TXT), DKIM (CNAMEs × 3), DMARC (TXT). Add all of them at your DNS provider.
4. Wait for DNS to propagate + Resend to verify (usually 5–30 min).
5. Update `src/lib/email/resend.ts:4` — change `FROM_EMAIL` to `'Baazar.io <noreply@baazar.io>'` (already updated on this branch).
6. **Verify:** trigger a booking request email to a non-Resend-account address (e.g., your personal Gmail) — should deliver.

Deliverability tip: warm up the domain by sending a few emails manually before going live. A cold domain going from 0 → 500 sends in a day gets flagged.

---

## H6 — Custom domain → Vercel prod

1. Vercel → project → **Settings → Domains → Add**. Enter `baazar.io` (and optionally `www.baazar.io`).
2. Vercel shows DNS records — either an `A` to `76.76.21.21` (apex) or a `CNAME` to `cname.vercel-dns.com` (www). Add at your DNS provider.
3. Wait for Vercel to provision the cert (a few minutes).
4. Update **NEXT_PUBLIC_APP_URL** on Vercel prod to `https://baazar.io`. Redeploy.
5. Update Supabase → Authentication → URL Configuration → add `https://baazar.io` as Site URL + `https://baazar.io/api/auth/callback` as redirect URL.
6. Update the Stripe live-mode webhook URL to use the new domain.
7. **Verify:** hit https://baazar.io, confirm it renders. Sign up a fresh user, confirm email-callback redirects land on the new domain.

---

## H8 — Soft launch

Once H1–H6 are done:

1. Hand-pick **5–10 real vendors** you already know. Walk them through the claim flow personally (30 min each, on a call). Note every paper cut for Phase J.
2. Hand-pick **2–3 couples** you know are actively planning. Same: do a screen-share during their first booking.
3. Monitor Sentry + Vercel logs like a hawk for the first 2 weeks.
4. No marketing push, no paid ads, no SEO until the soft-launch cohort has been through a full booking cycle (request → quote → deposit → event → review → payout) without an incident.
5. At that point → Phase I (UI polish) + Phase K (vendor sourcing at scale).

---

## Ordering

The only hard dependencies are **H5 needs a domain** and **H6 needs a domain**. Everything else can happen in parallel. Recommended order:

1. H1 (Sentry) — 15 min, zero blockers.
2. H2 (Upstash) — 15 min, zero blockers.
3. H3 (Supabase split) — 30 min, purely local.
4. (Buy domain, wait for nameservers.)
5. H5 + H6 can run in parallel once the domain is live.
6. H4 (Stripe live) — requires business info + bank.
7. H8 (soft launch) — only after 1–6.
