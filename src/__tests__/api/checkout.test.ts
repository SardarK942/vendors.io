import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { HttpError } from '@/lib/api/error-boundary';

const requireUser = vi.fn();
vi.mock('@/lib/api/auth', () => ({ requireUser: () => requireUser() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }) }));

const svc = { tag: 'service' };
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => svc }));

const createCheckoutSession = vi.fn();
vi.mock('@/services/checkout.service', () => ({
  createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
}));

import { POST } from '@/app/api/checkout/route';

const sb = { tag: 'rls' };
const req = (body: unknown) =>
  new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const valid = { vendor_profile_id: 'v1', fulfillment_type: 'pickup' };

beforeEach(() => {
  requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase: sb });
  createCheckoutSession.mockReset();
});

describe('POST /api/checkout', () => {
  it('returns 401 when unauthenticated', async () => {
    requireUser.mockRejectedValue(new HttpError(401, 'Unauthorized'));
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('returns { url } from the service with both clients', async () => {
    createCheckoutSession.mockResolvedValue({ data: { url: 'https://stripe/x' }, status: 200 });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://stripe/x' });
    expect(createCheckoutSession).toHaveBeenCalledWith(sb, svc, 'u1', valid);
  });

  it('propagates a service 409', async () => {
    createCheckoutSession.mockResolvedValue({ error: 'unready', status: 409 });
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'unready' });
  });

  it('rejects an invalid body', async () => {
    const res = await POST(req({ vendor_profile_id: 'v1', fulfillment_type: 'bogus' }));
    expect(res.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
