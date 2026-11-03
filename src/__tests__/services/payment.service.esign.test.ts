import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    refunds: { create: vi.fn().mockResolvedValue({}) },
    transfers: { createReversal: vi.fn() },
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: vi.fn(() => ({})) }));
vi.mock('@/lib/email/resend', () => ({
  sendDepositConfirmationEmail: vi.fn().mockResolvedValue(true),
  sendCancellationEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/services/notifications.service', () => ({
  notifyDepositPaid: vi.fn().mockResolvedValue(undefined),
  notifyBookingConfirmed: vi.fn().mockResolvedValue(undefined),
  notifyBookingCancelled: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/docuseal.service', () => ({
  createForBooking: vi.fn(),
  voidForBooking: vi.fn(),
}));

import { createForBooking, voidForBooking } from '@/services/docuseal.service';
import {
  handlePaymentSuccess,
  handleChargeRefunded,
  cancelBooking,
} from '@/services/payment.service';

const BOOKING_ID = 'booking-esign-1';

// Thenable chainable builder; terminal reads resolve to `result`.
function makeSupabase(opts: {
  single?: unknown;
  maybeSingle?: unknown;
  updateRows?: unknown;
}): SupabaseClient<Database> {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'update', 'insert', 'eq', 'in', 'is']) builder[m] = vi.fn(chain);
  builder.single = vi.fn(async () => ({ data: opts.single ?? null }));
  builder.maybeSingle = vi.fn(async () => ({ data: opts.maybeSingle ?? null }));
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: opts.updateRows ?? null, error: null });
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  vi.mocked(createForBooking)
    .mockReset()
    .mockResolvedValue({ data: { contractId: 'c', status: 'sent' }, status: 200 });
  vi.mocked(voidForBooking)
    .mockReset()
    .mockResolvedValue(undefined as never);
});

describe('payment path e-sign hooks', () => {
  it('handlePaymentSuccess triggers createForBooking after deposit_paid', async () => {
    const sb = makeSupabase({ single: null });
    await handlePaymentSuccess(sb, 'pi_1', BOOKING_ID, 5000);
    expect(createForBooking).toHaveBeenCalledWith(sb, BOOKING_ID);
  });

  it('createForBooking throwing does not fail handlePaymentSuccess', async () => {
    vi.mocked(createForBooking).mockRejectedValue(new Error('docuseal down'));
    const sb = makeSupabase({ single: null });
    await expect(handlePaymentSuccess(sb, 'pi_1', BOOKING_ID, 5000)).resolves.toBeUndefined();
  });

  it('cancelBooking triggers voidForBooking', async () => {
    const booking = {
      status: 'pending',
      couple_user_id: 'u1',
      vendor_profiles: { id: 'vp', user_id: 'u2' },
      transactions: [],
    };
    const sb = makeSupabase({ single: booking, updateRows: [{ id: BOOKING_ID }] });
    const res = await cancelBooking(sb, BOOKING_ID, 'u1', 'couple');
    expect(res.status).toBe(200);
    expect(voidForBooking).toHaveBeenCalledWith(sb, BOOKING_ID);
  });

  it('cancelBooking does not void when the status flip loses the race (409)', async () => {
    const booking = {
      status: 'pending',
      couple_user_id: 'u1',
      vendor_profiles: { id: 'vp', user_id: 'u2' },
      transactions: [],
    };
    const sb = makeSupabase({ single: booking, updateRows: [] });
    const res = await cancelBooking(sb, BOOKING_ID, 'u1', 'couple');
    expect(res.status).toBe(409);
    expect(voidForBooking).not.toHaveBeenCalled();
  });

  it('handleChargeRefunded triggers voidForBooking and survives a throw', async () => {
    vi.mocked(voidForBooking).mockRejectedValue(new Error('boom'));
    const sb = makeSupabase({
      maybeSingle: {
        id: 'tx1',
        booking_request_id: BOOKING_ID,
        stripe_transfer_id: null,
        transferred_at: null,
        refunded_at: null,
        vendor_payout: 0,
      },
    });
    await expect(handleChargeRefunded(sb, 'pi_1', 5000, 5000)).resolves.toBeUndefined();
    expect(voidForBooking).toHaveBeenCalledWith(sb, BOOKING_ID);
  });
});
