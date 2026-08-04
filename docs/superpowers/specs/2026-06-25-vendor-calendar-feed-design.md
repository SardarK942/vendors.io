# Vendor Calendar Feed (External Sync) Design

**Status:** Approved (brainstorm) · awaiting implementation plan
**Date:** 2026-06-25
**Author:** Claude (with Sardar)
**Sequencing:** Vendor-facing sync of confirmed Baazar bookings into the vendor's existing calendar app (Google, Apple, Outlook, or any other app that supports calendar feed subscriptions). Builds on Sub-project G's native calendar (vendor_calendar_holds, blocks, capacity). Does NOT modify booking lifecycle, payments, or the customer-side availability widget.

---

## 1. Why this exists

Sub-project G shipped the **internal** half of the calendar problem: Baazar prevents Baazar-vs-Baazar double-booking via `vendor_calendar_holds`, vendor-defined blocks, and capacity. What's still missing is the **external** half — a way for a vendor's confirmed Baazar bookings to appear in the calendar app they actually live in day-to-day (Google Calendar, Apple Calendar, Outlook, or wedding-vertical tools like HoneyBook/Tave/Dubsado that read from Google Cal).

Two concrete vendor pains this addresses:

- **Day-of no-shows from "I forgot about that booking."** Bookings confirmed weeks ago sit only in a Baazar tab. The vendor's phone calendar — where they actually plan their day — doesn't know about them. A confirmed Baazar event in the same calendar as the vendor's lunch with their cousin closes that gap.
- **Implicit double-booking with offline pipelines.** Many vendors take bookings over WhatsApp, walk-ins, or a CRM (HoneyBook, Tave). Today, those bookings exist outside Baazar; tomorrow's Baazar request can land on the same date. Pushing Baazar bookings into the vendor's Google Calendar means any downstream tool that already syncs with Google (Calendly, Acuity, Square Appointments) sees them and blocks accordingly. The vendor's "schedule of truth" stops being two places.

We're intentionally building **push only** (Baazar → vendor's world) for v1. The reverse direction (read the vendor's external calendar so it blocks Baazar) is a materially larger project — OAuth flows, refresh-token management, polling/webhooks, conflict reconciliation against `vendor_calendar_holds` — and deferred to a v2 follow-up.

We're also deliberately using **iCalendar (.ics) feed subscriptions** rather than per-provider OAuth. The `.ics` protocol is supported universally (Google Cal, Apple Cal, Outlook, HoneyBook, Calendly, Tave, Dubsado, Notion Calendar, Yahoo, Proton, Fastmail — basically every calendar tool shipped in the last 25 years). One generation path covers the entire ecosystem; no per-provider integration code; no auth tokens to rotate. The trade-off is polling latency (calendar apps refresh feeds every ~1-24h), which is acceptable for confirmed bookings days/weeks out.

---

## 2. Scope (in / out)

### In scope

**Server: per-vendor signed `.ics` feed endpoint**

- Public unauthenticated `GET /api/cal/[token].ics` route serving an RFC 5545 iCalendar feed of the vendor's confirmed bookings.
- Per-vendor secret token stored on `vendor_profiles` (new column). The token IS the auth — knowing it grants read access to that one vendor's booking calendar.
- Feed contents: every `booking_event` belonging to bookings in locking statuses (`accepted`, `adjusted_quote_sent`, `adjusted_quote_declined`, `deposit_paid`, `completed`) — matching Sub-project G's existing "locking" definition.
- Each event includes: title (`[Baazar] {package name} — {couple last name}`), `DTSTART`/`DTEND` in the vendor's timezone, full description (couple name, phone, venue, package, deposit status, deep-link back to Baazar), `LOCATION` (event venue), `STATUS` (`CONFIRMED` for paid, `TENTATIVE` for accepted-but-deposit-pending), `URL` (deep-link), stable `UID`.
- `Content-Type: text/calendar; charset=utf-8`. `Cache-Control: private, max-age=3600`. Sets a few `X-WR-*` and `REFRESH-INTERVAL` hints recognized by Google Cal / Apple Cal / Outlook.
- 404 if token unknown. Rotation overwrites the token in-place, so an old URL naturally becomes a 404 (the row no longer holds that token value).
- Logs `User-Agent` of every poll (parsed to a recognized provider where possible) into a new `vendor_calendar_feed_polls` table — this is the verification mechanism (see §3.3).

**Server: connection/verification state**

- Three lifecycle states on `vendor_profiles`: `not_connected`, `pending`, `connected`. Transitions:
  - `not_connected → pending` when the vendor clicks any "Open ↗" deep-link button OR copies the URL via the Other-app section (we record their intent client-side and POST to `/api/vendor-calendar/feed/intent`).
  - `pending → connected` automatically when the feed endpoint first sees a recognized calendar-app `User-Agent` poll for that vendor's token.
  - Either → `not_connected` when the vendor clicks Disconnect (clears intent state; existing polls keep working unless they also Rotate).
- Rotating the URL: regenerates `calendar_feed_token`, invalidates the old one (404 on next poll), resets state to `not_connected`. Vendor re-runs the flow.

**Server: feed-generation service**

- New `src/services/calendar-feed.service.ts`:
  - `getOrCreateFeedToken(vendorProfileId)` → generates 16-byte URL-safe random token on first call, stores on `vendor_profiles`.
  - `rotateFeedToken(vendorProfileId)` → regenerates, invalidates polls table.
  - `buildIcsForVendor(vendorProfileId, options?)` → SELECT booking_events JOIN bookings WHERE vendor_profile_id = ? AND status IN (locking set), emit RFC 5545 text. Includes deduplication of multiple events that share a parent booking.
  - `recordPoll({ vendorProfileId, userAgent, ipHash })` → INSERT into `vendor_calendar_feed_polls`. If this is the first poll for this vendor, flip connection state to `connected` and record `connected_via_ua`, `connected_at`.

**UI: dashboard sync card (`/dashboard/profile/calendar`)**

- New "📲 See Baazar bookings in your calendar app" card placed **above** the existing Sub-project G `BlockDateForm` and `CapacityField` cards on the same page.
- Three visual states: `not_connected`, `pending`, `connected` — each with different content (see §4).
- Primary CTA in `not_connected`: ink-filled button labeled **"Choose your calendar app →"** that opens the connection modal.
- Mini-icon teaser row above the CTA: Google Calendar + Apple Calendar + Outlook brand SVGs (inline, ~22px) plus the line "Google · Apple · Outlook · and any app that supports calendar feeds."
- `connected` state shows the recognized provider, first-detected sync time, last poll time, total polls in 24h, and three actions: `Copy feed URL`, `Rotate URL`, `Disconnect`.

**UI: connection modal**

- Triggered by the CTA on the sync card AND by the optional dashboard nudge (see below) AND by the post-first-booking contextual prompt.
- Title: **"Choose your calendar app"**. Lede: "Tap your calendar — we'll open it and pre-fill the subscription. No password sharing, no app to install."
- Three primary provider rows with real brand SVGs and "Open ↗" affordance:
  - **Google Calendar** → opens `https://calendar.google.com/calendar/u/0/r?cid={url-encoded-feed-url}` in a new tab.
  - **Apple Calendar (iPhone / Mac)** → opens `webcal://{host}/api/cal/{token}.ics` (the `webcal://` scheme triggers iOS/macOS Calendar's subscribe sheet).
  - **Outlook (Microsoft 365 / Outlook.com)** → opens `https://outlook.live.com/calendar/0/addfromweb?url={url-encoded-feed-url}&name=Baazar%20Bookings`.
- "Other calendar app" section: the raw `.ics` URL in a monospace box with a `Copy` button, plus the line "Works with HoneyBook, Calendly, Tave, Notion, Yahoo, Proton, and any app that supports calendar feeds."
- Clicking any provider row OR the Copy button POSTs `/api/vendor-calendar/feed/intent` with the chosen method, transitioning state to `pending`, then closes the modal.

**UI: dashboard nudge banner (dashboard home only)**

- Renders on `/dashboard` (vendor home) for vendors whose state is `not_connected` AND `calendar_feed_nudge_dismissed_at IS NULL`.
- One-line teaser card: "📅 Connect your calendar — show Baazar bookings in Google, Apple, or Outlook automatically." Two actions: `Connect` (opens connection modal) and `Maybe later` (sets `calendar_feed_nudge_dismissed_at = now()`, never shows again).

**UI: post-first-booking contextual prompt**

- After a vendor's first confirmed booking transitions to a locking status, render an inline contextual card on `/dashboard/bookings/[id]` (top of page, below the existing confirmation banner): "Want this on your phone calendar? Connect Google, Apple, or Outlook in one tap. [Connect calendar] [Dismiss]".
- "First booking" = `first_action_completed_at` columns on `vendor_profiles` already track this kind of milestone (existing infra from migration 00063); add a new `first_confirmed_booking_at` column populated by an AFTER UPDATE trigger when the booking moves into a locking status for the first time.
- Dismiss sets `calendar_feed_nudge_dismissed_at`. No re-show.

### Out of scope (deferred to follow-ups)

- **Pull direction (read vendor's external calendar into Baazar holds)** — needs OAuth + per-provider integrations + reconciliation against `vendor_calendar_holds`. Separate sub-project; revisit once we have signal real vendors want it.
- **Onboarding wizard step** — explicitly NOT adding a 7th step. Calendar sync is contextual to bookings, not signup. Discovery happens on the dashboard nudge + post-first-booking prompt instead.
- **Native HoneyBook / Calendly / Tave / Dubsado integrations** — they all already sync with Google Calendar in both directions, so a vendor who connects Baazar to Google Cal gets transitive coverage in those tools for free. Direct integrations only if vendor demand for offline-or-vertical-only flows shows up.
- **Real-time webhook push** — Google and Microsoft both offer webhook-based "push notification" calendar APIs. Out of scope; not worth the OAuth complexity for sub-day latency that no one's asked for.
- **Multi-vendor unified feed** (one URL covering all of a multi-business vendor account's profiles) — Sub-project I supports multi-business accounts. v1 is per-profile feed only. Multi-profile aggregation is a clean follow-up.
- **Vendor-side editing of synced events** — calendar subscriptions are read-only by design; if a vendor moves the event in Google Cal, it doesn't write back to Baazar. We don't try to make this work — Baazar stays the source of truth.
- **Mobile push notifications** — separate concern, addressed by the notifications system (Sub-project F + Bucket D1).
- **Customer-side `.ics` feed of the customer's confirmed bookings** — symmetric feature for couples. Possibly v2; out of scope for this spec.

---

## 3. Architecture details

### 3.1 Data model

**Migration `00064_vendor_calendar_feed.sql`** adds:

```sql
ALTER TABLE vendor_profiles
  ADD COLUMN calendar_feed_token text UNIQUE,
  ADD COLUMN calendar_feed_state text NOT NULL DEFAULT 'not_connected'
    CHECK (calendar_feed_state IN ('not_connected', 'pending', 'connected')),
  ADD COLUMN calendar_feed_intent_at timestamptz,
  ADD COLUMN calendar_feed_intent_method text,        -- 'google' | 'apple' | 'outlook' | 'copy'
  ADD COLUMN calendar_feed_connected_at timestamptz,
  ADD COLUMN calendar_feed_connected_via_ua text,     -- 'Google-Calendar-Importer' | 'iCal/*' | etc.
  ADD COLUMN calendar_feed_nudge_dismissed_at timestamptz,
  ADD COLUMN first_confirmed_booking_at timestamptz;

-- UNIQUE above already creates the index; rotation invalidates by overwriting in-place
-- (old token disappears from the table, so lookups return 404 naturally).

CREATE TABLE vendor_calendar_feed_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  polled_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  recognized_provider text,  -- 'google' | 'apple' | 'outlook' | 'other' | null
  ip_hash text,              -- sha256(ip || daily_salt), for rate-limiting only
  status_returned smallint NOT NULL DEFAULT 200
);
CREATE INDEX vendor_calendar_feed_polls_vendor_idx
  ON vendor_calendar_feed_polls (vendor_profile_id, polled_at DESC);

-- Backfill first_confirmed_booking_at for any vendor with existing confirmed bookings
UPDATE vendor_profiles vp
SET first_confirmed_booking_at = sub.first_at
FROM (
  SELECT b.vendor_profile_id, MIN(b.accepted_at) AS first_at
  FROM bookings b
  WHERE b.status IN ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined',
                     'deposit_paid', 'completed')
    AND b.accepted_at IS NOT NULL
  GROUP BY b.vendor_profile_id
) sub
WHERE vp.id = sub.vendor_profile_id;

-- Trigger: maintain first_confirmed_booking_at going forward
CREATE OR REPLACE FUNCTION sync_first_confirmed_booking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined',
                    'deposit_paid', 'completed')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('accepted', 'adjusted_quote_sent',
                                                    'adjusted_quote_declined',
                                                    'deposit_paid', 'completed')) THEN
    UPDATE vendor_profiles
    SET first_confirmed_booking_at = COALESCE(first_confirmed_booking_at, now())
    WHERE id = NEW.vendor_profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_first_confirmed_trigger
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION sync_first_confirmed_booking();
```

**RLS:** No new RLS policies needed.

- `vendor_calendar_feed_polls` is service-role-only (vendors don't directly query their poll history; the dashboard reads via service-role API endpoints).
- The new columns on `vendor_profiles` inherit the existing per-vendor RLS — vendors see their own row, public reads still don't expose these columns (existing policy already restricts to public-safe columns).

### 3.2 API surface

All endpoints live under `/api/vendor-calendar/feed/*` to align with the existing Sub-project G `/api/vendor-calendar/*` namespace.

| Method | Path                                      | Auth                     | Purpose                                                                                                                                                                                                                                                                                                      |
| ------ | ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/cal/[token].ics`                    | none (token is the auth) | Public ICS feed. Records poll. Returns 404 if token not found (covers both never-issued and post-rotation tokens).                                                                                                                                                                                           |
| GET    | `/api/vendor-calendar/feed/status`        | vendor session           | Returns current state: `{ state, intent_method, connected_at, connected_via_ua, last_poll_at, polls_24h, feed_url }`. Used by the dashboard card to render the right state.                                                                                                                                  |
| POST   | `/api/vendor-calendar/feed/intent`        | vendor session           | Body: `{ method: 'google' \| 'apple' \| 'outlook' \| 'copy' }`. Generates feed token if missing, transitions state to `pending`, records intent method + timestamp. Idempotent. Returns `{ feed_url, state: 'pending' }`.                                                                                    |
| POST   | `/api/vendor-calendar/feed/rotate`        | vendor session           | Regenerates token (invalidates old), resets state to `not_connected`. Returns `{ feed_url, state: 'not_connected' }`.                                                                                                                                                                                        |
| POST   | `/api/vendor-calendar/feed/disconnect`    | vendor session           | Sets `calendar_feed_state = 'not_connected'`, clears intent/connected fields. Does NOT rotate the token (old subscriptions in vendor's calendar app keep polling and getting 404 if they want a hard cut, or 200 if they don't — vendor chooses to Rotate separately). Returns `{ state: 'not_connected' }`. |
| POST   | `/api/vendor-calendar/feed/dismiss-nudge` | vendor session           | Sets `calendar_feed_nudge_dismissed_at = now()`. Dashboard nudge banner stops rendering.                                                                                                                                                                                                                     |

**Why disconnect ≠ rotate:** Two distinct user intents.

- "I want to stop using this" (disconnect): clears our state for UI purposes; doesn't necessarily invalidate the URL. Lower-stakes operation; no need to re-subscribe in their calendar app if they come back.
- "I think my URL leaked, kill it now" (rotate): generates a new token, old URL goes to 404. Forces re-subscribe.

Bundled together, "disconnect" would be more destructive than vendors expect. Keeping them separate matches GitHub-style "deauthorize app" vs "regenerate token" affordances.

### 3.3 Verification mechanism (the "did it work?" trick)

The honest problem: when a vendor clicks "Open in Google Calendar," we hand them off to Google. We don't get a callback. Without OAuth there's no token exchange to confirm subscription success. Showing "Connected!" optimistically would lie.

The solution: **the calendar app's first poll IS the confirmation.** Every calendar app polls `.ics` subscriptions periodically, and each sends a recognizable `User-Agent` header:

| Provider                    | User-Agent (observed)                                          |
| --------------------------- | -------------------------------------------------------------- |
| Google Calendar             | `Google-Calendar-Importer`                                     |
| Apple Calendar (macOS)      | `iCal/* CalendarAgent/*`                                       |
| Apple Calendar (iOS)        | `iOS/* CalendarFramework/*`                                    |
| Outlook (web)               | `Microsoft Outlook Calendar` (varies)                          |
| Outlook (desktop)           | `MSOutlook/*`                                                  |
| HoneyBook / Calendly / Tave | their own UAs, fall through to `recognized_provider = 'other'` |

`recordPoll()` parses the UA against a small allowlist. On the first poll for a vendor in `pending` state:

1. Insert poll row.
2. `UPDATE vendor_profiles SET calendar_feed_state = 'connected', calendar_feed_connected_at = now(), calendar_feed_connected_via_ua = $1 WHERE id = $2 AND calendar_feed_state = 'pending'` — the `WHERE` guards against double-transition under concurrent polls.
3. Subsequent polls just append to the polls table; no state change.

**Latency reality:** Google polls fresh subscriptions immediately (~30s-2min for the first poll after subscribe), then settles into ~12h cadence. Apple Calendar polls within minutes of subscribing, then ~hourly. Outlook ~3-12h. So the `pending → connected` flip is usually within a couple of minutes for Google/Apple, occasionally up to an hour for Outlook. The dashboard card's `pending` copy explicitly tells the vendor this so it doesn't feel broken.

### 3.4 ICS generation

`buildIcsForVendor(vendorProfileId)`:

1. Load the vendor profile: timezone (from `vendor_profiles.timezone`, fall back to America/Chicago), business name, account email.
2. SELECT booking events with parent booking:
   ```sql
   SELECT be.id, be.event_start_time, be.event_end_time, be.event_type,
          be.venue_name, be.venue_address,
          b.id AS booking_id, b.status, b.deposit_status,
          b.couple_user_id,
          u.full_name AS couple_name, u.phone AS couple_phone,
          p.name AS package_name, p.duration_minutes
     FROM booking_events be
     JOIN bookings b ON b.id = be.booking_id
     JOIN users u ON u.id = b.couple_user_id
     LEFT JOIN packages p ON p.id = b.package_id
    WHERE b.vendor_profile_id = $1
      AND b.status IN ('accepted','adjusted_quote_sent','adjusted_quote_declined',
                       'deposit_paid','completed')
      AND be.event_start_time >= now() - interval '60 days'  -- include recently-past for context
      AND be.event_start_time <= now() + interval '730 days'
    ORDER BY be.event_start_time;
   ```
3. For each row, emit a `VEVENT` block:
   - `UID:booking-event-{be.id}@baazar.io` — stable across regenerations.
   - `DTSTAMP:<now in UTC>`
   - `DTSTART;TZID={vendor.tz}:<event_start_time>` / `DTEND;TZID={vendor.tz}:<event_end_time>`
   - `SUMMARY:[Baazar] {package_name or event_type} — {couple_last_name}`
   - `DESCRIPTION:` multi-line (`\n` escaped per RFC 5545) — couple name, phone, package, deposit status, dashboard link.
   - `LOCATION:{venue_name}, {venue_address}` (RFC-escape commas + backslashes)
   - `STATUS:CONFIRMED` if `deposit_paid` or `completed`; `TENTATIVE` otherwise.
   - `TRANSP:OPAQUE` (mark vendor as busy).
   - `URL:https://baazar.io/dashboard/bookings/{booking_id}`
   - `CATEGORIES:Baazar,Booking`
4. Wrap in `BEGIN:VCALENDAR` / `END:VCALENDAR` with `VERSION:2.0`, `PRODID:-//Baazar//Vendor Calendar Feed//EN`, `METHOD:PUBLISH`, `X-WR-CALNAME:Baazar Bookings — {business_name}`, `X-WR-TIMEZONE:{vendor.tz}`, `REFRESH-INTERVAL;VALUE=DURATION:PT12H`, `X-PUBLISHED-TTL:PT12H`.
5. Line endings are CRLF per RFC 5545. Lines > 75 octets are folded with `\r\n ` continuation.

**Library:** use `ics` npm package (~10kB, well-maintained) for generation. We escape & fold via the library; we don't hand-roll line folding. If the library is unsuitable on inspection, fall back to a small in-repo `buildVCalendar()` helper — the format is simple enough.

### 3.5 Rate limiting

Calendar apps poll, and a malicious actor with a leaked token could thrash the endpoint. Two layers:

- **Per-token soft cap**: 60 polls per hour (logged but served). Anything over logs a warn-level event.
- **Per-IP hard cap** (using `ip_hash`): 600 polls per hour across all tokens. Returns 429 over the limit.

Both implemented via a simple sliding-window count from `vendor_calendar_feed_polls` (we already have the data). No new infrastructure.

### 3.6 Security & privacy

- **Token format**: 16 bytes from `crypto.randomBytes`, URL-safe base64 (22 chars). 128 bits of entropy — unguessable.
- **Token is the only auth**. The URL must be treated like a password. Never log the full URL in app logs. Never echo it in emails, only in the dashboard UI behind the vendor's session.
- **DESCRIPTION includes couple phone numbers.** If a vendor leaks their feed URL, those phone numbers leak too. The dashboard explicitly tells vendors this: "This URL contains your booking details. If anyone else gets it, they can see your bookings. Use Rotate URL if you suspect it leaked."
- **No CORS on the feed endpoint** — calendar apps don't make CORS requests; serving `Access-Control-Allow-Origin: *` would be a tiny scope expansion with no benefit, so we omit it.
- **No referer leak**: the feed URL is only displayed inside the vendor's own dashboard.
- **Rotate URL** is the kill switch. Encourage its use after any suspected leak. Vendor flow: copy new URL, re-subscribe in calendar app (the app keeps the old subscription too — vendor manually deletes the old one).
- **Disconnect does NOT revoke the token** by design (see §3.2). If a vendor wants both, they hit Rotate then Disconnect (or just Rotate — same effective result for our state machine).

### 3.7 Component structure

New files:

```
src/services/calendar-feed.service.ts         (~180 lines)
  - getOrCreateFeedToken(vendorProfileId)
  - rotateFeedToken(vendorProfileId)
  - buildIcsForVendor(vendorProfileId): string
  - recordPoll({ vendorProfileId, userAgent, ip }): void
  - parseUserAgent(ua): { recognized_provider, normalized_name }
  - getFeedStatus(vendorProfileId): FeedStatus

src/app/api/cal/[token]/route.ts              (~80 lines)
  - GET handler: lookup vendor by token, build ICS, record poll, return 200 with text/calendar
  - 404 for missing token (covers post-rotation), 429 on rate limit

src/app/api/vendor-calendar/feed/intent/route.ts        (~40 lines)
src/app/api/vendor-calendar/feed/status/route.ts        (~30 lines)
src/app/api/vendor-calendar/feed/rotate/route.ts        (~30 lines)
src/app/api/vendor-calendar/feed/disconnect/route.ts    (~25 lines)
src/app/api/vendor-calendar/feed/dismiss-nudge/route.ts (~20 lines)

src/components/dashboard/calendar/
  ExternalCalendarSyncCard.tsx       (~220 lines)  — the new card, 3 states
  ConnectCalendarModal.tsx           (~180 lines)  — provider chooser
  CalendarProviderIcons.tsx          (~120 lines)  — inline SVGs (Google / Apple / Outlook)
  DashboardCalendarNudge.tsx         (~80 lines)   — dismissible banner on /dashboard
  PostFirstBookingPrompt.tsx         (~70 lines)   — inline prompt on /dashboard/bookings/[id]

src/lib/calendar-feed/
  ua-patterns.ts                     (~60 lines)   — User-Agent → provider mapping
  deep-links.ts                      (~30 lines)   — buildGoogleSubscribeUrl / buildAppleWebcalUrl / buildOutlookSubscribeUrl
```

The dashboard card is mounted at the top of the existing `/dashboard/profile/calendar` page (`src/app/dashboard/profile/calendar/page.tsx`), above the existing `<BlockDateForm>` and `<CapacityField>` cards from Sub-project G. The dashboard nudge is mounted in `src/app/dashboard/page.tsx`. The post-first-booking prompt mounts in `src/app/dashboard/bookings/[id]/page.tsx`, conditioned on the trigger described in §3.1.

### 3.8 Status freshness on the dashboard

The dashboard card needs to flip from `pending` to `connected` in roughly real time when the calendar app polls. Three options considered:

- **Server-Sent Events / WebSockets**: lowest latency, highest complexity. Overkill for this — vendor doesn't stare at this card waiting for state.
- **Poll-on-page-load only**: simple, but vendor sees stale `pending` for a full page reload.
- **Poll every 10s while card is in `pending`, stop polling once `connected`** (recommended): the card's React component runs a `useInterval(10_000, while: state === 'pending')` that hits `/api/vendor-calendar/feed/status`. Stops on tab blur. Stops permanently on `connected`. Worst-case ~6 polls/min/active-vendor on a niche page. Trivial load.

We can also push via Supabase Realtime later if it becomes painful; not for v1.

### 3.9 Test coverage

- **Unit tests** for `calendar-feed.service.ts`: token generation/uniqueness, UA parsing across 8+ real UA strings, ICS escaping (commas, backslashes, multi-line descriptions, line folding > 75 octets), date handling across the 60-day-past / 730-day-future window, status mapping (`accepted` → TENTATIVE, `deposit_paid` → CONFIRMED).
- **API tests** for each route: feed serving (200 vs 404 vs 429), intent → pending transition, first-poll → connected transition, rotate invalidating old token, disconnect resetting state.
- **Integration test** (skipped in CI per existing infra): real Postgres, simulate the full lifecycle including the trigger-driven `first_confirmed_booking_at` backfill on a status change.
- **E2E test** (skipped in CI per existing infra): vendor visits `/dashboard/profile/calendar`, clicks Choose your calendar app, picks Google, modal closes, status pill shows Pending. Simulate a fetch from a `Google-Calendar-Importer` UA against the feed endpoint, then reload — status flips to Connected.
- **No browser-real test of the actual Google/Apple/Outlook deep-link** — those require live OAuth-side accounts; we trust the documented URL formats and add a console-noted "TODO: human smoke-test once" before launch.

---

## 4. UI states

Each state's content as it renders inside the card. (Brand icons shown as `🟦/⬜/🟦` placeholders; real component uses inline SVGs from `CalendarProviderIcons.tsx`.)

### 4.1 `not_connected`

```
┌─ 📲 See Baazar bookings in your calendar app  [Not connected] ─┐
│ Every confirmed Baazar booking will appear automatically in     │
│ your existing calendar app — no double-entry, no password       │
│ sharing. Subscribe once; new bookings flow in forever.          │
│                                                                  │
│ 🟦 ⬜ 🟦  Google · Apple · Outlook · and any app that supports │
│           calendar feeds                                         │
│                                                                  │
│ [ Choose your calendar app  → ]                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 `pending`

```
┌─ 📲 See Baazar bookings in your calendar app  [Pending] ───────┐
│ Pending verification…                                            │
│ We've opened {Google Calendar/Apple Calendar/Outlook} in a new   │
│ tab. Once you confirm the subscription, your calendar app will  │
│ poll our feed within a few minutes and we'll mark this as       │
│ connected automatically.                                         │
│                                                                  │
│ Your private feed URL (paste manually if needed):               │
│ [ https://baazar.io/cal/k3n9zx4q…ics ]  [ Copy ]                │
│                                                                  │
│ [ Cancel — disconnect ]                                         │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 `connected`

```
┌─ 📲 See Baazar bookings in your calendar app  [Connected] ─────┐
│ ✓ Connected via Google Calendar                                  │
│   First detected sync: 2 hours ago · Last poll: 8 minutes ago   │
│   23 confirmed bookings published to your calendar.             │
│                                                                  │
│ ┌─────────────┬─────────────┬─────────────┐                     │
│ │ User-Agent  │ Polls (24h) │ Avg interval│                     │
│ │ Google-Cal- │     2       │    ~12h     │                     │
│ │  Importer   │             │             │                     │
│ └─────────────┴─────────────┴─────────────┘                     │
│                                                                  │
│ [ Copy feed URL ]  [ Rotate URL ]  [ Disconnect ]               │
│                                                                  │
│  💡 How we know it's working: your calendar app fetched our     │
│     feed and identified itself in its User-Agent header. No     │
│     OAuth, no password — the request itself is the proof.       │
└──────────────────────────────────────────────────────────────────┘
```

### 4.4 Connection modal (triggered from any state's Connect/Choose action)

```
┌──── Choose your calendar app ────────────────────────────  [✕] ┐
│ Tap your calendar — we'll open it and pre-fill the              │
│ subscription. No password sharing, no app to install.           │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ 🟦  Google Calendar                          Open ↗      │    │
│ │     Most popular. One tap to subscribe.                  │    │
│ └──────────────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ ⬜  Apple Calendar  · iPhone, iPad, Mac      Open ↗      │    │
│ │     Opens the Calendar app to confirm.                   │    │
│ └──────────────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ 🟦  Outlook  · Microsoft 365, Outlook.com    Open ↗      │    │
│ │     Subscribes via Outlook's calendar add-by-URL.        │    │
│ └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│ ─────────── OTHER CALENDAR APP ───────────────────────────────  │
│                                                                  │
│ Copy this private URL and paste it into your calendar app's     │
│ "Subscribe to calendar" or "Add by URL" setting:                │
│ [ https://baazar.io/cal/k3n9zx4q…ics ]   [ Copy ]               │
│                                                                  │
│ Works with HoneyBook, Calendly, Tave, Notion, Yahoo, Proton,    │
│ and any app that supports calendar feeds.                       │
└──────────────────────────────────────────────────────────────────┘
```

### 4.5 Dashboard nudge (on `/dashboard` only, while `not_connected` and not dismissed)

```
┌─ 📅 Connect your calendar ───────────────────────────────────┐
│ Show Baazar bookings in Google, Apple, or Outlook            │
│ automatically.                                                 │
│         [ Connect ]   [ Maybe later ]                         │
└────────────────────────────────────────────────────────────────┘
```

### 4.6 Post-first-booking prompt (on `/dashboard/bookings/[id]` for first locked booking)

```
┌─ ✓ Booking confirmed — Sharma wedding ─────────────────────┐
│   Want this on your phone calendar? Connect Google, Apple,  │
│   or Outlook in one tap.                                    │
│         [ Connect calendar ]   [ Dismiss ]                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Behavior edge cases

- **Vendor on multi-business account (Sub-project I)**: each `vendor_profiles` row has its own token. Switching the active profile in the existing switcher pill reveals that profile's sync card. v1 doesn't offer one unified feed; we may add this if vendors ask.
- **Vendor lowers `concurrent_capacity` below current overlap count** (existing G edge case): unrelated to feed. Synced events are descriptive, not capacity-aware.
- **Booking cancelled after being in the feed**: next regeneration omits it. Calendar apps poll on their own schedule (~12h) and detect deletion via missing UID. Vendor's app removes the event automatically.
- **Vendor changes their account email**: no impact — feed token is independent of email; ICS includes email only as `ORGANIZER` informational.
- **Vendor's timezone changes**: ICS regenerates per-poll, so DTSTART/DTEND in the new timezone takes effect on the next poll. Calendar apps recompute display.
- **Soft-deleted vendor profile**: feed returns 404 (the lookup query filters out soft-deleted rows). Polls table CASCADE-deletes with the vendor profile.
- **`webcal://` deep-link fails on a vendor's machine** (rare — e.g., older Windows + Apple Calendar not installed): they fall back to copying the URL from the Other-app section, which is always visible in the modal.
- **Vendor copies URL but never subscribes anywhere**: state stays `pending` forever. The card's pending copy explains this so it doesn't feel broken; vendor can hit Cancel to reset.
- **Feed polled before first booking**: ICS still returns a valid empty `VCALENDAR` (no `VEVENT`s). Calendar apps show an empty subscribed calendar — fine.

---

## 6. Risks & mitigations

| Risk                                                                                                                | Likelihood             | Impact     | Mitigation                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendor leaks feed URL → exposes booking PII                                                                         | Low                    | Medium     | Token is 128-bit random; explicit warning copy; one-click Rotate URL.                                                                                                                                                                                                                                            |
| Calendar app's User-Agent isn't in our allowlist → forever-`pending`                                                | Medium                 | Low        | Allowlist is permissive (any UA matching `Importer`, `iCal`, `CalendarAgent`, `Calendar`, `Outlook`, or `caldav` is recognized); falls back to "recognized_provider = other" which still triggers `connected`. Manual override fallback: if 3+ polls happen with unrecognized UA within 24h, treat as connected. |
| ICS rendering bug exposes secrets in DESCRIPTION (e.g., service-role API key)                                       | Low                    | High       | Service computes ICS from a tightly-scoped SELECT; no env access in the template; unit tests assert no `service_role` / `sk_live` / Bearer-token-shaped strings ever appear in output.                                                                                                                           |
| `Google-Calendar-Importer` UA spoofed by malicious actor with leaked token to flip vendor's UI state to "connected" | Low                    | Negligible | The state flip is purely cosmetic — it doesn't grant any new access. The leaked-token risk dominates the spoof concern.                                                                                                                                                                                          |
| Feed endpoint becomes hot path under traffic                                                                        | Low (we're pre-launch) | Medium     | `Cache-Control: private, max-age=3600` on the response. Per-IP rate limit. The SELECT is well-indexed on `vendor_profile_id`.                                                                                                                                                                                    |
| Vendor confused by latency between subscribing and "Connected" appearing                                            | Medium                 | Low        | Pending copy explicitly says "within a few minutes" and explains the polling model. Dashboard card auto-refreshes every 10s while in pending.                                                                                                                                                                    |
| Google / Apple / Outlook change their subscribe URL formats                                                         | Low                    | Medium     | Deep-link builders live in one file (`src/lib/calendar-feed/deep-links.ts`); update there if formats change. Copy-URL fallback always works regardless.                                                                                                                                                          |

---

## 7. Migration & rollout

- **Migration `00064_vendor_calendar_feed.sql`**: applied to dev by Claude, applied to prod by Sardar per existing policy. No data backfill needed beyond `first_confirmed_booking_at`.
- **Feature flag**: none. Feature is opt-in by vendor click. The presence of the new card is the rollout signal.
- **Pre-launch smoke test (human, one-time)**: subscribe a real test feed in real Google Cal, real Apple Cal, and real Outlook accounts. Confirm events appear; confirm the dashboard flips to Connected; record the actual UAs and add to the allowlist if any are missing.
- **Post-launch monitoring**: weekly check of `vendor_calendar_feed_polls` for anomalies (unrecognized UAs, sudden spike in 429s, vendors stuck in `pending`).

---

## 8. Open questions

None blocking implementation. Possible future considerations (NOT in scope):

- Should the customer also get a per-couple `.ics` feed of their confirmed bookings? Symmetric feature; revisit after vendor side ships.
- Should we add a "connected via" badge on the public vendor profile ("Calendar synced ✓") as a soft trust signal? Probably not — overstates what's actually happening. Skip.
- Vendor's email integration (sending the feed URL to their email for easier paste into Outlook on desktop): convenience, defer.

---

## 9. Definition of done

- Migration 00064 applied to prod.
- New card visible on `/dashboard/profile/calendar` for all vendors, in the right state per their data.
- New nudge visible on `/dashboard` for `not_connected` vendors who haven't dismissed.
- Post-first-booking prompt renders on the first-locked booking's detail page.
- Connection modal opens, all three deep-links open the respective subscribe sheets in fresh browsers.
- Subscribed feed in Google Cal / Apple Cal / Outlook shows correct events with correct times in vendor TZ.
- State flips from `pending` to `connected` automatically after the first recognized poll.
- Rotate URL invalidates the old URL (404).
- Disconnect resets state without changing the token.
- Unit + API tests all green; integration + E2E tests pass locally with `.env.local`.
- No `service_role` / Stripe secret string ever appears in ICS output (unit-asserted).
- Memory updated with shipped state once merged to main.
