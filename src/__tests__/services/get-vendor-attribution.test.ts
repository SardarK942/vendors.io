import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies that payment.service.ts imports at module load time.
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
  sendDepositConfirmationEmail: vi.fn(),
  sendCompletionEmailToVendor: vi.fn(),
  sendReviewRequestEmail: vi.fn(),
  sendCancellationEmail: vi.fn(),
}));
vi.mock('@/lib/email/event-completed', () => ({
  sendEventCompletedEmail: vi.fn(),
}));
vi.mock('@/services/notifications.service', () => ({
  notifyDepositPaid: vi.fn(),
  notifyBookingConfirmed: vi.fn(),
  notifyBookingCancelled: vi.fn(),
  notifyEventCompleted: vi.fn(),
  notifyBookingCompleted: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { getVendorAttribution } from '@/services/payment.service';

// Minimal supabase mock that returns the test bookings.
// The query chain is: from().select().eq().in() — terminal for 'all' range.
// For date-filtered ranges: from().select().eq().in().gte() — terminal.
// We make .in() return a thenable that also has .gte() → same terminal.
function mockSupabase(
  bookings: Array<{ total_price_cents: number; status: string; created_at: string }>
) {
  const terminal = Promise.resolve({ data: bookings, error: null });
  const inResult = Object.assign(Object.create(terminal), terminal, {
    then: terminal.then.bind(terminal),
    catch: terminal.catch.bind(terminal),
    finally: terminal.finally.bind(terminal),
    gte: () => terminal,
  });
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => inResult),
        })),
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('getVendorAttribution()', () => {
  it('returns zeros + roiMultiple 0 when no bookings', async () => {
    const sb = mockSupabase([]);
    const result = await getVendorAttribution(sb, 'vp-1', 'all');
    expect(result).toEqual({
      totalCents: 0,
      bookingCount: 0,
      platformFeeCents: 0,
      netCents: 0,
      roiMultiple: 0,
    });
  });

  it('computes correct sums for 3 bookings', async () => {
    const sb = mockSupabase([
      { total_price_cents: 100_000, status: 'accepted', created_at: '2026-06-01T00:00:00Z' },
      { total_price_cents: 250_000, status: 'deposit_paid', created_at: '2026-06-02T00:00:00Z' },
      { total_price_cents: 450_000, status: 'completed', created_at: '2026-06-03T00:00:00Z' },
    ]);
    const result = await getVendorAttribution(sb, 'vp-1', 'all');
    expect(result.totalCents).toBe(800_000); // $8,000
    expect(result.bookingCount).toBe(3);
    expect(result.platformFeeCents).toBe(40_000); // 5% of $8,000 = $400
    expect(result.netCents).toBe(760_000); // 95% of $8,000 = $7,600
    expect(result.roiMultiple).toBe(20); // total / fee = 1 / 0.05
  });

  it('roiMultiple is always 20 when non-empty', async () => {
    const sb = mockSupabase([
      { total_price_cents: 12_345, status: 'accepted', created_at: '2026-06-01T00:00:00Z' },
    ]);
    const result = await getVendorAttribution(sb, 'vp-1', 'all');
    expect(result.roiMultiple).toBe(20);
  });
});
