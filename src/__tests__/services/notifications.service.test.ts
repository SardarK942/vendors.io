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
  notifyCoupleCountered,
} from '@/services/notifications.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import * as supabaseServer from '@/lib/supabase/server';

type MockSrClient = SupabaseClient<Database>;

type Sb = SupabaseClient<Database>;

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ── Service-role client mock ──────────────────────────────────────────────────
// createNotification now uses createServiceRoleClient() internally (bypasses
// RLS — see notifications migration 00030 and the D.1 bug fix). Tests must
// assert against the service-role mock, not the passed-in sb.

let mockInsertSpy: ReturnType<typeof vi.fn>;

function makeServiceRoleResult(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  mockInsertSpy = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve(result)),
    })),
  }));
  const client = {
    from: vi.fn(() => ({ insert: mockInsertSpy })),
    // expose spy for assertions
    _insertSpy: mockInsertSpy,
  };
  return client;
}

// Dummy sb — passed to helpers but intentionally ignored by createNotification
const dummySb = {} as unknown as Sb;

describe('createNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns inserted id on success', async () => {
    const srClient = makeServiceRoleResult({ data: { id: 'n-123' }, error: null });
    vi.spyOn(supabaseServer, 'createServiceRoleClient').mockReturnValue(
      srClient as unknown as MockSrClient
    );

    const result = await createNotification(dummySb, {
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
    const srClient = makeServiceRoleResult({ data: null, error: { message: 'rls denied' } });
    vi.spyOn(supabaseServer, 'createServiceRoleClient').mockReturnValue(
      srClient as unknown as MockSrClient
    );

    const result = await createNotification(dummySb, {
      user_id: 'u-1',
      type: 'booking_request_received',
      title: 'x',
      body: 'x',
    });
    expect(result).toBeNull();
  });

  it('passes link as null when not provided', async () => {
    const srClient = makeServiceRoleResult({ data: { id: 'n-1' }, error: null });
    vi.spyOn(supabaseServer, 'createServiceRoleClient').mockReturnValue(
      srClient as unknown as MockSrClient
    );

    await createNotification(dummySb, {
      user_id: 'u-1',
      type: 'review_received',
      title: 'x',
      body: 'x',
    });
    const insertArg = srClient._insertSpy.mock.calls[0][0];
    expect(insertArg.link).toBeNull();
  });
});

describe('typed helpers compose correctly', () => {
  let srClient: ReturnType<typeof makeServiceRoleResult>;

  beforeEach(() => {
    vi.restoreAllMocks();
    srClient = makeServiceRoleResult({ data: { id: 'x' }, error: null });
    vi.spyOn(supabaseServer, 'createServiceRoleClient').mockReturnValue(
      srClient as unknown as MockSrClient
    );
  });

  it('notifyBookingRequestReceived', async () => {
    await notifyBookingRequestReceived(dummySb, 'vendor-1', {
      bookingId: 'b-1',
      coupleName: 'Jane Smith',
      packageName: 'Full Wedding Coverage',
      totalCents: 240000,
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.user_id).toBe('vendor-1');
    expect(arg.type).toBe('booking_request_received');
    expect(arg.title).toMatch(/new booking request/i);
    expect(arg.body).toContain('Jane Smith');
    expect(arg.body).toContain('Full Wedding Coverage');
    expect(arg.body).toContain('$2,400');
    expect(arg.link).toBe('/dashboard/bookings/b-1');
    expect(arg.metadata).toEqual({
      booking_id: 'b-1',
      package_name: 'Full Wedding Coverage',
      total_cents: 240000,
      is_first: false,
    });
  });

  it('notifyVendorAccepted includes deposit amount (30%)', async () => {
    await notifyVendorAccepted(dummySb, 'couple-1', {
      bookingId: 'b-1',
      vendorName: 'Asha Photography',
      totalCents: 240000,
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('vendor_accepted');
    expect(arg.body).toContain('$720'); // 30% of 240000c = 72000c = $720
  });

  it('notifyVendorAdjustedQuote includes reason label', async () => {
    await notifyVendorAdjustedQuote(dummySb, 'couple-1', {
      bookingId: 'b-1',
      vendorName: 'Asha',
      newTotalCents: 260000,
      reason: 'travel',
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('vendor_adjusted_quote');
    expect(arg.body).toContain('travel distance');
  });

  it('notifyVendorAdjustedQuote falls back to raw reason on unknown', async () => {
    await notifyVendorAdjustedQuote(dummySb, 'couple-1', {
      bookingId: 'b-1',
      vendorName: 'Asha',
      newTotalCents: 260000,
      reason: 'unknown_reason',
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.body).toContain('unknown_reason');
  });

  it('notifyCoupleAcceptedAdjusted', async () => {
    await notifyCoupleAcceptedAdjusted(dummySb, 'vendor-1', {
      bookingId: 'b-1',
      coupleName: 'Jane',
      totalCents: 200000,
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('couple_accepted_adjusted');
    expect(arg.title).toContain('Jane');
    expect(arg.body).toContain('$2,000');
  });

  it('notifyCoupleDeclinedAdjusted', async () => {
    await notifyCoupleDeclinedAdjusted(dummySb, 'vendor-1', {
      bookingId: 'b-1',
      coupleName: 'Jane',
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('couple_declined_adjusted');
    expect(arg.body).toMatch(/72h|72 hours/i);
  });

  it('notifyDepositPaid', async () => {
    await notifyDepositPaid(dummySb, 'vendor-1', {
      bookingId: 'b-1',
      coupleName: 'Jane',
      depositCents: 72000,
      packageName: 'Full Wedding',
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('deposit_paid');
    expect(arg.body).toContain('Jane');
    expect(arg.body).toContain('$720');
    expect(arg.body).toContain('Full Wedding');
  });

  it('notifyBookingConfirmed', async () => {
    await notifyBookingConfirmed(dummySb, 'couple-1', { bookingId: 'b-1', vendorName: 'Asha' });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('booking_confirmed');
    expect(arg.body).toContain('Asha');
  });

  it('notifyBookingAutoCancelled', async () => {
    await notifyBookingAutoCancelled(dummySb, 'u-1', { bookingId: 'b-1', recipientRole: 'couple' });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('booking_auto_cancelled');
    expect(arg.metadata).toMatchObject({ recipient_role: 'couple' });
  });

  it('notifyBookingCancelled (mutual)', async () => {
    await notifyBookingCancelled(dummySb, 'u-1', { bookingId: 'b-1', cancellerRole: 'mutual' });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.body).toMatch(/mutual|both/i);
  });

  it('notifyBookingCancelled (single party)', async () => {
    await notifyBookingCancelled(dummySb, 'u-1', { bookingId: 'b-1', cancellerRole: 'vendor' });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.body).toContain('vendor');
  });

  it('notifyEventCompleted shows progress', async () => {
    await notifyEventCompleted(dummySb, 'couple-1', {
      bookingId: 'b-1',
      eventTypeLabel: 'Mehndi',
      sequence: 1,
      eventsCount: 3,
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('event_completed');
    expect(arg.title).toContain('1 of 3');
    expect(arg.body).toContain('Mehndi');
  });

  it('notifyBookingCompleted differs by role', async () => {
    await notifyBookingCompleted(dummySb, 'couple-1', {
      bookingId: 'b-1',
      recipientRole: 'couple',
    });
    const coupleArg = srClient._insertSpy.mock.calls[0][0];
    expect(coupleArg.body).toMatch(/review/i);

    // Reset for vendor role test
    vi.restoreAllMocks();
    srClient = makeServiceRoleResult({ data: { id: 'x' }, error: null });
    vi.spyOn(supabaseServer, 'createServiceRoleClient').mockReturnValue(
      srClient as unknown as MockSrClient
    );

    await notifyBookingCompleted(dummySb, 'vendor-1', {
      bookingId: 'b-1',
      recipientRole: 'vendor',
    });
    const vendorArg = srClient._insertSpy.mock.calls[0][0];
    expect(vendorArg.body).toMatch(/funds|earnings/i);
  });

  it('notifyReviewReceived', async () => {
    await notifyReviewReceived(dummySb, 'vendor-1', {
      bookingId: 'b-1',
      coupleName: 'Jane',
      ratingOverall: 5,
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.type).toBe('review_received');
    expect(arg.body).toContain('Jane');
    expect(arg.body).toContain('5');
  });

  it('notifyCoupleCountered: body contains couple name, type=couple_countered, no remaining count in body', async () => {
    await notifyCoupleCountered(dummySb, 'vendor-1', {
      bookingId: 'b-1',
      coupleName: 'Priya & Rohan',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
    });
    const arg = srClient._insertSpy.mock.calls[0][0];
    expect(arg.user_id).toBe('vendor-1');
    expect(arg.type).toBe('couple_countered');
    expect(arg.title).toBe('Counter-offer received');
    expect(arg.body).toContain('Priya & Rohan');
    expect(arg.body).not.toContain('remaining'); // spec § 6 — no remaining count in body
    expect(arg.link).toBe('/dashboard/bookings/b-1');
    expect(arg.metadata).toMatchObject({
      booking_id: 'b-1',
      proposed_total_cents: 95_000,
      vendor_adjustments_remaining: 2,
    });
  });
});
