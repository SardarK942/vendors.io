/**
 * Sub-project I §3 — POST /api/users/me/active-business tests.
 *
 * Verifies auth, ownership, validation, and rate limit handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));

import { POST } from '@/app/api/users/me/active-business/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

function makeMockClient(state: {
  user: { id: string } | null;
  vendorProfile: { id: string; user_id: string } | null;
  updateError?: { message: string } | null;
}) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user }, error: null }),
    },
    from(table: string) {
      if (table === 'vendor_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: state.vendorProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: state.updateError ?? null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/users/me/active-business', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

describe('POST /api/users/me/active-business', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no user', async () => {
    mockedCreateClient.mockResolvedValue(
      makeMockClient({ user: null, vendorProfile: null }) as never
    );
    mockedCheckRateLimit.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(401);
  });

  it('429 when rate limit exceeded', async () => {
    mockedCreateClient.mockResolvedValue(
      makeMockClient({
        user: { id: 'user-A' },
        vendorProfile: { id: 'vp-1', user_id: 'user-A' },
      }) as never
    );
    mockedCheckRateLimit.mockResolvedValue({ ok: false, message: 'Too many requests' });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(429);
  });

  it('400 when vendorProfileId is missing or not a string', async () => {
    mockedCreateClient.mockResolvedValue(
      makeMockClient({ user: { id: 'user-A' }, vendorProfile: null }) as never
    );
    mockedCheckRateLimit.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('404 when target vendor_profile does not exist', async () => {
    mockedCreateClient.mockResolvedValue(
      makeMockClient({ user: { id: 'user-A' }, vendorProfile: null }) as never
    );
    mockedCheckRateLimit.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('403 when target profile is not owned by caller', async () => {
    mockedCreateClient.mockResolvedValue(
      makeMockClient({
        user: { id: 'user-A' },
        vendorProfile: { id: 'vp-1', user_id: 'user-B' },
      }) as never
    );
    mockedCheckRateLimit.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(403);
  });

  it('200 on happy path', async () => {
    mockedCreateClient.mockResolvedValue(
      makeMockClient({
        user: { id: 'user-A' },
        vendorProfile: { id: 'vp-1', user_id: 'user-A' },
      }) as never
    );
    mockedCheckRateLimit.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('500 on db error during update', async () => {
    mockedCreateClient.mockResolvedValue(
      makeMockClient({
        user: { id: 'user-A' },
        vendorProfile: { id: 'vp-1', user_id: 'user-A' },
        updateError: { message: 'boom' },
      }) as never
    );
    mockedCheckRateLimit.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ vendorProfileId: 'vp-1' }));
    expect(res.status).toBe(500);
  });
});
