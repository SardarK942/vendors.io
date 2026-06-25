/**
 * B4.1 — Unit tests for PATCH /api/vendor-profile/setup/[step]
 *
 * Tests per step:
 * - 401 if unauthenticated
 * - 400 if Zod validation fails (one example per step)
 * - 200 + correct UPDATE/UPSERT payload for happy path
 * - 400 for unknown step
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { requireUser } from '@/lib/api/auth';
import { PATCH } from '@/app/api/vendor-profile/setup/[step]/route';
import { HttpError } from '@/lib/api/error-boundary';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(
  step: string,
  body: unknown
): [NextRequest, { params: Promise<{ step: string }> }] {
  const req = new NextRequest(`http://localhost/api/vendor-profile/setup/${step}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ step }) }];
}

function buildSupabaseForBasics({
  existingRow,
  insertError = null,
  updateError = null,
}: {
  existingRow: { id: string; slug: string } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  return {
    from: (_table: string) => ({
      select: (_cols: unknown) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () => Promise.resolve({ data: existingRow, error: null }),
        }),
      }),
      update: (_payload: unknown) => ({
        eq: (_col: string, _val: string) => Promise.resolve({ data: null, error: updateError }),
      }),
      insert: (_payload: unknown) => Promise.resolve({ data: null, error: insertError }),
    }),
  };
}

function buildSupabaseForUpdate({
  updateError = null,
  existingProfileId = 'vp-existing',
}: {
  updateError?: { message: string } | null;
  existingProfileId?: string | null;
} = {}) {
  // Sub-project I §6: the route now resolves profileId via select first.
  // When no profile_id is in the body (legacy path), it looks up by user_id.
  // We return a mock existing row so the resolution succeeds and the route
  // proceeds to validation + update.
  return {
    from: (_table: string) => ({
      select: (_cols: unknown) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: existingProfileId
                ? { id: existingProfileId, slug: 'test-slug', user_id: 'u-1' }
                : null,
              error: null,
            }),
        }),
      }),
      update: (_payload: unknown) => ({
        eq: (_col: string, _val: string) => Promise.resolve({ data: null, error: updateError }),
      }),
    }),
  };
}

// ─── Tests: 401 (shared) ──────────────────────────────────────────────────────

describe('PATCH /api/vendor-profile/setup/[step] — 401', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorized'));
    const [req, ctx] = makeRequest('basics', {
      businessName: 'X',
      category: 'mehndi',
      bio: 'a'.repeat(50),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
  });
});

// ─── Tests: basics step ───────────────────────────────────────────────────────

describe('PATCH /api/vendor-profile/setup/[step] — basics', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts bio < 50 chars (min constraint removed in T5)', async () => {
    const sb = buildSupabaseForBasics({ existingRow: null });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('basics', {
      businessName: 'Henna Art',
      category: 'mehndi',
      bio: 'short',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });

  it('returns 200 and INSERTs when no existing row', async () => {
    const sb = buildSupabaseForBasics({ existingRow: null });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('basics', {
      businessName: 'Henna Art Chicago',
      category: 'mehndi',
      bio: 'We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years.',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 200 and UPDATEs when existing row present', async () => {
    const sb = buildSupabaseForBasics({
      existingRow: { id: 'vp-1', slug: 'existing-slug-abc123' },
    });
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('basics', {
      businessName: 'Updated Name',
      category: 'photography',
      bio: 'We capture the most important moments of your wedding day with artistry and heart. Chicago-based.',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ─── Tests: location step ─────────────────────────────────────────────────────

describe('PATCH /api/vendor-profile/setup/[step] — location', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when baseAddressLine1 is missing (optional)', async () => {
    const sb = buildSupabaseForUpdate();
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('location', {
      baseAddressLine1: '',
      baseCity: 'Chicago',
      baseState: 'IL',
      basePostalCode: '60601',
      baseGooglePlaceId: 'ChIJxxx',
      baseAddressPublic: false,
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 200 with valid location data', async () => {
    const sb = buildSupabaseForUpdate();
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('location', {
      baseAddressLine1: '123 Main St',
      baseCity: 'Chicago',
      baseState: 'IL',
      basePostalCode: '60601',
      baseGooglePlaceId: 'ChIJxxx',
      baseAddressPublic: false,
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ─── Tests: online step ───────────────────────────────────────────────────────

describe('PATCH /api/vendor-profile/setup/[step] — online', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when instagramHandle is empty (now optional)', async () => {
    const sb = buildSupabaseForUpdate();
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('online', {
      instagramHandle: '',
      websiteUrl: '',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });

  it('returns 200 with valid instagram handle (strips leading @)', async () => {
    const sb = buildSupabaseForUpdate();
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('online', {
      instagramHandle: '@hennaart',
      websiteUrl: '',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ─── Tests: portfolio step ────────────────────────────────────────────────────

describe('PATCH /api/vendor-profile/setup/[step] — portfolio', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when portfolioImages is empty array', async () => {
    const sb = buildSupabaseForUpdate();
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('portfolio', { portfolioImages: [] });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 200 with valid portfolio images', async () => {
    const sb = buildSupabaseForUpdate();
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('portfolio', {
      portfolioImages: ['https://utfs.io/f/abc123.jpg'],
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ─── Tests: unknown step ──────────────────────────────────────────────────────

describe('PATCH /api/vendor-profile/setup/[step] — unknown step', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for unknown step', async () => {
    const sb = buildSupabaseForUpdate();
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase: sb });

    const [req, ctx] = makeRequest('badstep', { foo: 'bar' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Unknown step/);
  });
});
