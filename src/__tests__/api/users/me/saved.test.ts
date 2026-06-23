import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { GET, POST } from '@/app/api/users/me/saved/route';
import { DELETE } from '@/app/api/users/me/saved/[vendor_id]/route';

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function makeRequest(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Supabase mock builder — plain objects, no vi.fn() on chain nodes, so
// vi.clearAllMocks() cannot interfere with return values.
// ──────────────────────────────────────────────────────────────────────────────

interface MockOpts {
  user?: { id: string } | null;
  /** Rows returned by the users first_save_at UPDATE (non-empty = first save). */
  firstSaveRows?: { first_save_at: string }[];
  /** insert error for saved_vendors (null = success) */
  insertError?: { message: string } | null;
  /** saved_vendors select result for GET */
  savedVendors?: { vendor_profile_id: string; saved_at: string }[];
  /** delete error for saved_vendors */
  deleteError?: { message: string } | null;
}

function buildSupabase(opts: MockOpts) {
  const firstSaveData = opts.firstSaveRows ?? null;

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: opts.user ?? null }, error: null }),
    },
    from(table: string) {
      if (table === 'users') {
        return {
          update(_vals: unknown) {
            return {
              eq(_col: string, _val: string) {
                return {
                  is(_col2: string, _val2: null) {
                    return {
                      select(_cols: string) {
                        return Promise.resolve({ data: firstSaveData, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'saved_vendors') {
        return {
          // GET chain: .select().eq().order()
          select(_cols: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  order(_col2: string, _opts: unknown) {
                    return Promise.resolve({
                      data: opts.savedVendors ?? [],
                      error: null,
                    });
                  },
                };
              },
            };
          },
          // POST chain: .insert()
          insert(_row: unknown) {
            return Promise.resolve({ error: opts.insertError ?? null });
          },
          // DELETE chain: .delete().eq().eq()
          delete() {
            return {
              eq(_col: string, _val: string) {
                return {
                  eq(_col2: string, _val2: string) {
                    return Promise.resolve({ error: opts.deleteError ?? null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/users/me/saved
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /api/users/me/saved', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedCreateClient.mockResolvedValue(buildSupabase({ user: null }) as never);
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/users/me/saved', { vendor_profile_id: 'vp-1' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when vendor_profile_id is missing', async () => {
    mockedCreateClient.mockResolvedValue(buildSupabase({ user: { id: 'u-1' } }) as never);
    const res = await POST(makeRequest('POST', 'http://localhost/api/users/me/saved', {}));
    expect(res.status).toBe(400);
  });

  it('returns { first_save: true } on first ever save (first_save_at was null)', async () => {
    // firstSaveRows non-empty → UPDATE matched a row → first_save_at was null → first save
    mockedCreateClient.mockResolvedValue(
      buildSupabase({
        user: { id: 'u-1' },
        firstSaveRows: [{ first_save_at: new Date().toISOString() }],
      }) as never
    );
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/users/me/saved', { vendor_profile_id: 'vp-1' })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { first_save: true } });
  });

  it('returns { first_save: false } on second save (first_save_at already set)', async () => {
    // firstSaveRows empty → UPDATE matched no rows → first_save_at was already set
    mockedCreateClient.mockResolvedValue(
      buildSupabase({
        user: { id: 'u-1' },
        firstSaveRows: [],
      }) as never
    );
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/users/me/saved', { vendor_profile_id: 'vp-2' })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { first_save: false } });
  });

  it('returns 200 on duplicate save — PK conflict swallowed, first_save stays false', async () => {
    mockedCreateClient.mockResolvedValue(
      buildSupabase({
        user: { id: 'u-1' },
        firstSaveRows: [],
        insertError: { message: 'duplicate key value violates unique constraint' },
      }) as never
    );
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/users/me/saved', { vendor_profile_id: 'vp-1' })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { first_save: false } });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/me/saved
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/users/me/saved', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedCreateClient.mockResolvedValue(buildSupabase({ user: null }) as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns saved vendors sorted by saved_at desc', async () => {
    const vendors = [
      { vendor_profile_id: 'vp-2', saved_at: '2026-06-20T10:00:00Z' },
      { vendor_profile_id: 'vp-1', saved_at: '2026-06-19T10:00:00Z' },
    ];
    mockedCreateClient.mockResolvedValue(
      buildSupabase({ user: { id: 'u-1' }, savedVendors: vendors }) as never
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: vendors });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/me/saved/[vendor_id]
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/users/me/saved/[vendor_id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedCreateClient.mockResolvedValue(buildSupabase({ user: null }) as never);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/users/me/saved/vp-1'), {
      params: Promise.resolve({ vendor_id: 'vp-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('removes the saved vendor and returns { ok: true }', async () => {
    mockedCreateClient.mockResolvedValue(buildSupabase({ user: { id: 'u-1' } }) as never);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/users/me/saved/vp-1'), {
      params: Promise.resolve({ vendor_id: 'vp-1' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
