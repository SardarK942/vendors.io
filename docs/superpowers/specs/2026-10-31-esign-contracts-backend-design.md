# E-signature contracts (backend) — design

**Date:** 2026-10-31
**Status:** Draft for approval
**Scope:** Backend only. No frontend/in-app signing UI, no DocuSeal instance provisioning, no template authoring UI.

---

## 1. Intent & why

When a couple pays the 5% hold deposit, Baazar should automatically send a service contract between the couple and the vendor for e-signature, prefilled with the agreed price and both parties' details. Vendors who have their own contract use that; vendors who don't fall back to a Baazar boilerplate. The signed contract is a **record**, not a gate — it never blocks the booking or the existing contact-reveal.

**Why now:** Vendors have asked to get contracts signed through the app instead of chasing couples over email/DM after a booking. Automating it at deposit time means the contract goes out at the exact moment both parties are committed and contact details are already revealed.

**Tool decision (already made):** Self-hosted **DocuSeal** (open-source AGPL edition). Verified 2026-10-31 that the needed operations — create-submission-from-template, prefilled read-only fields, emailed signing, webhooks — carry **no Pro/license gate and no per-document fee** in the self-hosted OSS edition (the $0.20/doc fee applies only to DocuSeal Cloud / On-Premises Pro, and embedded/iframe signing + template-creation-by-API are the Pro-only features we deliberately avoid). See `reports/Free contract esignature integration.md`.

## 2. Goals

- On `deposit_paid`, auto-create a DocuSeal submission from the right template (vendor's own, else boilerplate), prefilled with a **read-only** agreed price, event date, and both parties' names/emails.
- Enforce **vendor signs first, couple second**.
- All participant emails sent through Baazar's existing Resend setup (branded), with direct signing links — DocuSeal's own emails disabled.
- On completion, fetch the signed PDF + certificate, store them privately, and email the signed copy to **both** parties.
- Expire an unsigned contract after **14 days**, with one reminder around day 7.
- Void/archive a live (unsigned) contract if the booking is cancelled or refunded.
- Contract state lives in its own table and never changes booking status or the critical payment path.

## 3. Non-goals / anti-goals

- **Non-goal:** Provisioning/hosting the DocuSeal instance (ops task). This code assumes a configured instance (env vars below).
- **Non-goal:** Template authoring — how a vendor's custom template gets built (admin-manual in DocuSeal's free builder now, self-serve later). This pass only stores and selects a template id.
- **Non-goal:** Any frontend — no in-app signing surface, no vendor UI to set their template id (set via admin/SQL for now).
- **Non-goal:** Embedded/iframe signing (a DocuSeal Pro feature). Email links only.
- **Anti-goal:** The contract must **never** gate the booking, block contact-reveal, or 500 the Stripe webhook. A contract failure is logged and retried out-of-band, not surfaced as a payment failure.
- **Anti-goal:** Do not overload `bookings.status` with contract states.

## 4. Constraints

- Stack: Next.js 14 App Router, Supabase (service-role client for webhooks/cron), Stripe (existing webhook infra), TypeScript (`any` forbidden, Zod on inputs), prices stored in **cents**.
- Business logic in `src/services/*.service.ts`; shared clients/pure helpers in `src/lib/`; route handlers stay thin.
- Must reuse existing patterns: `withErrorBoundary`, `createServiceRoleClient()`, `deliver()` fire-and-forget wrapper, `ServiceResult<T>`, cron `Bearer ${CRON_SECRET}` auth, migration RLS conventions.
- Budget ~$250/mo; prefer zero new paid vendors.

## 5. How it works (the decided design)

### 5.1 Trigger & hook point

The deposit transition already runs in `handlePaymentSuccess(supabase, paymentIntentId, bookingId, amount)` (`src/services/payment.service.ts` ~L97), called from the `payment_intent.succeeded` case of `src/app/api/webhooks/stripe/route.ts`. This function already flips the booking to `deposit_paid` and sets `couple_contact_revealed = true`, so couple contact is available exactly when the contract needs it.

Contract creation is appended to `handlePaymentSuccess` **wrapped in `deliver('…', …)`** so DocuSeal/Resend latency or errors can never break the Stripe webhook critical path (mirrors how existing deposit emails are fired). It is **idempotent on `booking_id`**: the create path first checks no `booking_contracts` row exists for the booking (and relies on the unique constraint as the backstop), so Stripe retries / duplicate `payment_intent.succeeded` events never create a second contract.

### 5.2 Template selection

`templateId = vendor_profiles.docuseal_template_id ?? process.env.DOCUSEAL_DEFAULT_TEMPLATE_ID`.

A new nullable `docuseal_template_id text` column on `vendor_profiles` holds a vendor's own template; empty means use the boilerplate. The template is expected (by contract, enforced out-of-band at authoring time) to contain named fields: `agreed_price`, `event_schedule`, `couple_name`, `vendor_name`, plus a signature/date field per role (roles named **`Vendor`** and **`Couple`**). (`event_schedule` is a multi-line field — see §5.3 — not a single date.) If the boilerplate env var is unset or the selected template is missing/invalid, the create path records the contract row as `failed` with an error and returns — no throw.

### 5.3 Prefill & field rules

- **Agreed price** is a **read-only** prefilled field (`readonly: true`) so neither party can edit the economically material term. Sourced from the booking's agreed total in cents (`total_price_cents`, falling back to the deposit/quote fields as the booking service exposes them) and formatted to USD at exactly one boundary: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)`. Cents stay cents everywhere else.
- **Event schedule** — a single booking at one vendor can bundle multiple functions (Mehndi, Shaadi, Walima…), each a row in `booking_events` with its own date/type/venue. The one signed contract covers the **whole engagement** and names **every function and its date**. `createForBooking` reads all `booking_events` for the booking (ordered by date) and renders a multi-line `event_schedule` value, e.g. `Mehndi — May 1, 2026\nShaadi — May 3, 2026\nWalima — May 4, 2026`. Dates formatted human-readably; the template's `event_schedule` field must accept multi-line text. A single-function booking simply yields one line.
- **Names/emails**: vendor = `vendor_profiles.business_name` + `users!user_id(email)`; couple = `users!couple_user_id(full_name/email)` with `bookings.couple_full_name/couple_email` snapshot fallback (same join the payment/booking services already use).
- All injected values validated with Zod before the DocuSeal call.

### 5.4 Signing order & our-own-email flow

DocuSeal submission created with `order: "preserved"`, Vendor as submitter `order` 1, Couple as `order` 2, and `send_email: false` (Baazar sends the emails). The create response returns each submitter's signing slug; Baazar builds the link (`${DOCUSEAL_API_URL}/s/{slug}`) and:

1. **On create** → store both slugs, email **vendor** their signing link (branded Resend). Status → `sent_vendor`.
2. **On vendor's `form.completed` webhook** (role = Vendor) → email **couple** their signing link. Status → `sent_couple`. Record `vendor_signed_at`.
3. **On `submission.completed` webhook** → fetch signed PDF + certificate, store them, email **both** parties the signed copy (as attachments). Status → `completed`. Record `couple_signed_at`, `completed_at`.

> **Build-time verification (not a blocker):** confirm that with `send_email: false` + `order: "preserved"`, the couple's signing link is inert until the vendor completes (desired). If DocuSeal lets the couple sign early regardless of order, the flow still works because we only email the couple after the vendor's `form.completed` — but this should be verified with a quick spike against the real instance before shipping.

### 5.5 Completion handling & storage

The DocuSeal completion webhook payload carries the signed document URL(s), the combined document URL, and the audit-log (certificate) URL. On `submission.completed`, the service fetches these **server-side** and stores them in a **private Supabase Storage bucket** (`contracts`) under deterministic keys `contracts/{booking_id}/signed.pdf` and `contracts/{booking_id}/certificate.pdf`. Only the storage **keys** are persisted on the row; signed download URLs are generated on demand. (We do not rely on DocuSeal-hosted URLs, whose TTL is unstated.)

> **Storage decision:** Despite earlier notes referencing Cloudflare R2, the codebase has **no R2 integration** (only Cloudflare Stream for video + UploadThing for images). Supabase Storage is already provisioned, supports private buckets with RLS, and server-side writes via the service-role client — so it's the lowest-cost, lowest-new-surface choice. R2 remains a future option if contract volume ever warrants it.

### 5.6 Webhook endpoint

New `src/app/api/webhooks/docuseal/route.ts`, structurally cloned from the Stripe route:

- `withErrorBoundary`, read **raw body** via `await request.text()` (never `request.json()` — HMAC needs exact bytes).
- **Verify the webhook's authenticity against whatever scheme the running DocuSeal instance actually produces** — this is a build-time verification, not a settled design. Self-hosted OSS DocuSeal has historically used a **user-configured secret header** (constant-time compare against `DOCUSEAL_WEBHOOK_SECRET`); some builds/docs describe a Stripe-style **HMAC-SHA256 over `${timestamp}.${rawBody}`** in an `X-Docuseal-Signature` header with skew rejection. During implementation, confirm which the instance emits and build `src/lib/docuseal/verify.ts` to match it (prefer HMAC+skew-rejection if available; otherwise a constant-time secret-header compare). Either way the helper is pure and unit-tested (known vector for HMAC; match/mismatch for secret-header). Do **not** ship an unauthenticated webhook.
- Dedup via a `docuseal_events` table (event id unique) mirroring `stripe_events`, so retried deliveries are no-ops.
- `createServiceRoleClient()`, switch on event type, delegate to `src/services/docuseal.service.ts`, return fast 200 (500 only to request a retry).
- Idempotent, **forward-only** status transitions (a late/duplicate event for an already-advanced contract is a 200 no-op).

### 5.7 State machine (own column, loosely coupled)

`booking_contracts.status`, forward-only, ranked so transitions only ever move up:

```
pending → sent_vendor → sent_couple → completed
```

Terminal (from any non-completed state): `declined`, `expired`, `voided`, `failed`.

- `pending`: row created, about to call DocuSeal.
- `sent_vendor`: vendor emailed, awaiting vendor signature.
- `sent_couple`: vendor signed, couple emailed, awaiting couple.
- `completed`: both signed, artifacts stored, copies emailed.
- `declined`: a signer declined (`form.declined`).
- `expired`: 14-day window elapsed unsigned.
- `voided`: booking cancelled/refunded before completion.
- `failed`: create-time error (DocuSeal unreachable, transient Resend/DocuSeal outage, etc.). **Automatically retried by the daily sweep** (§5.8) with a bounded attempt count and backoff; a `failed` row that exhausts retries stays `failed` for manual/alert follow-up. A permanent error (e.g. missing/invalid template, no `DOCUSEAL_DEFAULT_TEMPLATE_ID`) is recorded as `failed` with a non-retryable `error` and is **not** retried. Note: because create is idempotent on the existence of the `booking_contracts` row (§5.1), Stripe's own `payment_intent.succeeded` retries will **not** re-create a `failed` row — recovery is the sweep's job, not Stripe's.

Never writes to `bookings.status`. Transitions guarded in SQL (`UPDATE … WHERE status_rank < :new_rank`) and in the service.

### 5.8 Expiry & reminder (cron)

New daily cron `src/app/api/cron/contract-sweep/route.ts`, modeled on `shop-auto-void`:

- Pure, unit-tested selector in `src/lib/contracts/sweep.ts` picks three branches: (a) **reminder** — contracts in `sent_vendor`/`sent_couple` whose age ≥ 7 days with no reminder yet → send one branded reminder to the current signer, stamp `last_reminder_at`; (b) **expire** — contracts age ≥ 14 days still unsigned → expire; (c) **retry** — `failed` contracts whose `error` is retryable, `attempt_count` < cap (e.g. 5), and `next_retry_at` ≤ now → re-run `createForBooking`, incrementing `attempt_count` and setting the next `next_retry_at` (exponential backoff) on failure, or advancing to `sent_vendor` on success.
- Service in `docuseal.service.ts` performs the DB mutation and calls DocuSeal to **archive** the submission on expiry. `expire_at` is also set on the DocuSeal submission at creation as a backstop, and the sweep reconciles anything DocuSeal's own expiry missed (never trust a single webhook — same discipline as the Stripe reconciliation).
- `Bearer ${CRON_SECRET}` auth, `export const GET = POST`, registered in `vercel.json`.

### 5.9 Void on cancel / refund

- **Cancel:** in `cancelBooking` (`src/services/payment.service.ts`), after the status flip, if a non-terminal `booking_contracts` row exists, archive the DocuSeal submission and set status `voided` (via `deliver()` so it can't break cancellation).
- **Refund:** same, triggered from `handleChargeRefunded` in the Stripe webhook path.

### 5.10 Email changes

All new emails added to `src/lib/email/resend.tsx` in the existing inline-HTML style (`escapeHtml`, `fmtUsd`, `appUrl()`, `FOOTER`), fired through `deliver('email', …)`:

- `sendContractSigningRequestEmail(to, party, link, …)` — vendor at create, couple after vendor signs.
- `sendContractReminderEmail(to, party, link, …)` — day-7 nudge.
- `sendContractSignedCopyEmail(to, …, { signedPdf })` — on completion, **with attachment**.

The send wrapper (`sendEmail` / `sendWithRecord`) is extended to optionally forward Resend's `attachments: [{ filename, content }]`; existing callers unaffected (new optional param).

## 6. Data model (migration `00089`)

Following the `vendor_stripe_accounts` (00086) 1:1 side-table + RLS template.

- `ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS docuseal_template_id text;`
- New table `booking_contracts`:
  - `id uuid pk default gen_random_uuid()`
  - `booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE`
  - `vendor_profile_id uuid REFERENCES vendor_profiles(id)` (denormalized for vendor queries)
  - `docuseal_submission_id text` (DocuSeal submission id / external ref)
  - `template_id_used text`
  - `status text NOT NULL DEFAULT 'pending'` + `CHECK (status = ANY(ARRAY['pending','sent_vendor','sent_couple','completed','declined','expired','voided','failed']))`
  - `vendor_slug text`, `couple_slug text` (signing slugs; consider not persisting if deemed sensitive — see open question)
  - `signed_pdf_key text`, `certificate_key text` (Supabase Storage keys)
  - `vendor_signed_at`, `couple_signed_at`, `completed_at`, `expires_at`, `declined_at`, `voided_at` timestamptz
  - `last_reminder_at timestamptz`
  - `attempt_count int NOT NULL DEFAULT 0`, `next_retry_at timestamptz` (for sweep-driven retry of retryable `failed` rows — §5.8)
  - `error text` (for `failed`; a non-retryable error marker distinguishes permanent failures from transient ones)
  - `created_at`, `updated_at timestamptz default now()`
- RLS enabled: vendor reads own (`vendor_profile_id` → `auth.uid()` via vendor_profiles.user_id) and couple reads own (via booking), `service_role` FOR ALL. Writes are service-role only.
- New `docuseal_events` table mirroring `stripe_events` (`event_id` unique, `event_type`, `payload jsonb`, `handled_at`, `error`).
- Hand-patch the `Database` type in `src/types/` for the new columns/tables (per the repo's regen-pending convention).

## 7. File layout

- `src/lib/docuseal/client.ts` — fetch-based DocuSeal API client (create submission, get submission, archive), server-only env guard (mirrors `cloudflare-stream.ts`). Confirm exact endpoint shapes against the running instance.
- `src/lib/docuseal/verify.ts` — HMAC-SHA256 webhook verify helper (pure, unit-tested).
- `src/lib/contracts/sweep.ts` — pure reminder/expiry selector (unit-tested).
- `src/lib/storage/contracts-store.ts` — Supabase Storage put/get-signed-url for the private `contracts` bucket.
- `src/services/docuseal.service.ts` — `createForBooking()`, `applyWebhookEvent()`, `storeSignedArtifacts()`, `voidForBooking()`, `runSweep()`. Returns `ServiceResult<T>`.
- `src/app/api/webhooks/docuseal/route.ts` — thin: raw body → verify → dedup → delegate → 200/500.
- `src/app/api/cron/contract-sweep/route.ts` — cron guard → `runSweep()`.
- Edits: `src/services/payment.service.ts` (hook create into `handlePaymentSuccess`, void into `cancelBooking` + `handleChargeRefunded`), `src/lib/email/resend.tsx` (3 new senders + attachments param), `vercel.json` (cron schedule), `supabase/migrations/00089_*.sql`, `src/types/` (Database patch).

## 8. Env contract (new)

`DOCUSEAL_API_URL`, `DOCUSEAL_API_TOKEN`, `DOCUSEAL_WEBHOOK_SECRET`, `DOCUSEAL_DEFAULT_TEMPLATE_ID`. (Supabase + Resend + CRON_SECRET already exist. No R2 vars — using Supabase Storage.)

## 9. Testing

- Unit: webhook verify (per the scheme the instance uses — §5.6), sweep selector (day-7 reminder dedup, day-14 expiry boundaries, retryable-`failed` backoff + attempt cap), price formatting (cents→USD), `event_schedule` rendering for multi-function and single-function bookings, forward-only transition guard, template selection fallback.
- Integration/mocked: `createForBooking` idempotency on duplicate `deposit_paid`; webhook `form.completed`(vendor)→couple-email and `submission.completed`→store+both-emails; void on cancel/refund.
- Follow `agent_docs/testing.md`; add/adjust specs in the same PR; run `npm run lint` + `npm run typecheck`.

## 10. Open questions (left to the builder / flagged)

1. **Exact DocuSeal API/webhook shapes** (field for read-only prefill, submitter slug field name, completion payload keys for PDF/certificate, archive endpoint, event-type strings) must be confirmed against the running self-hosted instance / current DocuSeal docs during implementation — versions drift. Builder's call on exact field names.
2. **Order+no-email behavior** (§5.4) — spike to confirm couple link is inert pre-vendor-signature.
3. **Persisting signing slugs** — storing `vendor_slug`/`couple_slug` makes reminders a cheap DB read but they are capability URLs; alternative is to re-fetch from DocuSeal on each reminder. Builder's call unless there's a preference (default: persist, in the private service-role-only table).
4. **Price source field** — confirm the authoritative agreed-total column on `bookings` for the signed amount (`total_price_cents` vs quote/deposit fields) when wiring `createForBooking`.
