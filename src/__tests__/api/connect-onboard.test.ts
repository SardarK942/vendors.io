import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireUser = vi.fn();
vi.mock('@/lib/api/auth', () => ({ requireUser: () => requireUser() }));

const getActiveVendorProfileId = vi.fn();
vi.mock('@/lib/vendor/active', () => ({
  getActiveVendorProfileId: (...a: unknown[]) => getActiveVendorProfileId(...a),
}));

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }) }));

const getOrCreateConnectAccount = vi.fn();
const createOnboardingLink = vi.fn();
vi.mock('@/services/connect.service', () => ({
  getOrCreateConnectAccount: (...a: unknown[]) => getOrCreateConnectAccount(...a),
  createOnboardingLink: (...a: unknown[]) => createOnboardingLink(...a),
}));

import { POST } from '@/app/api/connect/onboard/route';

function req() {
  return new NextRequest('http://localhost/api/connect/onboard', { method: 'POST' });
}

beforeEach(() => {
  requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase: {} });
  getActiveVendorProfileId.mockResolvedValue('vp_1');
  getOrCreateConnectAccount.mockReset();
  createOnboardingLink.mockReset();
});

describe('POST /api/connect/onboard', () => {
  it('returns the onboarding url for a valid local bridal vendor', async () => {
    getOrCreateConnectAccount.mockResolvedValue({ data: { accountId: 'acct_1' }, status: 201 });
    createOnboardingLink.mockResolvedValue({ data: { url: 'https://stripe/x' }, status: 200 });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).data.url).toBe('https://stripe/x');
  });

  it('propagates the service 403 for a non-eligible vendor and does not mint a link', async () => {
    getOrCreateConnectAccount.mockResolvedValue({ error: 'not eligible', status: 403 });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(createOnboardingLink).not.toHaveBeenCalled();
  });
});
