# Sub-project F: Notifications + email P0 verify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship in-app notifications (bell + dropdown + dedicated page) for both vendors and couples covering all booking-lifecycle events, plus close the email P0 carried since Phase H.

**Architecture:** New `notifications` table with RLS + Supabase realtime publication. Each existing email send gets a parallel `createNotification()` call in the service layer. Client subscribes via supabase-js realtime to receive live row INSERTs. Bell badge updates live; 5 high-priority types also fire `sonner` toasts on realtime arrival. Dedicated `/dashboard/notifications` page uses Airbnb-style tabs (Action needed / Updates / Archived) with per-booking grouping.

**Tech Stack:** Next.js 14 app router, Supabase Postgres + Auth + Realtime, `@supabase/supabase-js` v2 realtime channels, `sonner` for toasts, Tailwind, `lucide-react` icons, Zod, vitest, Playwright.

**Source spec:** `docs/superpowers/specs/2026-05-16-sub-project-f-notifications-design.md` — referenced as **§N** throughout.

---

## Pre-flight (read before any task)

- Branch: create `feat/sub-project-f-notifications` off `main`.
- `git log --oneline -3` should show: `9d03673 docs(spec): F`, `97c9edb feat(cleanup): A-cleanup ... (#9)`, `ad2ef70 feat(packages): Sub-project A ... (#8)`.
- Existing patterns:
  - **API route**: `src/app/api/packages/route.ts` (`withErrorBoundary` + `requireUser` + Zod)
  - **Service**: `src/services/booking.service.ts` (service-result pattern + RLS-scoped queries)
  - **Component (client)**: `src/components/ui/Navbar.tsx` (auth state + realtime-via-supabase-js)
  - **Toast**: `import { toast } from 'sonner'` — already used in auth pages
  - **Migration**: `supabase/migrations/00027_add_booking_event_completed_at.sql` (most recent)
- Spec sections required: §2 (schema), §3 (triggers), §4.1–4.6 (UX incl. toast strategy), §10 (API), §13.1 (migration SQL).

---

## File structure

### New files

```
supabase/migrations/
└── 00030_create_notifications.sql

src/services/
└── notifications.service.ts                 # createNotification + 12 typed helpers

src/lib/notifications/
└── high-priority-types.ts                   # 5-type set used by toast hybrid logic

src/components/notifications/
├── NotificationBell.tsx                     # client; mounted in Navbar; realtime
├── NotificationDropdown.tsx                 # dropdown panel content
├── NotificationCard.tsx                     # one row UI (used by dropdown + page)
└── NotificationsPageClient.tsx              # tabs + per-booking grouping

src/app/dashboard/notifications/
└── page.tsx                                 # server component; passes data to client

src/app/api/notifications/
├── [id]/read/route.ts                       # PATCH single mark-read
└── mark-all-read/route.ts                   # POST bulk mark-read

src/__tests__/services/
└── notifications.service.test.ts            # unit tests for service helpers
```

### Modified files

```
src/types/database.types.ts                  # add notifications table types
src/types/index.ts                           # NotificationType + Zod schemas
src/components/ui/Navbar.tsx                 # mount NotificationBell when user is authed
src/services/booking.service.ts              # add notify*() calls to 5 functions
src/services/payment.service.ts              # add notify*() calls to 3 functions + per-event/booking_completed
src/services/review.service.ts (if exists)   # OR wherever review submit lives — add notifyReviewReceived
src/lib/email/resend.ts                      # F5: ensure all error paths use logger.error
src/app/api/health/route.ts                  # F5: add Resend ping check
```

### Files NOT touched

- Schema migrations 00027–00029 (already shipped)
- Existing email send functions in `resend.ts` (only error-path logging is changed in F5; the send logic itself is unchanged)

---

# Phase F1 — Schema + service (sequential, gates everything else, ~2h)

## Task F1.1: Migration 00030 — `notifications` table

**Files:**
- Create: `supabase/migrations/00030_create_notifications.sql`

- [ ] **Step 1: Write the migration file**

Copy the SQL from **spec §13.1**. The migration creates the `notifications` table, two indexes, two RLS policies, and registers the table for realtime broadcasting:

```sql
-- ============================================================================
-- Sub-project F · Migration 00030
-- notifications table + RLS + realtime publication
-- ============================================================================
-- One row per notification, owned by one user (recipient). 12 notification
-- types covering the full booking lifecycle (see spec §2.1). RLS scopes
-- SELECT and UPDATE to auth.uid() = user_id. INSERT is service-role only —
-- notifications are always created server-side as a side effect of state
-- transitions.

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

- [ ] **Step 2: Commit (apply happens via SQL editor by user)**

```bash
git add supabase/migrations/00030_create_notifications.sql
git commit -m "feat(schema): F — notifications table + RLS + realtime publication"
```

**Manual application (by user):** Paste the SQL into Supabase SQL editor for dev project; on PR merge, paste into prod. Don't apply yourself — the agent has no DB credentials.

## Task F1.2: TypeScript types

**Files:**
- Modify: `src/types/database.types.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `notifications` to database.types.ts**

Append to the `Database['public']['Tables']` object in `src/types/database.types.ts`:

```typescript
notifications: {
  Row: {
    id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    link: string | null;
    metadata: Record<string, unknown>;
    read_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string | null;
    metadata?: Record<string, unknown>;
    read_at?: string | null;
    created_at?: string;
  };
  Update: {
    read_at?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: 'notifications_user_id_fkey';
      columns: ['user_id'];
      isOneToOne: false;
      referencedRelation: 'users';
      referencedColumns: ['id'];
    },
  ];
};
```

Also export `NotificationType` near the top of the file:

```typescript
export type NotificationType =
  | 'booking_request_received'
  | 'vendor_accepted'
  | 'vendor_adjusted_quote'
  | 'couple_accepted_adjusted'
  | 'couple_declined_adjusted'
  | 'deposit_paid'
  | 'booking_confirmed'
  | 'booking_auto_cancelled'
  | 'booking_cancelled'
  | 'event_completed'
  | 'booking_completed'
  | 'review_received';
```

- [ ] **Step 2: Add Zod schemas to `src/types/index.ts`**

Append:

```typescript
export const notificationTypeSchema = z.enum([
  'booking_request_received', 'vendor_accepted', 'vendor_adjusted_quote',
  'couple_accepted_adjusted', 'couple_declined_adjusted', 'deposit_paid',
  'booking_confirmed', 'booking_auto_cancelled', 'booking_cancelled',
  'event_completed', 'booking_completed', 'review_received',
]);
export type NotificationTypeInput = z.infer<typeof notificationTypeSchema>;

// (No request schema needed — notifications are server-created only.)
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts src/types/index.ts
git commit -m "feat(types): F — notifications table types + NotificationType enum"
```

## Task F1.3: `notifications.service.ts` — `createNotification` + helpers

**Files:**
- Create: `src/services/notifications.service.ts`
- Test: `src/__tests__/services/notifications.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/services/notifications.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createNotification,
  notifyBookingRequestReceived,
  notifyVendorAccepted,
  notifyVendorAdjustedQuote,
  notifyCoupleAcceptedAdjusted,
  notifyCoupleDeclinedAdjusted,
  notifyDepositPaid,
  notifyBookingConfirmed,
  notifyBookingAutoCancelled,
  notifyBookingCancelled,
  notifyEventCompleted,
  notifyBookingCompleted,
  notifyReviewReceived,
} from '@/services/notifications.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type MockSupabase = SupabaseClient<Database>;

function mockSupabase(insertResult: { data: { id: string } | null; error: { message: string } | null }) {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(insertResult)),
        })),
      })),
    })),
  } as unknown as MockSupabase;
}

describe('createNotification', () => {
  it('returns inserted id on success', async () => {
    const sb = mockSupabase({ data: { id: 'n-123' }, error: null });
    const result = await createNotification(sb, {
      user_id: 'u-1',
      type: 'booking_request_received',
      title: 'New booking',
      body: 'From Jane',
      link: '/dashboard/bookings/b-1',
      metadata: { booking_id: 'b-1' },
    });
    expect(result).toEqual({ id: 'n-123' });
  });

  it('returns null on insert error (does not throw)', async () => {
    const sb = mockSupabase({ data: null, error: { message: 'rls denied' } });
    const result = await createNotification(sb, {
      user_id: 'u-1',
      type: 'booking_request_received',
      title: 'x',
      body: 'x',
    });
    expect(result).toBeNull();
  });
});

describe('typed helpers compose title/body/link/metadata correctly', () => {
  let sb: MockSupabase;
  let insertSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'x' }, error: null })) })),
    }));
    sb = { from: vi.fn(() => ({ insert: insertSpy })) } as unknown as MockSupabase;
  });

  it('notifyBookingRequestReceived composes correctly', async () => {
    await notifyBookingRequestReceived(sb, 'vendor-1', {
      bookingId: 'b-1',
      coupleName: 'Jane Smith',
      packageName: 'Full Wedding Coverage',
      totalCents: 240000,
    });
    const arg = insertSpy.mock.calls[0][0];
    expect(arg.user_id).toBe('vendor-1');
    expect(arg.type).toBe('booking_request_received');
    expect(arg.title).toMatch(/new booking request/i);
    expect(arg.body).toContain('Jane Smith');
    expect(arg.body).toContain('Full Wedding Coverage');
    expect(arg.body).toContain('$2,400');
    expect(arg.link).toBe('/dashboard/bookings/b-1');
    expect(arg.metadata).toEqual({ booking_id: 'b-1', package_name: 'Full Wedding Coverage', total_cents: 240000 });
  });

  it('notifyVendorAccepted composes correctly', async () => {
    await notifyVendorAccepted(sb, 'couple-1', {
      bookingId: 'b-1',
      vendorName: 'Asha Photography',
      totalCents: 240000,
    });
    const arg = insertSpy.mock.calls[0][0];
    expect(arg.user_id).toBe('couple-1');
    expect(arg.type).toBe('vendor_accepted');
    expect(arg.body).toContain('Asha Photography');
  });

  // Add similar coverage for the other 10 helpers; one assertion per helper
  // verifying type + at least one composed field is enough — the goal is
  // to make sure the title/body/link/metadata layer doesn't silently drift.

  it('notifyEventCompleted formats sequence correctly', async () => {
    await notifyEventCompleted(sb, 'couple-1', {
      bookingId: 'b-1',
      eventTypeLabel: 'Mehndi',
      sequence: 1,
      eventsCount: 3,
    });
    const arg = insertSpy.mock.calls[0][0];
    expect(arg.title).toContain('1 of 3');
    expect(arg.body).toContain('Mehndi');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL ("createNotification is not a function")**

```bash
npx vitest run src/__tests__/services/notifications.service.test.ts
```

- [ ] **Step 3: Implement the service**

Create `src/services/notifications.service.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NotificationType } from '@/types/database.types';
import { logger } from '@/lib/logger';

type Sb = SupabaseClient<Database>;

interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

const REASON_LABEL: Record<string, string> = {
  travel: 'travel distance',
  guest_count: 'guest count over package',
  peak_date: 'peak-season date',
  custom: 'custom requirements',
  setup_complexity: 'setup complexity',
  discount: 'a discount',
  other: 'other',
};

export async function createNotification(
  supabase: Sb,
  input: CreateNotificationInput
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      metadata: (input.metadata ?? {}) as Record<string, unknown> as Database['public']['Tables']['notifications']['Insert']['metadata'],
    })
    .select('id')
    .single();
  if (error || !data) {
    logger.error('createNotification failed', error, { type: input.type, user_id: input.user_id });
    return null;
  }
  return { id: data.id };
}

// ─── Typed helpers per notification type ───────────────────────────────────

export function notifyBookingRequestReceived(
  sb: Sb, vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; packageName: string; totalCents: number }
) {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'booking_request_received',
    title: 'New booking request',
    body: `From ${ctx.coupleName} for ${ctx.packageName} (${fmtUsd(ctx.totalCents)})`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, package_name: ctx.packageName, total_cents: ctx.totalCents },
  });
}

export function notifyVendorAccepted(
  sb: Sb, coupleUserId: string,
  ctx: { bookingId: string; vendorName: string; totalCents: number }
) {
  return createNotification(sb, {
    user_id: coupleUserId,
    type: 'vendor_accepted',
    title: `${ctx.vendorName} accepted your booking`,
    body: `Pay your deposit (${fmtUsd(Math.floor(ctx.totalCents * 0.3))}) to confirm.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, vendor_name: ctx.vendorName, total_cents: ctx.totalCents },
  });
}

export function notifyVendorAdjustedQuote(
  sb: Sb, coupleUserId: string,
  ctx: { bookingId: string; vendorName: string; newTotalCents: number; reason: string }
) {
  return createNotification(sb, {
    user_id: coupleUserId,
    type: 'vendor_adjusted_quote',
    title: `${ctx.vendorName} sent an adjusted quote`,
    body: `New total: ${fmtUsd(ctx.newTotalCents)} — reason: ${REASON_LABEL[ctx.reason] ?? ctx.reason}`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, new_total_cents: ctx.newTotalCents, reason: ctx.reason },
  });
}

export function notifyCoupleAcceptedAdjusted(
  sb: Sb, vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; totalCents: number }
) {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'couple_accepted_adjusted',
    title: `${ctx.coupleName} accepted your adjusted quote`,
    body: `Total ${fmtUsd(ctx.totalCents)}. Awaiting deposit.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, couple_name: ctx.coupleName, total_cents: ctx.totalCents },
  });
}

export function notifyCoupleDeclinedAdjusted(
  sb: Sb, vendorUserId: string,
  ctx: { bookingId: string; coupleName: string }
) {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'couple_declined_adjusted',
    title: `${ctx.coupleName} declined your adjusted quote`,
    body: 'Send a revised quote within 72h or the booking will auto-cancel.',
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, couple_name: ctx.coupleName },
  });
}

export function notifyDepositPaid(
  sb: Sb, vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; depositCents: number; packageName: string }
) {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'deposit_paid',
    title: 'Deposit paid — booking confirmed',
    body: `${ctx.coupleName} paid ${fmtUsd(ctx.depositCents)} for ${ctx.packageName}`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, deposit_cents: ctx.depositCents, package_name: ctx.packageName },
  });
}

export function notifyBookingConfirmed(
  sb: Sb, coupleUserId: string,
  ctx: { bookingId: string; vendorName: string }
) {
  return createNotification(sb, {
    user_id: coupleUserId,
    type: 'booking_confirmed',
    title: 'Booking confirmed',
    body: `${ctx.vendorName}'s full address and instructions are now visible.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, vendor_name: ctx.vendorName },
  });
}

export function notifyBookingAutoCancelled(
  sb: Sb, userId: string,
  ctx: { bookingId: string; recipientRole: 'couple' | 'vendor' }
) {
  return createNotification(sb, {
    user_id: userId,
    type: 'booking_auto_cancelled',
    title: 'Booking auto-cancelled',
    body: 'No response within 72 hours — the booking has been cancelled.',
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, recipient_role: ctx.recipientRole },
  });
}

export function notifyBookingCancelled(
  sb: Sb, userId: string,
  ctx: { bookingId: string; cancellerRole: 'couple' | 'vendor' | 'mutual' }
) {
  return createNotification(sb, {
    user_id: userId,
    type: 'booking_cancelled',
    title: 'Booking cancelled',
    body: ctx.cancellerRole === 'mutual'
      ? 'Both parties agreed to cancel this booking.'
      : `Cancelled by the ${ctx.cancellerRole}.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, canceller_role: ctx.cancellerRole },
  });
}

export function notifyEventCompleted(
  sb: Sb, userId: string,
  ctx: { bookingId: string; eventTypeLabel: string; sequence: number; eventsCount: number }
) {
  return createNotification(sb, {
    user_id: userId,
    type: 'event_completed',
    title: `Event ${ctx.sequence} of ${ctx.eventsCount} complete`,
    body: `${ctx.eventTypeLabel} marked complete.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, sequence: ctx.sequence, events_count: ctx.eventsCount },
  });
}

export function notifyBookingCompleted(
  sb: Sb, userId: string,
  ctx: { bookingId: string; recipientRole: 'couple' | 'vendor' }
) {
  return createNotification(sb, {
    user_id: userId,
    type: 'booking_completed',
    title: 'Booking complete',
    body: ctx.recipientRole === 'couple'
      ? 'All your events are done. Leave a review!'
      : 'All events delivered. Funds will release to your earnings shortly.',
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, recipient_role: ctx.recipientRole },
  });
}

export function notifyReviewReceived(
  sb: Sb, vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; ratingOverall: number }
) {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'review_received',
    title: 'New review received',
    body: `${ctx.coupleName} left you a ${ctx.ratingOverall}-star review.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, couple_name: ctx.coupleName, rating_overall: ctx.ratingOverall },
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/services/notifications.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/notifications.service.ts src/__tests__/services/notifications.service.test.ts
git commit -m "feat(notifications): F1 — service + 12 typed helpers"
```

## Task F1.4: High-priority types constant

**Files:**
- Create: `src/lib/notifications/high-priority-types.ts`

- [ ] **Step 1: Implement**

```typescript
// Smart-hybrid toast strategy (spec §4.6):
// these 5 types fire a sonner toast on realtime arrival; the other 7
// update the bell badge silently.

import type { NotificationType } from '@/types/database.types';

export const HIGH_PRIORITY_TYPES: ReadonlySet<NotificationType> = new Set([
  'booking_request_received',
  'deposit_paid',
  'vendor_adjusted_quote',
  'couple_declined_adjusted',
  'booking_confirmed',
]);

export function isHighPriority(type: NotificationType): boolean {
  return HIGH_PRIORITY_TYPES.has(type);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notifications/high-priority-types.ts
git commit -m "feat(notifications): F1 — high-priority types set for toast hybrid"
```

---

# Phase F2 — Trigger wire-up (parallel-safe with F3/F4 after F1 lands, ~3–4h)

## Task F2.1: Wire `booking.service.ts` — 5 functions

**Files:**
- Modify: `src/services/booking.service.ts`

Wire-up table — add `notifyXxx()` AFTER the state transition succeeds, fire-and-forget (don't await; don't fail the booking transition if notification fails):

| Function | After what line | Notify call |
|---|---|---|
| `createBooking` | After `events` insert succeeds, before `return { data, status: 201 }` | `notifyBookingRequestReceived(supabase, vendorUserId, { bookingId, coupleName, packageName, totalCents })` |
| `acceptBooking` | After UPDATE succeeds, before `return { data, status: 200 }` | `notifyVendorAccepted(supabase, coupleUserId, { bookingId, vendorName, totalCents })` |
| `adjustBookingQuote` | After UPDATE succeeds | `notifyVendorAdjustedQuote(supabase, coupleUserId, { bookingId, vendorName, newTotalCents, reason })` |
| `coupleAcceptAdjusted` | After UPDATE succeeds | `notifyCoupleAcceptedAdjusted(supabase, vendorUserId, { bookingId, coupleName, totalCents })` |
| `coupleDeclineAdjusted` | After UPDATE succeeds | `notifyCoupleDeclinedAdjusted(supabase, vendorUserId, { bookingId, coupleName })` |
| `autoCancelExpiredBookings` | Inside the per-booking loop after each successful update | `notifyBookingAutoCancelled(supabase, couple.user_id, { bookingId, recipientRole: 'couple' })` + same for `vendor.user_id` |

- [ ] **Step 1: Read the current state of each function**

```bash
grep -n "^export async function createBooking\|^export async function acceptBooking\|^export async function adjustBookingQuote\|^export async function coupleAcceptAdjusted\|^export async function coupleDeclineAdjusted\|^export async function autoCancelExpiredBookings" src/services/booking.service.ts
```

For each function, identify (a) where the state transition completes, (b) what context (couple name, vendor name, package name) you need to fetch before firing the notification.

- [ ] **Step 2: For each function, add a "fetch notification context" block**

Each notify call needs context that the function may not already have. Add a small follow-up query right before the notify call. Example for `createBooking` — after the booking + events are inserted:

```typescript
// Fetch context for notification (fire-and-forget)
void (async () => {
  const { data: ctx } = await supabase
    .from('bookings')
    .select(`
      vendor_profiles!inner(user_id, business_name),
      couple_user_id, users!couple_user_id(full_name)
    `)
    .eq('id', booking.id)
    .single();
  if (!ctx) return;
  const vp = ctx.vendor_profiles as unknown as { user_id: string; business_name: string };
  const cu = ctx.users as unknown as { full_name: string | null };
  notifyBookingRequestReceived(supabase, vp.user_id, {
    bookingId: booking.id,
    coupleName: cu?.full_name ?? 'A couple',
    packageName: pkg.name,
    totalCents: booking.total_price_cents ?? 0,
  });
})();
```

Wrap each as `void (async () => {...})()` so the parent return is not blocked.

- [ ] **Step 3: Add import**

At the top of `src/services/booking.service.ts`:

```typescript
import {
  notifyBookingRequestReceived,
  notifyVendorAccepted,
  notifyVendorAdjustedQuote,
  notifyCoupleAcceptedAdjusted,
  notifyCoupleDeclinedAdjusted,
  notifyBookingAutoCancelled,
} from '@/services/notifications.service';
```

- [ ] **Step 4: Apply the 6 notify calls per the table above**

For each of the 6 sites, follow the pattern from Step 2 (fetch context, call notify in fire-and-forget block).

- [ ] **Step 5: Run unit tests**

```bash
npm run lint && npm run typecheck && npx vitest run src/__tests__/services/
```

Existing booking.service tests should still pass — we haven't changed the synchronous return shape, only added side effects.

- [ ] **Step 6: Commit**

```bash
git add src/services/booking.service.ts
git commit -m "feat(notifications): F2 — wire booking.service notify calls"
```

## Task F2.2: Wire `payment.service.ts` — 3 functions + per-event/booking_completed

**Files:**
- Modify: `src/services/payment.service.ts`

| Function | Notify call |
|---|---|
| `handlePaymentSuccess` | `notifyDepositPaid(supabase, vendorUserId, { bookingId, coupleName, depositCents, packageName })` + `notifyBookingConfirmed(supabase, coupleUserId, { bookingId, vendorName })` |
| `cancelBooking` | `notifyBookingCancelled(supabase, otherPartyUserId, { bookingId, cancellerRole })` |
| `autoCompleteBookings` | For each event marked complete: `notifyEventCompleted(supabase, coupleUserId, { bookingId, eventTypeLabel, sequence, eventsCount })` + same to vendor. When parent booking flips to `completed`: also fire `notifyBookingCompleted(supabase, coupleUserId, { bookingId, recipientRole: 'couple' })` + same to vendor. |

- [ ] **Step 1: Add import + notify calls following the same pattern as F2.1**

```typescript
import {
  notifyDepositPaid,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyEventCompleted,
  notifyBookingCompleted,
} from '@/services/notifications.service';
```

For each site, fetch the context block via a follow-up `supabase.from('bookings').select(...)` and fire-and-forget the notify call.

For `autoCompleteBookings` specifically: inside the per-event loop where events are marked complete, fire `notifyEventCompleted` per event. After the parent booking is flipped to `status='completed'` (the `if (stillIncomplete === 0)` branch), additionally fire `notifyBookingCompleted` to both parties.

- [ ] **Step 2: Run tests**

```bash
npm run lint && npm run typecheck && npm test
```

The existing `auto-complete.test.ts` test added by A-cleanup should still pass — it doesn't mock notifications, but `notifyXxx()` calls inside `void (async () => {})()` blocks shouldn't throw even when the mocked supabase doesn't fully implement the chain.

- [ ] **Step 3: Commit**

```bash
git add src/services/payment.service.ts
git commit -m "feat(notifications): F2 — wire payment.service notify calls"
```

## Task F2.3: Wire review submission

**Files:**
- Find via: `grep -rn "reviews.*insert\|submitReview\|createReview" src/services/ src/app/api/`

- [ ] **Step 1: Identify the review-submit code path**

```bash
grep -rn "from('reviews').insert\|submitReview" src/ --include="*.ts" --include="*.tsx" | head
```

This will be either in `src/services/booking.service.ts`, `src/services/review.service.ts` (if it exists), or directly in an API route like `src/app/api/bookings/[id]/review/route.ts`.

- [ ] **Step 2: Add notify call after successful review insert**

```typescript
import { notifyReviewReceived } from '@/services/notifications.service';

// After review.insert succeeds:
void (async () => {
  const { data: ctx } = await supabase
    .from('bookings')
    .select('vendor_profiles!inner(user_id), users!couple_user_id(full_name)')
    .eq('id', bookingId)
    .single();
  if (!ctx) return;
  const vp = ctx.vendor_profiles as unknown as { user_id: string };
  const cu = ctx.users as unknown as { full_name: string | null };
  notifyReviewReceived(supabase, vp.user_id, {
    bookingId,
    coupleName: cu?.full_name ?? 'A couple',
    ratingOverall: review.rating_overall,
  });
})();
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(notifications): F2 — wire review-submit notify"
```

## Task F2.4: Integration smoke (manual + script)

**Files:**
- Create (one-off, not committed): `scripts/smoke-notifications.mjs`

- [ ] **Step 1: Write the smoke script**

```javascript
// scripts/smoke-notifications.mjs
// Verifies F2 wire-up: seed a booking via API, then check that a notification
// row appears for the vendor recipient.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Find the most recent booking row
  const { data: latest } = await sb
    .from('bookings')
    .select('id, vendor_profile_id, created_at, vendor_profiles!inner(user_id)')
    .order('created_at', { ascending: false })
    .limit(1);
  if (!latest?.length) { console.log('No bookings — create one via the UI first'); return; }
  const b = latest[0];
  const vendorUserId = (b.vendor_profiles).user_id;
  const { data: notif } = await sb
    .from('notifications')
    .select('id, type, title, body, created_at')
    .eq('user_id', vendorUserId)
    .gte('created_at', b.created_at)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Vendor notifications since this booking:', notif);
})();
```

- [ ] **Step 2: Run after starting the dev server + creating one booking manually**

```bash
npm run dev > /tmp/dev.log 2>&1 &
sleep 8
# (manually create a booking via /vendors/[slug] in browser)
node scripts/smoke-notifications.mjs
```

Expected: at least one notification row of type `booking_request_received` for the vendor.

- [ ] **Step 3: Delete the script (don't commit)**

It's a one-off verification tool. The real test coverage is in unit tests + the E2E spec in F4.

---

# Phase F3 — Bell + dropdown + toast (parallel-safe with F2/F4 after F1, ~3–4h)

## Task F3.1: NotificationBell client component

**Files:**
- Create: `src/components/notifications/NotificationBell.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';

import { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Database, NotificationType } from '@/types/database.types';
import { isHighPriority } from '@/lib/notifications/high-priority-types';
import { NotificationDropdown } from './NotificationDropdown';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

interface Props {
  userId: string;
}

export function NotificationBell({ userId }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const supabase = createClient();
  const isInitialLoad = useRef(true);

  // Initial fetch + realtime subscription
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (cancelled) return;
      setNotifications((data ?? []) as NotificationRow[]);
      isInitialLoad.current = false;
    }
    loadInitial();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) => [row, ...prev].slice(0, 50));
          // Toast for high-priority types on REALTIME arrival only (not initial load)
          if (!isInitialLoad.current && isHighPriority(row.type as NotificationType)) {
            toast(row.title, {
              description: row.body,
              action: row.link
                ? { label: 'View', onClick: () => { window.location.href = row.link!; } }
                : undefined,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? row : n)));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 hover:bg-accent"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          onClose={() => setOpen(false)}
          onMarkRead={(id) => {
            setNotifications((prev) =>
              prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
            );
          }}
          onMarkAllRead={() => {
            setNotifications((prev) =>
              prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
            );
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/notifications/NotificationBell.tsx
git commit -m "feat(notifications): F3 — NotificationBell with realtime + toast hybrid"
```

## Task F3.2: NotificationDropdown panel

**Files:**
- Create: `src/components/notifications/NotificationDropdown.tsx`
- Create: `src/components/notifications/NotificationCard.tsx`

- [ ] **Step 1: NotificationCard (one row, reused on the page)**

```typescript
// src/components/notifications/NotificationCard.tsx
'use client';

import Link from 'next/link';
import type { Database, NotificationType } from '@/types/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

const TYPE_ICON: Record<NotificationType, string> = {
  booking_request_received: '🎯',
  vendor_accepted: '✅',
  vendor_adjusted_quote: '💵',
  couple_accepted_adjusted: '✅',
  couple_declined_adjusted: '⚠️',
  deposit_paid: '💰',
  booking_confirmed: '🔒',
  booking_auto_cancelled: '⏱️',
  booking_cancelled: '❌',
  event_completed: '✓',
  booking_completed: '🎉',
  review_received: '⭐',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  notification: NotificationRow;
  onClick: () => void;
}

export function NotificationCard({ notification, onClick }: Props) {
  const isUnread = !notification.read_at;
  const inner = (
    <>
      <span className="text-lg shrink-0" aria-hidden>
        {TYPE_ICON[notification.type as NotificationType] ?? '🔔'}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isUnread ? 'font-semibold' : 'font-normal'} truncate`}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{notification.body}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {timeAgo(notification.created_at)}
        </p>
      </div>
      {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="unread" />}
    </>
  );

  return notification.link ? (
    <Link
      href={notification.link}
      onClick={onClick}
      className={`flex items-start gap-3 px-3 py-2 hover:bg-accent ${isUnread ? 'bg-blue-50/50' : ''}`}
    >
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent ${
        isUnread ? 'bg-blue-50/50' : ''
      }`}
    >
      {inner}
    </button>
  );
}
```

- [ ] **Step 2: NotificationDropdown**

```typescript
// src/components/notifications/NotificationDropdown.tsx
'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Database } from '@/types/database.types';
import { NotificationCard } from './NotificationCard';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

interface Props {
  notifications: NotificationRow[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationDropdown({ notifications, onClose, onMarkRead, onMarkAllRead }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Click outside closes
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const anyUnread = notifications.some((n) => !n.read_at);

  async function handleMarkAll() {
    onMarkAllRead(); // optimistic
    await fetch('/api/notifications/mark-all-read', { method: 'POST' });
  }

  async function handleRowClick(id: string, isUnread: boolean) {
    if (!isUnread) return;
    onMarkRead(id);
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border bg-popover shadow-lg"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {anyUnread && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="text-xs text-primary hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          notifications.slice(0, 10).map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onClick={() => handleRowClick(n.id, !n.read_at)}
            />
          ))
        )}
      </div>

      <div className="border-t">
        <Link
          href="/dashboard/notifications"
          onClick={onClose}
          className="block px-3 py-2 text-center text-xs font-medium text-primary hover:bg-accent"
        >
          See all →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/notifications/NotificationDropdown.tsx src/components/notifications/NotificationCard.tsx
git commit -m "feat(notifications): F3 — NotificationDropdown + Card"
```

## Task F3.3: API routes for mark-read

**Files:**
- Create: `src/app/api/notifications/[id]/read/route.ts`
- Create: `src/app/api/notifications/mark-all-read/route.ts`

- [ ] **Step 1: Single mark-read route**

```typescript
// src/app/api/notifications/[id]/read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const PATCH = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, read_at')
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, 'Notification not found');

    return NextResponse.json({ data }, { status: 200 });
  }
);
```

- [ ] **Step 2: Mark-all-read route**

```typescript
// src/app/api/notifications/mark-all-read/route.ts
import { NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async () => {
  const { user, supabase } = await requireUser();

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
    .select('id');

  if (error) throw new HttpError(500, error.message);

  return NextResponse.json({ data: { marked_count: data?.length ?? 0 } }, { status: 200 });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat(notifications): F3 — API routes for mark-read + mark-all-read"
```

## Task F3.4: Mount NotificationBell in Navbar

**Files:**
- Modify: `src/components/ui/Navbar.tsx`

- [ ] **Step 1: Add import + render the bell next to the user dropdown**

In `Navbar.tsx`, find the rendering of the user dropdown (search for `DropdownMenu` containing `LogOut`). Right BEFORE the user dropdown trigger, render the bell when `user` is set:

```typescript
import { NotificationBell } from '@/components/notifications/NotificationBell';

// ...inside the JSX, before the DropdownMenu for user:
{user && <NotificationBell userId={user.id} />}
```

- [ ] **Step 2: Run dev server + visually verify the bell appears**

```bash
npm run dev > /tmp/dev.log 2>&1 &
sleep 8
# Visit http://localhost:3000/dashboard while logged in → bell should appear in the top nav
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Navbar.tsx
git commit -m "feat(notifications): F3 — mount NotificationBell in top nav"
```

## Task F3.5: Manual end-to-end smoke

- [ ] **Step 1: Submit a booking from a couple account (via the UI)**

- [ ] **Step 2: Switch to vendor account in another browser/incognito tab**

Bell should show badge=1 within ~1s of the booking submission (realtime delivery).

A toast should appear with title "New booking request" + body "From [couple] for [package] ($X)".

- [ ] **Step 3: Click the bell → dropdown opens → click the new notification row → navigates to booking detail + badge clears**

- [ ] **Step 4: No commit (smoke only)**

---

# Phase F4 — Notifications page (parallel-safe with F2/F3 after F1, ~2–3h)

## Task F4.1: Server component shell + initial data fetch

**Files:**
- Create: `src/app/dashboard/notifications/page.tsx`

- [ ] **Step 1: Implement**

```typescript
// src/app/dashboard/notifications/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NotificationsPageClient } from '@/components/notifications/NotificationsPageClient';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Initial fetch — 150 most recent (covers all 3 tabs without immediate "Load more")
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(150);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <NotificationsPageClient
        userId={user.id}
        initial={(notifications ?? []) as Parameters<typeof NotificationsPageClient>[0]['initial']}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/notifications/page.tsx
git commit -m "feat(notifications): F4 — /dashboard/notifications page shell"
```

## Task F4.2: NotificationsPageClient — tabs + grouping

**Files:**
- Create: `src/components/notifications/NotificationsPageClient.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Database, NotificationType } from '@/types/database.types';
import { isHighPriority } from '@/lib/notifications/high-priority-types';
import { NotificationCard } from './NotificationCard';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

const ARCHIVE_AGE_DAYS = 30;

type Tab = 'action' | 'updates' | 'archived';

interface Props {
  userId: string;
  initial: NotificationRow[];
}

function isArchived(n: NotificationRow): boolean {
  if (!n.read_at) return false;
  const age = Date.now() - new Date(n.read_at).getTime();
  return age > ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function partition(notifications: NotificationRow[]) {
  const action: NotificationRow[] = [];
  const updates: NotificationRow[] = [];
  const archived: NotificationRow[] = [];
  for (const n of notifications) {
    if (isArchived(n)) {
      archived.push(n);
    } else if (!n.read_at && isHighPriority(n.type as NotificationType)) {
      action.push(n);
    } else {
      updates.push(n);
    }
  }
  return { action, updates, archived };
}

function groupByBooking(notifications: NotificationRow[]): Map<string, NotificationRow[]> {
  const groups = new Map<string, NotificationRow[]>();
  for (const n of notifications) {
    const bookingId = (n.metadata as { booking_id?: string })?.booking_id ?? '__other__';
    if (!groups.has(bookingId)) groups.set(bookingId, []);
    groups.get(bookingId)!.push(n);
  }
  // Sort each group's notifications newest first (already from query); preserve insertion order of groups
  return groups;
}

export function NotificationsPageClient({ initial }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[]>(initial);
  const [tab, setTab] = useState<Tab>('action');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const buckets = useMemo(() => partition(notifications), [notifications]);
  const current = buckets[tab === 'action' ? 'action' : tab === 'updates' ? 'updates' : 'archived'];
  const groups = useMemo(() => groupByBooking(current), [current]);

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await fetch('/api/notifications/mark-all-read', { method: 'POST' });
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const tabCounts = {
    action: buckets.action.length,
    updates: buckets.updates.length,
    archived: buckets.archived.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['action', 'updates', 'archived'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {t === 'action' ? 'Action needed' : t === 'updates' ? 'Updates' : 'Archived'}
              {tabCounts[t] > 0 && <span className="ml-1.5 text-xs opacity-80">({tabCounts[t]})</span>}
            </button>
          ))}
        </div>
        {buckets.action.length + buckets.updates.length > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {current.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {tab === 'action'
              ? 'Nothing needs your attention right now. 🎉'
              : tab === 'updates'
                ? "When bookings move through their lifecycle, you'll see updates here."
                : 'Read notifications older than 30 days appear here.'}
          </p>
        ) : (
          Array.from(groups.entries()).map(([bookingId, items]) => {
            const collapsed = collapsedGroups.has(bookingId);
            const headerLabel =
              bookingId === '__other__' ? 'Other' : `Booking ${bookingId.slice(0, 8)}…`;
            return (
              <div key={bookingId} className="overflow-hidden rounded-lg border bg-card">
                <button
                  type="button"
                  onClick={() => toggleGroup(bookingId)}
                  className="flex w-full items-center justify-between border-b bg-muted/30 px-4 py-2 text-left text-sm font-medium hover:bg-muted/50"
                >
                  <span>
                    {headerLabel} <span className="text-xs text-muted-foreground">({items.length})</span>
                  </span>
                  {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {!collapsed && (
                  <div className="divide-y">
                    {items.map((n) => (
                      <NotificationCard key={n.id} notification={n} onClick={() => markRead(n.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

Note: the group header label is intentionally generic (`Booking ${id.slice(0, 8)}…`). A future polish task could fetch booking summary data (package name + first event date) and render a richer header — but that requires joining metadata + a follow-up booking fetch. v1 ships the generic label.

- [ ] **Step 2: Commit**

```bash
git add src/components/notifications/NotificationsPageClient.tsx
git commit -m "feat(notifications): F4 — NotificationsPageClient with tabs + grouping"
```

## Task F4.3: Side-nav link to /dashboard/notifications

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Add the link**

In the sidebar nav, add a "Notifications" link:

```typescript
<Link
  href="/dashboard/notifications"
  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
>
  Notifications
</Link>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(notifications): F4 — add Notifications link to dashboard sidebar"
```

## Task F4.4: Playwright E2E for notifications

**Files:**
- Create: `tests/e2e/notifications.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedPackage,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('notifications — F end-to-end', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple booking → vendor sees notification row + bell badge', async ({ browser }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const pkg = await seedPackage(vendor, { basePriceCents: 150_000 });

    const coupleCtx = await browser.newContext();
    const couplePage = await coupleCtx.newPage();
    await loginAs(couplePage, couple);

    const eventDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const res = await couplePage.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        selected_addons: [],
        guest_count: 100,
        couple_full_name: 'E2E Couple',
        couple_contact_phone: '(312) 555-0100',
        events: [{
          sequence: 1, event_date: eventDate,
          event_start_time: `${eventDate}T16:00:00Z`,
          event_end_time: `${eventDate}T22:00:00Z`,
          event_type_label: 'Wedding Ceremony',
          address_line_1: '140 E Walton Pl', city: 'Chicago', state: 'IL', postal_code: '60611',
          location_overridden: false,
        }],
      },
    });
    expect(res.status()).toBe(201);

    // Verify notification row appears for vendor
    const supabase = getServiceClient();
    await expect.poll(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title')
        .eq('user_id', vendor!.id);
      return data;
    }, { timeout: 5_000 }).toHaveLength(1);

    const { data: notif } = await supabase
      .from('notifications')
      .select('type, title, body')
      .eq('user_id', vendor.id)
      .single();
    expect(notif?.type).toBe('booking_request_received');
    expect(notif?.body).toContain('Wedding Coverage');  // package name

    await coupleCtx.close();

    // Vendor side: bell badge + dropdown
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    await vendorPage.goto('/dashboard');
    // The bell badge should show "1"
    await expect(vendorPage.getByLabel(/Notifications.*1 unread/i)).toBeVisible();

    // Click bell → dropdown shows the notification
    await vendorPage.getByLabel(/Notifications.*1 unread/i).click();
    await expect(vendorPage.getByText(/new booking request/i).first()).toBeVisible();

    await vendorCtx.close();
  });

  test('mark-all-read clears unread count', async ({ browser }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const supabase = getServiceClient();

    // Seed 3 notifications directly
    await supabase.from('notifications').insert([
      { user_id: vendor.id, type: 'booking_request_received', title: 'A', body: 'body' },
      { user_id: vendor.id, type: 'deposit_paid', title: 'B', body: 'body' },
      { user_id: vendor.id, type: 'review_received', title: 'C', body: 'body' },
    ]);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);
    await page.goto('/dashboard/notifications');

    await page.getByRole('button', { name: /mark all read/i }).click();

    // Poll DB until all are marked read
    await expect.poll(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('read_at')
        .eq('user_id', vendor!.id);
      return data?.every((n) => n.read_at !== null);
    }, { timeout: 5_000 }).toBe(true);

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run with dev server up**

```bash
npm run dev > /tmp/dev.log 2>&1 &
sleep 8
PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/notifications.spec.ts --project=chromium --reporter=list
```

Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/notifications.spec.ts
git commit -m "test(e2e): notifications — booking → notification row + bell + mark-all-read"
```

---

# Phase F5 — Email P0 verification (parallel-safe, ~1h)

## Task F5.1: Audit `sendEmail` error paths use `logger.error`

**Files:**
- Read: `src/lib/email/resend.ts`
- Modify (if needed): `src/lib/email/resend.ts`

- [ ] **Step 1: Read the file**

```bash
grep -n "console.error\|logger.error\|catch" src/lib/email/resend.ts | head
```

- [ ] **Step 2: Replace any remaining `console.error` in error paths with `logger.error`**

For each occurrence:
```typescript
// Before:
console.error('[sendEmail] Resend error:', error);

// After:
import { logger } from '@/lib/logger';
logger.error('[sendEmail] Resend error', error, { to: options.to, subject: options.subject });
```

A4 may have done this already — if so, this task is a no-op except for verification.

- [ ] **Step 3: Commit (if changes made)**

```bash
git add src/lib/email/resend.ts
git commit -m "feat(email): F5 — logger.error coverage in sendEmail error paths"
```

## Task F5.2: Resend health check in /api/health

**Files:**
- Modify: `src/app/api/health/route.ts`

- [ ] **Step 1: Add the Resend ping**

```typescript
// Add to the existing GET handler's checks block:
const resendCheck = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
})
  .then((r) => ({ ok: r.ok, status: r.status }))
  .catch((err) => ({ ok: false, status: 0, error: String(err) }));

// Include `resend: resendCheck.ok ? 'ok' : 'failing'` in the response checks object
```

- [ ] **Step 2: Hit it locally + verify**

```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```

Expected output should now include a `resend: 'ok'` field.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat(health): F5 — add Resend ping to /api/health"
```

## Task F5.3: Manual Resend log audit (no commit)

- [ ] **Step 1: Open https://resend.com/emails**

Check the last 24h of logs.

- [ ] **Step 2: Verify**

- Are there sends? If zero → `RESEND_API_KEY` may be missing on prod Vercel; investigate before merging.
- Are sends delivered (not `bounced` / `failed`)? If many bounced → domain DNS issue.
- Are emails arriving in actual inboxes (check `noreply@baazar.io` outbox)?

- [ ] **Step 3: Document outcome (in PR description)**

If all green: close the P0 in the PR body as "Email P0 verified — sends arriving, Sentry coverage confirmed."

If issues: file a follow-up issue with the specific failure mode and continue F merge.

---

# Final tasks — full smoke + PR

## Task FZ.1: Full local smoke

- [ ] Run all unit tests: `npm test` — expect all green (existing 131 + new F1 + F4 = ~145+).
- [ ] Run all e2e specs: `PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test --project=chromium --reporter=list` — happy-path + notifications all pass.
- [ ] Lint + typecheck: `npm run lint && npm run typecheck` — clean.
- [ ] Build: `npm run build` — succeeds (may warn about `OPENAI_API_KEY` if not set; acceptable).

## Task FZ.2: Push + open PR

```bash
git push -u origin feat/sub-project-f-notifications
gh pr create --base main --head feat/sub-project-f-notifications \
  --title "feat(notifications): Sub-project F — in-app notifications + email P0 verify" \
  --body "..."
```

PR body should include:
- Migration 00030 (1 new migration; apply to dev + prod via SQL editor before merge)
- 12 notification types
- Toast hybrid strategy with the 5 high-priority types listed
- Test plan (links to happy-path + notifications.spec)
- Email P0 verification outcome from F5.3

## Task FZ.3: Apply migration 00030 to dev + prod, then merge

Same pattern as Sub-project A: paste migration 00030 into dev SQL editor first → verify → paste into prod SQL editor → squash-merge PR.

---

# Self-review

## Spec coverage

- **§1 scope**: all in-scope items have tasks (notifications table ✓, service ✓, trigger wire-up ✓, bell ✓, page ✓, email P0 ✓).
- **§2 schema**: F1.1 migration matches spec §13.1.
- **§3 trigger sites**: F2.1 + F2.2 + F2.3 cover all 10 listed sites in the spec; `booking_completed` is handled inside `autoCompleteBookings` in F2.2 when the parent booking flips to `status='completed'`.
- **§4 UX**: bell (F3.1), dropdown (F3.2), page (F4.1–F4.2), toast hybrid (F3.1 uses `isHighPriority`).
- **§4.5 realtime edge cases**: `isInitialLoad` ref in F3.1 prevents toast-on-page-load; multi-tab handled by the UPDATE subscription.
- **§5 email P0**: F5.1 + F5.2 + F5.3.
- **§7 phasing**: F1 sequential gate; F2/F3/F4/F5 parallel after.
- **§8 defaults**: all locked decisions reflected.
- **§9 SMS deferral**: out of scope, no tasks.
- **§10 API contracts**: F3.3 implements PATCH /api/notifications/[id]/read + POST /mark-all-read with the exact response shapes.
- **§13 migration**: F1.1.

## Placeholder scan

- No "TBD" / "TODO" / "fill in details" remain.
- Each step has either code, a precise file location with grep instruction, or an exact command.
- F4.2 has one acknowledged simplification: the group header uses `Booking ${id.slice(0,8)}…` instead of the richer "Smith Wedding · Aug 15" header. This is an intentional v1 polish gap, noted in the task — not a placeholder.

## Type consistency

- `NotificationType` exported from `database.types.ts` (F1.2) and used in `notifications.service.ts` (F1.3), `high-priority-types.ts` (F1.4), `NotificationBell.tsx` (F3.1), `NotificationsPageClient.tsx` (F4.2).
- Helper signatures locked in F1.3; F2.1 + F2.2 + F2.3 call them with matching arguments.
- API response shape from F3.3 matches what F3.2's `handleRowClick` + `NotificationsPageClient.markRead` expect (200 OK; client uses optimistic update, doesn't read response body).
