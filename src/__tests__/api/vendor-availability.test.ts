/**
 * G2 — Unit tests for GET /api/vendors/[slug]/availability
 *
 * Tests:
 * 1. 404 when vendor doesn't exist / isn't published
 * 2. 200 with empty unavailable list when no holds exist
 * 3. 200 correct shape — date/fully_blocked/busy_ranges aggregated per date
 * 4. fully_blocked = true when a hold covers the full day (1440 min for capacity=1)
 * 5. Returns capacity in response
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/services/availability.service', () => ({
  getUnavailableRanges: vi.fn(),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUnavailableRanges } from '@/services/availability.service';
import { GET } from '@/app/api/vendors/[slug]/availability/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetRequest(slug: string): NextRequest {
  return new NextRequest(`http://localhost/api/vendors/${slug}/availability`);
}

function buildSupabase(vendorRow: { id: string; concurrent_capacity: number } | null) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: vendorRow, error: vendorRow ? null : { message: 'not found' } }),
            }),
          }),
        }),
      }),
    }),
  };
}

async function callGet(slug: string) {
  return GET(makeGetRequest(slug), { params: Promise.resolve({ slug }) });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/vendors/[slug]/availability', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;
  const mockGetRanges = getUnavailableRanges as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when vendor not found or not published', async () => {
    mockCreateClient.mockResolvedValueOnce(buildSupabase(null));
    const res = await callGet('unknown-vendor');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('not found');
  });

  it('returns 200 with empty unavailable list when no holds', async () => {
    mockCreateClient.mockResolvedValueOnce(buildSupabase({ id: 'vp-1', concurrent_capacity: 1 }));
    mockGetRanges.mockResolvedValueOnce([]);

    const res = await callGet('test-vendor');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unavailable).toEqual([]);
    expect(json.capacity).toBe(1);
  });

  it('aggregates holds into correct per-date shape', async () => {
    mockCreateClient.mockResolvedValueOnce(buildSupabase({ id: 'vp-1', concurrent_capacity: 1 }));
    mockGetRanges.mockResolvedValueOnce([
      { hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")' },
    ]);

    const res = await callGet('test-vendor');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unavailable).toHaveLength(1);
    const day = json.unavailable[0];
    expect(day.date).toBe('2026-08-15');
    expect(day.fully_blocked).toBe(false);
    expect(day.busy_ranges).toEqual([{ start: '10:00', end: '12:00' }]);
  });

  it('marks fully_blocked=true when hold covers entire day for capacity=1', async () => {
    mockCreateClient.mockResolvedValueOnce(buildSupabase({ id: 'vp-1', concurrent_capacity: 1 }));
    // Full day hold: 00:00 → 00:00 next day = 1440 minutes
    mockGetRanges.mockResolvedValueOnce([
      { hold_range: '["2026-08-15T00:00:00+00:00","2026-08-16T00:00:00+00:00")' },
    ]);

    const res = await callGet('test-vendor');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unavailable).toHaveLength(1);
    const day = json.unavailable[0];
    expect(day.date).toBe('2026-08-15');
    expect(day.fully_blocked).toBe(true);
    // Privacy: busy_ranges is empty when fully blocked
    expect(day.busy_ranges).toEqual([]);
  });

  it('returns capacity in response', async () => {
    mockCreateClient.mockResolvedValueOnce(buildSupabase({ id: 'vp-1', concurrent_capacity: 3 }));
    mockGetRanges.mockResolvedValueOnce([]);

    const res = await callGet('test-vendor');
    const json = await res.json();
    expect(json.capacity).toBe(3);
  });
});
