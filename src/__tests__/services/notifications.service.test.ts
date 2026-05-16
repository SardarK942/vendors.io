/**
 * Unit tests for notifications.service.ts (Sub-project F · Phase F1/F2).
 *
 * Tests verify:
 *   - createNotification happy path returns id and calls supabase.insert correctly
 *   - createNotification failure path returns null and logs error (no throw)
 *   - Typed helper (notifyBookingRequestReceived) composes correct fields
 *   - isHighPriority correctly categorises all 12 types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger to prevent actual log output and capture calls.
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

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
import { isHighPriority, HIGH_PRIORITY_NOTIFICATION_TYPES } from '@/lib/notifications/high-priority-types';
import { logger } from '@/lib/logger';

// ─── Mock Supabase builder ────────────────────────────────────────────────────

function makeSuccessClient(returnedId = 'notif-uuid-1') {
  const insertFn = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: returnedId }, error: null }),
    }),
  });
  return {
    from: vi.fn().mockReturnValue({ insert: insertFn }),
    _insertFn: insertFn,
  };
}

function makeErrorClient(errorMessage = 'insert failed') {
  const insertFn = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: errorMessage, code: '500' } }),
    }),
  });
  return {
    from: vi.fn().mockReturnValue({ insert: insertFn }),
    _insertFn: insertFn,
  };
}

// ─── createNotification ───────────────────────────────────────────────────────

describe('createNotification — happy path', () => {
  it('returns the inserted id on success', async () => {
    const sb = makeSuccessClient('abc-123');
    const result = await createNotification(sb as never, {
      user_id: 'user-1',
      type: 'booking_request_received',
      title: 'New booking',
      body: 'From couple',
    });
    expect(result).toEqual({ id: 'abc-123' });
  });

  it('calls insert on the notifications table', async () => {
    const sb = makeSuccessClient();
    await createNotification(sb as never, {
      user_id: 'user-1',
      type: 'vendor_accepted',
      title: 'Accepted',
      body: 'Vendor accepted',
      link: '/dashboard/bookings/b-1',
      metadata: { booking_id: 'b-1' },
    });
    expect(sb.from).toHaveBeenCalledWith('notifications');
    const insertCall = sb._insertFn.mock.calls[0][0];
    expect(insertCall.user_id).toBe('user-1');
    expect(insertCall.type).toBe('vendor_accepted');
    expect(insertCall.link).toBe('/dashboard/bookings/b-1');
    expect(insertCall.metadata).toEqual({ booking_id: 'b-1' });
  });
});

describe('createNotification — failure path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when insert fails', async () => {
    const sb = makeErrorClient('constraint violation');
    const result = await createNotification(sb as never, {
      user_id: 'user-x',
      type: 'booking_cancelled',
      title: 'Cancelled',
      body: 'booking was cancelled',
    });
    expect(result).toBeNull();
  });

  it('calls logger.error on failure (Sentry capture path)', async () => {
    const sb = makeErrorClient('db error');
    await createNotification(sb as never, {
      user_id: 'user-y',
      type: 'review_received',
      title: 'New review',
      body: 'From couple',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'createNotification failed',
      expect.anything(),
      expect.objectContaining({ type: 'review_received', user_id: 'user-y' })
    );
  });

  it('does NOT throw on failure — parent function stays safe', async () => {
    const sb = makeErrorClient();
    await expect(
      createNotification(sb as never, {
        user_id: 'u',
        type: 'booking_completed',
        title: 'Done',
        body: 'All done',
      })
    ).resolves.toBeNull();
  });
});

// ─── Typed helper: notifyBookingRequestReceived ───────────────────────────────

describe('notifyBookingRequestReceived', () => {
  it('sends correct type and composes body with couple name + package + price', async () => {
    const sb = makeSuccessClient();
    await notifyBookingRequestReceived(sb as never, 'vendor-user-1', {
      bookingId: 'b-99',
      coupleName: 'John & Jane',
      packageName: 'Wedding Photography',
      totalCents: 300000,
    });

    const insertArg = sb._insertFn.mock.calls[0][0];
    expect(insertArg.type).toBe('booking_request_received');
    expect(insertArg.user_id).toBe('vendor-user-1');
    expect(insertArg.body).toContain('John & Jane');
    expect(insertArg.body).toContain('Wedding Photography');
    expect(insertArg.link).toBe('/dashboard/bookings/b-99');
    expect(insertArg.metadata).toMatchObject({ booking_id: 'b-99', amount_cents: 300000 });
  });
});

// ─── Typed helper: notifyVendorAccepted ───────────────────────────────────────

describe('notifyVendorAccepted', () => {
  it('sends to couple user with vendor name + price', async () => {
    const sb = makeSuccessClient();
    await notifyVendorAccepted(sb as never, 'couple-user-1', {
      bookingId: 'b-1',
      vendorName: 'Dream Shots',
      totalCents: 150000,
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('vendor_accepted');
    expect(arg.user_id).toBe('couple-user-1');
    expect(arg.body).toContain('Dream Shots');
  });
});

// ─── Typed helper: notifyVendorAdjustedQuote ──────────────────────────────────

describe('notifyVendorAdjustedQuote', () => {
  it('sends to couple user with adjusted price', async () => {
    const sb = makeSuccessClient();
    await notifyVendorAdjustedQuote(sb as never, 'couple-user-1', {
      bookingId: 'b-1',
      vendorName: 'Lens Masters',
      newTotalCents: 200000,
      reason: 'travel',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('vendor_adjusted_quote');
    expect(arg.user_id).toBe('couple-user-1');
    expect(arg.metadata).toMatchObject({ reason: 'travel' });
  });
});

// ─── Typed helper: notifyCoupleAcceptedAdjusted ───────────────────────────────

describe('notifyCoupleAcceptedAdjusted', () => {
  it('sends to vendor user', async () => {
    const sb = makeSuccessClient();
    await notifyCoupleAcceptedAdjusted(sb as never, 'vendor-user-1', {
      bookingId: 'b-1',
      coupleName: 'Smith & Lee',
      totalCents: 180000,
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('couple_accepted_adjusted');
    expect(arg.user_id).toBe('vendor-user-1');
    expect(arg.body).toContain('Smith & Lee');
  });
});

// ─── Typed helper: notifyCoupleDeclinedAdjusted ───────────────────────────────

describe('notifyCoupleDeclinedAdjusted', () => {
  it('sends to vendor user with couple name', async () => {
    const sb = makeSuccessClient();
    await notifyCoupleDeclinedAdjusted(sb as never, 'vendor-user-1', {
      bookingId: 'b-1',
      coupleName: 'Jones & Kim',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('couple_declined_adjusted');
    expect(arg.body).toContain('Jones & Kim');
  });
});

// ─── Typed helper: notifyDepositPaid ─────────────────────────────────────────

describe('notifyDepositPaid', () => {
  it('sends deposit amount and package name to vendor', async () => {
    const sb = makeSuccessClient();
    await notifyDepositPaid(sb as never, 'vendor-user-1', {
      bookingId: 'b-1',
      coupleName: 'Ali & Sara',
      depositCents: 30000,
      packageName: 'Mehndi Coverage',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('deposit_paid');
    expect(arg.body).toContain('Ali & Sara');
    expect(arg.body).toContain('Mehndi Coverage');
    expect(arg.metadata).toMatchObject({ deposit_cents: 30000 });
  });
});

// ─── Typed helper: notifyBookingConfirmed ─────────────────────────────────────

describe('notifyBookingConfirmed', () => {
  it('sends to couple user with vendor name', async () => {
    const sb = makeSuccessClient();
    await notifyBookingConfirmed(sb as never, 'couple-user-1', {
      bookingId: 'b-1',
      vendorName: 'Flash Frames',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('booking_confirmed');
    expect(arg.user_id).toBe('couple-user-1');
    expect(arg.body).toContain('Flash Frames');
  });
});

// ─── Typed helper: notifyBookingAutoCancelled ─────────────────────────────────

describe('notifyBookingAutoCancelled', () => {
  it('sends couple-targeted body when recipientRole is couple', async () => {
    const sb = makeSuccessClient();
    await notifyBookingAutoCancelled(sb as never, 'couple-user-1', {
      bookingId: 'b-1',
      recipientRole: 'couple',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('booking_auto_cancelled');
    expect(arg.metadata).toMatchObject({ recipient_role: 'couple' });
  });

  it('sends vendor-targeted body when recipientRole is vendor', async () => {
    const sb = makeSuccessClient();
    await notifyBookingAutoCancelled(sb as never, 'vendor-user-1', {
      bookingId: 'b-1',
      recipientRole: 'vendor',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.metadata).toMatchObject({ recipient_role: 'vendor' });
  });
});

// ─── Typed helper: notifyBookingCancelled ─────────────────────────────────────

describe('notifyBookingCancelled', () => {
  it('mentions "The couple" when couple cancelled', async () => {
    const sb = makeSuccessClient();
    await notifyBookingCancelled(sb as never, 'vendor-user-1', {
      bookingId: 'b-1',
      cancellerRole: 'couple',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('booking_cancelled');
    expect(arg.body).toContain('The couple');
  });

  it('mentions "The vendor" when vendor cancelled', async () => {
    const sb = makeSuccessClient();
    await notifyBookingCancelled(sb as never, 'couple-user-1', {
      bookingId: 'b-1',
      cancellerRole: 'vendor',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.body).toContain('The vendor');
  });
});

// ─── Typed helper: notifyEventCompleted ───────────────────────────────────────

describe('notifyEventCompleted', () => {
  it('includes event label and sequence in body', async () => {
    const sb = makeSuccessClient();
    await notifyEventCompleted(sb as never, 'user-1', {
      bookingId: 'b-1',
      eventTypeLabel: 'Mehndi',
      sequence: 1,
      eventsCount: 3,
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('event_completed');
    expect(arg.body).toContain('Mehndi');
    expect(arg.body).toContain('1 of 3');
  });
});

// ─── Typed helper: notifyBookingCompleted ─────────────────────────────────────

describe('notifyBookingCompleted', () => {
  it('prompts couple to leave a review', async () => {
    const sb = makeSuccessClient();
    await notifyBookingCompleted(sb as never, 'couple-user-1', {
      bookingId: 'b-1',
      recipientRole: 'couple',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('booking_completed');
    expect(arg.body).toContain('review');
  });

  it('mentions fund transfer for vendor', async () => {
    const sb = makeSuccessClient();
    await notifyBookingCompleted(sb as never, 'vendor-user-1', {
      bookingId: 'b-1',
      recipientRole: 'vendor',
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.body).toContain('funds');
  });
});

// ─── Typed helper: notifyReviewReceived ───────────────────────────────────────

describe('notifyReviewReceived', () => {
  it('includes rating and couple name in body', async () => {
    const sb = makeSuccessClient();
    await notifyReviewReceived(sb as never, 'vendor-user-1', {
      bookingId: 'b-1',
      coupleName: 'Ali & Zara',
      ratingOverall: 5,
    });
    const arg = sb._insertFn.mock.calls[0][0];
    expect(arg.type).toBe('review_received');
    expect(arg.body).toContain('Ali & Zara');
    expect(arg.body).toContain('5');
    expect(arg.metadata).toMatchObject({ rating_overall: 5 });
  });
});

// ─── HIGH_PRIORITY_NOTIFICATION_TYPES ────────────────────────────────────────

describe('isHighPriority', () => {
  it('returns true for booking_request_received', () => {
    expect(isHighPriority('booking_request_received')).toBe(true);
  });

  it('returns true for deposit_paid', () => {
    expect(isHighPriority('deposit_paid')).toBe(true);
  });

  it('returns true for vendor_adjusted_quote', () => {
    expect(isHighPriority('vendor_adjusted_quote')).toBe(true);
  });

  it('returns true for couple_declined_adjusted', () => {
    expect(isHighPriority('couple_declined_adjusted')).toBe(true);
  });

  it('returns true for booking_confirmed', () => {
    expect(isHighPriority('booking_confirmed')).toBe(true);
  });

  it('returns false for vendor_accepted (silent type)', () => {
    expect(isHighPriority('vendor_accepted')).toBe(false);
  });

  it('returns false for event_completed (silent type)', () => {
    expect(isHighPriority('event_completed')).toBe(false);
  });

  it('returns false for booking_completed (silent type)', () => {
    expect(isHighPriority('booking_completed')).toBe(false);
  });

  it('returns false for review_received (silent type)', () => {
    expect(isHighPriority('review_received')).toBe(false);
  });

  it('returns false for booking_cancelled (silent type)', () => {
    expect(isHighPriority('booking_cancelled')).toBe(false);
  });

  it('returns false for booking_auto_cancelled (silent type)', () => {
    expect(isHighPriority('booking_auto_cancelled')).toBe(false);
  });

  it('contains exactly 5 high-priority types', () => {
    expect(HIGH_PRIORITY_NOTIFICATION_TYPES.size).toBe(5);
  });
});
