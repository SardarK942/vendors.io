import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regression test for the Stripe webhook retry path.
 *
 * The dedup guard skips events whose `stripe_events.handled_at` is set. The bug:
 * `handled_at` was stamped unconditionally — even when the handler threw — so
 * Stripe's retry was swallowed as a duplicate and the handler never re-ran,
 * stranding a paid booking. The fix stamps `handled_at` only on success.
 */

// A controllable fake event returned by signature verification.
const FAKE_EVENT = {
  id: 'evt_test_1',
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_1', metadata: { booking_id: 'bk_1' }, amount: 15000 } },
} as unknown;

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn(() => FAKE_EVENT) },
  },
}));

const handlePaymentSuccess = vi.fn();
vi.mock('@/services/payment.service', () => ({
  handlePaymentSuccess: (...args: unknown[]) => handlePaymentSuccess(...args),
  handlePaymentFailure: vi.fn(),
  handleChargeRefunded: vi.fn(),
  handlePayoutEvent: vi.fn(),
}));

// Stateful single-row `stripe_events` store so we can observe handled_at across
// the two POST calls (first attempt + retry).
const store: { row: Record<string, unknown> | null } = { row: null };
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: store.row }),
        }),
      }),
      insert: async (values: Record<string, unknown>) => {
        store.row = { ...values, handled_at: null, error: null };
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          store.row = { ...(store.row ?? {}), ...patch };
          return { error: null };
        },
      }),
    }),
  }),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

function makeRequest() {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    body: JSON.stringify({ id: FAKE_EVENT }),
  });
}

describe('Stripe webhook — retry after a handler failure', () => {
  beforeEach(() => {
    store.row = null;
    handlePaymentSuccess.mockReset();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  it('leaves handled_at null and 500s when the handler throws, so the retry re-runs and succeeds', async () => {
    // First delivery: handler throws (transient failure after the card is charged).
    handlePaymentSuccess.mockRejectedValueOnce(new Error('transient DB blip'));
    const res1 = await POST(makeRequest());
    expect(res1.status).toBe(500);
    // Critical: the event is NOT marked handled, so it is retryable.
    expect(store.row?.handled_at).toBeNull();
    expect(store.row?.error).toBe('transient DB blip');

    // Stripe retries: the guard must NOT short-circuit as duplicate — the
    // handler runs again and this time succeeds.
    handlePaymentSuccess.mockResolvedValueOnce(undefined);
    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(200);
    expect(handlePaymentSuccess).toHaveBeenCalledTimes(2);
    expect(store.row?.handled_at).not.toBeNull();
    expect(store.row?.error).toBeNull();
  });

  it('short-circuits a genuine duplicate once handled_at is set', async () => {
    handlePaymentSuccess.mockResolvedValue(undefined);
    const first = await POST(makeRequest());
    expect(first.status).toBe(200);
    expect(handlePaymentSuccess).toHaveBeenCalledTimes(1);

    // Same event again after success → skipped without re-running the handler.
    const dup = await POST(makeRequest());
    expect(dup.status).toBe(200);
    const body = await dup.json();
    expect(body.duplicate).toBe(true);
    expect(handlePaymentSuccess).toHaveBeenCalledTimes(1);
  });
});
