import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/users/onboarding-complete/route';

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/users/onboarding-complete', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function buildSupabase(opts: {
  user?: { id: string } | null;
  userRole?: 'couple' | 'vendor';
  userUpdateError?: { message: string } | null;
  vendorUpsertError?: { message: string } | null;
}) {
  const userUpdate = vi.fn().mockResolvedValue({ error: opts.userUpdateError ?? null });
  const vendorUpsert = vi.fn().mockResolvedValue({ error: opts.vendorUpsertError ?? null });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.userRole ? { role: opts.userRole } : null,
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: opts.userUpdateError ?? null }),
          })),
        };
      }
      if (table === 'vendor_profiles') {
        return {
          upsert: vendorUpsert,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    userUpdate,
    vendorUpsert,
  };
}

describe('POST /api/users/onboarding-complete', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const sb = buildSupabase({ user: null });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ skipped: true, data: null }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'couple' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ foo: 'bar' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on couple completion', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'couple' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(
      makePostRequest({
        skipped: false,
        data: { event_date: '2026-10-17', categories: ['photography'] },
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('returns 200 on vendor completion + upserts vendor_profiles.category', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'vendor' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(
      makePostRequest({
        skipped: false,
        data: { category: 'photography', years_in_business: '3-10' },
      })
    );
    expect(res.status).toBe(200);
    expect(sb.vendorUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-1', category: 'photography' }),
      expect.objectContaining({ onConflict: 'user_id' })
    );
  });

  it('returns 200 on skip (data: null)', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, userRole: 'couple' });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ skipped: true, data: null }));
    expect(res.status).toBe(200);
  });

  it('returns 200 even if vendor_profiles upsert fails (non-fatal)', async () => {
    const sb = buildSupabase({
      user: { id: 'u-1' },
      userRole: 'vendor',
      vendorUpsertError: { message: 'duplicate row' },
    });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(
      makePostRequest({
        skipped: false,
        data: { category: 'photography', years_in_business: '3-10' },
      })
    );
    expect(res.status).toBe(200);
  });
});
