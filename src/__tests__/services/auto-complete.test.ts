/**
 * Unit tests for the per-event autoCompleteBookings rewrite (A-cleanup).
 *
 * We mock the Stripe module (to avoid initialization errors in test environment)
 * and inject a mock Supabase client to exercise the branching logic without
 * a real DB connection.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the Stripe client module to avoid STRIPE_SECRET_KEY requirement in tests
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
    refunds: { create: vi.fn() },
    transfers: { create: vi.fn(), createReversal: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
  },
}));

// Mock Stripe connect helper
vi.mock('@/lib/stripe/connect', () => ({
  createMinimalAccount: vi.fn(),
  createFullOnboardingLink: vi.fn(),
}));

// Mock Supabase server helpers
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(async () => ({
    auth: {
      admin: {
        getUserById: vi.fn(async (_id: string) => ({
          data: { user: { email: 'mock@example.com' } },
          error: null,
        })),
      },
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    })),
  })),
  createServerSupabaseClient: vi.fn(() => ({})),
}));

// Mock email helpers to avoid resend API calls
vi.mock('@/lib/email/resend', () => ({
  sendDepositConfirmationEmail: vi.fn(),
  sendCompletionEmailToVendor: vi.fn(),
  sendReviewRequestEmail: vi.fn(),
  sendCancellationEmail: vi.fn(),
}));

// Mock event-completed email template
vi.mock('@/lib/email/event-completed', () => ({
  sendEventCompletedEmail: vi.fn(async () => ({ ok: true, id: 'mock_email_id' })),
}));

// Mock notifications service to avoid Supabase insert calls in tests
vi.mock('@/services/notifications.service', () => ({
  notifyDepositPaid: vi.fn(),
  notifyBookingConfirmed: vi.fn(),
  notifyBookingCancelled: vi.fn(),
  notifyEventCompleted: vi.fn(),
  notifyBookingCompleted: vi.fn(),
}));

import { autoCompleteBookings } from '@/services/payment.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PAST = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // 72h ago — past cutoff
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h from now

// Build a minimal Supabase mock for autoCompleteBookings' query patterns.
// bookings now include couple_user_id + vendor_profiles for notification calls.
function makeMockSupabase(
  bookings: Array<{
    id: string;
    couple_user_id?: string;
    vendor_profiles?: { user_id: string };
    booking_events: Array<{
      id: string;
      event_end_time: string;
      event_type_label?: string;
      sequence?: number;
      completed_at: string | null;
    }>;
  }>
) {
  const updatedEventIds: string[] = [];
  const updatedBookingIds: string[] = [];

  // Enrich bookings with defaults for the new fields.
  const enriched = bookings.map((b) => ({
    couple_user_id: 'couple-user-id',
    couple_email: 'couple@example.com',
    couple_full_name: 'Test Couple',
    vendor_profiles: { user_id: 'vendor-user-id', business_name: 'Test Vendor' },
    ...b,
    booking_events: b.booking_events.map((e) => ({
      event_type_label: 'Wedding',
      sequence: 1,
      ...e,
    })),
  }));

  return {
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: enriched }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, val: string) => {
              if (payload.status === 'completed') updatedBookingIds.push(val);
              return Promise.resolve({ data: null });
            },
          }),
        };
      }
      if (table === 'booking_events') {
        return {
          update: (_payload: unknown) => ({
            in: (_col: string, ids: string[]) => {
              updatedEventIds.push(...ids);
              return Promise.resolve({ data: null });
            },
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null }) }) };
    },
    _state: { updatedEventIds, updatedBookingIds },
  };
}

describe('autoCompleteBookings (per-event)', () => {
  it('marks due events complete and completes the booking when all events done', async () => {
    const mockSb = makeMockSupabase([
      {
        id: 'booking-1',
        booking_events: [
          { id: 'ev-1', event_end_time: PAST, completed_at: null },
          { id: 'ev-2', event_end_time: PAST, completed_at: null },
        ],
      },
    ]);

    const result = await autoCompleteBookings(mockSb as never);

    expect(result.events_completed).toBe(2);
    expect(result.bookings_completed).toBe(1);
  });

  it('marks due events complete but does NOT complete booking if some events still pending', async () => {
    const mockSb = makeMockSupabase([
      {
        id: 'booking-2',
        booking_events: [
          { id: 'ev-3', event_end_time: PAST, completed_at: null }, // due
          { id: 'ev-4', event_end_time: FUTURE, completed_at: null }, // not yet due
        ],
      },
    ]);

    const result = await autoCompleteBookings(mockSb as never);

    expect(result.events_completed).toBe(1);
    expect(result.bookings_completed).toBe(0);
  });

  it('skips bookings with no events due', async () => {
    const mockSb = makeMockSupabase([
      {
        id: 'booking-3',
        booking_events: [{ id: 'ev-5', event_end_time: FUTURE, completed_at: null }],
      },
    ]);

    const result = await autoCompleteBookings(mockSb as never);

    expect(result.events_completed).toBe(0);
    expect(result.bookings_completed).toBe(0);
  });

  it('skips already-completed events', async () => {
    const mockSb = makeMockSupabase([
      {
        id: 'booking-4',
        booking_events: [
          { id: 'ev-6', event_end_time: PAST, completed_at: PAST }, // already done
        ],
      },
    ]);

    const result = await autoCompleteBookings(mockSb as never);

    expect(result.events_completed).toBe(0);
    expect(result.bookings_completed).toBe(0);
  });

  it('handles empty booking list gracefully', async () => {
    const mockSb = makeMockSupabase([]);

    const result = await autoCompleteBookings(mockSb as never);

    expect(result.events_completed).toBe(0);
    expect(result.bookings_completed).toBe(0);
  });

  it('handles booking with no events (edge case: no events due, no events incomplete)', async () => {
    const mockSb = makeMockSupabase([
      {
        id: 'booking-5',
        booking_events: [],
      },
    ]);

    const result = await autoCompleteBookings(mockSb as never);

    expect(result.events_completed).toBe(0);
    expect(result.bookings_completed).toBe(0);
  });
});
