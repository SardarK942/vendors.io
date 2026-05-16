/**
 * A2.10/A2.11 — Unit tests for PATCH /api/vendor-profile route handler
 *
 * Tests:
 * - is_active=true with 0 active packages → 409 NO_ACTIVE_PACKAGES
 * - is_active=true with ≥1 active package → 200, returns updated profile
 * - base_address_public=true with valid address → 200
 * - Unauthenticated → 401 (via requireUser throw)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock requireUser before importing the route ───────────────────────────

vi.mock('@/lib/api/auth', () => ({
  requireUser: vi.fn(),
}));

// Also mock the logger used by error-boundary to avoid noise
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { requireUser } from '@/lib/api/auth';
import { PATCH } from '@/app/api/vendor-profile/route';
import { HttpError } from '@/lib/api/error-boundary';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/vendor-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildSupabase({
  existingProfile,
  activePackageCount,
  updatedProfile,
  updateError = null,
}: {
  existingProfile: { id: string; user_id: string } | null;
  activePackageCount: number;
  updatedProfile?: Record<string, unknown>;
  updateError?: { message: string } | null;
}) {
  return {
    from: (table: string) => {
      if (table === 'vendor_profiles') {
        return {
          select: (_cols: unknown) => ({
            eq: (_col: string, _val: string) => ({
              single: () =>
                Promise.resolve({ data: existingProfile, error: existingProfile ? null : { message: 'not found' } }),
              // For the update chain
            }),
          }),
          update: (_payload: unknown) => ({
            eq: (_col: string, _val: string) => ({
              select: (_s: unknown) => ({
                single: () =>
                  Promise.resolve({
                    data: updateError ? null : (updatedProfile ?? existingProfile),
                    error: updateError,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === 'packages') {
        return {
          select: (_cols: unknown, _opts?: unknown) => ({
            eq: (_col: string, _val: string) => ({
              eq: (_col2: string, _val2: unknown) =>
                Promise.resolve({ count: activePackageCount, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/vendor-profile', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated (requireUser throws HttpError 401)', async () => {
    mockRequireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorized'));

    const res = await PATCH(makeRequest({ is_active: false }));
    expect(res.status).toBe(401);
  });

  it('returns 409 NO_ACTIVE_PACKAGES when activating with 0 active packages', async () => {
    const sb = buildSupabase({
      existingProfile: { id: 'vp-1', user_id: 'u-1' },
      activePackageCount: 0,
    });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const res = await PATCH(makeRequest({ is_active: true }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('NO_ACTIVE_PACKAGES');
  });

  it('returns 200 when activating with ≥1 active package', async () => {
    const updated = { id: 'vp-1', user_id: 'u-1', is_active: true, business_name: 'Test Vendor' };
    const sb = buildSupabase({
      existingProfile: { id: 'vp-1', user_id: 'u-1' },
      activePackageCount: 2,
      updatedProfile: updated,
    });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const res = await PATCH(makeRequest({ is_active: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.is_active).toBe(true);
  });

  it('returns 200 when updating base_address_public=true with valid address', async () => {
    const updated = {
      id: 'vp-1',
      user_id: 'u-1',
      base_address_line_1: '123 Main St',
      base_city: 'Chicago',
      base_state: 'IL',
      base_postal_code: '60601',
      base_address_public: true,
    };
    const sb = buildSupabase({
      existingProfile: { id: 'vp-1', user_id: 'u-1' },
      activePackageCount: 0,
      updatedProfile: updated,
    });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const res = await PATCH(
      makeRequest({
        base_address_line_1: '123 Main St',
        base_city: 'Chicago',
        base_state: 'IL',
        base_postal_code: '60601',
        base_address_public: true,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.base_address_public).toBe(true);
    expect(json.data.base_city).toBe('Chicago');
  });

  it('returns 403 when user has no vendor profile', async () => {
    const sb = buildSupabase({
      existingProfile: null,
      activePackageCount: 0,
    });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-no-profile' }, supabase: sb });

    const res = await PATCH(makeRequest({ is_active: false }));
    expect(res.status).toBe(403);
  });
});
