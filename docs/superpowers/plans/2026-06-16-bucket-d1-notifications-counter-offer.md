# Bucket D.1 — Notifications + Counter-Offer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every booking-state notification + email fire reliably, surface inline action buttons on notification rows, and ship the couple-counter feature with a 2-round-trip cap.

**Architecture:** A small `deliver()` helper wraps every existing `notify*` / `send*Email` call site so failures log loudly instead of disappearing into bare `void(...)` calls. Three new Resend templates fill the gaps where notifications exist but emails do not. An `ActionMap` config drives per-type action buttons in `NotificationDropdown` + `/dashboard/notifications`, deep-linked to the existing booking-detail page via `?action=X`. A new couple-counter action ships in parallel: schema migration, service method, endpoint, UI, notification, email. Caps on both sides enforced at the service layer and as DB `CHECK` constraints.

**Tech Stack:** Next.js 14 App Router · Supabase (Postgres + RLS, TEXT+CHECK constraints, not Postgres enums) · Resend (transactional email) · Stripe (deposit only — balance is off-platform) · Tailwind + shadcn/Radix · Vitest (unit) · Playwright (E2E, workers=1, fullyParallel=false) · `tsx` for one-off scripts.

## Global Constraints

- **Spec source of truth:** `docs/superpowers/specs/2026-06-16-bucket-d1-notifications-reliability-design.md` — every task's requirements implicitly include the spec's locked rules. If a task contradicts the spec, the spec wins.
- **Git workflow:** branch off `main` → `feat/d1-notifications-counter-offer` → squash-merge via `gh pr create`. NEVER commit directly to `main` (AGENTS.md rule).
- **Migrations:** Claude applies dev migrations via psql directly; user applies prod migrations manually (memory: `migration_apply_policy`). Next free migration numbers: `00055`, `00056`.
- **Schema shape gotcha:** Both `bookings.status` and `notifications.type` are `TEXT` with `CHECK` constraints, NOT Postgres enums. New values require dropping and recreating the CHECK constraint. The implementation step must read the **current** constraint definition from `pg_constraint` first to avoid regressing previously-added values.
- **Each side sees only its own remaining count.** This rule applies to every UI surface, every notification body, and every API error message. No leakage of the other side's state.
- **Baazar does not process the balance.** Email + UI copy must not imply "Pay balance through Baazar." Only the deposit (10% / 5%) is on-platform.
- **Brand tokens (from `docs/DESIGN.md`):** ink `#1B1414`, cream `#FBF6EC`, hot-pink `#D1006C`.
- **Resend From:** `Baazar.io <noreply@baazar.io>` (existing constant in `src/lib/email/resend.ts`).
- **Resend prod env-gates:** D.1 code does not deploy until `RESEND_API_KEY` is set in Vercel production AND `baazar.io` is SPF + DKIM verified in the Resend dashboard. Task 1 is the gate.
- **No outbox table, no background worker, no retry-with-backoff, no Sentry, no per-user prefs.** Out of scope.

---

## File Structure

**New files:**

- `supabase/migrations/00055_add_notification_delivery_status.sql`
- `supabase/migrations/00056_add_counter_offer_cap.sql`
- `src/lib/notifications/deliver.ts` — `deliver()` helper
- `src/lib/email/__mocks__/resend.ts` — vitest mock recording sends
- `src/lib/email/event-completed.tsx` — template
- `src/lib/email/custom-request.tsx` — template
- `src/lib/email/review-received.tsx` — template
- `src/lib/email/couple-countered.tsx` — template
- `src/app/dev/email-previews/[name]/page.tsx` — dev-only preview route
- `src/components/notifications/actions.ts` — `ActionMap` config
- `src/app/api/bookings/[id]/counter/route.ts` — couple-counter endpoint
- `tests/e2e/notifications-d1-happy-path.spec.ts`
- `tests/e2e/notifications-d1-counter-cap.spec.ts`
- `tests/e2e/notifications-d1-action-buttons.spec.ts`

**Modified files:**

- `src/types/database.types.ts` — add `NotificationType` value `'couple_countered'`, add `BookingStatus` value `'couple_countered'`, extend `Notification` row type with delivery-status columns.
- `src/services/notifications.service.ts` — add `notifyCoupleCountered`, accept optional `notification_id` link return for paired emails.
- `src/services/payment.service.ts` — replace 5 `void(...)` sites with `deliver()`.
- `src/services/booking.service.ts` — replace any `void(...)` sites with `deliver()`; add `coupleCounterBooking()`; enforce vendor adjust cap.
- `src/app/api/bookings/[id]/adjust/route.ts` — return 409 when cap reached.
- `src/app/api/custom-request/route.ts` — wire `sendCustomRequestEmail` via `deliver()`.
- `src/app/api/reviews/route.ts` — wire `sendReviewReceivedEmail` via `deliver()`.
- `src/app/dashboard/bookings/[id]/page.tsx` (or its server component) — read `searchParams.action`, auto-open the matching modal, replace history to strip the query; show remaining-count helper text.
- `src/components/notifications/NotificationCard.tsx` — render action buttons from `ActionMap`; render ⚠ on `email_status='failed'`.
- `src/components/notifications/NotificationDropdown.tsx` — primary action only.
- `src/components/notifications/NotificationsPageClient.tsx` — full action set.
- `src/lib/email/resend.ts` — surface a `sendWithRecord()` wrapper that updates `notifications.email_status` when given an optional `notification_id`.

---

## Task List

- **T1.** Resend prod verification + DNS check (operational gate)
- **T2.** Migration 00055 — delivery-status columns + types update
- **T3.** `deliver()` helper + unit tests
- **T4.** Email send wrapper updates `notifications.email_status`
- **T5.** Replace `void(...)` call sites with `deliver()` in `payment.service.ts` + `booking.service.ts`
- **T6.** Vitest mock for Resend (`src/lib/email/__mocks__/resend.ts`)
- **T7.** Email template — `sendEventCompletedEmail` + preview + wire-up
- **T8.** Email template — `sendCustomRequestEmail` + preview + wire-up
- **T9.** Email template — `sendReviewReceivedEmail` + preview + wire-up
- **T10.** `ActionMap` config + `NotificationCard` action buttons + dropdown primary-only
- **T11.** `?action=X` query handler on booking-detail page (mark-read + open modal + strip history)
- **T12.** Migration 00056 — counter-offer schema + types update
- **T13.** `coupleCounterBooking()` service method + cap enforcement + unit tests
- **T14.** `POST /api/bookings/[id]/counter` endpoint + unit tests
- **T15.** Vendor `adjustBooking` cap enforcement (service + endpoint) + unit tests
- **T16.** `notifyCoupleCountered` helper + `sendCoupleCounteredEmail` template + preview + wire-up
- **T17.** Vendor booking-detail UI — Adjust button helper text + disable
- **T18.** Couple booking-detail UI — Counter button + Counter modal + remaining-count helper
- **T19.** Playwright happy-path spec
- **T20.** Playwright counter-cap spec
- **T21.** Playwright action-buttons spec
- **T22.** Open PR + manual smoke

---

### Task 1: Resend prod verification + DNS check

**Files:** none (operational; results documented inline below).

**Interfaces:**

- Consumes: nothing.
- Produces: a verified prod `RESEND_API_KEY` env var + verified `baazar.io` DNS. Documents the verification commands the next tasks rely on as a precondition.

- [ ] **Step 1: Check Vercel prod env**

```bash
vercel env ls production | grep RESEND_API_KEY
```

Expected output: a line beginning with `RESEND_API_KEY  production`. If empty, run:

```bash
vercel env add RESEND_API_KEY production
```

Paste the value from `.env.local` (line beginning `RESEND_API_KEY=re_...`).

- [ ] **Step 2: Confirm Resend domain verification**

Open https://resend.com/domains in the Resend dashboard. Confirm `baazar.io` shows status **Verified** with green SPF + DKIM badges. If not verified, add the displayed TXT records to the DNS provider (Vercel Domains or wherever `baazar.io` is hosted) and wait for verification — Resend silently 422s sends without DKIM.

- [ ] **Step 3: Smoke test send**

```bash
RESEND_API_KEY=<prod-key> tsx -e "
import { Resend } from 'resend';
const r = new Resend(process.env.RESEND_API_KEY);
const out = await r.emails.send({
  from: 'Baazar.io <noreply@baazar.io>',
  to: 'sardarm.khan942@gmail.com',
  subject: 'D.1 smoke test',
  html: '<p>If you see this, Resend prod is wired correctly.</p>',
});
console.log(out);
"
```

Expected output: `{ data: { id: 're_...' }, error: null }` and the email lands in the inbox within ~30s. If `error: { ... }`, fix DNS / key before proceeding.

- [ ] **Step 4: No commit needed — operational task.** Proceed to T2 once all three steps succeed.

---

### Task 2: Migration 00055 — delivery-status columns + types update

**Files:**

- Create: `supabase/migrations/00055_add_notification_delivery_status.sql`
- Modify: `src/types/database.types.ts:889` area — extend the `notifications` row type with three columns

**Interfaces:**

- Consumes: nothing.
- Produces: `notifications.email_status`, `notifications.email_error`, `notifications.email_attempted_at` columns; updated `Database['public']['Tables']['notifications']['Row']` type with the same.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/00055_add_notification_delivery_status.sql
-- Sub-project D.1: track email delivery state per notification.
-- Reason: we need to know when emails silently fail. Pairs with the
-- deliver('email', ...) wrapper introduced in src/lib/notifications/deliver.ts.

ALTER TABLE notifications
  ADD COLUMN email_status TEXT
    NOT NULL
    DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  ADD COLUMN email_error TEXT,
  ADD COLUMN email_attempted_at TIMESTAMPTZ;

CREATE INDEX notifications_failed_emails_idx
  ON notifications (user_id, email_attempted_at DESC)
  WHERE email_status = 'failed';
```

- [ ] **Step 2: Apply to dev DB**

```bash
PGPASSWORD="$DEV_DB_PASSWORD" psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00055_add_notification_delivery_status.sql
```

Expected output: `ALTER TABLE` and `CREATE INDEX` with no errors.

- [ ] **Step 3: Verify columns exist**

```bash
PGPASSWORD="$DEV_DB_PASSWORD" psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "\d notifications"
```

Expected: three new columns listed.

- [ ] **Step 4: Update the TS row type**

In `src/types/database.types.ts`, locate the `notifications` Row type definition (search for `notifications: {` then `Row: {`). Add:

```ts
email_status: 'pending' | 'sent' | 'failed' | 'skipped';
email_error: string | null;
email_attempted_at: string | null;
```

Add the same three keys to the `Insert` and `Update` interfaces, each `?` optional with the same union type.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00055_add_notification_delivery_status.sql src/types/database.types.ts
git commit -m "feat(notifications): add delivery_status columns (D.1 migration 00055)"
```

---

### Task 3: `deliver()` helper + unit tests

**Files:**

- Create: `src/lib/notifications/deliver.ts`
- Create: `src/__tests__/lib/notifications/deliver.test.ts`

**Interfaces:**

- Consumes: existing `logger` from `src/lib/logger.ts` (verify path during implementation — fall back to a `console.error` wrapper if not present).
- Produces:

  ```ts
  export type DeliverKind = 'notify' | 'email';
  export function deliver<T>(
    kind: DeliverKind,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T | null>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/notifications/deliver.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliver } from '@/lib/notifications/deliver';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('deliver()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the inner result on success', async () => {
    const result = await deliver('notify', async () => ({ id: 'n_1' }));
    expect(result).toEqual({ id: 'n_1' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns null on error and logs structured failure', async () => {
    const err = new Error('rls denied');
    const result = await deliver(
      'email',
      async () => {
        throw err;
      },
      { booking_id: 'b_1' }
    );
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'delivery_failure',
      expect.objectContaining({
        kind: 'email',
        error: 'rls denied',
        context: { booking_id: 'b_1' },
      })
    );
  });

  it('handles non-Error throws without crashing', async () => {
    const result = await deliver('notify', async () => {
      throw 'string-error';
    });
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'delivery_failure',
      expect.objectContaining({
        kind: 'notify',
        error: 'string-error',
      })
    );
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
npm run test:unit -- deliver
```

Expected: FAIL — `Cannot find module '@/lib/notifications/deliver'`.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/notifications/deliver.ts
import { logger } from '@/lib/logger';

export type DeliverKind = 'notify' | 'email';

/**
 * Wraps a notify or email send so the caller never has to remember to
 * .catch(). Failures log structured errors and resolve to null. The
 * surrounding business logic stays succeeding.
 */
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

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm run test:unit -- deliver
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/deliver.ts src/__tests__/lib/notifications/deliver.test.ts
git commit -m "feat(notifications): add deliver() helper for non-throwing notify+email wraps"
```

---

### Task 4: Email send wrapper updates `notifications.email_status`

**Files:**

- Modify: `src/lib/email/resend.ts` — add an exported `sendWithRecord()` wrapper used by each `send*Email` helper.
- Create: `src/__tests__/lib/email/send-with-record.test.ts`

**Interfaces:**

- Consumes: existing `Resend` client init in `src/lib/email/resend.ts`, the service-role Supabase client builder from `src/lib/supabase/server.ts`.
- Produces:

  ```ts
  export async function sendWithRecord(args: {
    to: string;
    subject: string;
    html: string;
    notificationId?: string; // when provided, updates that row's email_status
  }): Promise<{ ok: boolean; id?: string; error?: string }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/email/send-with-record.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWithRecord } from '@/lib/email/resend';

const mockSend = vi.fn();
const mockFrom = vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn() })) }));

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: mockSend } })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(async () => ({ from: mockFrom })),
}));

describe('sendWithRecord()', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockFrom.mockClear();
    process.env.RESEND_API_KEY = 'test_key';
  });

  it('records sent status when send succeeds and notificationId provided', async () => {
    mockSend.mockResolvedValue({ data: { id: 're_1' }, error: null });
    const out = await sendWithRecord({
      to: 'x@y.z',
      subject: 's',
      html: '<p>h</p>',
      notificationId: 'n_1',
    });
    expect(out.ok).toBe(true);
    expect(out.id).toBe('re_1');
    expect(mockFrom).toHaveBeenCalledWith('notifications');
  });

  it('records failed status when Resend returns error', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'DKIM not verified' } });
    const out = await sendWithRecord({
      to: 'x@y.z',
      subject: 's',
      html: '<p>h</p>',
      notificationId: 'n_1',
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('DKIM not verified');
  });

  it('skips update when notificationId omitted', async () => {
    mockSend.mockResolvedValue({ data: { id: 're_2' }, error: null });
    const out = await sendWithRecord({ to: 'x@y.z', subject: 's', html: '<p>h</p>' });
    expect(out.ok).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, watch it fail**

```bash
npm run test:unit -- send-with-record
```

Expected: FAIL — `sendWithRecord is not exported`.

- [ ] **Step 3: Add `sendWithRecord` to `src/lib/email/resend.ts`**

Append the following export. Do not touch existing exports.

```ts
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function sendWithRecord(args: {
  to: string;
  subject: string;
  html: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const resend = getResendClient(); // existing private getter; if not present, inline `new Resend(...)`
  const { data, error } = await resend.emails.send({
    from: 'Baazar.io <noreply@baazar.io>',
    to: args.to,
    subject: args.subject,
    html: args.html,
  });

  const now = new Date().toISOString();
  const ok = !error;
  const update = ok
    ? { email_status: 'sent' as const, email_attempted_at: now }
    : {
        email_status: 'failed' as const,
        email_attempted_at: now,
        email_error: error?.message ?? 'unknown',
      };

  if (args.notificationId) {
    const sb = await createServiceRoleClient();
    await sb.from('notifications').update(update).eq('id', args.notificationId);
  }

  return ok ? { ok: true, id: data?.id } : { ok: false, error: error?.message ?? 'unknown' };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm run test:unit -- send-with-record
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/resend.ts src/__tests__/lib/email/send-with-record.test.ts
git commit -m "feat(email): add sendWithRecord wrapper to update notifications.email_status"
```

---

### Task 5: Replace `void(...)` call sites with `deliver()`

**Files:**

- Modify: `src/services/payment.service.ts` — five call sites (lines ~340, 346, 619–629, 821–824, 895–898, 911–918 per the audit; verify with grep before editing).
- Modify: `src/services/booking.service.ts` — any `void notify*` or unwrapped `send*Email` sites.

**Interfaces:**

- Consumes: `deliver` from `@/lib/notifications/deliver` (T3).
- Produces: same observable behavior, but every notify+email call now logs structured errors on failure instead of silently disappearing.

- [ ] **Step 1: Find every site**

```bash
grep -n "void notify\|void send" src/services/payment.service.ts src/services/booking.service.ts
```

- [ ] **Step 2: Write a regression test against the auto-cancel path**

```ts
// src/__tests__/services/payment-service-deliver.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as notif from '@/services/notifications.service';
import * as email from '@/lib/email/auto-cancel'; // existing
import * as deliverMod from '@/lib/notifications/deliver';

describe('autoCancelExpiredBookings — deliver() wraps notify+email', () => {
  it('invokes deliver("notify") and deliver("email") for each cancelled booking', async () => {
    const deliverSpy = vi.spyOn(deliverMod, 'deliver');
    // ...minimal seed: one expired booking, mock supabase client, call autoCancelExpiredBookings()
    // assert deliverSpy invocations include kind 'notify' and 'email'
    expect(deliverSpy).toHaveBeenCalledWith('notify', expect.any(Function), expect.any(Object));
    expect(deliverSpy).toHaveBeenCalledWith('email', expect.any(Function), expect.any(Object));
  });
});
```

(The implementer fills in the supabase mock from the patterns already used in `src/__tests__/services/payment.service.test.ts`.)

- [ ] **Step 3: Run, watch it fail**

```bash
npm run test:unit -- payment-service-deliver
```

Expected: FAIL — `deliver` not called.

- [ ] **Step 4: Rewrite every call site**

Pattern: replace

```ts
void notifyXyz(supabase, userId, ctx);
sendXyzEmail({ ... });
```

with

```ts
await deliver('notify', () => notifyXyz(supabase, userId, ctx), { booking_id: ctx.bookingId });
await deliver('email', () => sendXyzEmail({ ... }), { booking_id: ctx.bookingId });
```

Add the import to the top of each modified file: `import { deliver } from '@/lib/notifications/deliver';`.

Sites to update (verify against grep — list as of audit):

- `payment.service.ts:340,346` — auto-cancel notify + email
- `payment.service.ts:619–629` — manual cancel notify
- `payment.service.ts:821–824` — booking-completed email
- `payment.service.ts:895,898` — event-completed notify (both couple + vendor)
- `payment.service.ts:911–918` — booking-completed notify
- `payment.service.ts:203,206,223,229` — deposit_paid / booking_confirmed
- Any matches in `booking.service.ts`.

- [ ] **Step 5: Run all tests**

```bash
npm run test:unit
```

Expected: full test suite passes (no regressions). The new deliver test passes.

- [ ] **Step 6: Commit**

```bash
git add src/services/payment.service.ts src/services/booking.service.ts src/__tests__/services/payment-service-deliver.test.ts
git commit -m "fix(notifications): wrap every notify+email call in deliver() (D.1 reliability)"
```

---

### Task 6: Vitest mock for Resend

**Files:**

- Create: `src/lib/email/__mocks__/resend.ts`
- Modify: `vitest.config.ts` (only if needed to wire the manual mock; verify first).

**Interfaces:**

- Consumes: same signature as `src/lib/email/resend.ts`.
- Produces:

  ```ts
  export function getRecordedSends(): RecordedSend[];
  export function clearRecordedSends(): void;
  export async function sendWithRecord(args): Promise<{ ok: true; id: string }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/email/resend-mock.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { sendWithRecord, getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('Resend mock', () => {
  beforeEach(() => clearRecordedSends());

  it('records the sent payload', async () => {
    const out = await sendWithRecord({ to: 'a@b.c', subject: 'hi', html: '<p>x</p>' });
    expect(out.ok).toBe(true);
    expect(getRecordedSends()).toEqual([
      expect.objectContaining({ to: 'a@b.c', subject: 'hi', html: '<p>x</p>' }),
    ]);
  });

  it('clearRecordedSends resets the store', async () => {
    await sendWithRecord({ to: 'a@b.c', subject: 'hi', html: '<p>x</p>' });
    clearRecordedSends();
    expect(getRecordedSends()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, watch it fail.**

```bash
npm run test:unit -- resend-mock
```

- [ ] **Step 3: Implement the mock**

```ts
// src/lib/email/__mocks__/resend.ts
export interface RecordedSend {
  to: string;
  subject: string;
  html: string;
  notificationId?: string;
  at: string;
}

let store: RecordedSend[] = [];

export function getRecordedSends(): RecordedSend[] {
  return [...store];
}

export function clearRecordedSends(): void {
  store = [];
}

export async function sendWithRecord(args: {
  to: string;
  subject: string;
  html: string;
  notificationId?: string;
}): Promise<{ ok: true; id: string }> {
  store.push({ ...args, at: new Date().toISOString() });
  return { ok: true, id: `mock_${store.length}` };
}
```

- [ ] **Step 4: Confirm pass.**

```bash
npm run test:unit -- resend-mock
```

- [ ] **Step 5: Commit.**

```bash
git add src/lib/email/__mocks__/resend.ts src/__tests__/lib/email/resend-mock.test.ts
git commit -m "test(email): add Resend mock that records sends for assertions"
```

---

### Task 7: `sendEventCompletedEmail` + preview + wire-up

**Files:**

- Create: `src/lib/email/event-completed.tsx` — template render + `sendEventCompletedEmail` export.
- Create: `src/app/dev/email-previews/event-completed/page.tsx` — preview route (dev-only gate via `NODE_ENV !== 'production'`).
- Modify: `src/services/payment.service.ts` — wire send into the existing event-complete callsite already rewritten in T5.
- Create: `src/__tests__/lib/email/event-completed.test.ts`

**Interfaces:**

- Consumes: `sendWithRecord` from `@/lib/email/resend`, `deliver` from `@/lib/notifications/deliver`.
- Produces:

  ```ts
  export async function sendEventCompletedEmail(args: {
    to: string;
    recipientRole: 'couple' | 'vendor';
    vendorName: string;
    coupleName: string;
    eventTypeLabel: string;
    sequence: number;
    eventsCount: number;
    bookingId: string;
    notificationId?: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/email/event-completed.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/email/resend', () => import('@/lib/email/__mocks__/resend'));

import { sendEventCompletedEmail } from '@/lib/email/event-completed';
import { getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('sendEventCompletedEmail()', () => {
  beforeEach(() => clearRecordedSends());

  it('couple variant subject + body framing', async () => {
    await sendEventCompletedEmail({
      to: 'c@x.com',
      recipientRole: 'couple',
      vendorName: 'Epic Events',
      coupleName: 'Sam',
      eventTypeLabel: 'Sangeet',
      sequence: 1,
      eventsCount: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toContain('Event 1 of 2 marked complete with Epic Events');
    expect(send.html).toContain('owed directly to Epic Events');
    expect(send.html).not.toContain('Pay balance'); // <- spec rule: not the payment rail
  });

  it('vendor variant subject + body framing', async () => {
    await sendEventCompletedEmail({
      to: 'v@x.com',
      recipientRole: 'vendor',
      vendorName: 'Epic Events',
      coupleName: 'Sam',
      eventTypeLabel: 'Sangeet',
      sequence: 1,
      eventsCount: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toContain('marked complete with Sam');
    expect(send.html).toContain('Collect the balance per your payment terms');
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm run test:unit -- event-completed
```

- [ ] **Step 3: Implement the template**

```tsx
// src/lib/email/event-completed.tsx
import { sendWithRecord } from '@/lib/email/resend';

function renderHtml(args: {
  recipientRole: 'couple' | 'vendor';
  vendorName: string;
  coupleName: string;
  eventTypeLabel: string;
  sequence: number;
  eventsCount: number;
  bookingId: string;
}): string {
  const intro =
    args.recipientRole === 'couple'
      ? `Hope <strong>${args.eventTypeLabel}</strong> was a great day.`
      : `Baazar marked <strong>${args.eventTypeLabel}</strong> complete with ${args.coupleName}.`;
  const balanceLine =
    args.recipientRole === 'couple'
      ? `The remaining balance is owed directly to <strong>${args.vendorName}</strong> per their payment terms — Baazar collected your deposit; the rest is between you two.`
      : `Collect the balance per your payment terms. Once all events for this booking finish, platform funds release and the couple receives a review request.`;
  const reviewLine =
    args.recipientRole === 'couple'
      ? `Once all your booked events finish, we'll ask you to leave a review.`
      : '';
  return `
    <div style="font-family: -apple-system, sans-serif; background:#FBF6EC; color:#1B1414; padding:24px;">
      <h1 style="font-size:22px; margin:0 0 16px;">Event ${args.sequence} of ${args.eventsCount} marked complete</h1>
      <p>${intro}</p>
      <p>${balanceLine}</p>
      ${reviewLine ? `<p>${reviewLine}</p>` : ''}
      <p style="margin-top:24px;">
        <a href="https://www.baazar.io/dashboard/bookings/${args.bookingId}"
           style="background:#1B1414; color:#FBF6EC; padding:12px 20px; text-decoration:none; border-radius:6px;">
          View booking
        </a>
      </p>
    </div>
  `;
}

export async function sendEventCompletedEmail(args: {
  to: string;
  recipientRole: 'couple' | 'vendor';
  vendorName: string;
  coupleName: string;
  eventTypeLabel: string;
  sequence: number;
  eventsCount: number;
  bookingId: string;
  notificationId?: string;
}) {
  const subject =
    args.recipientRole === 'couple'
      ? `Event ${args.sequence} of ${args.eventsCount} marked complete with ${args.vendorName}`
      : `Event ${args.sequence} of ${args.eventsCount} marked complete with ${args.coupleName}`;
  return sendWithRecord({
    to: args.to,
    subject,
    html: renderHtml(args),
    notificationId: args.notificationId,
  });
}
```

- [ ] **Step 4: Add the preview route**

```tsx
// src/app/dev/email-previews/event-completed/page.tsx
import { notFound } from 'next/navigation';

export default function Preview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const html = `<iframe srcdoc="${'... renderHtml(sample) ...'}" style="width:100%; height:90vh; border:none;"></iframe>`;
  // Implementer: import renderHtml and pass a sample args object. Render two iframes side-by-side (couple + vendor).
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 5: Wire into the event-complete site in `payment.service.ts`**

Replace the deliver-wrapped notify call with the notify-then-email pattern:

```ts
const notifyResult = await deliver(
  'notify',
  () => notifyEventCompleted(supabase, b.couple_user_id, evPayload),
  { booking_id: b.id }
);
if (notifyResult?.id) {
  await deliver(
    'email',
    () =>
      sendEventCompletedEmail({
        to: coupleEmail,
        recipientRole: 'couple',
        vendorName: vendorDisplayName,
        coupleName: coupleDisplayName,
        eventTypeLabel: ev.event_type_label,
        sequence: ev.sequence,
        eventsCount: events.length,
        bookingId: b.id,
        notificationId: notifyResult.id,
      }),
    { booking_id: b.id }
  );
}
// repeat for vendor side
```

(The implementer fetches `coupleEmail` + `vendorDisplayName` from the existing booking query joins; extend the select if needed.)

- [ ] **Step 6: Run all tests**

```bash
npm run test:unit
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/email/event-completed.tsx src/app/dev/email-previews/event-completed/page.tsx src/services/payment.service.ts src/__tests__/lib/email/event-completed.test.ts
git commit -m "feat(email): add sendEventCompletedEmail + wire to event-complete cron (D.1)"
```

---

### Task 8: `sendCustomRequestEmail` + preview + wire-up

**Files:**

- Create: `src/lib/email/custom-request.tsx`
- Create: `src/app/dev/email-previews/custom-request/page.tsx`
- Modify: `src/app/api/custom-request/route.ts` — wire send after notify (line ~68 per audit).
- Create: `src/__tests__/lib/email/custom-request.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export async function sendCustomRequestEmail(args: {
    to: string;
    coupleFirstName: string;
    coupleCity: string;
    eventType: string;
    eventDate: string; // YYYY-MM-DD
    headcount: number;
    location: string;
    description: string; // truncated to 200 chars before send
    bookingId: string;
    notificationId?: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/email/custom-request.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@/lib/email/resend', () => import('@/lib/email/__mocks__/resend'));
import { sendCustomRequestEmail } from '@/lib/email/custom-request';
import { getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('sendCustomRequestEmail()', () => {
  beforeEach(() => clearRecordedSends());

  it('subject contains first name only + truncates description to 200', async () => {
    const longDesc = 'a'.repeat(500);
    await sendCustomRequestEmail({
      to: 'v@x.com',
      coupleFirstName: 'Sam',
      coupleCity: 'Chicago',
      eventType: 'sangeet',
      eventDate: '2026-07-15',
      headcount: 120,
      location: 'Drury Lane',
      description: longDesc,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toBe('New custom request from Sam — sangeet on 2026-07-15');
    expect(send.html).not.toContain('a'.repeat(300));
    expect(send.html).toContain('a'.repeat(200));
  });
});
```

- [ ] **Step 2: Run, watch fail.** `npm run test:unit -- custom-request`

- [ ] **Step 3: Implement template** (follow Task 7 pattern; render HTML with cream/ink wrapper; CTA → `/dashboard/bookings/[id]`).

- [ ] **Step 4: Add preview route** under `src/app/dev/email-previews/custom-request/page.tsx`.

- [ ] **Step 5: Wire into `src/app/api/custom-request/route.ts`** — replace the existing `notifyCustomRequestReceived` call with a `deliver('notify',...)` followed by `deliver('email',...)`. Fetch vendor email from the `vendor_profiles` join.

- [ ] **Step 6: Run tests.** Expected: pass.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/email/custom-request.tsx src/app/dev/email-previews/custom-request/page.tsx src/app/api/custom-request/route.ts src/__tests__/lib/email/custom-request.test.ts
git commit -m "feat(email): add sendCustomRequestEmail + wire to /api/custom-request (D.1)"
```

---

### Task 9: `sendReviewReceivedEmail` + preview + wire-up

**Files:**

- Create: `src/lib/email/review-received.tsx`
- Create: `src/app/dev/email-previews/review-received/page.tsx`
- Modify: `src/app/api/reviews/route.ts` — wire send after notify (line ~55 per audit).
- Create: `src/__tests__/lib/email/review-received.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export async function sendReviewReceivedEmail(args: {
    to: string;
    coupleName: string;
    rating: number; // 1–5
    body: string; // truncated to 240 chars before send
    vendorSlug: string;
    notificationId?: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/email/review-received.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@/lib/email/resend', () => import('@/lib/email/__mocks__/resend'));
import { sendReviewReceivedEmail } from '@/lib/email/review-received';
import { getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('sendReviewReceivedEmail()', () => {
  beforeEach(() => clearRecordedSends());

  it('renders star glyphs + truncates body to 240', async () => {
    await sendReviewReceivedEmail({
      to: 'v@x.com',
      coupleName: 'Sam & Riya',
      rating: 4,
      body: 'b'.repeat(500),
      vendorSlug: 'epic-events',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toBe('Sam & Riya left you a 4-star review');
    expect(send.html).toContain('★★★★☆');
    expect(send.html).toContain('b'.repeat(240));
    expect(send.html).not.toContain('b'.repeat(260));
    expect(send.html).toContain('/vendors/epic-events?tab=reviews');
  });
});
```

- [ ] **Step 2: Watch fail.** `npm run test:unit -- review-received`

- [ ] **Step 3: Implement.** Star helper:

  ```ts
  const stars = '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
  ```

  CTA → `https://www.baazar.io/vendors/${vendorSlug}?tab=reviews`.

- [ ] **Step 4: Preview route.**

- [ ] **Step 5: Wire into `src/app/api/reviews/route.ts`** with `deliver('notify',...)` → `deliver('email',...)`. Fetch vendor email + slug from join.

- [ ] **Step 6: Tests.** Pass.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/email/review-received.tsx src/app/dev/email-previews/review-received/page.tsx src/app/api/reviews/route.ts src/__tests__/lib/email/review-received.test.ts
git commit -m "feat(email): add sendReviewReceivedEmail + wire to /api/reviews (D.1)"
```

---

### Task 10: `ActionMap` config + `NotificationCard` action buttons + dropdown primary-only

**Files:**

- Create: `src/components/notifications/actions.ts`
- Modify: `src/components/notifications/NotificationCard.tsx` — render button row + ⚠ on failed email_status
- Modify: `src/components/notifications/NotificationDropdown.tsx` — primary-only
- Modify: `src/components/notifications/NotificationsPageClient.tsx` — full action set
- Create: `src/__tests__/components/notifications/actions.test.ts`

**Interfaces:**

- Consumes: `NotificationType` (from `src/types/database.types.ts`), notification row shape.
- Produces:

  ```ts
  export type ActionVariant = 'primary' | 'secondary' | 'destructive';
  export interface ActionConfig {
    label: string;
    variant: ActionVariant;
    href: (n: Notification) => string;
  }
  export type ActionMap = Partial<Record<NotificationType, ActionConfig[]>>;
  export const NOTIFICATION_ACTIONS: ActionMap;
  ```

- [ ] **Step 1: Write the failing test for the config map**

```ts
// src/__tests__/components/notifications/actions.test.ts
import { describe, it, expect } from 'vitest';
import { NOTIFICATION_ACTIONS } from '@/components/notifications/actions';

describe('NOTIFICATION_ACTIONS map', () => {
  it('booking_request_received has Accept primary + Adjust + Decline', () => {
    const actions = NOTIFICATION_ACTIONS.booking_request_received!;
    expect(actions[0]).toMatchObject({ label: 'Accept', variant: 'primary' });
    expect(actions.find((a) => a.label === 'Adjust')).toBeDefined();
    expect(actions.find((a) => a.label === 'Decline')?.variant).toBe('destructive');
  });

  it('vendor_adjusted_quote has Accept + Counter + Decline', () => {
    const actions = NOTIFICATION_ACTIONS.vendor_adjusted_quote!;
    expect(actions.map((a) => a.label)).toEqual(['Accept', 'Counter', 'Decline']);
  });

  it('href builders include ?action= query', () => {
    const fakeRow = {
      id: 'n_1',
      type: 'booking_request_received' as const,
      metadata: { booking_id: 'b_1' },
      // ...minimal shape
    } as any;
    expect(NOTIFICATION_ACTIONS.booking_request_received![0].href(fakeRow)).toBe(
      '/dashboard/bookings/b_1?action=accept'
    );
  });
});
```

- [ ] **Step 2: Watch fail.** `npm run test:unit -- actions.test`

- [ ] **Step 3: Implement `actions.ts`**

Use the table in the spec § 5.4 verbatim. Each `href` reads `n.metadata.booking_id` and appends `?action=accept` / `?action=adjust` / `?action=decline` / `?action=pay-deposit` / `?action=counter` / `?action=leave-review` / `?action=send-quote` per the spec table.

- [ ] **Step 4: Confirm test passes.**

- [ ] **Step 5: Update `NotificationCard.tsx`**

```tsx
// In the card, below the body line:
const actions = NOTIFICATION_ACTIONS[notification.type] ?? [];
const variantClass = {
  primary: 'bg-ink text-cream',
  secondary: 'border border-ink text-ink bg-cream',
  destructive: 'text-hot-pink bg-cream',
}[a.variant];

return (
  <>
    {/* existing icon + title + body + timestamp */}
    {notification.email_status === 'failed' && (
      <span title="Email delivery failed" className="text-hot-pink">
        ⚠
      </span>
    )}
    {actions.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href(notification)}
            onClick={() => markRead(notification.id)}
            className={`rounded px-3 py-1.5 text-sm ${variantClass}`}
          >
            {a.label}
          </Link>
        ))}
      </div>
    )}
  </>
);
```

- [ ] **Step 6: Update `NotificationDropdown.tsx`** — render the card with a prop like `showAllActions={false}`; in primary-only mode, render only `actions[0]` if any.

- [ ] **Step 7: Update `NotificationsPageClient.tsx`** — render the card with `showAllActions={true}` (or simply unchanged if the default is "all").

- [ ] **Step 8: Run full unit suite + a manual eye check.**

```bash
npm run test:unit && npm run dev
```

Open `/dashboard/notifications` after seeding a row of each type via SQL (see helper one-liner in Task 21).

- [ ] **Step 9: Commit.**

```bash
git add src/components/notifications/actions.ts src/components/notifications/NotificationCard.tsx src/components/notifications/NotificationDropdown.tsx src/components/notifications/NotificationsPageClient.tsx src/__tests__/components/notifications/actions.test.ts
git commit -m "feat(notifications): add action buttons driven by ActionMap config (D.1)"
```

---

### Task 11: `?action=X` query handler on booking-detail page

**Files:**

- Modify: `src/app/dashboard/bookings/[id]/page.tsx` (or the client component beneath it) — read `searchParams.action`, open the matching modal, replace history to strip the query.

**Interfaces:**

- Consumes: action labels from `actions.ts` (the values in `?action=X`).
- Produces: auto-open behavior; spec § 5.3.

- [ ] **Step 1: Identify which modals already exist**

```bash
grep -rln "AcceptQuoteModal\|AdjustQuoteModal\|DeclineBookingModal\|PayDepositModal\|LeaveReviewModal\|SendQuoteModal\|CounterModal" src/app/dashboard/bookings/ src/components/ 2>/dev/null
```

For any that don't exist, the spec § 5.3 explicitly accepts degraded behavior: the user lands on the page with no modal opened. Mark those `?action=` values in a code comment as "stub — modal will land in feature task" but DO NOT block on them.

- [ ] **Step 2: Implement the auto-open handler**

In the client component (the leaf of `bookings/[id]/page.tsx`), add a `useEffect`:

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const ACTION_TO_MODAL: Record<string, () => void> = {
  accept: () => setAcceptModalOpen(true),
  adjust: () => setAdjustModalOpen(true),
  decline: () => setDeclineModalOpen(true),
  'pay-deposit': () => setPayDepositModalOpen(true),
  counter: () => setCounterModalOpen(true), // ships in T18
  'leave-review': () => setReviewModalOpen(true),
  'send-quote': () => setSendQuoteModalOpen(true),
};

useEffect(() => {
  const action = searchParams.get('action');
  if (action && ACTION_TO_MODAL[action]) {
    ACTION_TO_MODAL[action]();
    // strip the query so refresh doesn't reopen
    const url = new URL(window.location.href);
    url.searchParams.delete('action');
    router.replace(url.pathname + url.search, { scroll: false });
  }
}, [searchParams]);
```

- [ ] **Step 3: Manual smoke**

Visit `/dashboard/bookings/<any-id>?action=adjust` as a logged-in vendor. Confirm the Adjust modal opens and the URL becomes `/dashboard/bookings/<id>` without page reload.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/bookings/[id]/
git commit -m "feat(bookings): auto-open modal from ?action= query + strip history (D.1)"
```

---

### Task 12: Migration 00056 — counter-offer schema + types update

**Files:**

- Create: `supabase/migrations/00056_add_counter_offer_cap.sql`
- Modify: `src/types/database.types.ts` — extend `NotificationType` + `BookingStatus` + `bookings` row type.

**Interfaces:**

- Consumes: `notifications.type` + `bookings.status` current CHECK constraint definitions (read from `pg_constraint`).
- Produces: `vendor_adjustment_count`, `couple_counter_count` on `bookings`; `'couple_countered'` valid value in both `bookings.status` and `notifications.type` CHECK lists.

- [ ] **Step 1: Read the current CHECK constraints**

```bash
PGPASSWORD="$DEV_DB_PASSWORD" psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname IN ('bookings','notifications') AND c.conname LIKE '%_check' AND pg_get_constraintdef(c.oid) ILIKE '%CHECK%';"
```

Copy the two `CHECK (... IN (...))` lists verbatim into the migration's `IN (...)` clauses. Append `'couple_countered'` to both.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/00056_add_counter_offer_cap.sql
-- Sub-project D.1: couple-counter feature with 2-round-trip cap.

ALTER TABLE bookings
  ADD COLUMN vendor_adjustment_count SMALLINT
    NOT NULL DEFAULT 0
    CHECK (vendor_adjustment_count BETWEEN 0 AND 2),
  ADD COLUMN couple_counter_count SMALLINT
    NOT NULL DEFAULT 0
    CHECK (couple_counter_count BETWEEN 0 AND 2);

-- Replace bookings.status CHECK. Copy current values from pg_constraint
-- and append 'couple_countered'. DO NOT regenerate from memory — current
-- list may include values added after PR #10.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    -- <PASTE current values from step 1>,
    'couple_countered'
  ));

-- Same for notifications.type.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- <PASTE current values from step 1>,
    'couple_countered'
  ));
```

- [ ] **Step 3: Apply to dev**

```bash
PGPASSWORD="$DEV_DB_PASSWORD" psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00056_add_counter_offer_cap.sql
```

Expected: success. If `ERROR: check constraint violated`, abort — means existing data has an unexpected `status` value not in the CHECK list. Investigate before continuing.

- [ ] **Step 4: Update `src/types/database.types.ts`**

In `NotificationType` add `| 'couple_countered'`. In `BookingStatus` add `| 'couple_countered'`. In the `bookings` Row/Insert/Update interfaces add `vendor_adjustment_count: number;` and `couple_counter_count: number;`.

- [ ] **Step 5: Typecheck.** `npm run typecheck`. Expected pass.

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/00056_add_counter_offer_cap.sql src/types/database.types.ts
git commit -m "feat(bookings): add counter-offer cap schema (D.1 migration 00056)"
```

---

### Task 13: `coupleCounterBooking()` service method + cap enforcement + unit tests

**Files:**

- Modify: `src/services/booking.service.ts` — add `coupleCounterBooking()`.
- Create: `src/__tests__/services/booking-couple-counter.test.ts`

**Interfaces:**

- Consumes: existing `adjustBooking()` shape as a template.
- Produces:

  ```ts
  export async function coupleCounterBooking(args: {
    supabase: SupabaseClient<Database>;
    bookingId: string;
    actorUserId: string; // must equal bookings.couple_user_id
    proposedTotalCents: number;
    note?: string;
  }): Promise<
    | { ok: true; booking: BookingRow }
    | {
        ok: false;
        code: 'forbidden' | 'counter_cap_reached' | 'invalid_state' | 'not_found';
        message: string;
      }
  >;
  ```

- [ ] **Step 1: Write failing tests**

```ts
// src/__tests__/services/booking-couple-counter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coupleCounterBooking } from '@/services/booking.service';
// reuse the existing supabase mock pattern from booking.service.test.ts

describe('coupleCounterBooking()', () => {
  it('rejects with counter_cap_reached when couple_counter_count >= 2', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_1',
        couple_user_id: 'u_couple',
        couple_counter_count: 2,
        status: 'vendor_adjusted_quote',
      },
    });
    const out = await coupleCounterBooking({
      supabase,
      bookingId: 'b_1',
      actorUserId: 'u_couple',
      proposedTotalCents: 100_000,
    });
    expect(out).toMatchObject({ ok: false, code: 'counter_cap_reached' });
  });

  it('rejects with forbidden when actor is not the couple_user', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_1',
        couple_user_id: 'u_couple',
        couple_counter_count: 0,
        status: 'vendor_accepted',
      },
    });
    const out = await coupleCounterBooking({
      supabase,
      bookingId: 'b_1',
      actorUserId: 'u_other',
      proposedTotalCents: 100_000,
    });
    expect(out).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('rejects with invalid_state when status is not vendor_accepted or vendor_adjusted_quote', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_1',
        couple_user_id: 'u_couple',
        couple_counter_count: 0,
        status: 'deposit_paid',
      },
    });
    const out = await coupleCounterBooking({
      supabase,
      bookingId: 'b_1',
      actorUserId: 'u_couple',
      proposedTotalCents: 100_000,
    });
    expect(out).toMatchObject({ ok: false, code: 'invalid_state' });
  });

  it('on success: increments counter, sets status couple_countered, stores proposed total + note', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_1',
        couple_user_id: 'u_couple',
        couple_counter_count: 0,
        status: 'vendor_accepted',
      },
    });
    const out = await coupleCounterBooking({
      supabase,
      bookingId: 'b_1',
      actorUserId: 'u_couple',
      proposedTotalCents: 95_000,
      note: 'a bit lower please',
    });
    expect(out.ok).toBe(true);
    expect(supabase.updateCalls()).toContainEqual(
      expect.objectContaining({
        couple_counter_count: 1,
        status: 'couple_countered',
        couple_counter_amount: 95_000,
        couple_counter_note: 'a bit lower please',
      })
    );
  });
});
```

(Implementer wires the `mockSb` helper from the existing `booking.service.test.ts` pattern.)

- [ ] **Step 2: Watch fail.** `npm run test:unit -- couple-counter`

- [ ] **Step 3: Decide on transient columns vs reusing existing**

Decision: extend migration 00056 with two transient nullable columns to store the couple's most-recent counter — `couple_counter_amount INTEGER` and `couple_counter_note TEXT`. The vendor's adjust UI reads these when responding. Add them to migration 00056 now (before applying) and the type defs.

(Implementer: edit `00056_add_counter_offer_cap.sql` to include these columns, re-apply migration via `psql -f`. If migration already applied, write `00057_add_counter_offer_payload.sql` instead — do not re-edit a committed migration that ran on dev.)

- [ ] **Step 4: Implement `coupleCounterBooking()`** in `src/services/booking.service.ts`. Use the existing `adjustBooking()` as a template — single `update().eq()` query that increments + sets status atomically. Validate status transition: only allow from `vendor_accepted` or `vendor_adjusted_quote`.

- [ ] **Step 5: Tests pass.** `npm run test:unit -- couple-counter`

- [ ] **Step 6: Commit.**

```bash
git add src/services/booking.service.ts src/__tests__/services/booking-couple-counter.test.ts supabase/migrations/00056_add_counter_offer_cap.sql src/types/database.types.ts
git commit -m "feat(bookings): add coupleCounterBooking service + cap enforcement (D.1)"
```

---

### Task 14: `POST /api/bookings/[id]/counter` endpoint + unit tests

**Files:**

- Create: `src/app/api/bookings/[id]/counter/route.ts`
- Create: `src/__tests__/api/bookings-counter.test.ts`

**Interfaces:**

- Consumes: `coupleCounterBooking()` from T13.
- Produces: HTTP endpoint that accepts `{ totalCents: number, note?: string }`, returns `200 { booking }` on success, `409 { code: 'counter_cap_reached', message }` when capped, `403 { code: 'forbidden' }` when not the booking's couple, `400 { code: 'invalid_state' }` when wrong status.

- [ ] **Step 1: Write the failing test** — exercises 200, 409, 403, 400 paths via a route-handler invocation. Pattern: mirror `src/__tests__/api/bookings-adjust.test.ts` if it exists; otherwise inline the route handler call with a mock Request.

- [ ] **Step 2: Watch fail.** `npm run test:unit -- bookings-counter`

- [ ] **Step 3: Implement the route handler**

```ts
// src/app/api/bookings/[id]/counter/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server';
import { createServerComponentClient } from '@/lib/supabase/server';
import { coupleCounterBooking } from '@/services/booking.service';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ code: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as { totalCents?: number; note?: string };
  if (typeof body.totalCents !== 'number' || body.totalCents <= 0) {
    return NextResponse.json(
      { code: 'invalid_input', message: 'totalCents must be a positive integer' },
      { status: 400 }
    );
  }

  const supabase = await createServerComponentClient();
  const result = await coupleCounterBooking({
    supabase,
    bookingId: params.id,
    actorUserId: session.user.id,
    proposedTotalCents: body.totalCents,
    note: body.note,
  });

  if (result.ok) return NextResponse.json({ booking: result.booking });

  const httpStatus = {
    counter_cap_reached: 409,
    forbidden: 403,
    invalid_state: 400,
    not_found: 404,
  }[result.code];
  return NextResponse.json({ code: result.code, message: result.message }, { status: httpStatus });
}
```

(Verify the auth helper import path — pattern from existing adjust route.)

- [ ] **Step 4: Tests pass.**

- [ ] **Step 5: Commit.**

```bash
git add src/app/api/bookings/[id]/counter/route.ts src/__tests__/api/bookings-counter.test.ts
git commit -m "feat(api): add POST /api/bookings/[id]/counter (D.1)"
```

---

### Task 15: Vendor `adjustBooking` cap enforcement (service + endpoint) + unit tests

**Files:**

- Modify: `src/services/booking.service.ts` — `adjustBooking()` gains a cap check.
- Modify: `src/app/api/bookings/[id]/adjust/route.ts` — 409 on cap reached.
- Create / modify: `src/__tests__/services/booking-adjust-cap.test.ts`

**Interfaces:**

- Consumes: existing `adjustBooking()` signature + the `bookings.vendor_adjustment_count` column from T12.
- Produces: 409 `{ code: 'adjust_cap_reached' }` when `vendor_adjustment_count >= 2`; service increments the counter atomically on success.

- [ ] **Step 1: Write failing tests** — assert the 409 path, the increment-on-success path, and that the 3rd adjust returns 409.

- [ ] **Step 2: Watch fail.**

- [ ] **Step 3: Implement**

In `adjustBooking()` add at the start of the update query: bail with `{ ok: false, code: 'adjust_cap_reached' }` when current count is already 2. On success, include `vendor_adjustment_count: <current+1>` in the update payload. The DB CHECK constraint is a backstop.

In the route handler, return 409 when `result.code === 'adjust_cap_reached'`.

- [ ] **Step 4: Tests pass.**

- [ ] **Step 5: Commit.**

```bash
git add src/services/booking.service.ts src/app/api/bookings/[id]/adjust/route.ts src/__tests__/services/booking-adjust-cap.test.ts
git commit -m "feat(bookings): cap vendor adjust at 2 with 409 response (D.1)"
```

---

### Task 16: `notifyCoupleCountered` + `sendCoupleCounteredEmail` + preview + wire-up

**Files:**

- Modify: `src/services/notifications.service.ts` — add `notifyCoupleCountered` helper.
- Create: `src/lib/email/couple-countered.tsx`
- Create: `src/app/dev/email-previews/couple-countered/page.tsx`
- Modify: `src/services/booking.service.ts` — wire `notifyCoupleCountered` + `sendCoupleCounteredEmail` inside `coupleCounterBooking()` via `deliver()`.
- Create: `src/__tests__/lib/email/couple-countered.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export function notifyCoupleCountered(
    sb: Sb,
    vendorUserId: string,
    ctx: {
      bookingId: string;
      coupleName: string;
      proposedTotalCents: number;
      note?: string;
      vendorAdjustmentsRemaining: 0 | 1 | 2;
    }
  ): Promise<{ id: string } | null>;

  export async function sendCoupleCounteredEmail(args: {
    to: string;
    coupleName: string;
    proposedTotalCents: number;
    note?: string;
    vendorAdjustmentsRemaining: 0 | 1 | 2;
    bookingId: string;
    notificationId?: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }>;
  ```

- [ ] **Step 1: Add `notifyCoupleCountered`** in `src/services/notifications.service.ts` following the existing pattern (parallel to `notifyVendorAdjustedQuote`). Body text: `"${coupleName} sent a counter-offer."` Title: `Counter-offer received`. Link: `/dashboard/bookings/${bookingId}`. The vendorAdjustmentsRemaining goes into `metadata` only — NOT into the user-visible body (spec § 6 — vendor sees their own count only in the dashboard UI).

- [ ] **Step 2: Write the failing email test** (parallel to T7).

- [ ] **Step 3: Implement `couple-countered.tsx`** with the cream/ink wrapper. Subject: `${coupleName} sent a counter-offer on your quote`. Body includes proposed total formatted as USD, optional note (truncated to 200), and the vendor's own remaining-adjust count (this email goes to the vendor only, so it's allowed to mention their own count). CTA → `/dashboard/bookings/${bookingId}?action=respond-to-counter`.

- [ ] **Step 4: Preview route.**

- [ ] **Step 5: Wire into `coupleCounterBooking()`** — after the successful update, fetch vendor user id + email, then:

```ts
const notify = await deliver('notify', () => notifyCoupleCountered(supabase, vendorUserId, ctx), {
  booking_id: bookingId,
});
if (notify?.id) {
  await deliver(
    'email',
    () => sendCoupleCounteredEmail({ ...emailArgs, notificationId: notify.id }),
    { booking_id: bookingId }
  );
}
```

- [ ] **Step 6: Run all tests.** Pass.

- [ ] **Step 7: Commit.**

```bash
git add src/services/notifications.service.ts src/services/booking.service.ts src/lib/email/couple-countered.tsx src/app/dev/email-previews/couple-countered/page.tsx src/__tests__/lib/email/couple-countered.test.ts
git commit -m "feat(notifications): add notifyCoupleCountered + email + wire to counter flow (D.1)"
```

---

### Task 17: Vendor booking-detail UI — Adjust button helper text + disable

**Files:**

- Modify: the vendor view in `src/app/dashboard/bookings/[id]/page.tsx` (or sibling client component that renders the Adjust button).

**Interfaces:**

- Consumes: `booking.vendor_adjustment_count` from T12.
- Produces: Adjust button helper text "N adjustments remaining" or "No more adjustments available"; button disabled at 0.

- [ ] **Step 1: Locate the existing Adjust button**

```bash
grep -rn "Adjust\b\|adjust quote\|onAdjust\|AdjustQuote" src/app/dashboard/bookings/[id]/
```

- [ ] **Step 2: Implement**

```tsx
const adjustsLeft = Math.max(0, 2 - (booking.vendor_adjustment_count ?? 0));
return (
  <div className="flex flex-col gap-1">
    <Button onClick={openAdjust} disabled={adjustsLeft === 0}>
      Adjust quote
    </Button>
    <span className="text-xs text-ink/60">
      {adjustsLeft === 0
        ? 'No more adjustments available'
        : `${adjustsLeft} adjustment${adjustsLeft === 1 ? '' : 's'} remaining`}
    </span>
  </div>
);
```

- [ ] **Step 3: Manual smoke** — seed a booking with `vendor_adjustment_count=2` via SQL, confirm button disabled.

- [ ] **Step 4: Commit.**

```bash
git add src/app/dashboard/bookings/[id]/
git commit -m "feat(bookings-vendor-ui): show adjust remaining + disable at cap (D.1)"
```

---

### Task 18: Couple booking-detail UI — Counter button + Counter modal + remaining-count helper

**Files:**

- Modify: couple view of `src/app/dashboard/bookings/[id]/page.tsx`.
- Create: `src/components/bookings/CounterModal.tsx`

**Interfaces:**

- Consumes: `booking.couple_counter_count` from T12, `POST /api/bookings/[id]/counter` from T14.
- Produces: Counter button next to Accept/Decline; modal with total + note inputs; "N counter-offers remaining" helper text.

- [ ] **Step 1: Create the Counter modal**

```tsx
// src/components/bookings/CounterModal.tsx
'use client';
import { useState } from 'react';
// reuse the existing Modal primitive used by AcceptQuote / Adjust / Decline

export function CounterModal({
  open,
  onClose,
  bookingId,
  currentTotalCents,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  currentTotalCents: number;
  onSuccess: () => void;
}) {
  const [total, setTotal] = useState(currentTotalCents / 100);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/bookings/${bookingId}/counter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalCents: Math.round(total * 100), note: note || undefined }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? data.code ?? 'Something went wrong');
      return;
    }
    onSuccess();
    onClose();
  }

  return open ? (
    <Modal onClose={onClose} title="Send a counter-offer">
      <label>
        Your proposed total
        <input
          type="number"
          step="1"
          min="1"
          value={total}
          onChange={(e) => setTotal(Number(e.target.value))}
        />
      </label>
      <label>
        Note (optional)
        <textarea maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="text-hot-pink">{error}</p>}
      <button onClick={submit} disabled={loading}>
        Send counter-offer
      </button>
    </Modal>
  ) : null;
}
```

- [ ] **Step 2: Wire into couple view**

```tsx
const countersLeft = Math.max(0, 2 - (booking.couple_counter_count ?? 0));
// Render Counter button only when countersLeft > 0
{
  countersLeft > 0 && (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" onClick={() => setCounterOpen(true)}>
        Counter
      </Button>
      <span className="text-xs text-ink/60">
        {countersLeft} counter-offer{countersLeft === 1 ? '' : 's'} remaining
      </span>
    </div>
  );
}
<CounterModal
  open={counterOpen}
  onClose={() => setCounterOpen(false)}
  bookingId={booking.id}
  currentTotalCents={booking.total_price_cents}
  onSuccess={refresh}
/>;
```

When `countersLeft === 0`, the Counter button is omitted entirely (spec § 5.4: "the Counter action on `vendor_adjusted_quote` is rendered only when the couple's `couple_counter_count < 2`; otherwise the Counter button is omitted entirely (not greyed)"). The "0 counter-offers remaining" helper text appears once _after_ the Counter button is removed, replacing it.

- [ ] **Step 3: Manual smoke** — log in as a couple on a `vendor_accepted` booking. Counter button appears. Submit a counter. Booking status flips to `couple_countered` in DB. Notification fires.

- [ ] **Step 4: Commit.**

```bash
git add src/app/dashboard/bookings/[id]/ src/components/bookings/CounterModal.tsx
git commit -m "feat(bookings-couple-ui): add Counter button + modal + remaining helper (D.1)"
```

---

### Task 19: Playwright happy-path spec

**Files:**

- Create: `tests/e2e/notifications-d1-happy-path.spec.ts`

**Interfaces:**

- Consumes: existing E2E helpers (`seedCouple`, `seedVendor`, `seedPackage`, `cleanup`, `loginAs`, `getServiceClient`) from `tests/e2e/helpers/`.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/notifications-d1-happy-path.spec.ts
import { test, expect } from '@playwright/test';
import { seedCouple, seedVendor, seedPackage, cleanup, getServiceClient } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('D.1 — happy path notifications + emails', () => {
  let couple: any, vendor: any;
  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple → vendor accepts → couple pays deposit → notifications fire with email_status=sent', async ({
    browser,
  }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const pkg = await seedPackage(vendor, { basePriceCents: 150_000 });

    const sb = getServiceClient();

    // 1) couple submits booking
    const coupleCtx = await browser.newContext();
    const couplePage = await coupleCtx.newPage();
    await loginAs(couplePage, couple);
    const res = await couplePage.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        selected_addons: [],
        guest_count: 100,
        couple_full_name: 'E2E Couple',
        couple_contact_phone: '(312) 555-0100',
        event_date: '2026-09-15',
        event_start_time: '18:00',
        event_end_time: '23:00',
        location_text: 'Drury Lane',
      },
    });
    expect(res.ok()).toBeTruthy();
    const bookingId = (await res.json()).booking_id;

    // assert: notification + email_status=sent for vendor
    const { data: vendorNotifs } = await sb
      .from('notifications')
      .select('*')
      .eq('user_id', vendor.id)
      .eq('type', 'booking_request_received');
    expect(vendorNotifs?.length).toBe(1);
    expect(vendorNotifs![0].email_status).toBe('sent');

    // 2) vendor accepts
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);
    await vendorPage.request.post(`/api/bookings/${bookingId}/accept`);

    const { data: coupleNotifs1 } = await sb
      .from('notifications')
      .select('*')
      .eq('user_id', couple.id)
      .eq('type', 'vendor_accepted');
    expect(coupleNotifs1?.length).toBe(1);
    expect(coupleNotifs1![0].email_status).toBe('sent');

    // 3) couple notification dropdown shows the Pay Deposit primary action
    await couplePage.goto('/dashboard');
    await couplePage.getByRole('button', { name: /notifications/i }).click();
    await expect(couplePage.getByRole('link', { name: 'Pay Deposit' })).toBeVisible();
    await expect(couplePage.getByRole('link', { name: 'Pay Deposit' })).toHaveAttribute(
      'href',
      `/dashboard/bookings/${bookingId}?action=pay-deposit`
    );
  });
});
```

(Implementer extends through deposit-paid, event-complete cron, booking-complete, review submit. Stripe test-mode card: `4242 4242 4242 4242`, any future date, any CVC.)

- [ ] **Step 2: Run headed against local dev**

```bash
npm run dev   # in another terminal
npm run test:e2e:headed -- notifications-d1-happy-path
```

Expected: all assertions pass. If Resend env is the dev key, recorded emails go to the real Resend inbox — that's fine for headed smoke, but the spec asserts `email_status='sent'` in the DB row, which is the authoritative check.

- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/notifications-d1-happy-path.spec.ts
git commit -m "test(e2e): D.1 happy-path spec — full booking lifecycle notifications"
```

---

### Task 20: Playwright counter-cap spec

**Files:**

- Create: `tests/e2e/notifications-d1-counter-cap.spec.ts`

- [ ] **Step 1: Write the spec**

Walks the full 6-step state machine: vendor quotes → couple counter #1 → vendor adjust #1 → couple counter #2 → vendor adjust #2 → couple accepts.

Asserts after step 5:

- Vendor's Adjust button is disabled with "No more adjustments available" helper text.
- Direct `POST /api/bookings/<id>/adjust` returns 409 `{ code: 'adjust_cap_reached' }`.

Asserts after step 4:

- Couple's Counter button is gone (rendered only when `countersLeft > 0`) and replaced with "0 counter-offers remaining" helper text.
- Direct `POST /api/bookings/<id>/counter` returns 409 `{ code: 'counter_cap_reached' }`.

Asserts no-leak rule: at step 3, the couple's notification body does NOT contain the string "remaining"; at step 4, the vendor's notification body does NOT contain "remaining".

- [ ] **Step 2: Run.** `npm run test:e2e:headed -- notifications-d1-counter-cap`

- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/notifications-d1-counter-cap.spec.ts
git commit -m "test(e2e): D.1 counter-cap spec — 2-round-trip enforcement"
```

---

### Task 21: Playwright action-buttons spec

**Files:**

- Create: `tests/e2e/notifications-d1-action-buttons.spec.ts`

- [ ] **Step 1: Write the spec**

For each notification type, seed a row directly into the DB via service-role client, sign in as the recipient role, open the bell, assert the rendered action button label + `href` matches the `NOTIFICATION_ACTIONS` table.

Seed helper:

```ts
async function seedNotification(userId: string, type: string, metadata: Record<string, unknown>) {
  const sb = getServiceClient();
  const { data } = await sb
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title: 't',
      body: 'b',
      metadata,
    })
    .select()
    .single();
  return data;
}
```

Test loop:

```ts
const cases = [
  {
    type: 'booking_request_received',
    actor: 'vendor',
    primary: 'Accept',
    href: '/dashboard/bookings/b_1?action=accept',
  },
  {
    type: 'vendor_accepted',
    actor: 'couple',
    primary: 'Pay Deposit',
    href: '/dashboard/bookings/b_1?action=pay-deposit',
  },
  // ... etc, all 13 types per the spec table
];
for (const c of cases) {
  test(`${c.type} → ${c.primary} button`, async ({ page }) => {
    /* ... */
  });
}
```

- [ ] **Step 2: Run.** `npm run test:e2e:headed -- notifications-d1-action-buttons`

- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/notifications-d1-action-buttons.spec.ts
git commit -m "test(e2e): D.1 action-buttons spec — every type renders expected primary"
```

---

### Task 22: Open PR + manual smoke

**Files:** none.

**Interfaces:**

- Consumes: all commits from T2–T21.
- Produces: a single PR ready for human review and squash-merge.

- [ ] **Step 1: Run the full suite locally**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

Expected: green across the board.

- [ ] **Step 2: Open PR**

```bash
git push -u origin feat/d1-notifications-counter-offer
gh pr create --title "feat: Bucket D.1 — notifications reliability + counter-offer" --body "$(cat <<'EOF'
## Summary

Implements Bucket D.1 per `docs/superpowers/specs/2026-06-16-bucket-d1-notifications-reliability-design.md`. Spec was approved in PR #44.

- Silent-failure removal via `deliver()` wrapper across every notify+email call site
- Migration 00055 adds `email_status` / `email_error` / `email_attempted_at` to `notifications`
- Three new email templates: event-completed, custom-request, review-received
- Action buttons inside `NotificationDropdown` + `/dashboard/notifications`, driven by `ActionMap` config + `?action=X` query handler
- Migration 00056 + new `coupleCounterBooking` service + `POST /api/bookings/[id]/counter` endpoint + Counter modal
- 2-round-trip cap enforced at service + endpoint + DB CHECK on both `vendor_adjustment_count` and `couple_counter_count`
- Three new Playwright specs

## Test plan

- [ ] CI green
- [ ] Verify `RESEND_API_KEY` in Vercel prod + DNS verified
- [ ] Smoke test happy-path locally with `npm run test:e2e:headed -- notifications-d1-happy-path`
- [ ] Apply migrations 00055 + 00056 to prod after PR merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Manual smoke against the PR's Vercel preview**

Once Vercel posts a preview URL, run:

```bash
PLAYWRIGHT_BASE_URL=<preview-url> npm run test:e2e -- notifications-d1-happy-path
```

Expected: pass against preview (preview uses prod DB; the spec cleans up after itself).

- [ ] **Step 4: Hand off for human review.** Spec gate + manual UI eyeball + migration apply scheduling are the human's call.

---

## Self-Review

**Spec coverage:**

- § 3.1 `deliver()` helper → T3. ✓
- § 3.2 `delivery_status` columns → T2. ✓
- § 3.3 No outbox → respected; not a task. ✓
- § 3.4 Counter-offer state machine → T12 (schema), T13 (service), T14 (couple endpoint), T15 (vendor cap), T16 (notification + email). ✓
- § 4.1–4.3 Three missing emails → T7, T8, T9. ✓
- § 4.4 Couple-countered email → T16. ✓
- § 5 Action buttons UI → T10, T11. ✓
- § 6 Each side own state only → enforced in T13 (vendorAdjustmentsRemaining only in vendor email + metadata; not in couple body), T17 (vendor UI), T18 (couple UI), T20 (E2E no-leak assertions). ✓
- § 7 Resend prod verification → T1. ✓
- § 8 Email test surface → T6 mock. ✓
- § 9 Playwright specs → T19, T20, T21. ✓
- § 10 Migration summary → T2 (00055), T12 (00056). ✓
- § 11 Effort estimate → reflected in 22 tasks. ✓
- § 12 Success criteria → covered across T1–T22.

**Placeholder scan:** zero `TBD`, `TODO`, `XXX`, or "fill in details" entries in plan steps. Two stubs are explicit and accepted by the spec: (a) the booking-detail modals for some actions may not exist yet — T11 documents the degraded path; (b) the vendor reviews tab may not exist — T9 documents the stub link.

**Type consistency:**

- `deliver()` signature consistent across T3, T5, T7–T9, T15, T16.
- `sendWithRecord()` signature consistent across T4, T6, T7–T9, T16.
- `coupleCounterBooking()` signature consistent across T13, T14, T16.
- `ActionConfig` / `ActionMap` consistent across T10, T11, T21.
- Notification `metadata.booking_id` referenced consistently in T10 (`href` builder), T19/T20/T21 (E2E assertions).

No gaps found. Plan is ready for execution.
