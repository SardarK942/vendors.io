/**
 * G2 — Unit tests for vendor calendar API routes:
 *   POST   /api/vendor-calendar/block
 *   DELETE /api/vendor-calendar/block/[id]
 *   PATCH  /api/vendor-calendar/capacity
 *
 * Tests (17 total):
 * POST /block:
 *   1. 401 when unauthenticated
 *   2. 404 when user has no vendor profile
 *   3. 400 when body is missing `mode` (Zod validation)
 *   4. 400 when mode is invalid
 *   5. 201 full_day happy path — correct tstzrange written
 *   6. 201 time_range happy path — correct tstzrange written
 *   7. 409 when DB trigger returns calendar_capacity_exceeded
 *
 * DELETE /block/[id]:
 *   8.  401 when unauthenticated
 *   9.  404 when hold not found / not owned
 *   10. 200 happy path — hold deleted, ok: true returned
 *
 * PATCH /capacity:
 *   11. 401 when unauthenticated
 *   12. 404 when user has no vendor profile
 *   13. 400 when capacity is 0 (out of range)
 *   14. 400 when capacity is 51 (out of range)
 *   15. 400 when capacity is not an integer
 *   16. 200 happy path — ok: true returned
 *   17. 500 when DB update returns error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks (hoisted before imports) ───────────────────────────────────────────

vi.mock('@/lib/api/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { requireUser } from '@/lib/api/auth';
import { HttpError } from '@/lib/api/error-boundary';
import { POST as blockPost } from '@/app/api/vendor-calendar/block/route';
import { DELETE as blockDelete } from '@/app/api/vendor-calendar/block/[id]/route';
import { PATCH as capacityPatch } from '@/app/api/vendor-calendar/capacity/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'DELETE' });
}

/**
 * Builds a minimal Supabase client mock for block/capacity tests.
 *
 * vendorRow:    null → no profile found; otherwise { id: 'vp-1' }
 * insertResult: { data, error } for the INSERT on vendor_calendar_holds
 * deleteResult: { data, error } for the DELETE on vendor_calendar_holds
 * updateResult: { error } for the UPDATE on vendor_profiles
 */
function buildSupabase({
  vendorRow = { id: 'vp-1' } as { id: string } | null,
  insertResult = { data: { id: 'hold-1' }, error: null } as {
    data: { id: string } | null;
    error: { message: string } | null;
  },
  deleteResult = { data: { id: 'hold-1' }, error: null } as {
    data: { id: string } | null;
    error: { message: string } | null;
  },
  updateError = null as { message: string } | null,
} = {}) {
  return {
    from: (table: string) => {
      if (table === 'vendor_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: vendorRow,
                  error: vendorRow ? null : { message: 'no rows' },
                }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: updateError }),
          }),
        };
      }
      if (table === 'vendor_calendar_holds') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve(insertResult),
            }),
          }),
          delete: () => ({
            eq: (_col: string, _val: string) => {
              // Chain two .eq() calls — return same shape each time
              return {
                eq: () => ({
                  select: () => ({
                    maybeSingle: () => Promise.resolve(deleteResult),
                  }),
                }),
                select: () => ({
                  maybeSingle: () => Promise.resolve(deleteResult),
                }),
                // If only one .eq() is called (shouldn't happen but safe)
                maybeSingle: () => Promise.resolve(deleteResult),
              };
            },
          }),
        };
      }
      return {};
    },
  };
}

// ─── POST /api/vendor-calendar/block ─────────────────────────────────────────

describe('POST /api/vendor-calendar/block', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorized'));
    const res = await blockPost(
      makePostRequest('http://localhost/api/vendor-calendar/block', {
        mode: 'full_day',
        date: '2026-08-15',
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when user has no vendor profile', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase({ vendorRow: null }),
    });
    const res = await blockPost(
      makePostRequest('http://localhost/api/vendor-calendar/block', {
        mode: 'full_day',
        date: '2026-08-15',
      })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('No vendor profile');
  });

  it('returns 400 when body is missing mode field', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase(),
    });
    const res = await blockPost(
      makePostRequest('http://localhost/api/vendor-calendar/block', {
        date: '2026-08-15',
        // mode missing
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when mode is an unknown value', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase(),
    });
    const res = await blockPost(
      makePostRequest('http://localhost/api/vendor-calendar/block', {
        mode: 'invalid_mode',
        date: '2026-08-15',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 201 with correct full_day tstzrange', async () => {
    let capturedInsert: unknown;
    const supabase = {
      from: (table: string) => {
        if (table === 'vendor_profiles') {
          return {
            select: () => ({
              eq: () => ({ single: () => Promise.resolve({ data: { id: 'vp-1' }, error: null }) }),
            }),
          };
        }
        if (table === 'vendor_calendar_holds') {
          return {
            insert: (payload: unknown) => {
              capturedInsert = payload;
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'hold-new' }, error: null }),
                }),
              };
            },
          };
        }
        return {};
      },
    };

    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase });

    const res = await blockPost(
      makePostRequest('http://localhost/api/vendor-calendar/block', {
        mode: 'full_day',
        date: '2026-08-15',
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe('hold-new');

    // Verify the tstzrange literal uses the correct full-day form.
    const payload = capturedInsert as {
      hold_range: string;
      hold_type: string;
      vendor_profile_id: string;
    };
    expect(payload.hold_type).toBe('vendor_blocked');
    expect(payload.vendor_profile_id).toBe('vp-1');
    expect(payload.hold_range).toBe(
      '["2026-08-15T00:00:00+00:00","2026-08-16T00:00:00+00:00")'
    );
  });

  it('returns 201 with correct time_range tstzrange', async () => {
    let capturedInsert: unknown;
    const supabase = {
      from: (table: string) => {
        if (table === 'vendor_profiles') {
          return {
            select: () => ({
              eq: () => ({ single: () => Promise.resolve({ data: { id: 'vp-1' }, error: null }) }),
            }),
          };
        }
        if (table === 'vendor_calendar_holds') {
          return {
            insert: (payload: unknown) => {
              capturedInsert = payload;
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'hold-tr' }, error: null }),
                }),
              };
            },
          };
        }
        return {};
      },
    };

    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' }, supabase });

    const res = await blockPost(
      makePostRequest('http://localhost/api/vendor-calendar/block', {
        mode: 'time_range',
        date: '2026-08-15',
        start_time: '10:00',
        end_time: '12:00',
      })
    );

    expect(res.status).toBe(201);
    const payload = capturedInsert as { hold_range: string };
    expect(payload.hold_range).toBe(
      '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")'
    );
  });

  it('returns 409 when DB trigger raises calendar_capacity_exceeded', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase({
        insertResult: {
          data: null,
          error: { message: 'calendar_capacity_exceeded: vendor is at capacity' },
        },
      }),
    });

    const res = await blockPost(
      makePostRequest('http://localhost/api/vendor-calendar/block', {
        mode: 'full_day',
        date: '2026-08-15',
      })
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('full capacity');
  });
});

// ─── DELETE /api/vendor-calendar/block/[id] ───────────────────────────────────

describe('DELETE /api/vendor-calendar/block/[id]', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callDelete(id: string) {
    return blockDelete(makeDeleteRequest(`http://localhost/api/vendor-calendar/block/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockRequireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorized'));
    const res = await callDelete('hold-abc');
    expect(res.status).toBe(401);
  });

  it('returns 404 when hold not found or not owned', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase({
        deleteResult: { data: null, error: null },
      }),
    });
    const res = await callDelete('hold-missing');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('not found');
  });

  it('returns 200 with ok:true on happy path', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase({
        deleteResult: { data: { id: 'hold-1' }, error: null },
      }),
    });
    const res = await callDelete('hold-1');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ─── PATCH /api/vendor-calendar/capacity ──────────────────────────────────────

describe('PATCH /api/vendor-calendar/capacity', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorized'));
    const res = await capacityPatch(
      makePatchRequest('http://localhost/api/vendor-calendar/capacity', {
        concurrent_capacity: 2,
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when user has no vendor profile', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase({ vendorRow: null }),
    });
    const res = await capacityPatch(
      makePatchRequest('http://localhost/api/vendor-calendar/capacity', {
        concurrent_capacity: 2,
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when concurrent_capacity is 0 (below minimum)', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase(),
    });
    const res = await capacityPatch(
      makePatchRequest('http://localhost/api/vendor-calendar/capacity', {
        concurrent_capacity: 0,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when concurrent_capacity is 51 (above maximum)', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase(),
    });
    const res = await capacityPatch(
      makePatchRequest('http://localhost/api/vendor-calendar/capacity', {
        concurrent_capacity: 51,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when concurrent_capacity is a float', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase(),
    });
    const res = await capacityPatch(
      makePatchRequest('http://localhost/api/vendor-calendar/capacity', {
        concurrent_capacity: 1.5,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 with ok:true on happy path', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase({ updateError: null }),
    });
    const res = await capacityPatch(
      makePatchRequest('http://localhost/api/vendor-calendar/capacity', {
        concurrent_capacity: 3,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 500 when DB update returns an error', async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: { id: 'u-1' },
      supabase: buildSupabase({ updateError: { message: 'db error' } }),
    });
    const res = await capacityPatch(
      makePatchRequest('http://localhost/api/vendor-calendar/capacity', {
        concurrent_capacity: 2,
      })
    );
    expect(res.status).toBe(500);
  });
});
