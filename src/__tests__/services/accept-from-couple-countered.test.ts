/**
 * D.1 follow-up — Unit tests for acceptBooking() from couple_countered
 * Tests: whitelist allows couple_countered, price flips to couple_counter_amount,
 *        pending path unchanged (no total_price_cents in update payload).
 * Uses in-memory mock Supabase client — no network required.
 */
import { describe, it, expect, vi } from 'vitest';
import { acceptBooking } from '@/services/booking.service';

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
  notifyCoupleCountered: vi.fn(),
}));

// Mock deliver so fire-and-forget deliver() calls resolve cleanly.
vi.mock('@/lib/notifications/deliver', () => ({
  deliver: vi.fn().mockResolvedValue({ id: 'mock_notif_1' }),
}));

// ─── mockSb factory ───────────────────────────────────────────────────────────
// Builds a minimal Supabase mock that handles both the bookings SELECT (with
// vendor_profiles join) and the bookings UPDATE, plus a packages SELECT that
// returns null (no template). Exposes updateCalls() to inspect payloads.

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
            // Second SELECT is the notification context fetch — return a minimal row.
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('acceptBooking() — couple_countered source', () => {
  it('allows couple_countered source: returns 200 with accepted status', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_1',
        vendor_profile_id: 'vp_1',
        vendor_profiles: { user_id: 'u_vendor' },
        status: 'couple_countered',
        package_id: null,
        total_price_cents: 100_000,
        couple_counter_amount: 85_000,
        couple_counter_count: 1,
      },
    });

    const result = await acceptBooking(supabase as never, 'b_1', 'u_vendor');

    expect(result.status).toBe(200);
    expect(result.error).toBeUndefined();
    expect((result.data as Record<string, unknown>)?.status).toBe('accepted');
  });

  it('price flips to couple_counter_amount when accepting a counter', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_2',
        vendor_profile_id: 'vp_1',
        vendor_profiles: { user_id: 'u_vendor' },
        status: 'couple_countered',
        package_id: null,
        total_price_cents: 100_000,
        couple_counter_amount: 85_000,
        couple_counter_count: 1,
      },
    });

    await acceptBooking(supabase as never, 'b_2', 'u_vendor');

    expect(supabase.updateCalls()).toContainEqual(
      expect.objectContaining({ total_price_cents: 85_000 })
    );
  });

  it('pending source does NOT include total_price_cents in update payload', async () => {
    const supabase = mockSb({
      booking: {
        id: 'b_3',
        vendor_profile_id: 'vp_1',
        vendor_profiles: { user_id: 'u_vendor' },
        status: 'pending',
        package_id: null,
        total_price_cents: 100_000,
        couple_counter_amount: null,
        couple_counter_count: 0,
      },
    });

    const result = await acceptBooking(supabase as never, 'b_3', 'u_vendor');

    expect(result.status).toBe(200);
    // The update payload must NOT contain total_price_cents for the pending path.
    const updatePayload = supabase.updateCalls()[0];
    expect(updatePayload).not.toHaveProperty('total_price_cents');
  });
});
