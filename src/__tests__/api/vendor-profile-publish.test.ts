/**
 * B4.2 — Unit tests for POST /api/vendor-profile/publish
 *
 * Tests:
 * 1. 401 when unauthenticated
 * 2. 404 when no vendor_profile row
 * 3. 400 when bio is missing / too short
 * 4. 400 when address missing
 * 5. 400 when instagram_handle missing
 * 6. 400 when portfolio_images empty
 * 7. 200 + flips onboarding_complete=true + is_active=true on complete profile
 * 8. 200 (idempotent) — already-published profile returns ok
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { requireUser } from '@/lib/api/auth';
import { POST } from '@/app/api/vendor-profile/publish/route';
import { HttpError } from '@/lib/api/error-boundary';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMPLETE_PROFILE = {
  id: 'vp-1',
  user_id: 'u-1',
  business_name: 'Henna Art Chicago',
  category: 'mehndi',
  bio: 'We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years.',
  base_address_line_1: '123 Main St',
  base_city: 'Chicago',
  base_state: 'IL',
  base_postal_code: '60601',
  base_google_place_id: 'ChIJxxx',
  base_address_public: false,
  instagram_handle: 'hennaartchicago',
  website_url: null,
  portfolio_images: ['https://utfs.io/f/abc.jpg'],
  onboarding_complete: false,
  is_active: false,
};

function makePostRequest(): NextRequest {
  return new NextRequest('http://localhost/api/vendor-profile/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildSupabase({
  profile,
  singleError = null,
  updateError = null,
}: {
  profile: Record<string, unknown> | null;
  singleError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  let updatePayloadCaptured: unknown = null;
  const supabase = {
    from: (_table: string) => ({
      select: (_cols: unknown) => ({
        eq: (_col: string, _val: string) => ({
          single: () =>
            Promise.resolve({
              data: profile,
              error: profile ? singleError : { message: 'no rows' },
            }),
        }),
      }),
      update: (payload: unknown) => {
        updatePayloadCaptured = payload;
        return {
          eq: (_col: string, _val: string) =>
            Promise.resolve({ data: null, error: updateError }),
        };
      },
    }),
    _getUpdatePayload: () => updatePayloadCaptured,
  };
  return supabase;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/vendor-profile/publish', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorized'));
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });

  it('returns 404 when no vendor profile row exists', async () => {
    const sb = buildSupabase({ profile: null });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(404);
  });

  it('returns 400 with field=bio when bio is missing', async () => {
    const profile = { ...COMPLETE_PROFILE, bio: null };
    const sb = buildSupabase({ profile });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Profile incomplete');
    expect(json.field).toBe('bio');
  });

  it('returns 400 with field=bio when bio is too short', async () => {
    const profile = { ...COMPLETE_PROFILE, bio: 'short' };
    const sb = buildSupabase({ profile });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Profile incomplete');
    expect(json.field).toBe('bio');
  });

  it('returns 400 with field=base_address_line_1 when address is missing', async () => {
    const profile = { ...COMPLETE_PROFILE, base_address_line_1: null };
    const sb = buildSupabase({ profile });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Profile incomplete');
    expect(json.field).toBe('base_address_line_1');
  });

  it('returns 400 with field=instagram_handle when instagram is missing', async () => {
    const profile = { ...COMPLETE_PROFILE, instagram_handle: null };
    const sb = buildSupabase({ profile });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Profile incomplete');
    expect(json.field).toBe('instagram_handle');
  });

  it('returns 400 with field=portfolio_images when portfolio is empty', async () => {
    const profile = { ...COMPLETE_PROFILE, portfolio_images: [] };
    const sb = buildSupabase({ profile });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Profile incomplete');
    expect(json.field).toBe('portfolio_images');
  });

  it('returns 200 and flips onboarding_complete + is_active on complete profile', async () => {
    const sb = buildSupabase({ profile: COMPLETE_PROFILE });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Verify the update payload contained both flags
    const payload = sb._getUpdatePayload() as Record<string, unknown>;
    expect(payload.onboarding_complete).toBe(true);
    expect(payload.is_active).toBe(true);
    expect(typeof payload.updated_at).toBe('string');
  });

  it('returns 200 idempotently when profile is already published', async () => {
    const alreadyPublished = { ...COMPLETE_PROFILE, onboarding_complete: true, is_active: true };
    const sb = buildSupabase({ profile: alreadyPublished });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
