import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({ stripe: {} }));
const notifyConfirmed = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/shop-notifications.service', () => ({
  notifyShopOrderPlaced: vi.fn(),
  notifyShopOrderCancelled: vi.fn(),
  notifyShopOrderConfirmed: (...a: unknown[]) => notifyConfirmed(...a),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { finalizeOrderPaid } from '@/services/orders.service';

function dbFor(status: string) {
  const order = {
    id: 'o1',
    vendor_profile_id: 'vp',
    status,
    charge_mode: 'direct',
    item_subtotal_cents: 1,
    shipping_cents: 0,
    commission_cents: 0,
  };
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: order }) }) }),
      update: () => ({
        eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'o1' }], error: null }) }) }),
      }),
    }),
  };
}

describe('finalizeOrderPaid notifications', () => {
  beforeEach(() => notifyConfirmed.mockClear());

  it('fires notifyShopOrderConfirmed on pending -> confirmed', async () => {
    const r = await finalizeOrderPaid(dbFor('pending_confirmation') as never, 'pi_1');
    expect(r.data).toEqual({ status: 'confirmed' });
    expect(notifyConfirmed).toHaveBeenCalledTimes(1);
  });

  it('does not notify on the already-confirmed no-op', async () => {
    const r = await finalizeOrderPaid(dbFor('confirmed') as never, 'pi_1');
    expect(r.data).toEqual({ status: 'confirmed' });
    expect(notifyConfirmed).not.toHaveBeenCalled();
  });

  it('a notification failure does not affect the result', async () => {
    notifyConfirmed.mockRejectedValueOnce(new Error('boom'));
    const r = await finalizeOrderPaid(dbFor('pending_confirmation') as never, 'pi_1');
    expect(r.status).toBe(200);
  });
});
