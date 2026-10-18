import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({ stripe: {} }));

import { finalizeOrderCanceled } from '@/services/orders.service';

describe('finalizeOrderCanceled', () => {
  it('is a 200 no-op when no order matches the payment intent', async () => {
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      }),
    };
    const r = await finalizeOrderCanceled(db as never, 'pi_void');
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ status: 'none' });
  });
});
