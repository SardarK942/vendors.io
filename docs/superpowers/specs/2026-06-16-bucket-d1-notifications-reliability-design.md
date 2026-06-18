# Bucket D.1 — Notifications + Emails Reliability + Counter-Offer Feature

**Status:** Approved (brainstorm) · awaiting implementation plan
**Date:** 2026-06-16
**Author:** Claude (with Sardar)
**Sequencing:** Bucket D of 5 in the pre-launch redesign sweep (D → A → B → E → C). D.1 ships first; D.2 was folded back into D.1 and is no longer a separate cycle.

---

## 1. Why this exists

Four hand-curated photobooth vendors get outreach this week (Epic Events, PhotoxUSA, GLAMBOT, Chicago Photo Booth Rental — tokens expire 2026-06-23). Their first real bookings cannot land while the notification + email system silently fails. An empirical audit (this session, 2026-06-16) of the post-PR #10 codebase found:

1. **Multiple silent failure sites across four paths.** `notify*` calls wrapped in bare `void(...)` with no `.catch()` — auto-cancel, manual cancel, event-complete, and booking-complete swallow DB errors. Same shape for several `sendXEmail` calls whose `false` returns are ignored.
2. **Three notification types fire in-app but send no email** — `event_completed`, `custom_request_received`, `review_received`. The vendor never learns of a custom request or a new review by email; the couple never learns the event was marked complete.
3. **`RESEND_API_KEY` may not be set in Vercel production.** The Resend client init silently fails when the env var is missing; every `send` errors into the log unobserved.
4. **No action affordances inside notifications.** Dropdown rows are link-only. Users navigate to the booking detail page to act on every state change. High-friction during a booking lifecycle that has ~6 decision points.
5. **No counter-offer mechanism.** The booking state machine today supports only vendor-side `adjust`. The couple's only response is binary accept-or-decline. Users have repeatedly asked for a counter-offer button, and the negotiation back-and-forth must be capped so the platform doesn't become a haggling treadmill.

D.1 ships all five fixes in one cycle. The original plan to defer the couple-counter feature to a separate D.2 was dropped on 2026-06-16 — the cap notification and the counter mechanic are the same feature, and splitting them produced a "1 left" counter floating in space with no UI to act on it.

---

## 2. Scope (in / out)

### In scope

- Silent-failure removal at every `notify*` and `send*Email` call site.
- A `deliver()` helper that wraps notify + email calls, logs structured failures, and never throws.
- Three delivery-status columns on `notifications` for observability.
- Three new Resend templates: `sendEventCompletedEmail`, `sendCustomRequestEmail`, `sendReviewReceivedEmail`. Each fires to both parties where the existing notification fires to both.
- Verification (and adding if absent) of `RESEND_API_KEY` in Vercel production + DNS verification of `baazar.io` for SPF/DKIM.
- Action-button affordances inside `NotificationDropdown` and the `/dashboard/notifications` page, driven by a single `ActionMap` config, deep-linked to the existing booking-detail page with a new `?action=X` query handler that auto-opens the relevant modal.
- A new couple-counter action: schema, service method, endpoint, UI, notification, email.
- A 2-round-trip cap on counter-offers, enforced at the service layer and guarded by DB `CHECK` constraints on both sides.
- Three Playwright specs that cover the happy path, the counter-cap exhaustion, and the action-button render surface.

### Out of scope (deferred)

- Sentry / observability platform hookup.
- Per-user notification preferences (mute by type, frequency, etc.).
- Push notifications or SMS.
- Retry-with-backoff on Resend failures. Failed sends are logged with `email_status='failed'` and that's it.
- Email template visual redesign (Bucket E or later).
- Reset of counter counts on idle bookings.
- Cancellation flow UX redesign (Bucket C). D.1 only restores the silent-failure on the existing cancel path.
- A dedicated vendor "reviews" tab. The `review_received` email links to `/vendors/[slug]?tab=reviews`; if that tab doesn't already exist, this surfaces as a stub for a follow-up ticket.

---

## 3. Architecture

### 3.1 The `deliver()` helper

New file: `src/lib/notifications/deliver.ts`

```ts
type DeliverKind = 'notify' | 'email';

export async function deliver<T>(
  kind: DeliverKind,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error('delivery_failure', {
      kind,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context,
    });
    return null;
  }
}
```

Every existing `notify*` or `send*Email` call site changes from:

```ts
void notifyBookingCancelled(supabase, userId, ctx);
sendCancellationEmail(...);
```

to:

```ts
await deliver('notify', () => notifyBookingCancelled(supabase, userId, ctx), { booking_id: ctx.bookingId });
await deliver('email', () => sendCancellationEmail(...), { booking_id: ctx.bookingId });
```

The booking flow continues to succeed even if either side fails. The visibility changes from "silent" to "loud in logs."

### 3.2 `delivery_status` columns on `notifications`

Migration `00055` (named `add_notification_delivery_status.sql`) adds:

```sql
ALTER TABLE notifications
  ADD COLUMN email_status TEXT
    NOT NULL
    DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  ADD COLUMN email_error TEXT,
  ADD COLUMN email_attempted_at TIMESTAMPTZ;
```

The `deliver('email', ...)` wrapper, after the Resend call resolves, updates the corresponding notification row's `email_status` and `email_attempted_at` (and `email_error` on failure). Each notification helper that has a paired email accepts an optional `notification_id` to link the two.

The `/dashboard/notifications` page renders a small ⚠ icon on rows with `email_status = 'failed'` — visible only to the user the row belongs to (no cross-user leak).

### 3.3 No outbox table, no background worker

Deliberately out of scope. The outbox-with-retries pattern is the right answer at higher scale; at four vendors in their first booking it adds operational surface area we don't need. D.1's reliability model is "fail visibly + correctly" — failure surfaces in logs and in the row's status column. Add the outbox pattern in H+1 when real volume justifies it.

### 3.4 Counter-offer state machine

Migration `00056` (named `add_counter_offer_cap.sql`). Note that both `bookings.status` and `notifications.type` are `TEXT` with `CHECK` constraints in this codebase, not Postgres enums — so adding new values means dropping and recreating the constraint with the new values, not `ALTER TYPE`. The implementation plan must read the _current_ CHECK constraint definition (from `pg_constraint`) before regenerating it to avoid silently dropping recently-added values like `custom_request_received`.

```sql
ALTER TABLE bookings
  ADD COLUMN vendor_adjustment_count SMALLINT
    NOT NULL DEFAULT 0
    CHECK (vendor_adjustment_count BETWEEN 0 AND 2),
  ADD COLUMN couple_counter_count SMALLINT
    NOT NULL DEFAULT 0
    CHECK (couple_counter_count BETWEEN 0 AND 2);

-- Add 'couple_countered' to bookings.status CHECK constraint
ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (<current values…>, 'couple_countered'));

-- Add 'couple_countered' to notifications.type CHECK constraint
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (<current values…>, 'couple_countered'));
```

`<current values…>` is intentionally a placeholder — the implementation step reads the constraint definitions live so the migration is faithful to whatever the prod schema has accumulated since PR #10.

Also update `src/types/database.types.ts`: add `'couple_countered'` to both `NotificationType` and `BookingStatus`.

Locked state machine:

| #   | Step                          | Status                                                       | Who acts next                   |
| --- | ----------------------------- | ------------------------------------------------------------ | ------------------------------- |
| 1   | Vendor sends initial quote    | `vendor_accepted`                                            | Couple                          |
| 2   | Couple counter #1             | `couple_countered`                                           | Vendor                          |
| 3   | Vendor adjust #1              | `vendor_adjusted_quote`                                      | Couple                          |
| 4   | Couple counter #2             | `couple_countered`                                           | Vendor                          |
| 5   | Vendor adjust #2 (final)      | `vendor_adjusted_quote` (with `vendor_adjustment_count = 2`) | Couple — accept or decline only |
| 6   | Couple accepts → deposit paid | `deposit_paid` → `booking_confirmed`                         | Done                            |

Either side may accept at any earlier step to short-circuit. Cap reached on either side → the corresponding action button is disabled in the UI and the endpoint returns 409.

New service method `coupleCounterBooking()` in `src/services/booking.service.ts`, parallel shape to existing `adjustBooking()`. Increments `couple_counter_count` atomically inside the existing transaction. New endpoint `POST /api/bookings/[id]/counter` accepts `{ totalCents: number, note?: string }`. New notification type `couple_countered` (recipient: vendor). New email template `sendCoupleCounteredEmail`.

Vendor's existing adjust endpoint gains the parallel cap: rejects with `409 { code: 'adjust_cap_reached' }` when `vendor_adjustment_count >= 2`. New service-layer check + DB-level `CHECK` constraint as belt-and-suspenders.

---

## 4. Three new Resend templates

All three follow the existing `src/lib/email/` pattern: an HTML render function with the cream/ink wrapper, a `sendXEmail` export, and a `.preview.tsx` route under `app/dev/email-previews/[name]/` for visual eyeballing in development. Each fires at the existing notification trigger site, wrapped in `deliver('email', ...)`.

### 4.1 `sendEventCompletedEmail`

- **Trigger:** existing `notifyEventCompleted` call site in `src/services/payment.service.ts:895,898`.
- **Recipients:** both couple and vendor (mirrors the existing notification).
- **Subject (couple):** `Event [N] of [M] marked complete with [vendor_name]`
- **Subject (vendor):** `Event [N] of [M] marked complete with [couple_name]`
- **Body beats (couple):** Hope `[event_type_label]` was a great day. The remaining balance is owed directly to `[vendor_name]` per their payment terms — Baazar collected the deposit; the rest is between you two. Once all booked events finish, we'll send a review request.
- **Body beats (vendor):** Baazar marked `[event_type_label]` complete with `[couple_name]`. Collect the balance per your payment terms. Once all events for this booking finish, platform funds release and the couple receives a review request.
- **CTA (both):** `View booking` → `/dashboard/bookings/[id]`

The "balance is off-platform" framing is intentional. Baazar is not the payment rail for the 90% / 95% balance — only for the 10% / 5% deposit. The 3% framing is left for Bucket B copy work and is not introduced here.

### 4.2 `sendCustomRequestEmail`

- **Trigger:** existing `notifyCustomRequestReceived` call site in `src/app/api/custom-request/route.ts:68`.
- **Recipient:** vendor.
- **Subject:** `New custom request from [couple_first_name] — [event_type] on [date]`
- **Body beats:** who (first name + city only), what (event type, date, headcount, location), the couple's description (truncated to 200 chars), expectation that quotes turn around in 48h.
- **CTA:** `Send your quote` → `/dashboard/bookings/[id]`

First name only until the vendor accepts.

### 4.3 `sendReviewReceivedEmail`

- **Trigger:** existing `notifyReviewReceived` call site in `src/app/api/reviews/route.ts:55`.
- **Recipient:** vendor.
- **Subject:** `[Couple name] left you a [N]-star review`
- **Body beats:** rating rendered as `★★★★★`, first 240 chars of the review body, link to respond.
- **CTA:** `Read full review` → `/vendors/[slug]?tab=reviews` (stub link; the vendor reviews tab work is a follow-up ticket if it doesn't already exist).

### 4.4 `sendCoupleCounteredEmail` (new — paired with the counter feature)

- **Trigger:** new `notifyCoupleCountered` call site inside `coupleCounterBooking()` service method.
- **Recipient:** vendor.
- **Subject:** `[Couple name] sent a counter-offer on your quote`
- **Body beats:** couple's name, the new proposed total, optional note (truncated to 200 chars), how many adjustments the vendor still has remaining (vendor's own state — does not leak the couple's remaining counter count).
- **CTA:** `View counter-offer` → `/dashboard/bookings/[id]?action=respond-to-counter`

---

## 5. Action buttons UI

### 5.1 Data shape

New file: `src/components/notifications/actions.ts`.

```ts
import type { NotificationType, Notification } from '@/types';

export type ActionVariant = 'primary' | 'secondary' | 'destructive';

export interface ActionConfig {
  label: string;
  variant: ActionVariant;
  href: (n: Notification) => string;
}

export type ActionMap = Partial<Record<NotificationType, ActionConfig[]>>;

export const NOTIFICATION_ACTIONS: ActionMap = {
  /* see § 5.4 */
};
```

One source of truth. The card reads from the map; no per-type JSX.

### 5.2 Where actions render

- **Bell dropdown (`NotificationDropdown`).** Render only the **first** action in the array — the primary CTA. The dropdown is ~360px wide and three buttons cramp on mobile.
- **`/dashboard/notifications` page (`NotificationCard`).** Render **all** actions as a row of buttons under the body.

### 5.3 Deep-link behavior

Action `href` always constructs `/dashboard/bookings/[id]?action=X`. The booking-detail page reads `searchParams.action` server-side and auto-opens the corresponding modal. The query is one-shot — after the modal mounts, the page replaces history state to strip `?action=X` so a refresh doesn't reopen the modal.

If a modal does not yet exist for a given action, navigation lands the user on the booking page with no modal opened — degraded gracefully, no error. The implementation plan enumerates which modals already exist and which (if any) need to be wired.

Mark-read happens via the existing mutation before navigation begins. Single optimistic update.

### 5.4 Action table (final)

| Type                       | Recipient | Actions (primary, then secondary…) |
| -------------------------- | --------- | ---------------------------------- |
| `booking_request_received` | Vendor    | **Accept** · Adjust · Decline      |
| `vendor_accepted`          | Couple    | **Pay Deposit**                    |
| `vendor_adjusted_quote`    | Couple    | **Accept** · Counter · Decline     |
| `couple_countered`         | Vendor    | **Accept** · Adjust · Decline      |
| `couple_accepted_adjusted` | Vendor    | View booking                       |
| `couple_declined_adjusted` | Vendor    | View booking                       |
| `deposit_paid`             | Vendor    | View booking                       |
| `booking_confirmed`        | Couple    | View booking                       |
| `booking_auto_cancelled`   | Both      | View booking                       |
| `booking_cancelled`        | Both      | View booking                       |
| `event_completed`          | Both      | **View booking**                   |
| `booking_completed`        | Couple    | **Leave Review**                   |
| `booking_completed`        | Vendor    | View booking                       |
| `review_received`          | Vendor    | **View Review**                    |
| `custom_request_received`  | Vendor    | **Send Quote** · Decline           |

The Counter action on `vendor_adjusted_quote` is rendered only when the couple's `couple_counter_count < 2`; otherwise the Counter button is omitted entirely (not greyed). Same shape mirrors on the vendor side for `couple_countered` and Adjust.

### 5.5 Visual treatment

Brand-aligned per `docs/DESIGN.md`:

- `primary` — ink (#1B1414) background, cream text.
- `secondary` — cream background, ink border (1.5px), ink text.
- `destructive` — cream background, hot-pink (#D1006C) text, no border.

Spacing follows the existing card design tokens. Mobile dropdown stays one-action-only per § 5.2.

---

## 6. Each side sees only its own state

A locked rule across every surface in D.1: a user's notifications, cards, and dashboards expose **that user's own remaining counts only**. Never the other side's.

| Role   | Where                                  | What they see                                                                                        |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Vendor | Booking detail                         | "N adjustments remaining" next to Adjust button. Disabled at 0.                                      |
| Couple | Booking detail                         | "N counter-offers remaining" next to Counter button. Disabled at 0. Accept + Decline always visible. |
| Vendor | Notification body when couple counters | "Couple sent a counter-offer." (no remaining-count text)                                             |
| Couple | Notification body when vendor adjusts  | "Vendor sent an adjusted quote." (no remaining-count text)                                           |

API errors are symmetric: `409 adjust_cap_reached` returns only to the vendor's adjust endpoint; `409 counter_cap_reached` returns only to the couple's counter endpoint. Neither error message references the other side's state.

---

## 7. Resend production verification

Before any D.1 code ships:

1. `vercel env ls production | grep RESEND_API_KEY` — confirms the key is set. If absent: `vercel env add RESEND_API_KEY production` with the value from `.env.local`.
2. Resend dashboard → Domains → confirm `baazar.io` shows SPF + DKIM verified. If not verified, add the records to the DNS provider and wait for propagation. Without DNS verification, Resend silently 422s and `email_status` will perpetually be `'failed'`.
3. One smoke test send from prod to a Baazar throwaway address. Confirm receipt in the inbox.

These three steps are the first items in the implementation plan and the rest of D.1 does not deploy until they pass.

---

## 8. Email test surface

In tests, `src/lib/email/resend.ts` is mocked by `src/lib/email/__mocks__/resend.ts`. The mock records every send into an in-memory store accessible via `getRecordedSends()`. Tests assert against the recorded array — no real Resend calls in CI or local Playwright runs. The mock is wired through Vitest aliasing for unit tests and through a Playwright test-server flag for E2E.

In production the real client runs.

---

## 9. Playwright verification

Three specs under `tests/e2e/`:

### 9.1 `notifications-d1-happy-path.spec.ts`

End-to-end run through: couple submits request → vendor accepts → couple pays deposit (Stripe test mode) → event-completion cron fires → booking-completion cron fires → couple submits review.

After each transition the spec asserts:

1. The expected `notifications` row exists with the correct `type` and `email_status='sent'`.
2. The dropdown renders a card for the row with the expected primary action button label.
3. `getRecordedSends()` contains the expected template invocation.

### 9.2 `notifications-d1-counter-cap.spec.ts`

Walks the full six-step state machine: vendor quotes → couple counter #1 → vendor adjust #1 → couple counter #2 → vendor adjust #2 (final) → couple accepts.

Asserts:

1. After step 5 the vendor's Adjust button is disabled with helper "0 adjustments remaining" and a direct API call returns `409 { code: 'adjust_cap_reached' }`.
2. After step 4 the couple's Counter button is disabled with helper "0 counter-offers remaining" and a direct API call returns `409 { code: 'counter_cap_reached' }`.
3. No leakage: at step 3 the couple's notification body does not contain the string "remaining"; at step 4 the vendor's notification body does not contain "remaining".

### 9.3 `notifications-d1-action-buttons.spec.ts`

For each of the 13 notification types, seeds a row directly into the DB via the service-role client, signs in as the recipient role, opens the dropdown, and asserts:

1. The card renders with the expected primary action label.
2. The action button's `href` contains the expected `?action=X` query parameter.
3. Mark-read fires on click.

Pure surface check — fast, parallelizable.

### 9.4 Run command

```bash
npx playwright test tests/e2e/notifications-d1-*.spec.ts --headed --workers=1
```

`--workers=1` because the booking state machine is not safe to parallelize across the same dev database. The shared seed data plus state transitions race otherwise.

---

## 10. Migrations summary

| #     | File                                   | What it adds                                                                                                                                                   |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00055 | `add_notification_delivery_status.sql` | `email_status`, `email_error`, `email_attempted_at` on `notifications`                                                                                         |
| 00056 | `add_counter_offer_cap.sql`            | `vendor_adjustment_count`, `couple_counter_count` on `bookings`; `couple_countered` added to both `bookings.status` and `notifications.type` CHECK constraints |

Apply to dev via psql directly per the migration apply policy. Prod application waits for user authorization per the same policy.

---

## 11. Estimated effort

5–7 working days, split as:

- Day 1 — Resend prod verification + `deliver()` helper + migration 00055 + all call-site rewrites.
- Day 2 — Three email templates (event_completed, custom_request, review_received) + `.preview.tsx` routes.
- Day 3 — Action buttons (`actions.ts`, `NotificationDropdown` + `NotificationCard` changes, `?action=X` query handler on booking-detail page).
- Day 4 — Couple-counter feature: migration 00056, `coupleCounterBooking` service method, `/api/bookings/[id]/counter` endpoint, new email template, vendor + couple booking-detail UI changes.
- Day 5 — Three Playwright specs.
- Day 6–7 — Buffer for UI polish, edge cases surfaced by the specs, dev-DB cleanup.

Single squash-merge PR. The migration files are part of the PR but the prod apply is sequenced via the migration apply policy.

---

## 12. Success criteria

The bucket is done when:

1. All five silent-failure call sites are wrapped in `deliver()`.
2. The three new emails fire in the dev test surface and a manual smoke-test send from prod arrives at a throwaway address.
3. `vercel env ls production` shows `RESEND_API_KEY` and Resend shows `baazar.io` SPF + DKIM verified.
4. The 13 notification types each render the correct action button(s) in the dropdown and on `/dashboard/notifications`.
5. The full 6-step couple-counter state machine works end-to-end with caps enforced at the service, endpoint, and DB layers.
6. All three Playwright specs pass headless in CI and headed locally.
7. No user-facing UI on either side references the other side's remaining-count state.
