import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state: { event: unknown } = { event: null };
const cancelPi = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn(() => state.event) },
    paymentIntents: { cancel: (...a: unknown[]) => cancelPi(...a) },
  },
}));

const handlePaymentSuccess = vi.fn();
vi.mock('@/services/payment.service', () => ({
  handlePaymentSuccess: (...a: unknown[]) => handlePaymentSuccess(...a),
  handlePaymentFailure: vi.fn(),
  handleChargeRefunded: vi.fn(),
  handlePayoutEvent: vi.fn(),
}));

const createOrderFromSession = vi.fn();
const finalizeOrderPaid = vi.fn();
const finalizeOrderCanceled = vi.fn();
vi.mock('@/services/orders.service', () => ({
  createOrderFromSession: (...a: unknown[]) => createOrderFromSession(...a),
  finalizeOrderPaid: (...a: unknown[]) => finalizeOrderPaid(...a),
  finalizeOrderCanceled: (...a: unknown[]) => finalizeOrderCanceled(...a),
}));

vi.mock('@/services/connect.service', () => ({ refreshAccountStatus: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

function post() {
  return POST(
    new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    })
  );
}

const session = (extra: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_1',
      payment_intent: 'pi_1',
      metadata: { kind: 'shop' },
      amount_total: 11000,
      total_details: { amount_tax: 500 },
    },
  },
  ...extra,
});

describe('Stripe webhook — shop events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    createOrderFromSession.mockResolvedValue({ data: { orderId: 'o1' }, status: 201 });
    finalizeOrderPaid.mockResolvedValue({ data: { status: 'confirmed' }, status: 200 });
    finalizeOrderCanceled.mockResolvedValue({ data: { status: 'cancelled' }, status: 200 });
  });

  it('creates an order from a shop checkout session (escrow)', async () => {
    state.event = session();
    const res = await post();
    expect(res.status).toBe(200);
    expect(createOrderFromSession).toHaveBeenCalledWith(expect.anything(), {
      sessionId: 'cs_1',
      paymentIntentId: 'pi_1',
      chargeMode: 'escrow',
      account: null,
      taxCents: 500,
      totalCents: 11000,
    });
  });

  it('uses direct mode for connected-account events', async () => {
    state.event = session({ account: 'acct_1' });
    await post();
    expect(createOrderFromSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chargeMode: 'direct', account: 'acct_1' })
    );
  });

  it('cancels the PI and still returns 200 when out of stock', async () => {
    createOrderFromSession.mockResolvedValue({ data: { voided: 'out_of_stock' }, status: 200 });
    state.event = session({ account: 'acct_1' });
    const res = await post();
    expect(res.status).toBe(200);
    expect(cancelPi).toHaveBeenCalledWith('pi_1', { stripeAccount: 'acct_1' });
  });

  it('does not touch non-shop checkout sessions', async () => {
    state.event = {
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', metadata: {} } },
    };
    const res = await post();
    expect(res.status).toBe(200);
    expect(createOrderFromSession).not.toHaveBeenCalled();
  });

  it('finalizes a shop payment_intent.succeeded', async () => {
    state.event = {
      id: 'evt_3',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { kind: 'shop' }, amount: 11000 } },
    };
    const res = await post();
    expect(res.status).toBe(200);
    expect(finalizeOrderPaid).toHaveBeenCalledWith(expect.anything(), 'pi_1');
    expect(handlePaymentSuccess).not.toHaveBeenCalled();
  });

  it('routes a booking payment_intent.succeeded to the booking handler only', async () => {
    state.event = {
      id: 'evt_4',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_b', metadata: { booking_id: 'bk_1' }, amount: 15000 } },
    };
    const res = await post();
    expect(res.status).toBe(200);
    expect(handlePaymentSuccess).toHaveBeenCalledTimes(1);
    expect(finalizeOrderPaid).not.toHaveBeenCalled();
  });

  it('finalizes a shop payment_intent.canceled', async () => {
    state.event = {
      id: 'evt_5',
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_1', metadata: { kind: 'shop' } } },
    };
    const res = await post();
    expect(res.status).toBe(200);
    expect(finalizeOrderCanceled).toHaveBeenCalledWith(expect.anything(), 'pi_1');
  });

  it('returns 500 when a shop handler reports an error so Stripe retries', async () => {
    createOrderFromSession.mockResolvedValue({ error: 'boom', status: 500 });
    state.event = session();
    const res = await post();
    expect(res.status).toBe(500);
  });
});
