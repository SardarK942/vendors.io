import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const transferHeldEarnings = vi.fn();
const eq = vi.fn();

vi.mock('@/services/escrow-transfer.service', () => ({
  transferHeldEarnings: (...args: unknown[]) => transferHeldEarnings(...args),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({ select: () => ({ eq }) }),
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET, POST } from '@/app/api/cron/shop-escrow-transfer/route';

function req(auth?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/shop-escrow-transfer', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('shop-escrow-transfer cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'secret';
  });

  it('returns 401 when unauthorized', async () => {
    const res = await POST(req('Bearer wrong'));
    expect(res.status).toBe(401);
    expect(transferHeldEarnings).not.toHaveBeenCalled();
  });

  it('calls transferHeldEarnings once per distinct vendor with held rows', async () => {
    eq.mockResolvedValue({
      data: [{ vendor_profile_id: 'v1' }, { vendor_profile_id: 'v1' }, { vendor_profile_id: 'v2' }],
      error: null,
    });
    transferHeldEarnings.mockResolvedValue({
      transferredCount: 2,
      transferredCents: 100,
      failed: 0,
    });
    const res = await POST(req('Bearer secret'));
    expect(res.status).toBe(200);
    expect(transferHeldEarnings).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ vendors: 2, transferred: 4, failed: 0 });
  });

  it('counts a throwing vendor as failed and continues', async () => {
    eq.mockResolvedValue({
      data: [{ vendor_profile_id: 'v1' }, { vendor_profile_id: 'v2' }],
      error: null,
    });
    transferHeldEarnings
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ transferredCount: 1, transferredCents: 5, failed: 0 });
    const body = await (await POST(req('Bearer secret'))).json();
    expect(body).toEqual({ vendors: 2, transferred: 1, failed: 1 });
  });

  it('GET is aliased to POST', () => {
    expect(GET).toBe(POST);
  });
});
