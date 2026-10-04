import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const FAKE_EVENT = {
  id: 'evt_acct_1',
  type: 'account.updated',
  account: 'acct_42',
  data: { object: { id: 'acct_42', charges_enabled: true } },
} as unknown;

vi.mock('@/lib/stripe/client', () => ({
  stripe: { webhooks: { constructEvent: vi.fn(() => FAKE_EVENT) } },
}));

const refreshAccountStatus = vi.fn();
vi.mock('@/services/payment.service', () => ({
  handlePaymentSuccess: vi.fn(),
  handlePaymentFailure: vi.fn(),
  handleChargeRefunded: vi.fn(),
  handlePayoutEvent: vi.fn(),
}));
vi.mock('@/services/connect.service', () => ({
  refreshAccountStatus: (...a: unknown[]) => refreshAccountStatus(...a),
}));

const store: { row: Record<string, unknown> | null } = { row: null };
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: store.row }) }) }),
      insert: async (v: Record<string, unknown>) => {
        store.row = { ...v, handled_at: null, error: null };
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

beforeEach(() => {
  store.row = null;
  refreshAccountStatus.mockReset();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

it('calls refreshAccountStatus with the event account on account.updated', async () => {
  const res = await POST(
    new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    })
  );
  expect(res.status).toBe(200);
  expect(refreshAccountStatus).toHaveBeenCalledWith(expect.anything(), 'acct_42');
});
