/**
 * D.1 — Unit tests for coupleCounterBooking()
 * Tests: cap enforcement, auth guard, state guard, success path.
 * Uses in-memory mock Supabase client — no network required.
 */
import { describe, it, expect, vi } from 'vitest';
import { coupleCounterBooking } from '@/services/booking.service';

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

  // Updated row mirrors input booking with whatever changes were applied.
  const updatedBooking = { ...booking };

  const sb = {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: booking, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        _updateCalls.push(payload);
        // Merge payload into updatedBooking for the returned row.
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
      supabase: supabase as never,
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
      supabase: supabase as never,
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
      supabase: supabase as never,
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
      supabase: supabase as never,
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
