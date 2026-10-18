import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireUser = vi.fn();
vi.mock('@/lib/api/auth', () => ({ requireUser: () => requireUser() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ svc: true }) }));

const confirmOrder = vi.fn();
const declineOrder = vi.fn();
vi.mock('@/services/orders.service', () => ({
  confirmOrder: (...a: unknown[]) => confirmOrder(...a),
  declineOrder: (...a: unknown[]) => declineOrder(...a),
}));

import { POST as confirmPOST } from '@/app/api/orders/[id]/confirm/route';
import { POST as declinePOST } from '@/app/api/orders/[id]/decline/route';
import { GET as orderGET } from '@/app/api/orders/[id]/route';
import { GET as sessionGET } from '@/app/api/orders/by-session/[sessionId]/route';

/** Fake RLS client: tables -> single-row results for maybeSingle(). */
function fakeDb(rows: Record<string, unknown>) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
      return chain;
    },
  };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body?: unknown) =>
  new NextRequest('http://localhost/api/orders/o1/x', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = () => new NextRequest('http://localhost/api/orders/o1');

beforeEach(() => {
  confirmOrder.mockReset();
  declineOrder.mockReset();
});

describe('POST /api/orders/[id]/confirm', () => {
  it('403s a user who does not own the order vendor profile and never confirms', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u2' },
      supabase: fakeDb({ orders: { id: 'o1', vendor_profile_id: 'vp1' } }),
    });
    const res = await confirmPOST(post(), ctx('o1'));
    expect(res.status).toBe(403);
    expect(confirmOrder).not.toHaveBeenCalled();
  });

  it('404s when the order is not visible', async () => {
    requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase: fakeDb({}) });
    const res = await confirmPOST(post(), ctx('o1'));
    expect(res.status).toBe(404);
    expect(confirmOrder).not.toHaveBeenCalled();
  });

  it('lets the owning vendor confirm and returns the service status', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u1' },
      supabase: fakeDb({
        orders: { id: 'o1', vendor_profile_id: 'vp1' },
        vendor_profiles: { id: 'vp1' },
      }),
    });
    confirmOrder.mockResolvedValue({ data: { status: 'confirmed' }, status: 200 });
    const res = await confirmPOST(post(), ctx('o1'));
    expect(res.status).toBe(200);
    expect(confirmOrder).toHaveBeenCalledWith({ svc: true }, 'o1');
  });

  it('propagates a service 502', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u1' },
      supabase: fakeDb({
        orders: { id: 'o1', vendor_profile_id: 'vp1' },
        vendor_profiles: { id: 'vp1' },
      }),
    });
    confirmOrder.mockResolvedValue({ error: 'capture failed', status: 502 });
    const res = await confirmPOST(post(), ctx('o1'));
    expect(res.status).toBe(502);
  });
});

describe('POST /api/orders/[id]/decline', () => {
  it('403s a non-owner and never declines', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u2' },
      supabase: fakeDb({ orders: { id: 'o1', vendor_profile_id: 'vp1' } }),
    });
    const res = await declinePOST(post({ reason: 'x' }), ctx('o1'));
    expect(res.status).toBe(403);
    expect(declineOrder).not.toHaveBeenCalled();
  });

  it('lets the owner decline with a reason', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u1' },
      supabase: fakeDb({
        orders: { id: 'o1', vendor_profile_id: 'vp1' },
        vendor_profiles: { id: 'vp1' },
      }),
    });
    declineOrder.mockResolvedValue({ data: { status: 'cancelled' }, status: 200 });
    const res = await declinePOST(post({ reason: 'sold out' }), ctx('o1'));
    expect(res.status).toBe(200);
    expect(declineOrder).toHaveBeenCalledWith({ svc: true }, 'o1', 'sold out');
  });

  it('allows an empty body', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u1' },
      supabase: fakeDb({
        orders: { id: 'o1', vendor_profile_id: 'vp1' },
        vendor_profiles: { id: 'vp1' },
      }),
    });
    declineOrder.mockResolvedValue({ data: { status: 'cancelled' }, status: 200 });
    const res = await declinePOST(post(), ctx('o1'));
    expect(res.status).toBe(200);
    expect(declineOrder).toHaveBeenCalledWith({ svc: true }, 'o1', undefined);
  });
});

describe('GET /api/orders/[id]', () => {
  it('returns the order for an allowed caller', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u1' },
      supabase: fakeDb({ orders: { id: 'o1', order_items: [] } }),
    });
    const res = await orderGET(get(), ctx('o1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe('o1');
  });

  it('404s when RLS hides the order', async () => {
    requireUser.mockResolvedValue({ user: { id: 'u9' }, supabase: fakeDb({}) });
    const res = await orderGET(get(), ctx('o1'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/orders/by-session/[sessionId]', () => {
  it('returns the order when it exists', async () => {
    requireUser.mockResolvedValue({
      user: { id: 'u1' },
      supabase: fakeDb({ orders: { id: 'o1' } }),
    });
    const res = await sessionGET(get(), { params: Promise.resolve({ sessionId: 'cs_1' }) });
    expect(res.status).toBe(200);
  });

  it('404s cleanly before the webhook has created the order', async () => {
    requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase: fakeDb({}) });
    const res = await sessionGET(get(), { params: Promise.resolve({ sessionId: 'cs_1' }) });
    expect(res.status).toBe(404);
  });
});
