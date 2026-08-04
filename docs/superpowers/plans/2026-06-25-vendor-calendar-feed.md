# Vendor Calendar Feed (External Sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-vendor signed `.ics` calendar feed that pushes Baazar booking events into Google Calendar, Apple Calendar, Outlook, or any calendar app — verified automatically via User-Agent on first poll, surfaced through a dashboard card + dashboard nudge + post-first-booking prompt.

**Architecture:** Push-only via the iCalendar (RFC 5545) standard. One Next.js route emits ICS text, with auth via a 128-bit token in the URL path. A new `vendor_calendar_feed_polls` table records every poll's `User-Agent`; the first recognized poll flips the vendor's `calendar_feed_state` from `pending` to `connected`. UI lives at `/dashboard/profile/calendar` (sync card) plus dismissible banners on `/dashboard` (nudge) and `/dashboard/bookings/[id]` (post-first-booking).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind CSS, Vitest (unit/API), Playwright (E2E), `ics` npm package for RFC 5545 emission.

## Global Constraints

- Spec authority: `docs/superpowers/specs/2026-06-25-vendor-calendar-feed-design.md` — refer to this for any case not explicitly covered here.
- Migration number: `00064` (next sequential after `00063_first_action_tracking.sql`).
- Brand palette tokens (from `DESIGN.md`, locked 2026-05-22): cream `#F5EFE6`, ink `#1A1A1A`, indigo `#3F3D8E`, hot pink `#E91E63`, haldi yellow `#F2C94C`. **Primary CTAs use ink, never pink. Yellow appears max 2 places per page.**
- Typography: `font-display` (Spectral on Day-1 fonts; Gambarino on v2) for titles; `font-sans` (Schibsted Grotesk → Apparat) for body. Already defined in `tailwind.config.ts`.
- Locking-status set (matches Sub-project G): `accepted`, `adjusted_quote_sent`, `adjusted_quote_declined`, `deposit_paid`, `completed`. Any reference to "confirmed booking" means a booking in one of these.
- Vendor dashboard pages are under `src/app/dashboard/**`. Server components are the default; only mark `'use client'` when needed (hooks, browser APIs).
- Supabase access: use `createServiceRoleClient()` from `src/lib/supabase/server.ts` for the public `.ics` route (it bypasses RLS to read by token); use `createServerSupabaseClient()` for vendor-session routes.
- Git workflow (locked rule, see memory): NEVER commit directly to main. The branch `docs/vendor-calendar-feed-design` already exists with the spec — implementation work goes on a new branch `feat/vendor-calendar-feed`, branched off main.
- ALL new files end with a newline. Use Prettier defaults (already enforced by lint-staged).
- Tests: place under `src/__tests__/**` mirroring source layout (e.g., `src/__tests__/services/calendar-feed.service.test.ts`). Use the `mockSupabase` factory pattern from `availability.service.test.ts` for service tests.
- Do NOT add an onboarding wizard step. Discovery happens via dashboard nudge and post-first-booking prompt only.

---

## File Structure

**Create:**

```
supabase/migrations/00064_vendor_calendar_feed.sql

src/lib/calendar-feed/
  ua-patterns.ts                       # User-Agent → provider mapping (pure)
  deep-links.ts                        # buildGoogle/Apple/OutlookSubscribeUrl (pure)

src/services/
  calendar-feed.service.ts             # token CRUD, ICS building, recordPoll, getFeedStatus

src/app/api/cal/[token]/
  route.ts                             # public GET /api/cal/[token].ics

src/app/api/vendor-calendar/feed/
  status/route.ts                      # GET state
  intent/route.ts                      # POST — flip to pending
  rotate/route.ts                      # POST — regen token
  disconnect/route.ts                  # POST — reset state, keep token
  dismiss-nudge/route.ts               # POST — hide dashboard banner

src/components/dashboard/calendar/
  CalendarProviderIcons.tsx            # inline brand SVGs (Google/Apple/Outlook)
  ConnectCalendarModal.tsx             # provider chooser
  ExternalCalendarSyncCard.tsx         # 3-state card on /dashboard/profile/calendar
  DashboardCalendarNudge.tsx           # dismissible banner on /dashboard
  PostFirstBookingPrompt.tsx           # inline prompt on /dashboard/bookings/[id]

src/__tests__/lib/calendar-feed/
  ua-patterns.test.ts
  deep-links.test.ts

src/__tests__/services/
  calendar-feed.service.test.ts

src/__tests__/api/
  cal-token.test.ts                    # public feed
  vendor-calendar-feed-routes.test.ts  # 5 vendor-session routes

e2e/vendor-calendar-feed.spec.ts       # Playwright, skipped in CI
```

**Modify:**

```
src/app/dashboard/profile/calendar/page.tsx   # mount ExternalCalendarSyncCard above existing G cards
src/app/dashboard/page.tsx                    # mount DashboardCalendarNudge
src/app/dashboard/bookings/[id]/page.tsx      # mount PostFirstBookingPrompt
package.json                                   # add `ics` dependency
```

---

## Tasks

### Task 1: Migration 00064 — schema for token, state, polls table, first-confirmed-booking trigger

**Files:**

- Create: `supabase/migrations/00064_vendor_calendar_feed.sql`

**Interfaces:**

- Produces: `vendor_profiles.calendar_feed_token`, `vendor_profiles.calendar_feed_state` (`'not_connected' | 'pending' | 'connected'`), `vendor_profiles.calendar_feed_intent_at`, `vendor_profiles.calendar_feed_intent_method`, `vendor_profiles.calendar_feed_connected_at`, `vendor_profiles.calendar_feed_connected_via_ua`, `vendor_profiles.calendar_feed_nudge_dismissed_at`, `vendor_profiles.first_confirmed_booking_at`. New table `vendor_calendar_feed_polls(id, vendor_profile_id, polled_at, user_agent, recognized_provider, ip_hash, status_returned)`. Trigger `bookings_first_confirmed_trigger` on bookings.

- [ ] **Step 1: Create branch off main**

```bash
git checkout main
git pull
git checkout -b feat/vendor-calendar-feed
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/00064_vendor_calendar_feed.sql` with the full body from spec §3.1 (reproduced here verbatim):

```sql
-- vendor_profiles new columns
ALTER TABLE vendor_profiles
  ADD COLUMN calendar_feed_token text UNIQUE,
  ADD COLUMN calendar_feed_state text NOT NULL DEFAULT 'not_connected'
    CHECK (calendar_feed_state IN ('not_connected', 'pending', 'connected')),
  ADD COLUMN calendar_feed_intent_at timestamptz,
  ADD COLUMN calendar_feed_intent_method text,
  ADD COLUMN calendar_feed_connected_at timestamptz,
  ADD COLUMN calendar_feed_connected_via_ua text,
  ADD COLUMN calendar_feed_nudge_dismissed_at timestamptz,
  ADD COLUMN first_confirmed_booking_at timestamptz;

-- polls table (service-role-only — no RLS policy needed)
CREATE TABLE vendor_calendar_feed_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  polled_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  recognized_provider text,
  ip_hash text,
  status_returned smallint NOT NULL DEFAULT 200
);
CREATE INDEX vendor_calendar_feed_polls_vendor_idx
  ON vendor_calendar_feed_polls (vendor_profile_id, polled_at DESC);

ALTER TABLE vendor_calendar_feed_polls ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies for non-service-role; service-role bypasses RLS.

-- Backfill first_confirmed_booking_at for vendors with existing confirmed bookings
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

-- Trigger function: maintain first_confirmed_booking_at on status transitions
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

- [ ] **Step 3: Apply to dev**

Per `migration_apply_policy.md` memory, Claude applies dev migrations via psql directly:

```bash
psql "$DEV_DATABASE_URL" -f supabase/migrations/00064_vendor_calendar_feed.sql
```

Expected: `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `UPDATE n`, `CREATE FUNCTION`, `CREATE TRIGGER` — no errors.

- [ ] **Step 4: Verify schema in dev**

```bash
psql "$DEV_DATABASE_URL" -c "\d vendor_profiles" | grep calendar_feed
psql "$DEV_DATABASE_URL" -c "\d vendor_calendar_feed_polls"
```

Expected: 8 new columns on `vendor_profiles` (`calendar_feed_token`, `calendar_feed_state`, `calendar_feed_intent_at`, `calendar_feed_intent_method`, `calendar_feed_connected_at`, `calendar_feed_connected_via_ua`, `calendar_feed_nudge_dismissed_at`, `first_confirmed_booking_at`). Table `vendor_calendar_feed_polls` exists with the 7 columns described.

- [ ] **Step 5: Smoke-test the trigger**

```bash
psql "$DEV_DATABASE_URL" -c "
  WITH any_vendor AS (SELECT id FROM vendor_profiles LIMIT 1)
  SELECT id, first_confirmed_booking_at FROM vendor_profiles WHERE id = (SELECT id FROM any_vendor);
"
```

Expected: a row returned (either with `first_confirmed_booking_at` populated from backfill or `NULL`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00064_vendor_calendar_feed.sql
git commit -m "feat(db): migration 00064 — calendar feed token, state, polls table

Adds calendar_feed_{token,state,intent_*,connected_*,nudge_dismissed_at}
to vendor_profiles plus first_confirmed_booking_at. Creates polls log
table (service-role only). Trigger populates first_confirmed_booking_at
on status transitions into the locking set."
```

---

### Task 2: User-Agent → provider mapping helper (TDD)

**Files:**

- Create: `src/lib/calendar-feed/ua-patterns.ts`
- Test: `src/__tests__/lib/calendar-feed/ua-patterns.test.ts`

**Interfaces:**

- Produces: `recognizeProvider(userAgent: string | null | undefined): 'google' | 'apple' | 'outlook' | 'other' | null`. Returns `null` only for empty/missing UA; otherwise matches against allowlist and falls back to `'other'` for any non-empty UA.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/lib/calendar-feed/ua-patterns.test.ts
import { describe, it, expect } from 'vitest';
import { recognizeProvider } from '@/lib/calendar-feed/ua-patterns';

describe('recognizeProvider', () => {
  it('recognizes Google Calendar Importer', () => {
    expect(recognizeProvider('Google-Calendar-Importer')).toBe('google');
  });
  it('recognizes Apple Calendar (macOS)', () => {
    expect(recognizeProvider('iCal/15.0 CalendarAgent/1234')).toBe('apple');
  });
  it('recognizes Apple Calendar (iOS)', () => {
    expect(recognizeProvider('iOS/17.4 CalendarFramework/2.0')).toBe('apple');
  });
  it('recognizes Outlook desktop', () => {
    expect(recognizeProvider('MSOutlook/16.0')).toBe('outlook');
  });
  it('recognizes Outlook on the web variant', () => {
    expect(recognizeProvider('Microsoft Outlook Calendar')).toBe('outlook');
  });
  it('recognizes a generic CalDAV client as other', () => {
    expect(recognizeProvider('Mozilla/5.0 caldav-sync')).toBe('other');
  });
  it('returns other for any non-empty unrecognized UA', () => {
    expect(recognizeProvider('curl/8.0')).toBe('other');
    expect(recognizeProvider('HoneyBookCalendarSync')).toBe('other');
  });
  it('returns null for missing UA', () => {
    expect(recognizeProvider(undefined)).toBeNull();
    expect(recognizeProvider(null)).toBeNull();
    expect(recognizeProvider('')).toBeNull();
    expect(recognizeProvider('   ')).toBeNull();
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
npx vitest run src/__tests__/lib/calendar-feed/ua-patterns.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/calendar-feed/ua-patterns'`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/calendar-feed/ua-patterns.ts
export type RecognizedProvider = 'google' | 'apple' | 'outlook' | 'other';

const PATTERNS: Array<{ test: RegExp; provider: RecognizedProvider }> = [
  { test: /Google-Calendar-Importer/i, provider: 'google' },
  { test: /\bMSOutlook\b/i, provider: 'outlook' },
  { test: /Microsoft Outlook/i, provider: 'outlook' },
  { test: /Outlook[-\s]?Calendar/i, provider: 'outlook' },
  { test: /CalendarAgent/i, provider: 'apple' },
  { test: /CalendarFramework/i, provider: 'apple' },
  { test: /\biCal\b/i, provider: 'apple' },
];

export function recognizeProvider(userAgent: string | null | undefined): RecognizedProvider | null {
  if (!userAgent || !userAgent.trim()) return null;
  for (const { test, provider } of PATTERNS) {
    if (test.test(userAgent)) return provider;
  }
  return 'other';
}
```

- [ ] **Step 4: Verify test passes**

```bash
npx vitest run src/__tests__/lib/calendar-feed/ua-patterns.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar-feed/ua-patterns.ts src/__tests__/lib/calendar-feed/ua-patterns.test.ts
git commit -m "feat(calendar-feed): recognizeProvider() UA → provider classifier"
```

---

### Task 3: Subscribe-URL deep-link builders (TDD)

**Files:**

- Create: `src/lib/calendar-feed/deep-links.ts`
- Test: `src/__tests__/lib/calendar-feed/deep-links.test.ts`

**Interfaces:**

- Produces:
  - `buildGoogleSubscribeUrl(feedUrl: string): string` — `https://calendar.google.com/calendar/u/0/r?cid=<url-encoded feedUrl>`.
  - `buildAppleWebcalUrl(feedUrl: string): string` — swaps `https://` for `webcal://` (or `http://` for local dev).
  - `buildOutlookSubscribeUrl(feedUrl: string, name: string): string` — `https://outlook.live.com/calendar/0/addfromweb?url=<encoded>&name=<encoded>`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/lib/calendar-feed/deep-links.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildGoogleSubscribeUrl,
  buildAppleWebcalUrl,
  buildOutlookSubscribeUrl,
} from '@/lib/calendar-feed/deep-links';

const FEED = 'https://baazar.io/api/cal/abc123.ics';

describe('buildGoogleSubscribeUrl', () => {
  it('wraps the feed URL with the cid param, percent-encoded', () => {
    expect(buildGoogleSubscribeUrl(FEED)).toBe(
      'https://calendar.google.com/calendar/u/0/r?cid=https%3A%2F%2Fbaazar.io%2Fapi%2Fcal%2Fabc123.ics'
    );
  });
});

describe('buildAppleWebcalUrl', () => {
  it('replaces https:// with webcal://', () => {
    expect(buildAppleWebcalUrl(FEED)).toBe('webcal://baazar.io/api/cal/abc123.ics');
  });
  it('replaces http:// with webcal:// for local dev', () => {
    expect(buildAppleWebcalUrl('http://localhost:3000/api/cal/x.ics')).toBe(
      'webcal://localhost:3000/api/cal/x.ics'
    );
  });
  it('throws for non-http schemes', () => {
    expect(() => buildAppleWebcalUrl('ftp://x.com/feed.ics')).toThrow();
  });
});

describe('buildOutlookSubscribeUrl', () => {
  it('builds the addfromweb URL with url + name params', () => {
    expect(buildOutlookSubscribeUrl(FEED, 'Baazar Bookings')).toBe(
      'https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fbaazar.io%2Fapi%2Fcal%2Fabc123.ics&name=Baazar%20Bookings'
    );
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npx vitest run src/__tests__/lib/calendar-feed/deep-links.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/calendar-feed/deep-links.ts
export function buildGoogleSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(feedUrl)}`;
}

export function buildAppleWebcalUrl(feedUrl: string): string {
  if (feedUrl.startsWith('https://')) return 'webcal://' + feedUrl.slice('https://'.length);
  if (feedUrl.startsWith('http://')) return 'webcal://' + feedUrl.slice('http://'.length);
  throw new Error(`buildAppleWebcalUrl: unsupported scheme in ${feedUrl}`);
}

export function buildOutlookSubscribeUrl(feedUrl: string, name: string): string {
  const u = encodeURIComponent(feedUrl);
  const n = encodeURIComponent(name);
  return `https://outlook.live.com/calendar/0/addfromweb?url=${u}&name=${n}`;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npx vitest run src/__tests__/lib/calendar-feed/deep-links.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar-feed/deep-links.ts src/__tests__/lib/calendar-feed/deep-links.test.ts
git commit -m "feat(calendar-feed): subscribe-URL builders for Google/Apple/Outlook"
```

---

### Task 4: Install `ics` npm package and add the calendar-feed service skeleton

**Files:**

- Create: `src/services/calendar-feed.service.ts`
- Test: `src/__tests__/services/calendar-feed.service.test.ts`
- Modify: `package.json`, `package-lock.json` (npm install side effect)

**Interfaces:**

- Produces (in this task only the token CRUD half):
  - `getOrCreateFeedToken(supabase: SupabaseClient, vendorProfileId: string): Promise<string>` — returns existing or generates 16-byte URL-safe base64 (22 chars), persists.
  - `rotateFeedToken(supabase: SupabaseClient, vendorProfileId: string): Promise<string>` — generates new token, overwrites, resets `calendar_feed_state` to `'not_connected'` and clears intent/connected fields.
- (The remaining service functions land in Tasks 5 and 7.)

- [ ] **Step 1: Install `ics` package**

```bash
npm install ics
```

Expected: `package.json` `dependencies` now lists `"ics": "^3.x"`.

- [ ] **Step 2: Write failing tests for token CRUD**

```typescript
// src/__tests__/services/calendar-feed.service.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { getOrCreateFeedToken, rotateFeedToken } from '@/services/calendar-feed.service';

function mockSupabase(initialToken: string | null) {
  let token: string | null = initialToken;
  let state = initialToken ? 'pending' : 'not_connected';
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { calendar_feed_token: token, calendar_feed_state: state },
              error: null,
            })
          ),
        })),
      })),
      update: vi.fn((patch: any) => ({
        eq: vi.fn(() => {
          if ('calendar_feed_token' in patch) token = patch.calendar_feed_token;
          if ('calendar_feed_state' in patch) state = patch.calendar_feed_state;
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    })),
    _peek: () => ({ token, state }),
  } as any;
}

describe('getOrCreateFeedToken', () => {
  it('returns the existing token if already set', async () => {
    const sb = mockSupabase('existing-token-abc');
    const result = await getOrCreateFeedToken(sb, 'vendor-1');
    expect(result).toBe('existing-token-abc');
  });

  it('generates a fresh 22-char base64 token if absent', async () => {
    const sb = mockSupabase(null);
    const result = await getOrCreateFeedToken(sb, 'vendor-1');
    expect(result).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sb._peek().token).toBe(result);
  });
});

describe('rotateFeedToken', () => {
  it('overwrites the token and resets state to not_connected', async () => {
    const sb = mockSupabase('old-token');
    const fresh = await rotateFeedToken(sb, 'vendor-1');
    expect(fresh).not.toBe('old-token');
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sb._peek().state).toBe('not_connected');
  });
});
```

- [ ] **Step 3: Verify tests fail**

```bash
npx vitest run src/__tests__/services/calendar-feed.service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement token CRUD**

```typescript
// src/services/calendar-feed.service.ts
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

function newToken(): string {
  // 16 random bytes → base64url, trimmed to 22 chars (drop the trailing '==')
  return crypto.randomBytes(16).toString('base64url');
}

export async function getOrCreateFeedToken(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('calendar_feed_token')
    .eq('id', vendorProfileId)
    .single();
  if (error) throw new Error(`getOrCreateFeedToken: ${error.message}`);
  if (data?.calendar_feed_token) return data.calendar_feed_token;

  const token = newToken();
  const { error: updErr } = await supabase
    .from('vendor_profiles')
    .update({ calendar_feed_token: token })
    .eq('id', vendorProfileId);
  if (updErr) throw new Error(`getOrCreateFeedToken (update): ${updErr.message}`);
  return token;
}

export async function rotateFeedToken(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const token = newToken();
  const { error } = await supabase
    .from('vendor_profiles')
    .update({
      calendar_feed_token: token,
      calendar_feed_state: 'not_connected',
      calendar_feed_intent_at: null,
      calendar_feed_intent_method: null,
      calendar_feed_connected_at: null,
      calendar_feed_connected_via_ua: null,
    })
    .eq('id', vendorProfileId);
  if (error) throw new Error(`rotateFeedToken: ${error.message}`);
  return token;
}
```

- [ ] **Step 5: Verify tests pass**

```bash
npx vitest run src/__tests__/services/calendar-feed.service.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/services/calendar-feed.service.ts src/__tests__/services/calendar-feed.service.test.ts
git commit -m "feat(calendar-feed): token CRUD + ics package install"
```

---

### Task 5: ICS feed builder + poll recording (TDD, extends service)

**Files:**

- Modify: `src/services/calendar-feed.service.ts`, `src/__tests__/services/calendar-feed.service.test.ts`

**Interfaces:**

- Consumes: `recognizeProvider` from Task 2; `getOrCreateFeedToken` from Task 4.
- Produces:
  - `buildIcsForVendor(supabase, vendorProfileId): Promise<string>` — RFC 5545 text. Empty `VCALENDAR` if no bookings. Locking-status filter from spec.
  - `recordPoll(args: { supabase, vendorProfileId, userAgent, ipHash, statusReturned }): Promise<void>` — inserts a polls row; if vendor is in `'pending'`, flips to `'connected'` and records UA. Idempotent on re-poll.
  - `getFeedStatus(supabase, vendorProfileId): Promise<FeedStatus>` — returns `{ state, intent_method, connected_at, connected_via_ua, last_poll_at, polls_24h, feed_url, has_first_booking }`.
- Exported type: `export interface FeedStatus { state: 'not_connected' | 'pending' | 'connected'; intent_method: string | null; connected_at: string | null; connected_via_ua: string | null; last_poll_at: string | null; polls_24h: number; feed_url: string | null; has_first_booking: boolean; }`.

- [ ] **Step 1: Write failing tests for `buildIcsForVendor`**

Append to `src/__tests__/services/calendar-feed.service.test.ts`:

```typescript
import { buildIcsForVendor, recordPoll, getFeedStatus } from '@/services/calendar-feed.service';

function mockSupabaseWithEvents(
  events: any[],
  profile: any = { timezone: 'America/Chicago', business_name: 'Test Vendor' }
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'vendor_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: profile, error: null })),
            })),
          })),
        };
      }
      if (table === 'booking_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                gte: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: events, error: null })),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  } as any;
}

describe('buildIcsForVendor', () => {
  it('emits a valid empty VCALENDAR when there are no bookings', async () => {
    const sb = mockSupabaseWithEvents([]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR\s*$/);
    expect(ics).not.toMatch(/BEGIN:VEVENT/);
  });

  it('emits one VEVENT per booking_event', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-1',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        event_type: 'sangeet',
        venue_name: 'Hyatt',
        venue_address: '123 Main St',
        booking_id: 'b-1',
        status: 'deposit_paid',
        couple_name: 'Anjali Sharma',
        couple_phone: '+13125550142',
        package_name: 'Bridal Plus',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toMatch(/UID:booking-event-be-1@baazar\.io/);
    expect(ics).toMatch(/SUMMARY:\[Baazar\] Bridal Plus — Sharma/);
    expect(ics).toMatch(/STATUS:CONFIRMED/); // deposit_paid → CONFIRMED
  });

  it('marks accepted-but-unpaid as TENTATIVE', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-2',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        status: 'accepted',
        booking_id: 'b-2',
        couple_name: 'Khan',
        package_name: 'Family',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toMatch(/STATUS:TENTATIVE/);
  });

  it('escapes commas and backslashes in LOCATION and DESCRIPTION', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-3',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        status: 'deposit_paid',
        booking_id: 'b-3',
        venue_address: '123 Main St, Suite #4, Chicago, IL',
        couple_name: 'Patel\\Test',
        package_name: 'Bridal',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toContain('123 Main St\\, Suite #4\\, Chicago\\, IL');
    expect(ics).toContain('Patel\\\\Test');
  });

  it('never includes service-role-shaped strings', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-4',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        status: 'deposit_paid',
        booking_id: 'b-4',
        couple_name: 'X',
        package_name: 'P',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).not.toMatch(/service_role/);
    expect(ics).not.toMatch(/sk_live_/);
    expect(ics).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npx vitest run src/__tests__/services/calendar-feed.service.test.ts
```

Expected: FAIL — `buildIcsForVendor is not a function`.

- [ ] **Step 3: Implement `buildIcsForVendor`**

Add to `src/services/calendar-feed.service.ts`:

```typescript
const LOCKING_STATUSES = [
  'accepted',
  'adjusted_quote_sent',
  'adjusted_quote_declined',
  'deposit_paid',
  'completed',
] as const;

function escapeIcsText(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function fmtDtUtc(iso: string): string {
  // 2026-08-15T16:00:00Z → 20260815T160000Z
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function lastNameOf(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines > 75 octets are folded with CRLF + space.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push(line.slice(i, i + (i === 0 ? 75 : 74)));
    i += i === 0 ? 75 : 74;
  }
  return chunks.join('\r\n ');
}

export async function buildIcsForVendor(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('timezone, business_name')
    .eq('id', vendorProfileId)
    .single();

  const tz = profile?.timezone || 'America/Chicago';
  const businessName = profile?.business_name || 'Vendor';

  const now = new Date();
  const minStart = new Date(now.getTime() - 60 * 86400_000).toISOString();
  const maxStart = new Date(now.getTime() + 730 * 86400_000).toISOString();

  const { data: events = [] } = await supabase
    .from('booking_events')
    .select(
      `
      id, event_start_time, event_end_time, event_type, venue_name, venue_address,
      booking_id, status, couple_name, couple_phone, package_name
    `
    )
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', LOCKING_STATUSES as unknown as string[])
    .gte('event_start_time', minStart)
    .lte('event_start_time', maxStart)
    .order('event_start_time', { ascending: true });

  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Baazar//Vendor Calendar Feed//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(foldLine(`X-WR-CALNAME:Baazar Bookings — ${escapeIcsText(businessName)}`));
  lines.push(`X-WR-TIMEZONE:${tz}`);
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT12H');
  lines.push('X-PUBLISHED-TTL:PT12H');

  const dtStamp = fmtDtUtc(now.toISOString());
  for (const e of events) {
    const isPaid = e.status === 'deposit_paid' || e.status === 'completed';
    const summary = `[Baazar] ${e.package_name || e.event_type || 'Booking'} — ${lastNameOf(e.couple_name)}`;
    const descLines = [
      e.couple_name ? `Couple: ${e.couple_name}` : null,
      e.couple_phone ? `Phone: ${e.couple_phone}` : null,
      e.package_name ? `Package: ${e.package_name}` : null,
      `Deposit: ${isPaid ? 'PAID' : 'PENDING'}`,
      `Manage in Baazar: https://baazar.io/dashboard/bookings/${e.booking_id}`,
    ]
      .filter(Boolean)
      .join('\\n');

    const location = [e.venue_name, e.venue_address].filter(Boolean).join(', ');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:booking-event-${e.id}@baazar.io`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${fmtDtUtc(e.event_start_time)}`);
    lines.push(`DTEND:${fmtDtUtc(e.event_end_time)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descLines)}`));
    if (location) lines.push(foldLine(`LOCATION:${escapeIcsText(location)}`));
    lines.push(`STATUS:${isPaid ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push('TRANSP:OPAQUE');
    lines.push(`URL:https://baazar.io/dashboard/bookings/${e.booking_id}`);
    lines.push('CATEGORIES:Baazar,Booking');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Verify ICS tests pass**

```bash
npx vitest run src/__tests__/services/calendar-feed.service.test.ts -t buildIcsForVendor
```

Expected: PASS (5 tests).

- [ ] **Step 5: Write failing tests for `recordPoll` + `getFeedStatus`**

Append to the same test file:

```typescript
describe('recordPoll', () => {
  it('inserts a row + flips pending→connected on first recognized poll', async () => {
    let inserted: any = null;
    let updated: any = null;
    const sb: any = {
      from: vi.fn((table: string) => {
        if (table === 'vendor_calendar_feed_polls') {
          return {
            insert: vi.fn((row: any) => {
              inserted = row;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'vendor_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({ data: { calendar_feed_state: 'pending' }, error: null })
                ),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => {
                  updated = patch;
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };

    await recordPoll({
      supabase: sb,
      vendorProfileId: 'vendor-1',
      userAgent: 'Google-Calendar-Importer',
      ipHash: 'abc',
      statusReturned: 200,
    });

    expect(inserted.recognized_provider).toBe('google');
    expect(inserted.user_agent).toBe('Google-Calendar-Importer');
    expect(updated.calendar_feed_state).toBe('connected');
    expect(updated.calendar_feed_connected_via_ua).toBe('Google-Calendar-Importer');
  });

  it('does NOT flip state when vendor is already connected', async () => {
    let updated: any = null;
    const sb: any = {
      from: vi.fn((table: string) => {
        if (table === 'vendor_calendar_feed_polls') {
          return { insert: vi.fn(() => Promise.resolve({ error: null })) };
        }
        if (table === 'vendor_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({ data: { calendar_feed_state: 'connected' }, error: null })
                ),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => {
                  updated = patch;
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };
    await recordPoll({
      supabase: sb,
      vendorProfileId: 'v',
      userAgent: 'iCal/x',
      ipHash: 'h',
      statusReturned: 200,
    });
    expect(updated).toBeNull();
  });
});
```

- [ ] **Step 6: Implement `recordPoll` + `getFeedStatus`**

Append to `src/services/calendar-feed.service.ts`:

```typescript
import { recognizeProvider } from '@/lib/calendar-feed/ua-patterns';

export interface FeedStatus {
  state: 'not_connected' | 'pending' | 'connected';
  intent_method: string | null;
  connected_at: string | null;
  connected_via_ua: string | null;
  last_poll_at: string | null;
  polls_24h: number;
  feed_url: string | null;
  has_first_booking: boolean;
}

export async function recordPoll(args: {
  supabase: SupabaseClient;
  vendorProfileId: string;
  userAgent: string | null;
  ipHash: string | null;
  statusReturned: number;
}): Promise<void> {
  const { supabase, vendorProfileId, userAgent, ipHash, statusReturned } = args;
  const provider = recognizeProvider(userAgent);

  await supabase.from('vendor_calendar_feed_polls').insert({
    vendor_profile_id: vendorProfileId,
    user_agent: userAgent,
    recognized_provider: provider,
    ip_hash: ipHash,
    status_returned: statusReturned,
  });

  if (statusReturned !== 200 || !provider) return;

  const { data } = await supabase
    .from('vendor_profiles')
    .select('calendar_feed_state')
    .eq('id', vendorProfileId)
    .single();

  if (data?.calendar_feed_state === 'pending') {
    await supabase
      .from('vendor_profiles')
      .update({
        calendar_feed_state: 'connected',
        calendar_feed_connected_at: new Date().toISOString(),
        calendar_feed_connected_via_ua: userAgent,
      })
      .eq('id', vendorProfileId)
      .eq('calendar_feed_state', 'pending'); // guard against concurrent flips
  }
}

export async function getFeedStatus(
  supabase: SupabaseClient,
  vendorProfileId: string,
  publicBaseUrl: string
): Promise<FeedStatus> {
  const { data: vp } = await supabase
    .from('vendor_profiles')
    .select(
      `
      calendar_feed_token, calendar_feed_state, calendar_feed_intent_method,
      calendar_feed_connected_at, calendar_feed_connected_via_ua, first_confirmed_booking_at
    `
    )
    .eq('id', vendorProfileId)
    .single();

  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count: polls24h = 0 } = await supabase
    .from('vendor_calendar_feed_polls')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .gte('polled_at', since);

  const { data: lastPoll } = await supabase
    .from('vendor_calendar_feed_polls')
    .select('polled_at')
    .eq('vendor_profile_id', vendorProfileId)
    .order('polled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    state: vp?.calendar_feed_state ?? 'not_connected',
    intent_method: vp?.calendar_feed_intent_method ?? null,
    connected_at: vp?.calendar_feed_connected_at ?? null,
    connected_via_ua: vp?.calendar_feed_connected_via_ua ?? null,
    last_poll_at: lastPoll?.polled_at ?? null,
    polls_24h: polls24h ?? 0,
    feed_url: vp?.calendar_feed_token
      ? `${publicBaseUrl}/api/cal/${vp.calendar_feed_token}.ics`
      : null,
    has_first_booking: !!vp?.first_confirmed_booking_at,
  };
}
```

- [ ] **Step 7: Verify all service tests pass**

```bash
npx vitest run src/__tests__/services/calendar-feed.service.test.ts
```

Expected: PASS (10 tests total).

- [ ] **Step 8: Commit**

```bash
git add src/services/calendar-feed.service.ts src/__tests__/services/calendar-feed.service.test.ts
git commit -m "feat(calendar-feed): ICS builder, recordPoll with auto-verify, getFeedStatus"
```

---

### Task 6: Public `/api/cal/[token].ics` route

**Files:**

- Create: `src/app/api/cal/[token]/route.ts`
- Test: `src/__tests__/api/cal-token.test.ts`

**Interfaces:**

- Consumes: `buildIcsForVendor`, `recordPoll` from Task 5.
- Produces: `GET /api/cal/[token].ics` returning `200 text/calendar` with the ICS body, `404` for unknown token, `429` when per-IP rate limit (600/h) is exceeded.

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/api/cal-token.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const buildIcsMock = vi.fn();
const recordPollMock = vi.fn();
const serviceRoleMock = vi.fn();

vi.mock('@/services/calendar-feed.service', () => ({
  buildIcsForVendor: (...a: any[]) => buildIcsMock(...a),
  recordPoll: (...a: any[]) => recordPollMock(...a),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => serviceRoleMock(),
}));

import { GET } from '@/app/api/cal/[token]/route';

function mockReq(ua = 'Google-Calendar-Importer', ip = '1.2.3.4') {
  return new Request('http://localhost/api/cal/abc.ics', {
    headers: { 'user-agent': ua, 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  buildIcsMock.mockReset();
  recordPollMock.mockReset();
  serviceRoleMock.mockReset();
});

describe('GET /api/cal/[token].ics', () => {
  it('returns 404 for unknown token', async () => {
    serviceRoleMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    });
    const res = await GET(mockReq(), { params: { token: 'abc.ics' } });
    expect(res.status).toBe(404);
  });

  it('serves text/calendar with the ICS body for a valid token', async () => {
    serviceRoleMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'v-1' }, error: null }) }),
        }),
      }),
    });
    buildIcsMock.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    const res = await GET(mockReq(), { params: { token: 'abc.ics' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/calendar/);
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR/);
    expect(recordPollMock).toHaveBeenCalledOnce();
  });

  it('strips the .ics suffix from the token before lookup', async () => {
    const eqMock = vi.fn(() => ({
      maybeSingle: () => Promise.resolve({ data: { id: 'v-1' }, error: null }),
    }));
    serviceRoleMock.mockReturnValue({ from: () => ({ select: () => ({ eq: eqMock }) }) });
    buildIcsMock.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    await GET(mockReq(), { params: { token: 'xyz123.ics' } });
    expect(eqMock).toHaveBeenCalledWith('calendar_feed_token', 'xyz123');
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npx vitest run src/__tests__/api/cal-token.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Implement**

```typescript
// src/app/api/cal/[token]/route.ts
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildIcsForVendor, recordPoll } from '@/services/calendar-feed.service';

const DAILY_SALT = process.env.CAL_FEED_IP_SALT || 'baazar-cal-feed-default-salt';

function hashIp(ip: string): string {
  return crypto
    .createHash('sha256')
    .update(ip + ':' + DAILY_SALT)
    .digest('hex')
    .slice(0, 24);
}

function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function GET(
  req: NextRequest | Request,
  ctx: { params: { token: string } }
): Promise<Response> {
  const rawToken = ctx.params.token;
  const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;
  if (!/^[A-Za-z0-9_-]{20,32}$/.test(token)) return new Response('Not Found', { status: 404 });

  const sb = createServiceRoleClient();
  const { data: vp } = await sb
    .from('vendor_profiles')
    .select('id')
    .eq('calendar_feed_token', token)
    .maybeSingle();
  if (!vp) return new Response('Not Found', { status: 404 });

  const ua = req.headers.get('user-agent');
  const ipHash = hashIp(extractIp(req));

  // Per-IP hard cap: 600 polls / hour
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count = 0 } = await sb
    .from('vendor_calendar_feed_polls')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('polled_at', since);
  if ((count ?? 0) >= 600) {
    await recordPoll({
      supabase: sb,
      vendorProfileId: vp.id,
      userAgent: ua,
      ipHash,
      statusReturned: 429,
    });
    return new Response('Too Many Requests', { status: 429 });
  }

  const ics = await buildIcsForVendor(sb, vp.id);
  await recordPoll({
    supabase: sb,
    vendorProfileId: vp.id,
    userAgent: ua,
    ipHash,
    statusReturned: 200,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, max-age=3600',
      'x-robots-tag': 'noindex',
    },
  });
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npx vitest run src/__tests__/api/cal-token.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cal/[token]/route.ts src/__tests__/api/cal-token.test.ts
git commit -m "feat(calendar-feed): public GET /api/cal/[token].ics route with rate limit"
```

---

### Task 7: Vendor-session API routes (5 routes)

**Files:**

- Create: `src/app/api/vendor-calendar/feed/status/route.ts`
- Create: `src/app/api/vendor-calendar/feed/intent/route.ts`
- Create: `src/app/api/vendor-calendar/feed/rotate/route.ts`
- Create: `src/app/api/vendor-calendar/feed/disconnect/route.ts`
- Create: `src/app/api/vendor-calendar/feed/dismiss-nudge/route.ts`
- Test: `src/__tests__/api/vendor-calendar-feed-routes.test.ts`

**Interfaces:**

- Consumes: `getFeedStatus`, `getOrCreateFeedToken`, `rotateFeedToken` from the service. Auth helper `getActiveVendorProfileId(supabase)` already exists in `src/lib/auth/active-business.ts` (verify import path; if not present, locate the equivalent helper used elsewhere in `vendor-calendar/*` routes).
- Produces:
  - `GET /api/vendor-calendar/feed/status` → `{ ...FeedStatus }`.
  - `POST /api/vendor-calendar/feed/intent` body `{ method: 'google'|'apple'|'outlook'|'copy' }` → `{ feed_url, state: 'pending' }`.
  - `POST /api/vendor-calendar/feed/rotate` → `{ feed_url, state: 'not_connected' }`.
  - `POST /api/vendor-calendar/feed/disconnect` → `{ state: 'not_connected' }`.
  - `POST /api/vendor-calendar/feed/dismiss-nudge` → `{ ok: true }`.

- [ ] **Step 1: Locate the active-vendor auth helper**

```bash
grep -rn "getActiveVendorProfileId\|active_vendor_profile_id" /Users/sardarkhan/IdeaProjects/vendors.io/src/app/api/vendor-calendar/ | head -5
```

Expected: a helper used by existing block / capacity routes. Use the SAME helper for the new routes. If it doesn't exist with that exact name, use whatever the existing routes call (e.g., `getActiveVendorProfile()`).

- [ ] **Step 2: Write failing tests for `status` + `intent`**

```typescript
// src/__tests__/api/vendor-calendar-feed-routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getFeedStatusMock = vi.fn();
const getOrCreateFeedTokenMock = vi.fn();
const rotateFeedTokenMock = vi.fn();
const serverClientMock = vi.fn();
const activeVendorMock = vi.fn();

vi.mock('@/services/calendar-feed.service', () => ({
  getFeedStatus: (...a: any[]) => getFeedStatusMock(...a),
  getOrCreateFeedToken: (...a: any[]) => getOrCreateFeedTokenMock(...a),
  rotateFeedToken: (...a: any[]) => rotateFeedTokenMock(...a),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => serverClientMock(),
}));
// Replace path below with the actual helper located in Step 1
vi.mock('@/lib/auth/active-business', () => ({
  getActiveVendorProfileId: (...a: any[]) => activeVendorMock(...a),
}));

import { GET as statusGet } from '@/app/api/vendor-calendar/feed/status/route';
import { POST as intentPost } from '@/app/api/vendor-calendar/feed/intent/route';

beforeEach(() => {
  getFeedStatusMock.mockReset();
  getOrCreateFeedTokenMock.mockReset();
  rotateFeedTokenMock.mockReset();
  serverClientMock.mockReset();
  activeVendorMock.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = 'https://baazar.io';
});

describe('GET /api/vendor-calendar/feed/status', () => {
  it('returns 401 when no active vendor', async () => {
    activeVendorMock.mockResolvedValue(null);
    serverClientMock.mockReturnValue({});
    const res = await statusGet(new Request('http://localhost/api/vendor-calendar/feed/status'));
    expect(res.status).toBe(401);
  });

  it('returns the FeedStatus payload', async () => {
    activeVendorMock.mockResolvedValue('vendor-1');
    serverClientMock.mockReturnValue({});
    getFeedStatusMock.mockResolvedValue({
      state: 'pending',
      intent_method: 'google',
      connected_at: null,
      connected_via_ua: null,
      last_poll_at: null,
      polls_24h: 0,
      feed_url: 'https://baazar.io/api/cal/abc.ics',
      has_first_booking: false,
    });
    const res = await statusGet(new Request('http://localhost/api/vendor-calendar/feed/status'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('pending');
    expect(body.feed_url).toMatch(/abc\.ics/);
  });
});

describe('POST /api/vendor-calendar/feed/intent', () => {
  it('rejects unknown methods with 400', async () => {
    activeVendorMock.mockResolvedValue('vendor-1');
    serverClientMock.mockReturnValue({});
    const req = new Request('http://localhost/api/vendor-calendar/feed/intent', {
      method: 'POST',
      body: JSON.stringify({ method: 'icalcloud9' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await intentPost(req);
    expect(res.status).toBe(400);
  });

  it('flips to pending, returns feed_url', async () => {
    activeVendorMock.mockResolvedValue('vendor-1');
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    serverClientMock.mockReturnValue({
      from: () => ({ update: () => ({ eq: updateEq }) }),
    });
    getOrCreateFeedTokenMock.mockResolvedValue('tokenABC');
    const req = new Request('http://localhost/api/vendor-calendar/feed/intent', {
      method: 'POST',
      body: JSON.stringify({ method: 'google' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await intentPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('pending');
    expect(body.feed_url).toBe('https://baazar.io/api/cal/tokenABC.ics');
  });
});
```

- [ ] **Step 3: Verify tests fail**

```bash
npx vitest run src/__tests__/api/vendor-calendar-feed-routes.test.ts
```

Expected: FAIL — route modules not found.

- [ ] **Step 4: Implement `status` route**

```typescript
// src/app/api/vendor-calendar/feed/status/route.ts
import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfileId } from '@/lib/auth/active-business';
import { getFeedStatus } from '@/services/calendar-feed.service';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(_req: NextRequest | Request): Promise<Response> {
  const sb = createServerSupabaseClient();
  const vendorId = await getActiveVendorProfileId(sb);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const status = await getFeedStatus(sb, vendorId, APP_URL);
  return Response.json(status);
}
```

- [ ] **Step 5: Implement `intent` route**

```typescript
// src/app/api/vendor-calendar/feed/intent/route.ts
import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfileId } from '@/lib/auth/active-business';
import { getOrCreateFeedToken } from '@/services/calendar-feed.service';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const VALID_METHODS = new Set(['google', 'apple', 'outlook', 'copy']);

export async function POST(req: NextRequest | Request): Promise<Response> {
  const sb = createServerSupabaseClient();
  const vendorId = await getActiveVendorProfileId(sb);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const method = body.method;
  if (!VALID_METHODS.has(method)) {
    return Response.json({ error: 'invalid_method' }, { status: 400 });
  }

  const token = await getOrCreateFeedToken(sb, vendorId);
  await sb
    .from('vendor_profiles')
    .update({
      calendar_feed_state: 'pending',
      calendar_feed_intent_at: new Date().toISOString(),
      calendar_feed_intent_method: method,
    })
    .eq('id', vendorId);

  return Response.json({ state: 'pending', feed_url: `${APP_URL}/api/cal/${token}.ics` });
}
```

- [ ] **Step 6: Implement `rotate`, `disconnect`, `dismiss-nudge` routes**

```typescript
// src/app/api/vendor-calendar/feed/rotate/route.ts
import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfileId } from '@/lib/auth/active-business';
import { rotateFeedToken } from '@/services/calendar-feed.service';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(_req: NextRequest | Request): Promise<Response> {
  const sb = createServerSupabaseClient();
  const vendorId = await getActiveVendorProfileId(sb);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const token = await rotateFeedToken(sb, vendorId);
  return Response.json({ state: 'not_connected', feed_url: `${APP_URL}/api/cal/${token}.ics` });
}
```

```typescript
// src/app/api/vendor-calendar/feed/disconnect/route.ts
import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfileId } from '@/lib/auth/active-business';

export async function POST(_req: NextRequest | Request): Promise<Response> {
  const sb = createServerSupabaseClient();
  const vendorId = await getActiveVendorProfileId(sb);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  await sb
    .from('vendor_profiles')
    .update({
      calendar_feed_state: 'not_connected',
      calendar_feed_intent_at: null,
      calendar_feed_intent_method: null,
      calendar_feed_connected_at: null,
      calendar_feed_connected_via_ua: null,
    })
    .eq('id', vendorId);
  return Response.json({ state: 'not_connected' });
}
```

```typescript
// src/app/api/vendor-calendar/feed/dismiss-nudge/route.ts
import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfileId } from '@/lib/auth/active-business';

export async function POST(_req: NextRequest | Request): Promise<Response> {
  const sb = createServerSupabaseClient();
  const vendorId = await getActiveVendorProfileId(sb);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  await sb
    .from('vendor_profiles')
    .update({
      calendar_feed_nudge_dismissed_at: new Date().toISOString(),
    })
    .eq('id', vendorId);
  return Response.json({ ok: true });
}
```

- [ ] **Step 7: Verify tests pass**

```bash
npx vitest run src/__tests__/api/vendor-calendar-feed-routes.test.ts
```

Expected: PASS (4 tests). If they fail because the actual auth helper has a different name than `getActiveVendorProfileId`, update the routes and tests to use the real name found in Step 1.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/vendor-calendar/feed/ src/__tests__/api/vendor-calendar-feed-routes.test.ts
git commit -m "feat(calendar-feed): vendor-session routes (status, intent, rotate, disconnect, dismiss-nudge)"
```

---

### Task 8: `CalendarProviderIcons` component (inline brand SVGs)

**Files:**

- Create: `src/components/dashboard/calendar/CalendarProviderIcons.tsx`

**Interfaces:**

- Produces: `<GoogleCalIcon size?: number />`, `<AppleCalIcon size?: number />`, `<OutlookCalIcon size?: number />`. Default size 40px. No props besides `size` and standard SVG attrs. Pure presentation, no test.

- [ ] **Step 1: Implement**

```typescript
// src/components/dashboard/calendar/CalendarProviderIcons.tsx
import React from 'react';

type IconProps = { size?: number; className?: string };

export function GoogleCalIcon({ size = 40, className }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-label="Google Calendar">
      <rect x={3} y={3} width={34} height={34} rx={3} fill="#fff" stroke="#DADCE0" strokeWidth={0.8} />
      <rect x={3} y={3} width={34} height={6} fill="#4285F4" />
      <text x={20} y={28} textAnchor="middle" fontFamily="'Google Sans', Arial, sans-serif" fontWeight={700} fontSize={15} fill="#1A73E8" letterSpacing="-0.5">
        31
      </text>
    </svg>
  );
}

export function AppleCalIcon({ size = 40, className }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-label="Apple Calendar">
      <rect x={3} y={3} width={34} height={34} rx={4} fill="#fff" stroke="#E5E5E5" strokeWidth={0.8} />
      <text x={20} y={13} textAnchor="middle" fontFamily="-apple-system, 'SF Pro Text', Arial, sans-serif" fontWeight={700} fontSize={5.5} fill="#FF3B30" letterSpacing="0.5">MON</text>
      <text x={20} y={32} textAnchor="middle" fontFamily="-apple-system, 'SF Pro Display', Arial, sans-serif" fontWeight={300} fontSize={17} fill="#1A1A1A" letterSpacing="-0.5">17</text>
    </svg>
  );
}

export function OutlookCalIcon({ size = 40, className }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-label="Outlook">
      <rect x={2} y={2} width={36} height={36} rx={4} fill="#0078D4" />
      <rect x={9} y={11} width={22} height={18} rx={1.5} fill="#fff" />
      <rect x={9} y={11} width={22} height={4.5} fill="#106EBE" />
      <line x1={16.3} y1={15.5} x2={16.3} y2={29} stroke="#0078D4" strokeWidth={0.6} />
      <line x1={23.7} y1={15.5} x2={23.7} y2={29} stroke="#0078D4" strokeWidth={0.6} />
      <line x1={9} y1={22} x2={31} y2={22} stroke="#0078D4" strokeWidth={0.6} />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/calendar/CalendarProviderIcons.tsx
git commit -m "feat(calendar-feed): inline brand SVG icons for provider chooser"
```

---

### Task 9: `ConnectCalendarModal` component

**Files:**

- Create: `src/components/dashboard/calendar/ConnectCalendarModal.tsx`
- Test: `src/__tests__/components/dashboard/calendar/ConnectCalendarModal.test.tsx`

**Interfaces:**

- Consumes: `GoogleCalIcon`, `AppleCalIcon`, `OutlookCalIcon` from Task 8. `buildGoogleSubscribeUrl`, `buildAppleWebcalUrl`, `buildOutlookSubscribeUrl` from Task 3.
- Produces: `<ConnectCalendarModal open: boolean; onClose: () => void; feedUrl: string; onIntent: (method: 'google'|'apple'|'outlook'|'copy') => void; />`. Renders Radix Dialog. Three provider rows that open the corresponding URL in a new tab AND call `onIntent`. "Other calendar app" section with a copy button that also calls `onIntent('copy')`.

- [ ] **Step 1: Confirm `@radix-ui/react-dialog` is available**

```bash
grep '"@radix-ui/react-dialog"' /Users/sardarkhan/IdeaProjects/vendors.io/package.json
```

Expected: a `"@radix-ui/react-dialog"` entry (already present per package.json header above).

- [ ] **Step 2: Write failing test**

```typescript
// src/__tests__/components/dashboard/calendar/ConnectCalendarModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectCalendarModal } from '@/components/dashboard/calendar/ConnectCalendarModal';

describe('ConnectCalendarModal', () => {
  it('does not render when closed', () => {
    render(<ConnectCalendarModal open={false} onClose={() => {}} feedUrl="https://baazar.io/api/cal/x.ics" onIntent={() => {}} />);
    expect(screen.queryByText(/Choose your calendar app/)).toBeNull();
  });

  it('renders all three provider rows when open', () => {
    render(<ConnectCalendarModal open={true} onClose={() => {}} feedUrl="https://baazar.io/api/cal/x.ics" onIntent={() => {}} />);
    expect(screen.getByText(/Google Calendar/)).toBeTruthy();
    expect(screen.getByText(/Apple Calendar/)).toBeTruthy();
    expect(screen.getByText(/Outlook/)).toBeTruthy();
  });

  it('fires onIntent("google") when Google row clicked', () => {
    const onIntent = vi.fn();
    render(<ConnectCalendarModal open={true} onClose={() => {}} feedUrl="https://baazar.io/api/cal/x.ics" onIntent={onIntent} />);
    fireEvent.click(screen.getByRole('link', { name: /Google Calendar/i }));
    expect(onIntent).toHaveBeenCalledWith('google');
  });
});
```

- [ ] **Step 3: Verify test fails**

```bash
npx vitest run src/__tests__/components/dashboard/calendar/ConnectCalendarModal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// src/components/dashboard/calendar/ConnectCalendarModal.tsx
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { GoogleCalIcon, AppleCalIcon, OutlookCalIcon } from './CalendarProviderIcons';
import {
  buildGoogleSubscribeUrl,
  buildAppleWebcalUrl,
  buildOutlookSubscribeUrl,
} from '@/lib/calendar-feed/deep-links';

type IntentMethod = 'google' | 'apple' | 'outlook' | 'copy';

interface Props {
  open: boolean;
  onClose: () => void;
  feedUrl: string;
  onIntent: (method: IntentMethod) => void;
}

export function ConnectCalendarModal({ open, onClose, feedUrl, onIntent }: Props) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(feedUrl); } catch {}
    setCopied(true);
    onIntent('copy');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-[8vh] -translate-x-1/2 w-[min(560px,92vw)] bg-white rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5">
            <Dialog.Title className="font-display text-xl font-semibold tracking-tight">Choose your calendar app</Dialog.Title>
            <Dialog.Close className="text-ink/60 hover:bg-cream-2 rounded-md px-2 py-1 text-xl">×</Dialog.Close>
          </div>
          <div className="px-6 pb-6 pt-3">
            <p className="text-sm text-ink/70 mb-4">
              Tap your calendar — we'll open it and pre-fill the subscription. No password sharing, no app to install.
            </p>

            <ProviderRow
              href={buildGoogleSubscribeUrl(feedUrl)}
              icon={<GoogleCalIcon />}
              name="Google Calendar"
              desc="Most popular. One tap to subscribe."
              onClick={() => onIntent('google')}
            />
            <ProviderRow
              href={buildAppleWebcalUrl(feedUrl)}
              icon={<AppleCalIcon />}
              name={<>Apple Calendar <span className="text-ink/60 text-xs">· iPhone, iPad, Mac</span></>}
              desc="Opens the Calendar app to confirm."
              onClick={() => onIntent('apple')}
            />
            <ProviderRow
              href={buildOutlookSubscribeUrl(feedUrl, 'Baazar Bookings')}
              icon={<OutlookCalIcon />}
              name={<>Outlook <span className="text-ink/60 text-xs">· Microsoft 365, Outlook.com</span></>}
              desc="Subscribes via Outlook's calendar add-by-URL."
              onClick={() => onIntent('outlook')}
            />

            <div className="flex items-center gap-3 my-5 text-ink/60 text-xs uppercase tracking-wider">
              <div className="flex-1 h-px bg-ink/10" />
              Other calendar app
              <div className="flex-1 h-px bg-ink/10" />
            </div>

            <p className="text-sm text-ink/70 mb-2">
              Copy this private URL and paste it into your calendar app's "Subscribe to calendar" or "Add by URL" setting:
            </p>
            <div className="flex items-center gap-2 bg-cream rounded-lg px-3 py-2.5 mb-2">
              <code className="flex-1 text-xs font-mono text-ink/70 truncate">{feedUrl}</code>
              <button onClick={copyUrl} className="text-sm font-semibold px-3 py-1.5 rounded-md border border-ink/10 hover:bg-cream-2">
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-ink/60">
              Works with HoneyBook, Calendly, Tave, Notion, Yahoo, Proton, and any app that supports calendar feeds.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProviderRow({ href, icon, name, desc, onClick }: {
  href: string; icon: React.ReactNode; name: React.ReactNode; desc: string; onClick: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="flex items-center gap-3 border border-ink/10 rounded-xl p-3.5 mb-2.5 hover:bg-cream hover:border-ink/20 transition-colors no-underline text-ink"
    >
      <div className="w-10 h-10 flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="font-semibold text-sm">{name}</div>
        <div className="text-xs text-ink/60 mt-0.5">{desc}</div>
      </div>
      <div className="text-sm text-ink/60">Open ↗</div>
    </a>
  );
}
```

- [ ] **Step 5: Verify tests pass**

```bash
npx vitest run src/__tests__/components/dashboard/calendar/ConnectCalendarModal.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/calendar/ConnectCalendarModal.tsx src/__tests__/components/dashboard/calendar/ConnectCalendarModal.test.tsx
git commit -m "feat(calendar-feed): ConnectCalendarModal with provider chooser + copy fallback"
```

---

### Task 10: `ExternalCalendarSyncCard` (3-state card with status polling)

**Files:**

- Create: `src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx`
- Test: `src/__tests__/components/dashboard/calendar/ExternalCalendarSyncCard.test.tsx`

**Interfaces:**

- Consumes: `ConnectCalendarModal` (Task 9), `GoogleCalIcon`/`AppleCalIcon`/`OutlookCalIcon` (Task 8). Server endpoints from Task 7.
- Produces: `<ExternalCalendarSyncCard initialStatus: FeedStatus />`. Client component. Renders 1 of 3 sub-views based on `status.state`. While in `pending`, polls `GET /api/vendor-calendar/feed/status` every 10s; stops polling on `connected` or page blur.

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/components/dashboard/calendar/ExternalCalendarSyncCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExternalCalendarSyncCard } from '@/components/dashboard/calendar/ExternalCalendarSyncCard';

const baseStatus = {
  state: 'not_connected' as const,
  intent_method: null,
  connected_at: null,
  connected_via_ua: null,
  last_poll_at: null,
  polls_24h: 0,
  feed_url: null,
  has_first_booking: false,
};

describe('ExternalCalendarSyncCard', () => {
  it('shows the not-connected CTA when state is not_connected', () => {
    render(<ExternalCalendarSyncCard initialStatus={baseStatus} />);
    expect(screen.getByText(/Choose your calendar app/)).toBeTruthy();
    expect(screen.getByText(/See Baazar bookings in your calendar app/)).toBeTruthy();
  });

  it('shows the pending copy when state is pending', () => {
    render(<ExternalCalendarSyncCard initialStatus={{ ...baseStatus, state: 'pending', intent_method: 'google', feed_url: 'https://baazar.io/api/cal/abc.ics' }} />);
    expect(screen.getByText(/Pending verification/i)).toBeTruthy();
  });

  it('shows the connected stats when state is connected', () => {
    render(<ExternalCalendarSyncCard initialStatus={{
      ...baseStatus,
      state: 'connected',
      connected_at: '2026-06-25T12:00:00Z',
      connected_via_ua: 'Google-Calendar-Importer',
      last_poll_at: '2026-06-25T14:00:00Z',
      polls_24h: 2,
      feed_url: 'https://baazar.io/api/cal/abc.ics',
    }} />);
    expect(screen.getByText(/Connected via Google/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
npx vitest run src/__tests__/components/dashboard/calendar/ExternalCalendarSyncCard.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import { GoogleCalIcon, AppleCalIcon, OutlookCalIcon } from './CalendarProviderIcons';
import type { FeedStatus } from '@/services/calendar-feed.service';

interface Props {
  initialStatus: FeedStatus;
}

function providerLabel(ua: string | null): string {
  if (!ua) return 'your calendar app';
  if (/Google-Calendar-Importer/i.test(ua)) return 'Google Calendar';
  if (/iCal|CalendarAgent|CalendarFramework/i.test(ua)) return 'Apple Calendar';
  if (/Outlook/i.test(ua)) return 'Outlook';
  return 'your calendar app';
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function ExternalCalendarSyncCard({ initialStatus }: Props) {
  const [status, setStatus] = useState<FeedStatus>(initialStatus);
  const [modalOpen, setModalOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch('/api/vendor-calendar/feed/status', { cache: 'no-store' });
          if (r.ok) {
            const next: FeedStatus = await r.json();
            setStatus(next);
            if (next.state !== 'pending') stop();
          }
        } catch {}
      }, 10_000);
    };
    const stop = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    if (status.state === 'pending' && !document.hidden) start();
    const onVis = () => { document.hidden ? stop() : status.state === 'pending' && start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [status.state]);

  async function postIntent(method: 'google' | 'apple' | 'outlook' | 'copy') {
    await fetch('/api/vendor-calendar/feed/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method }),
    });
    setStatus(s => ({ ...s, state: 'pending', intent_method: method }));
  }

  async function disconnect() {
    await fetch('/api/vendor-calendar/feed/disconnect', { method: 'POST' });
    setStatus(s => ({ ...s, state: 'not_connected', intent_method: null, connected_at: null, connected_via_ua: null }));
  }

  async function rotate() {
    const r = await fetch('/api/vendor-calendar/feed/rotate', { method: 'POST' });
    const body = await r.json();
    setStatus(s => ({ ...s, state: 'not_connected', feed_url: body.feed_url, intent_method: null, connected_at: null, connected_via_ua: null }));
  }

  const pill = (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
      status.state === 'connected' ? 'bg-emerald-100 text-emerald-800' :
      status.state === 'pending' ? 'bg-amber-100 text-amber-800' :
      'bg-cream-2 text-ink/70'
    }`}>
      <span className={`w-2 h-2 rounded-full ${
        status.state === 'connected' ? 'bg-emerald-600' :
        status.state === 'pending' ? 'bg-amber-500 animate-pulse' :
        'bg-ink/40'
      }`} />
      {status.state === 'connected' ? 'Connected' : status.state === 'pending' ? 'Pending verification' : 'Not connected'}
    </span>
  );

  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold tracking-tight">
          📲 See Baazar bookings in your calendar app
        </h3>
        {pill}
      </div>

      {status.state === 'not_connected' && (
        <>
          <p className="text-sm text-ink/70 mb-4">
            Every confirmed Baazar booking will appear automatically in your existing calendar app — no double-entry, no password sharing. Subscribe once; new bookings flow in forever.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <GoogleCalIcon size={22} />
            <AppleCalIcon size={22} />
            <OutlookCalIcon size={22} />
            <span className="text-xs text-ink/60 ml-2">
              Google · Apple · Outlook · and any app that supports calendar feeds
            </span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-ink text-white font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-black"
          >
            Choose your calendar app  →
          </button>
        </>
      )}

      {status.state === 'pending' && (
        <>
          <p className="text-sm text-ink mb-2"><strong>Pending verification…</strong></p>
          <p className="text-sm text-ink/70 mb-4">
            We've opened {status.intent_method === 'google' ? 'Google Calendar' : status.intent_method === 'apple' ? 'Apple Calendar' : status.intent_method === 'outlook' ? 'Outlook' : 'your calendar app'} in a new tab. Once you confirm the subscription, your calendar app will poll our feed within a few minutes and we'll mark this as connected automatically.
          </p>
          {status.feed_url && (
            <div className="flex items-center gap-2 bg-cream rounded-lg px-3 py-2.5 mb-3">
              <code className="flex-1 text-xs font-mono text-ink/70 truncate">{status.feed_url}</code>
              <button
                onClick={() => navigator.clipboard?.writeText(status.feed_url!)}
                className="text-sm font-semibold px-3 py-1.5 rounded-md border border-ink/10 hover:bg-cream-2"
              >
                Copy
              </button>
            </div>
          )}
          <button onClick={disconnect} className="text-sm font-semibold px-3 py-2 rounded-md border border-ink/10 hover:bg-cream-2">
            Cancel — disconnect
          </button>
        </>
      )}

      {status.state === 'connected' && (
        <>
          <p className="text-sm text-ink mb-1">
            ✓ Connected via <strong>{providerLabel(status.connected_via_ua)}</strong>
          </p>
          <p className="text-xs text-ink/60 mb-3">
            First detected sync: {timeAgo(status.connected_at)} · Last poll: {timeAgo(status.last_poll_at)}
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat k="User-Agent" v={status.connected_via_ua ?? '—'} small />
            <Stat k="Polls (24h)" v={String(status.polls_24h)} />
            <Stat k="Avg interval" v={status.polls_24h > 0 ? `~${Math.round(24 / status.polls_24h)}h` : '—'} />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => status.feed_url && navigator.clipboard?.writeText(status.feed_url)} className="text-sm font-semibold px-3 py-2 rounded-md border border-ink/10 hover:bg-cream-2">Copy feed URL</button>
            <button onClick={rotate} className="text-sm font-semibold px-3 py-2 rounded-md border border-ink/10 hover:bg-cream-2">Rotate URL</button>
            <button onClick={disconnect} className="text-sm font-semibold px-3 py-2 rounded-md text-red-700 hover:bg-red-50">Disconnect</button>
          </div>
          <p className="text-xs text-ink/60 bg-indigo-50 text-indigo-900 px-3 py-2 rounded-md">
            💡 How we know it's working: your calendar app fetched our feed and identified itself in its <code>User-Agent</code> header. No OAuth, no password — the request itself is the proof.
          </p>
        </>
      )}

      {modalOpen && status.feed_url && (
        <ConnectCalendarModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          feedUrl={status.feed_url}
          onIntent={(m) => { postIntent(m); setModalOpen(false); }}
        />
      )}
      {modalOpen && !status.feed_url && (
        // If no feed_url yet (vendor never had a token), fetch intent first to generate one then open.
        <FetchIntentAndOpen onReady={(feedUrl) => setStatus(s => ({ ...s, feed_url: feedUrl }))} method="copy" />
      )}
    </div>
  );
}

function Stat({ k, v, small }: { k: string; v: string; small?: boolean }) {
  return (
    <div className="bg-cream rounded-lg px-3 py-2">
      <div className="text-xs text-ink/60">{k}</div>
      <div className={`font-semibold ${small ? 'text-sm' : 'text-lg'} mt-0.5`}>{v}</div>
    </div>
  );
}

function FetchIntentAndOpen({ onReady, method }: { onReady: (feedUrl: string) => void; method: 'copy' }) {
  useEffect(() => {
    fetch('/api/vendor-calendar/feed/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method }),
    }).then(r => r.json()).then((b) => onReady(b.feed_url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npx vitest run src/__tests__/components/dashboard/calendar/ExternalCalendarSyncCard.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/calendar/ExternalCalendarSyncCard.tsx src/__tests__/components/dashboard/calendar/ExternalCalendarSyncCard.test.tsx
git commit -m "feat(calendar-feed): ExternalCalendarSyncCard with 3 states + 10s polling on pending"
```

---

### Task 11: Wire `ExternalCalendarSyncCard` into `/dashboard/profile/calendar` page

**Files:**

- Modify: `src/app/dashboard/profile/calendar/page.tsx`

**Interfaces:**

- Consumes: `ExternalCalendarSyncCard` (Task 10), `getFeedStatus` (Task 5), the existing active-vendor helper.

- [ ] **Step 1: Inspect the existing page**

```bash
cat /Users/sardarkhan/IdeaProjects/vendors.io/src/app/dashboard/profile/calendar/page.tsx | head -50
```

Note: the page is a server component (or possibly client wrapper around server data). Read it fully before editing so the new card is mounted in the right place relative to existing `<BlockDateForm>` and `<CapacityField>`.

- [ ] **Step 2: Add the card mount above the existing G cards**

In `src/app/dashboard/profile/calendar/page.tsx`, near the top of the page's JSX (right after the page heading, BEFORE the existing block / capacity cards), add:

```typescript
import { ExternalCalendarSyncCard } from '@/components/dashboard/calendar/ExternalCalendarSyncCard';
import { getFeedStatus } from '@/services/calendar-feed.service';
```

In the server-side data fetch (alongside the existing one), add:

```typescript
const feedStatus = await getFeedStatus(
  supabase,
  vendorProfileId,
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
);
```

In JSX, before the existing G blocks:

```tsx
<ExternalCalendarSyncCard initialStatus={feedStatus} />
```

- [ ] **Step 3: Smoke-test locally**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/profile/calendar` while signed in as a vendor with no token. Confirm:

- Card appears at the top with `[Not connected]` pill.
- "Choose your calendar app →" button opens the modal with Google/Apple/Outlook + URL.
- Picking Google opens a new tab to `calendar.google.com/.../?cid=...` and the card flips to `[Pending verification]`.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/profile/calendar/page.tsx
git commit -m "feat(calendar-feed): mount ExternalCalendarSyncCard on /dashboard/profile/calendar"
```

---

### Task 12: `DashboardCalendarNudge` + mount on `/dashboard`

**Files:**

- Create: `src/components/dashboard/calendar/DashboardCalendarNudge.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**

- Consumes: `getFeedStatus` (Task 5) for the data; uses `/api/vendor-calendar/feed/dismiss-nudge` for dismissal.
- Produces: `<DashboardCalendarNudge feedStatus: FeedStatus; nudgeDismissed: boolean />`. Renders nothing if `feedStatus.state !== 'not_connected'` OR `nudgeDismissed`. Otherwise renders a one-line card with `[Connect]` (opens modal) and `[Maybe later]` (POSTs dismiss).

- [ ] **Step 1: Implement the component**

```typescript
// src/components/dashboard/calendar/DashboardCalendarNudge.tsx
'use client';

import { useState } from 'react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import type { FeedStatus } from '@/services/calendar-feed.service';

interface Props {
  feedStatus: FeedStatus;
  nudgeDismissed: boolean;
}

export function DashboardCalendarNudge({ feedStatus, nudgeDismissed }: Props) {
  const [hidden, setHidden] = useState(nudgeDismissed);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(feedStatus.feed_url);

  if (hidden || feedStatus.state !== 'not_connected') return null;

  async function ensureFeedUrl(): Promise<string> {
    if (feedUrl) return feedUrl;
    const r = await fetch('/api/vendor-calendar/feed/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'copy' }),
    });
    const b = await r.json();
    setFeedUrl(b.feed_url);
    return b.feed_url;
  }

  async function dismiss() {
    setHidden(true);
    await fetch('/api/vendor-calendar/feed/dismiss-nudge', { method: 'POST' });
  }

  return (
    <>
      <div className="bg-white border border-ink/10 rounded-xl px-5 py-4 mb-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg">📅</span>
          <div>
            <div className="font-semibold text-sm">Connect your calendar</div>
            <div className="text-xs text-ink/60 mt-0.5">Show Baazar bookings in Google, Apple, or Outlook automatically.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => { await ensureFeedUrl(); setModalOpen(true); }}
            className="bg-ink text-white font-semibold text-sm px-3 py-2 rounded-md hover:bg-black"
          >
            Connect
          </button>
          <button onClick={dismiss} className="text-sm font-semibold text-ink/70 px-3 py-2 rounded-md hover:bg-cream-2">
            Maybe later
          </button>
        </div>
      </div>
      {modalOpen && feedUrl && (
        <ConnectCalendarModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          feedUrl={feedUrl}
          onIntent={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount on `/dashboard/page.tsx`**

In `src/app/dashboard/page.tsx`, in the server data section, fetch the feed status + nudge-dismissed flag:

```typescript
import { DashboardCalendarNudge } from '@/components/dashboard/calendar/DashboardCalendarNudge';
import { getFeedStatus } from '@/services/calendar-feed.service';

// ... inside the page component, alongside existing data fetches:
const feedStatus = await getFeedStatus(
  supabase,
  vendorProfileId,
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
);
const { data: vp } = await supabase
  .from('vendor_profiles')
  .select('calendar_feed_nudge_dismissed_at')
  .eq('id', vendorProfileId)
  .single();
const nudgeDismissed = !!vp?.calendar_feed_nudge_dismissed_at;
```

In the JSX, mount the nudge at the top of the dashboard (above the existing "Today" / leads cards):

```tsx
<DashboardCalendarNudge feedStatus={feedStatus} nudgeDismissed={nudgeDismissed} />
```

- [ ] **Step 3: Smoke-test**

Reload `/dashboard` as a not-connected vendor. Confirm the nudge appears. Hit "Maybe later" — it disappears and reloading keeps it hidden. Reload as a `connected` vendor — nudge stays hidden.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/calendar/DashboardCalendarNudge.tsx src/app/dashboard/page.tsx
git commit -m "feat(calendar-feed): dashboard nudge banner for unconnected vendors"
```

---

### Task 13: `PostFirstBookingPrompt` + mount on `/dashboard/bookings/[id]`

**Files:**

- Create: `src/components/dashboard/calendar/PostFirstBookingPrompt.tsx`
- Modify: `src/app/dashboard/bookings/[id]/page.tsx`

**Interfaces:**

- Produces: `<PostFirstBookingPrompt feedStatus: FeedStatus; bookingId: string; isFirstConfirmedBooking: boolean />`. Renders nothing unless `isFirstConfirmedBooking === true`, `feedStatus.state === 'not_connected'`, and the local-storage dismissal flag is unset. Otherwise renders an inline prompt.

- [ ] **Step 1: Implement**

```typescript
// src/components/dashboard/calendar/PostFirstBookingPrompt.tsx
'use client';

import { useState, useEffect } from 'react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import type { FeedStatus } from '@/services/calendar-feed.service';

const DISMISS_KEY = 'baazar.calendarFeed.postFirstBookingPrompt.dismissed';

interface Props {
  feedStatus: FeedStatus;
  bookingId: string;
  isFirstConfirmedBooking: boolean;
}

export function PostFirstBookingPrompt({ feedStatus, bookingId, isFirstConfirmedBooking }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(feedStatus.feed_url);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
  }, []);

  if (dismissed || !isFirstConfirmedBooking || feedStatus.state !== 'not_connected') return null;

  async function ensureFeedUrl(): Promise<string> {
    if (feedUrl) return feedUrl;
    const r = await fetch('/api/vendor-calendar/feed/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'copy' }),
    });
    const b = await r.json();
    setFeedUrl(b.feed_url);
    return b.feed_url;
  }

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  return (
    <>
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm text-emerald-900">✓ Your first Baazar booking is confirmed</div>
            <div className="text-xs text-emerald-800/80 mt-0.5">Want this on your phone calendar? Connect Google, Apple, or Outlook in one tap.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { await ensureFeedUrl(); setModalOpen(true); }}
              className="bg-ink text-white font-semibold text-sm px-3 py-2 rounded-md hover:bg-black"
            >
              Connect calendar
            </button>
            <button onClick={dismiss} className="text-sm font-semibold text-emerald-900/70 px-3 py-2 rounded-md hover:bg-emerald-100">
              Dismiss
            </button>
          </div>
        </div>
      </div>
      {modalOpen && feedUrl && (
        <ConnectCalendarModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          feedUrl={feedUrl}
          onIntent={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount on `/dashboard/bookings/[id]/page.tsx`**

In the server data section of the booking detail page, compute `isFirstConfirmedBooking`:

```typescript
import { PostFirstBookingPrompt } from '@/components/dashboard/calendar/PostFirstBookingPrompt';
import { getFeedStatus } from '@/services/calendar-feed.service';

const feedStatus = await getFeedStatus(
  supabase,
  vendorProfileId,
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
);

// "First confirmed booking" = the lowest accepted_at booking for this vendor matches this booking's id.
const { data: firstBooking } = await supabase
  .from('bookings')
  .select('id')
  .eq('vendor_profile_id', vendorProfileId)
  .in('status', [
    'accepted',
    'adjusted_quote_sent',
    'adjusted_quote_declined',
    'deposit_paid',
    'completed',
  ])
  .order('accepted_at', { ascending: true })
  .limit(1)
  .maybeSingle();

const isFirstConfirmedBooking = firstBooking?.id === bookingId;
```

In JSX, near the top of the booking detail body (below the existing booking-confirmed banner if there is one):

```tsx
<PostFirstBookingPrompt
  feedStatus={feedStatus}
  bookingId={bookingId}
  isFirstConfirmedBooking={isFirstConfirmedBooking}
/>
```

- [ ] **Step 3: Smoke-test**

As a vendor with one confirmed booking and `not_connected` state, open that booking's detail page. Confirm the green prompt appears. Click Dismiss — gone. Reload — still gone (localStorage flag). Open a DIFFERENT confirmed booking's page — prompt does NOT render.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/calendar/PostFirstBookingPrompt.tsx src/app/dashboard/bookings/[id]/page.tsx
git commit -m "feat(calendar-feed): post-first-booking prompt on /dashboard/bookings/[id]"
```

---

### Task 14: E2E test (Playwright, skipped in CI per existing infra)

**Files:**

- Create: `e2e/vendor-calendar-feed.spec.ts`

**Interfaces:**

- Exercises the full flow against `npm run dev` running locally with `.env.local`.

- [ ] **Step 1: Write the spec**

```typescript
// e2e/vendor-calendar-feed.spec.ts
import { test, expect } from '@playwright/test';

// Skipped in CI per existing infra gap (matches Sub-project G's pattern).
test.skip(({}, testInfo) => !!process.env.CI, 'requires .env.local + seeded vendor');

test('vendor connects calendar via Google deep-link and verification flips to connected', async ({
  page,
  request,
}) => {
  // Pre-condition: signed in as a vendor with calendar_feed_state = 'not_connected'.
  // (Assume the existing test harness in e2e/ logs in via storage state; reuse it.)
  await page.goto('/dashboard/profile/calendar');

  // Card shows Not connected
  await expect(page.getByText('See Baazar bookings in your calendar app')).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible();

  // Open modal, click Google
  await page.getByRole('button', { name: /Choose your calendar app/ }).click();
  await expect(page.getByText('Choose your calendar app')).toBeVisible();

  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: /Google Calendar/ }).click(),
  ]);
  expect(popup.url()).toContain('calendar.google.com/calendar/u/0/r?cid=');
  await popup.close();

  // Card flips to Pending
  await expect(page.getByText('Pending verification')).toBeVisible({ timeout: 5000 });

  // Read the feed URL from the displayed code element
  const feedUrl = (await page.locator('code').first().textContent())!;
  expect(feedUrl).toMatch(/\/api\/cal\/[A-Za-z0-9_-]+\.ics$/);

  // Simulate a real calendar app polling the feed with a recognized UA
  const response = await request.get(feedUrl, {
    headers: { 'user-agent': 'Google-Calendar-Importer' },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/text\/calendar/);

  // Reload + assert flipped to Connected
  await page.reload();
  await expect(page.getByText('Connected via')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Google Calendar')).toBeVisible();
});
```

- [ ] **Step 2: Run locally (won't run in CI)**

```bash
npx playwright test e2e/vendor-calendar-feed.spec.ts
```

Expected: PASS locally (assuming the test vendor harness is wired). The test is `test.skip` when `CI` is set, matching Sub-project G's pattern.

- [ ] **Step 3: Commit**

```bash
git add e2e/vendor-calendar-feed.spec.ts
git commit -m "test(e2e): vendor calendar feed connect-and-verify flow (skipped in CI)"
```

---

### Task 15: Open PR + final sweeps

**Files:** none new; verification and PR creation.

- [ ] **Step 1: Full test sweep**

```bash
npm run test
npm run typecheck
npm run lint
```

Expected: all green.

- [ ] **Step 2: Manual smoke-test in dev**

Run `npm run dev`, sign in as a vendor with the dev-DB migration applied, and walk the full flow:

1. `/dashboard/profile/calendar` — card visible, Not connected.
2. Click Choose your calendar app → modal opens with all three providers + URL.
3. Click Apple Calendar → macOS Calendar.app opens its subscribe sheet at `webcal://localhost:3000/api/cal/<token>.ics`. Confirm subscription.
4. Wait ~1 min — macOS Calendar polls. Reload the page; card flips to Connected via Apple Calendar.
5. Hit Rotate URL — card returns to Not connected, new URL shown.
6. Open `/dashboard` — nudge gone (since vendor already opted in once via the intent endpoint during step 3).

Document any deviation from expected behavior in the PR description.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feat/vendor-calendar-feed
gh pr create --title "feat: vendor calendar feed (external sync via .ics)" --body "$(cat <<'EOF'
## Summary

Per-vendor signed `.ics` feed that pushes confirmed Baazar bookings into Google Calendar, Apple Calendar, Outlook, or any calendar app that supports feed subscriptions. Verified automatically via User-Agent on first poll — no OAuth.

- Migration `00064`: feed token, state machine, polls table, `first_confirmed_booking_at` trigger.
- New service `calendar-feed.service.ts`: token CRUD, ICS generation (RFC 5545), poll recording with auto-verify.
- Public `GET /api/cal/[token].ics` route + 5 vendor-session routes (`/status`, `/intent`, `/rotate`, `/disconnect`, `/dismiss-nudge`).
- Three UI surfaces: card on `/dashboard/profile/calendar`, nudge on `/dashboard`, post-first-booking prompt on `/dashboard/bookings/[id]`.
- No onboarding wizard step (by design — discovery is contextual).

Spec: `docs/superpowers/specs/2026-06-25-vendor-calendar-feed-design.md`

## Test plan

- [ ] All unit + API tests pass (`npm run test`)
- [ ] Typecheck + lint clean
- [ ] Manual: subscribe in real Google Calendar, confirm verify flip
- [ ] Manual: subscribe in real Apple Calendar (macOS), confirm verify flip
- [ ] Manual: subscribe in real Outlook on the web, confirm verify flip
- [ ] Manual: dashboard nudge appears for unconnected vendor; "Maybe later" persists
- [ ] Manual: post-first-booking prompt appears on the right booking only
- [ ] Apply migration 00064 to prod (manual, per policy)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Update MEMORY index after merge**

After merge to main and prod migration, add a new memory file `sub_project_l_calendar_feed_shipped.md` and an entry in `MEMORY.md`.

---

## Self-Review (against spec)

**Spec coverage:**

| Spec section                                   | Covered by                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| §2 In-scope: signed feed endpoint              | Tasks 4, 5, 6                                                         |
| §2 In-scope: connection/verification state     | Tasks 1, 5                                                            |
| §2 In-scope: feed-generation service           | Tasks 4, 5                                                            |
| §2 In-scope: dashboard sync card               | Tasks 10, 11                                                          |
| §2 In-scope: connection modal                  | Task 9                                                                |
| §2 In-scope: dashboard nudge                   | Task 12                                                               |
| §2 In-scope: post-first-booking prompt         | Task 13                                                               |
| §3.1 schema (migration 00064)                  | Task 1                                                                |
| §3.2 API surface (6 routes)                    | Tasks 6, 7                                                            |
| §3.3 UA verification                           | Tasks 2, 5                                                            |
| §3.4 ICS generation                            | Task 5                                                                |
| §3.5 rate limiting                             | Task 6                                                                |
| §3.6 security (token format, URL secrecy copy) | Tasks 4, 10                                                           |
| §3.7 component structure                       | Tasks 8–13                                                            |
| §3.8 status freshness polling                  | Task 10                                                               |
| §3.9 test coverage                             | Tasks 2, 3, 4, 5, 6, 7, 14                                            |
| §4 UI states                                   | Tasks 9, 10, 12, 13                                                   |
| §6 risks                                       | mitigations baked into rate limit (T6), UA fallback (T2), copy in T10 |
| §7 rollout                                     | Tasks 1, 15                                                           |
| §9 definition of done                          | Task 15                                                               |

No gaps.

**Type consistency check:**

- `FeedStatus` interface — defined in Task 5; consumed by Tasks 7 (status route), 10 (card), 12 (nudge), 13 (prompt). Identical fields throughout.
- `recognizeProvider` return type `'google' | 'apple' | 'outlook' | 'other' | null` — defined in Task 2; consumed by Task 5 in `recordPoll`.
- `IntentMethod` (literal union `'google' | 'apple' | 'outlook' | 'copy'`) — used in Tasks 7 (API), 9 (modal), 10 (card), 12 (nudge), 13 (prompt). Consistent.
- `buildIcsForVendor(supabase, vendorProfileId)` — defined Task 5; consumed Task 6.
- `getOrCreateFeedToken(supabase, vendorProfileId)`, `rotateFeedToken(supabase, vendorProfileId)` — defined Task 4; consumed Task 7.
- `recordPoll(args)` — defined Task 5; consumed Task 6.
- `getFeedStatus(supabase, vendorProfileId, publicBaseUrl)` — defined Task 5; consumed Tasks 7, 11, 12, 13.

No drift.

**Placeholder scan:** no `TBD`/`TODO`/`fill in details`/`add appropriate error handling` outside of the spec-quoted "TODO: human smoke-test once" string in §3.9 (which is documentation about a note we add to code, not an unresolved placeholder).
