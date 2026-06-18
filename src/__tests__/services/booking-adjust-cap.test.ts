/**
 * D.1 — Unit tests for adjustBookingQuote() cap enforcement
 * Tests: cap at 2 (reject), increment on success, sequential cap.
 * Uses in-memory mock Supabase client — no network required.
 */
import { describe, it, expect, vi } from 'vitest';
import { adjustBookingQuote } from '@/services/booking.service';

// Mock notifications so fire-and-forget calls don't fail with mock Supabase.
vi.mock('@/services/notifications.service', () => ({
  notifyBookingRequestReceived: vi.fn(),
  notifyVendorAccepted: vi.fn(),
  notifyVendorAdjustedQuote: vi.fn(),
  notifyCoupleAcceptedAdjusted: vi.fn(),
  notifyCoupleDeclinedAdjusted: vi.fn(),
  notifyBookingAutoCancelled: vi.fn(),
  notifyDepositPaid: vi.fn(),
  notifyBookingConfirmed: vi.fn(),
  notifyBookingCancelled: vi.fn(),
  notifyEventCompleted: vi.fn(),
  notifyBookingCompleted: vi.fn(),
  notifyReviewReceived: vi.fn(),
}));

// ─── mockSb factory ───────────────────────────────────────────────────────────
// Builds a minimal Supabase mock that:
//   - Returns the provided booking on the SELECT path.
//   - Returns the updated booking on the UPDATE path.
//   - Exposes updateCalls() to inspect what was passed to .update().

function mockSb({ booking }: { booking: Record<string, unknown> }) {
  const _updateCalls: Record<string, unknown>[] = [];
  const updatedBooking = { ...booking };

  const sb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => {
            if (table === 'packages') {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: booking, error: null });
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        _updateCalls.push(payload);
        Object.assign(updatedBooking, payload);
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: updatedBooking, error: null }),
            }),
          }),
        };
      },
    }),
    updateCalls: () => _updateCalls,
  };

  return sb as unknown as typeof sb & {
    updateCalls: () => Record<string, unknown>[];
  };
}

const baseInput = {
  adjustment_amount_cents: 150_000,
  reason: 'custom' as const,
  explanation: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('adjustBookingQuote() — adjust cap enforcement', () => {
  it('rejects with adjust_cap_reached when vendor_adjustment_count >= 2', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_1',
        vendor_profile_id: 'vp_1',
        vendor_profiles: { user_id: 'u_vendor' },
        status: 'pending_quote',
        negotiation_round_count: 2,
        package_id: null,
        vendor_adjustment_count: 2,
      },
    });

    const result = await adjustBookingQuote(supabase as never, 'b_1', 'u_vendor', baseInput);

    expect(result).toMatchObject({ ok: false, code: 'adjust_cap_reached' });
  });

  it('increments vendor_adjustment_count on success when count is 0', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_2',
        vendor_profile_id: 'vp_1',
        vendor_profiles: { user_id: 'u_vendor' },
        status: 'pending_quote',
        negotiation_round_count: 0,
        package_id: null,
        vendor_adjustment_count: 0,
      },
    });

    const result = await adjustBookingQuote(supabase as never, 'b_2', 'u_vendor', baseInput);

    const success = result as { error?: { code: string }; status: number };
    expect(success.error).toBeUndefined();
    expect(supabase.updateCalls()).toContainEqual(
      expect.objectContaining({ vendor_adjustment_count: 1 })
    );
  });

  it('rejects on third attempt (count=2) after two prior adjustments', async () => {
    // Simulate a booking that has already been adjusted twice (count=2).
    const supabase = mockSb({
      booking: {
        id: 'b_3',
        vendor_profile_id: 'vp_1',
        vendor_profiles: { user_id: 'u_vendor' },
        status: 'pending_quote',
        negotiation_round_count: 2,
        package_id: null,
        vendor_adjustment_count: 2,
      },
    });

    const result = await adjustBookingQuote(supabase as never, 'b_3', 'u_vendor', baseInput);

    expect(result).toMatchObject({ ok: false, code: 'adjust_cap_reached' });
    // No update should have been attempted.
    expect(supabase.updateCalls()).toHaveLength(0);
  });
});
