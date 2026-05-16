# Sub-project F: Notifications + email P0 verification — Design Spec

- **Date**: 2026-05-16
- **Branch (when started)**: `feat/sub-project-f-notifications`
- **Status**: Pending user review
- **Origin**: Punch-list item #1 + the unverified email P0 carrying since Phase H

---

## 0. Executive summary

Add **in-app notifications** for both vendors and couples covering all booking lifecycle events. Bell icon with unread badge in the top nav, click-through dropdown showing the 10 most recent, and a dedicated `/dashboard/notifications` page for full history + mark-all-read.

In-app becomes the **primary channel for users currently in the app**; existing email sends remain in place as the "not online" backup. Same trigger sites — both fire on each event, no removals.

Delivery uses **Supabase realtime** (existing infrastructure, free on our tier): server inserts into `notifications` table on event → client subscribes via `supabase-js` realtime → bell badge updates live without polling.

Side-quest: verify the email P0 (carried from Phase H) is actually delivering on prod by spot-checking Resend logs + adding Sentry coverage on `sendEmail` failures.

**SMS / Twilio integration is explicitly deferred** to a future sub-project. See §9.

This sub-project is independent — depends only on the schema landed by A + A-cleanup. Can be implemented in parallel with any other Wave 2/3 sub-project.

---

## 1. Scope & success criteria

### In scope

- **Schema**: new `notifications` table + RLS policies + indexes
- **Service**: `createNotification()` helper + per-type factory helpers
- **Trigger wire-up**: 11 booking-lifecycle events fire both email (existing) AND a notification row
- **UI**: bell icon component (subscribes to realtime, displays badge), dropdown showing 10 most recent, `/dashboard/notifications` full-history page with filters + mark-all-read
- **Email P0 verification**: confirm A4's email sends actually arrive in prod via Resend logs spot-check; promote silent `sendEmail` failures to `logger.error` for Sentry capture if A4 didn't already

### Out of scope (other sub-projects / future)

| Concern | Where |
|---|---|
| SMS / Twilio | **Parking lot — future sub-project (§9)**. 10DLC compliance + opt-in consent flows + per-message cost not justified yet. Reserved for ONE critical use case where email/in-app is too slow. |
| Notification preferences UI (per-type opt-out) | Deferred to v1.5. Once real vendors complain we'll know which types matter. |
| Mobile push notifications | Future. Requires PWA install + Web Push API + service worker. |
| Email digest / batching | Future optimization. Send per-event for now. |
| Admin-broadcast notifications (marketing, system messages) | Out of scope; this sub-project covers transactional/lifecycle only. |

### Acceptance criteria

1. New vendor signs up, couple submits a booking → vendor's bell shows red badge within ~1s; clicking opens dropdown with "New booking request from [couple] for [package]"
2. Vendor accepts the booking → couple's bell badge updates live within ~1s (same browser tab open in incognito)
3. `/dashboard/notifications` lists all the user's notifications, ordered newest first, with "Unread" filter chip
4. "Mark all read" button clears the bell badge to 0
5. RLS verified: User A cannot SELECT or UPDATE User B's notifications via service-role-key-less query
6. Existing email sends still fire alongside (no removals)
7. Resend dashboard shows successful sends for the smoke-test flow (or, if not, we have a clear ticket to fix)
8. Lint + typecheck clean; new unit tests cover the `createNotification` service and the bell-component realtime subscription edge cases (initial load, new arrival, mark-read)

---

## 2. Data model

### 2.1 `notifications` table

```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'booking_request_received',     -- → vendor
    'vendor_accepted',              -- → couple
    'vendor_adjusted_quote',        -- → couple
    'couple_accepted_adjusted',     -- → vendor
    'couple_declined_adjusted',     -- → vendor
    'deposit_paid',                 -- → vendor
    'booking_confirmed',            -- → couple
    'booking_auto_cancelled',       -- → both (different rows)
    'booking_cancelled',            -- → both (different rows)
    'event_completed',              -- → both (per-event progress: "Mehndi complete")
    'booking_completed',            -- → both (all events done; triggers review prompt)
    'review_received'               -- → vendor
  )),
  title text NOT NULL,              -- short, e.g. "New booking request"
  body text NOT NULL,               -- one-line context, e.g. "From John & Jane for Wedding Photography"
  link text,                        -- internal URL, e.g. /dashboard/bookings/<id>
  metadata jsonb NOT NULL DEFAULT '{}',  -- {booking_id, package_name, amount_cents, ...}
  read_at timestamptz,              -- NULL = unread
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_recent_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
```

### 2.2 RLS

```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users mark own notifications read" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT is service-role only; no policy for authenticated. Notifications are
-- always created server-side as a side effect of state transitions.
```

### 2.3 Realtime publication

```sql
-- Enable realtime broadcasts for the notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

The client subscribes with a `user_id` filter so users only receive their own row events:
```typescript
supabase.channel('notifications')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
    handler
  )
  .subscribe();
```

---

## 3. Trigger wire-up

Every site in `src/services/` that currently fires an email gets a parallel `createNotification()` call. The new notifications service exposes typed helpers per event so call sites don't manually compose `title`/`body`/`link`/`metadata`.

### 3.1 New service: `src/services/notifications.service.ts`

```typescript
type NotificationType = /* the 11 types from §2.1 */;

interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(
  supabase: SupabaseClient<Database>,
  input: CreateNotificationInput
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert(input)
    .select('id')
    .single();
  if (error) {
    logger.error('createNotification failed', error, { type: input.type, user_id: input.user_id });
    return null;
  }
  return data;
}

// Typed factory helpers — one per notification type. These compose the right
// title/body/link from the booking context.

export async function notifyBookingRequestReceived(
  supabase, vendorUserId, { bookingId, coupleName, packageName, totalCents }
) { /* ... */ }

export async function notifyVendorAccepted(
  supabase, coupleUserId, { bookingId, vendorName, totalCents, depositCheckoutUrl }
) { /* ... */ }

// ... 9 more typed helpers, one per type
```

### 3.2 Trigger sites

| Event | Service / Route | Notification helper to add |
|---|---|---|
| Couple submits booking | `src/services/booking.service.ts` `createBooking()` | `notifyBookingRequestReceived(vendor.user_id)` |
| Vendor accepts | `src/services/booking.service.ts` `acceptBooking()` | `notifyVendorAccepted(couple.user_id)` |
| Vendor adjusts quote | `src/services/booking.service.ts` `adjustBookingQuote()` | `notifyVendorAdjustedQuote(couple.user_id)` |
| Couple accepts adjusted | `src/services/booking.service.ts` `coupleAcceptAdjusted()` | `notifyCoupleAcceptedAdjusted(vendor.user_id)` |
| Couple declines adjusted | `src/services/booking.service.ts` `coupleDeclineAdjusted()` | `notifyCoupleDeclinedAdjusted(vendor.user_id)` |
| Deposit paid (Stripe webhook) | `src/services/payment.service.ts` `handlePaymentSuccess()` | `notifyDepositPaid(vendor.user_id)` + `notifyBookingConfirmed(couple.user_id)` |
| 72h auto-cancel | `src/services/booking.service.ts` `autoCancelExpiredBookings()` | `notifyBookingAutoCancelled(couple.user_id)` + same for vendor |
| Manual cancel | `src/services/payment.service.ts` `cancelBooking()` | `notifyBookingCancelled(otherParty)` |
| Per-event completed | `src/services/payment.service.ts` `autoCompleteBookings()` | `notifyEventCompleted(couple.user_id)` + same for vendor; one row per event |
| Booking fully completed | `src/services/payment.service.ts` `autoCompleteBookings()` (when last event flips parent to status='completed') | `notifyBookingCompleted(couple.user_id)` + same for vendor; triggers review prompt link |
| Review received | `src/services/booking.service.ts` `submitReview()` (or wherever reviews are written) | `notifyReviewReceived(vendor.user_id)` |

All `notifyXxx()` calls are **fire-and-forget** — they don't block the parent transaction. If the notification insert fails, the booking transition still succeeds; the failure is captured by `logger.error` (Sentry).

### 3.3 Email coexistence

Existing email sends in `src/lib/email/resend.ts` are **not touched**. Each trigger site calls both `sendXxxEmail()` and `notifyXxx()` side-by-side. Future v1.5 work may consolidate or gate via preferences.

---

## 4. UX

### 4.1 Bell icon component

**File**: `src/components/notifications/NotificationBell.tsx` (new, client component)

Renders in the existing top nav (likely in `src/components/layout/Navbar.tsx` or wherever the header is) for authenticated users.

```
[ 🔔 ]   ← bell SVG
   [3]   ← red badge with count (hidden when 0 unread)
```

States:
- 0 unread → just the bell, no badge
- 1–9 unread → small red circle with the count
- 10+ unread → red circle with "9+"

Click → opens dropdown (4.2). Re-click or click-outside → closes.

Subscribes via supabase-js realtime on mount:
- Initial fetch: `SELECT * FROM notifications WHERE user_id = me ORDER BY created_at DESC LIMIT 10`
- Realtime: on `INSERT` event for our user_id → prepend to local state, increment unread count, optional toast
- On `UPDATE` event (read_at flip) → update local state

### 4.2 Bell dropdown

**File**: `src/components/notifications/NotificationDropdown.tsx`

Layout:
```
┌─────────────────────────────┐
│ Notifications  [Mark all]   │
├─────────────────────────────┤
│ 🎯  New booking request     │
│     From John & Jane for…   │
│     2 minutes ago           │
├─────────────────────────────┤
│ 💰  Deposit paid             │
│     Smith Wedding · $720    │
│     1 hour ago              │
├─────────────────────────────┤
│ … 8 more rows               │
├─────────────────────────────┤
│ See all →                   │
└─────────────────────────────┘
```

Per-row:
- Icon by `type` (emoji or lucide icon)
- Title (bold if unread, regular if read)
- Body (muted, 1 line, truncated)
- Time-ago (e.g. "2m", "1h", "3d") in small muted text
- Click → navigate to `link`, mark this row read via `PATCH /api/notifications/[id]/read`

If 0 notifications ever: empty state "No notifications yet."

### 4.3 `/dashboard/notifications` page (Airbnb-style)

**File**: `src/app/dashboard/notifications/page.tsx` (new server component)

Server-fetches the user's notifications (RLS scoped). Three-tab layout with per-booking grouping inside each tab — matches how vendors mentally organize their work (by booking, not by timestamp).

**Top tabs:**

```
[ Action needed (3) ]  [ Updates (8) ]  [ Archived ]                [Mark all read]
```

- **Action needed** — unread notifications of `high-priority` types (the same 5 that fire toasts; see §4.6). These require vendor or couple input.
- **Updates** — informational notifications (`event_completed`, `booking_completed`, `review_received`, `vendor_accepted`, `couple_accepted_adjusted`, `booking_auto_cancelled`, `booking_cancelled`). Unread first within the tab, then read.
- **Archived** — read notifications older than 30 days. (Auto-archived; no manual archive in v1.)

**Per-booking grouping inside each tab:**

Notifications are grouped by `metadata.booking_id`. Each group renders as a collapsible card with the booking's summary in the header:

```
┌────────────────────────────────────────────────────┐
│ Smith Wedding · Aug 15                       ▾    │
│ ──────────────────────────────────────────────────│
│ 🎯 New booking request · 2h ago                    │
│    From John & Jane — Full Wedding Coverage $2,400 │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Anderson Engagement · Sep 12                 ▾    │
│ ──────────────────────────────────────────────────│
│ 💵 Couple declined your $1,700 quote · 5h ago      │
│    Re-quote within 72h or it auto-cancels          │
└────────────────────────────────────────────────────┘
```

Group header: booking package + first event date. Click row → navigate to `link` (booking detail) + mark this notification read. Click group header → collapse/expand. Group sorted by most-recent-notification-within first.

Notifications without a `booking_id` (e.g., future system-broadcast types) render at the bottom of each tab in a separate "Other" group.

**Mark-all-read** (top-right) → `POST /api/notifications/mark-all-read`. Optimistic update: clear unread counts client-side immediately, then await server.

**Pagination**: 50 notifications per tab initially; "Load more" footer button fetches the next 50. (Infinite scroll deferred; simpler to reason about.)

Empty state per tab:
- Action needed: "Nothing needs your attention right now. 🎉"
- Updates: "When bookings move through their lifecycle, you'll see updates here."
- Archived: "Notifications older than 30 days appear here once you've read them."

### 4.6 Toast strategy — smart hybrid

Toasts (slide-in popups, ~5s auto-dismiss) fire for **high-priority** types only. Routine informational types update the bell badge silently — important so a vendor with many bookings doesn't get interrupted every time a non-actionable update lands.

**Toast on arrival (5 types):**
- `booking_request_received` — vendor must respond
- `deposit_paid` — money has moved, booking is locked in
- `vendor_adjusted_quote` — couple must accept/decline
- `couple_declined_adjusted` — vendor must re-quote within 72h
- `booking_confirmed` — couple's deposit succeeded, address now visible

**Silent (bell badge only — 7 types):**
- `vendor_accepted` — couple already gets the deposit-link prompt UI, toast is duplicative
- `couple_accepted_adjusted` — informational, deposit prompt is the action
- `event_completed` — per-event progress; nice-to-know
- `booking_completed` — final completion; review prompt fires via a different mechanism
- `booking_auto_cancelled` — already a quiet bookkeeping signal
- `booking_cancelled` — manual cancel by other party, informational
- `review_received` — vendor will see it next time they're on the bookings page

**Implementation note:** the realtime handler in `NotificationBell` checks `type` against the high-priority set; if matched, calls `toast.success()` from `sonner` (already in the codebase) with `notification.title` + `notification.body`. Click on toast → navigate to `notification.link` + mark read.

Toasts are NOT shown for notifications fetched on page load — only for those arriving live via the realtime subscription. (Prevents "10 old notifications all toasting at once" on tab open.)

### 4.4 API routes

| Route | Purpose |
|---|---|
| `PATCH /api/notifications/[id]/read` | Mark single notification read. RLS enforces ownership. |
| `POST /api/notifications/mark-all-read` | Mark all the user's unread notifications read in one UPDATE. |

No `GET` route needed — the bell + page query Supabase directly via RLS-scoped client.

### 4.5 Real-time subscription edge cases

- **Tab reopened** after server-restart: bell re-subscribes on mount; any notifications missed during disconnect appear via the initial fetch.
- **Multiple tabs**: each tab subscribes independently. Marking read in tab A → realtime UPDATE flows to tab B → tab B's badge decrements live.
- **Subscription failure**: bell falls back to polling every 60s. Caller can `setInterval` if `subscribe()` returns an error status.

---

## 5. Email P0 verification (side-quest)

Carrying since Phase H — uncertain whether `sendEmail` actually delivers in prod or silently fails.

### 5.1 Audit

- Read Resend dashboard logs (`https://resend.com/emails`) for the last 7 days. Look for: zero sends (silent failure), high bounce rate (domain issue), high failed-delivery rate (env-var or template issue).
- Verify `RESEND_API_KEY` is set in Vercel prod env.
- Verify `baazar.io` domain status in Resend → Domains is **Verified** (DKIM + SPF + DMARC all green).

### 5.2 Code hardening

- Confirm A4's `logger.error` promotion on `sendEmail` failures is complete (read `src/lib/email/resend.ts`). If any `console.error` remains in error paths, replace with `logger.error` so Sentry catches it.
- Add a `health` indicator in `/api/health` that pings Resend's API (e.g., `GET /v1/domains`) and reports `{ resend: 'ok' | 'failing' }`.

### 5.3 Smoke test

Trigger one booking-request email manually (via the live prod app or a service-role insert) and confirm it lands in the Resend Email log AND in the recipient's inbox. If yes, close the P0 silently. If no, log a ticket with the specific failure mode (delivery? auth? template?) and either fix in this sub-project (if small) or split out as F-P0-fix.

---

## 6. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Service layer (booking.service.ts, payment.service.ts)          │
│                                                                  │
│  On state transition:                                            │
│    1. UPDATE bookings (existing)                                 │
│    2. INSERT notifications (NEW — fire-and-forget)               │
│    3. await sendXxxEmail() (existing — fire-and-forget)          │
└────────────────────┬────────────────────────────────────────────┘
                     │ INSERT
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ notifications table (Postgres)                                   │
│   - RLS: user_id = auth.uid()                                    │
│   - In supabase_realtime publication                             │
└────────────────────┬────────────────────────────────────────────┘
                     │ realtime change events
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client: NotificationBell (top nav, every authenticated route)   │
│                                                                  │
│  useEffect: supabase.channel().on('postgres_changes', ...)       │
│    → setState(prepend notification, increment unreadCount)       │
│  Click bell → open dropdown                                      │
│  Click row → router.push(link) + PATCH /read                     │
└──────────────────────────────────────────────────────────────────┘
```

Email channel runs orthogonally (same trigger sites, separate provider). The two channels do not coordinate; users may see both for the same event during v1.

---

## 7. Phasing

| Phase | Work | Est. |
|---|---|---|
| **F1. Schema + service** | `notifications` table, RLS, realtime publication; `notifications.service.ts` with `createNotification` + 11 typed helpers; unit tests | 2h |
| **F2. Trigger wire-up** | Add `notifyXxx()` calls to every service that currently sends an email (~10 trigger sites) | 3–4h |
| **F3. Bell + dropdown** | `NotificationBell`, `NotificationDropdown`; realtime subscription; mark-read on click; nav placement | 3–4h |
| **F4. Dedicated page** | `/dashboard/notifications` with filter chips, infinite scroll, mark-all-read button + route | 2–3h |
| **F5. Email P0 verify** | Resend log audit + Sentry capture verification + health check addition | 1h |

**Total: 11–14h.** F1 is the only sequential gate; F2/F3/F4/F5 can run in parallel after F1.

---

## 8. Defaults locked

| Area | Default |
|---|---|
| Audiences | Both vendors and couples — symmetric |
| Surfaces | Bell + dropdown (10 most recent) + `/dashboard/notifications` page |
| Delivery | Supabase realtime subscription, no polling |
| Storage | Single polymorphic `notifications` table with type enum + jsonb metadata |
| Read tracking | `read_at timestamptz` on the row (no separate join table) |
| In-app + email overlap | Both fire for every event in v1; no preferences UI; deferred to v1.5 |
| Trigger count | 11 booking-lifecycle notification types (no marketing, system, admin) |
| Toast on new arrival | Smart hybrid — toast for 5 high-priority types (see §4.6); silent bell-badge-only for the other 7 informational types. Toasts only fire for realtime arrivals, not initial page-load fetch. |
| Mark-read pattern | Single row: PATCH on click. Bulk: POST /mark-all-read. No "mark unread" affordance in v1. |
| `/dashboard/notifications` layout | Airbnb-style: 3 top tabs (`Action needed` / `Updates` / `Archived` (read + >30d old)). Within each tab, notifications grouped by `metadata.booking_id` (collapsible cards). 50 per tab initially, "Load more" pagination. |

---

## 9. Twilio / SMS — future sub-project

Explicitly deferred. When we revisit:

- **Use case**: ONE critical, time-sensitive event where email/in-app is too slow. Likely candidate: "Your booking is auto-cancelling in 2 hours." Generic state-change SMS is noise.
- **Provider**: Twilio Programmatic Messaging. Alternative: Resend's upcoming SMS, Postmark (no SMS), AWS SNS.
- **Costs**: ~$0.008/msg outbound US, ~$1/mo per phone number. Negligible for the proposed scope (one event type, ~few sends per user per year).
- **Compliance**: US 10DLC requires brand + campaign registration ($4 one-time brand fee + $10/mo campaign + $2 vetting). Required before any business-volume SMS.
- **Opt-in**: TCPA requires explicit consent. Vendor signup flow would need an SMS-opt-in checkbox + clear "MSG&DATA rates apply" disclosure.
- **Implementation surface**: a new `sendSms()` helper in `src/lib/sms/twilio.ts`, mirroring the `sendEmail` pattern. Triggered alongside email + notification on the chosen events. New env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- **Add a `users.sms_opt_in boolean` + `users.phone_e164 text`**: collect at signup, verify via Twilio Verify (one OTP round-trip) to confirm phone ownership.

When the demand surfaces, this gets its own brainstorm → spec → plan. Not in F.

---

## 10. API contracts

### 10.1 `PATCH /api/notifications/[id]/read`

Request: `{}`

Server:
1. `requireUser()` — gets caller's user_id.
2. UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $caller.
3. RLS enforces ownership; 0 rows updated → 404.

Response (200): `{ data: { id, read_at } }`

### 10.2 `POST /api/notifications/mark-all-read`

Request: `{}`

Server:
1. `requireUser()`.
2. UPDATE notifications SET read_at = NOW() WHERE user_id = $caller AND read_at IS NULL.

Response (200): `{ data: { marked_count: integer } }`

---

## 11. Testing strategy

### Unit (vitest)

- `createNotification` happy path: returns id, inserts row.
- `createNotification` failure: returns null, logs error, doesn't throw.
- Each typed helper composes correct title/body/link/metadata.
- RLS: SELECT scoped to user_id (mock the supabase client to assert filters).

### Component tests (where useful)

- NotificationBell badge renders correct count from initial fetch.
- NotificationBell prepends incoming realtime row.
- NotificationDropdown click → calls mark-read API + navigates to link.

### E2E (Playwright, add to `happy-path.spec.ts` or a new `notifications.spec.ts`)

Either add a 5th test to `happy-path.spec.ts` or create `tests/e2e/notifications.spec.ts`:

- Seed couple + vendor + package
- Couple POSTs a booking via API
- Switch to vendor session → expect a notification row in DB for vendor user
- Vendor's dashboard renders the bell with badge=1
- Click bell → dropdown shows "New booking request"
- Click row → navigates to booking detail + notification is read

Realtime aspect is hard to assert reliably in E2E (timing); cover the initial-fetch path and accept that realtime is harder to test directly.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Notification fatigue** for vendors with many bookings | Industry benchmark says 4–7 per booking is normal. Single-row dropdown shows only 10 most recent, infinite scroll on full page absorbs more. Preferences UI in v1.5 once real signals exist. |
| **Realtime delivery silent failure** (subscription drops, user misses event) | Bell falls back to polling every 60s on subscription error. Initial fetch on tab focus catches anything missed. |
| **Database growth** (notifications never deleted) | Add a future cron to delete read notifications older than 90 days. Not in F1 scope; track in roadmap. |
| **Realtime row insert visible cross-tenant** | RLS + realtime filter both enforce user_id matching. Defense in depth; verify in tests. |
| **Email + in-app showing the same event twice for active vendors** | Acceptable for v1. Preferences UI in v1.5 lets users dial back email if they're satisfied with in-app. |

---

## 13. Migrations

### 13.1 Migration 00030 — `notifications` table + RLS + realtime

```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'booking_request_received','vendor_accepted','vendor_adjusted_quote',
    'couple_accepted_adjusted','couple_declined_adjusted','deposit_paid',
    'booking_confirmed','booking_auto_cancelled','booking_cancelled',
    'event_completed','booking_completed','review_received'
  )),
  title text NOT NULL,
  body text NOT NULL,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_recent_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users mark own notifications read" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

One migration only. Standalone — no dependencies on legacy column drops.

---

## 14. Glossary

- **Notification** — a single row in the `notifications` table, owned by one user, representing one event the user should know about.
- **Bell** — the icon in the top nav showing unread count.
- **Dropdown** — the floating panel that opens on bell click, listing 10 most recent.
- **Mark-read** — set `read_at = NOW()` on a notification. Toggleable to unread is **out of scope** in v1.
- **Type** — one of 11 enumerated notification kinds; determines icon, title pattern, and which audience receives it.
- **Realtime channel** — supabase-js subscription to Postgres logical replication, scoped via `filter: user_id=eq.<userId>`.
