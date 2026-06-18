import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as deliverMod from '@/lib/notifications/deliver';

// ── Module-level mocks (must be hoisted before any dynamic imports) ──────────
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
    refunds: { create: vi.fn() },
    transfers: { create: vi.fn(), createReversal: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
  },
}));
vi.mock('@/lib/stripe/connect', () => ({
  createMinimalAccount: vi.fn(),
  createFullOnboardingLink: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/email/resend', () => ({
  sendDepositConfirmationEmail: vi.fn().mockResolvedValue(true),
  sendCompletionEmailToVendor: vi.fn().mockResolvedValue(true),
  sendReviewRequestEmail: vi.fn().mockResolvedValue(true),
  sendCancellationEmail: vi.fn().mockResolvedValue(true),
  sendBookingAutoCancelEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/services/notifications.service', () => ({
  notifyDepositPaid: vi.fn().mockResolvedValue(undefined),
  notifyBookingConfirmed: vi.fn().mockResolvedValue(undefined),
  notifyBookingCancelled: vi.fn().mockResolvedValue(undefined),
  notifyEventCompleted: vi.fn().mockResolvedValue(undefined),
  notifyBookingCompleted: vi.fn().mockResolvedValue(undefined),
  notifyBookingAutoCancelled: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// ── Import SUT after mocks ────────────────────────────────────────────────────
import { autoCancelExpiredBookings } from '@/services/booking.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
const BOOKING_ID = 'booking-deliver-test-001';

function makeSupabaseMock() {
  // The builder always returns `this` to support `.from().select().in().lt()` chains.
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    in: vi.fn(),
    lt: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  // Make every chainable method return the builder itself.
  builder.select.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.lt.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.single.mockReturnValue(Promise.resolve({ data: null }));

  // The SELECT call (first .from call) resolves with one expired booking.
  let selectCallCount = 0;
  const fromMock = vi.fn((table: string) => {
    if (table === 'bookings') {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First .from('bookings') = the SELECT for expired bookings.
        builder.lt.mockReturnValueOnce(
          Promise.resolve({
            data: [
              {
                id: BOOKING_ID,
                couple_user_id: 'couple-user-001',
                couple_email: 'couple@example.com',
                users: { email: 'couple@example.com' },
                vendor_profiles: {
                  user_id: 'vendor-user-001',
                  business_name: 'Test Vendor',
                  users: { email: 'vendor@example.com' },
                },
              },
            ],
          })
        );
      } else {
        // Second .from('bookings') = the UPDATE — just resolve with empty.
        builder.lt.mockReturnValueOnce(Promise.resolve({ data: [], error: null }));
      }
    }
    return builder;
  });

  return { from: fromMock } as unknown as Parameters<typeof autoCancelExpiredBookings>[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('autoCancelExpiredBookings — deliver() wraps notify+email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes deliver("email") and deliver("notify") for each cancelled booking', async () => {
    const deliverSpy = vi.spyOn(deliverMod, 'deliver');
    const supabase = makeSupabaseMock();

    await autoCancelExpiredBookings(supabase);

    // Should have been called at least twice for the couple (email + notify)
    // and at least twice for the vendor (email + notify) = 4 total.
    const emailCalls = deliverSpy.mock.calls.filter(([kind]) => kind === 'email');
    const notifyCalls = deliverSpy.mock.calls.filter(([kind]) => kind === 'notify');

    expect(emailCalls.length).toBeGreaterThanOrEqual(1);
    expect(notifyCalls.length).toBeGreaterThanOrEqual(1);

    // Verify the context bag carries the booking_id.
    expect(deliverSpy).toHaveBeenCalledWith(
      'notify',
      expect.any(Function),
      expect.objectContaining({ booking_id: BOOKING_ID })
    );
    expect(deliverSpy).toHaveBeenCalledWith(
      'email',
      expect.any(Function),
      expect.objectContaining({ booking_id: BOOKING_ID })
    );
  });
});
