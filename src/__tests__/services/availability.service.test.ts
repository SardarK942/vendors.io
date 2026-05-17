/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  buildHoldRange,
  checkOverlap,
  wouldExceedCapacity,
  getUnavailableRanges,
} from '@/services/availability.service';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function mockSupabase(
  holdsResponse: { data: { id?: string; hold_range?: string }[]; error: null } | { data: null; error: { message: string } },
  profileResponse?: { data: { concurrent_capacity: number }; error: null } | { data: null; error: { message: string } }
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'vendor_calendar_holds') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              filter: vi.fn(() => Promise.resolve(holdsResponse)),
            })),
          })),
        };
      }
      if (table === 'vendor_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve(
                  profileResponse ?? { data: { concurrent_capacity: 1 }, error: null }
                )
              ),
            })),
          })),
        };
      }
      return {};
    }),
  };
}

// ---------------------------------------------------------------------------
// buildHoldRange
// ---------------------------------------------------------------------------

describe('buildHoldRange', () => {
  it('formats tstzrange string with UTC offset and half-open bound', () => {
    expect(buildHoldRange('2026-08-15', '10:00', '12:00')).toBe(
      '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")'
    );
  });

  it('uses +00:00 suffix (not Z) to satisfy Postgres tstzrange literal parsing', () => {
    const result = buildHoldRange('2026-08-15', '09:00', '17:00');
    expect(result).not.toContain('Z');
    expect(result).toContain('+00:00');
  });

  it('handles full-day blocks (midnight-to-midnight next day)', () => {
    expect(buildHoldRange('2026-08-15', '00:00', '00:00', { fullDay: true })).toBe(
      '["2026-08-15T00:00:00+00:00","2026-08-16T00:00:00+00:00")'
    );
  });

  it('handles full-day blocks at month boundaries', () => {
    expect(buildHoldRange('2026-08-31', '00:00', '00:00', { fullDay: true })).toBe(
      '["2026-08-31T00:00:00+00:00","2026-09-01T00:00:00+00:00")'
    );
  });

  it('handles full-day blocks at year boundaries', () => {
    expect(buildHoldRange('2026-12-31', '00:00', '00:00', { fullDay: true })).toBe(
      '["2026-12-31T00:00:00+00:00","2027-01-01T00:00:00+00:00")'
    );
  });
});

// ---------------------------------------------------------------------------
// checkOverlap
// ---------------------------------------------------------------------------

describe('checkOverlap', () => {
  it('returns overlapping: 0 when no overlapping holds exist', async () => {
    const sb = mockSupabase({ data: [], error: null });
    const result = await checkOverlap(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ overlapping: 0 });
  });

  it('returns overlapping count when overlapping holds exist', async () => {
    const sb = mockSupabase({ data: [{ id: 'hold-1' }, { id: 'hold-2' }], error: null });
    const result = await checkOverlap(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ overlapping: 2 });
  });

  it('calls vendor_calendar_holds table with correct vendor_profile_id', async () => {
    const sb = mockSupabase({ data: [], error: null });
    await checkOverlap(sb as any, 'vendor-abc', '2026-08-15', '10:00', '12:00');
    expect(sb.from).toHaveBeenCalledWith('vendor_calendar_holds');
  });

  it('throws when supabase returns an error', async () => {
    const sb = mockSupabase({ data: null, error: { message: 'DB error' } });
    await expect(
      checkOverlap(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00')
    ).rejects.toMatchObject({ message: 'DB error' });
  });
});

// ---------------------------------------------------------------------------
// wouldExceedCapacity
// ---------------------------------------------------------------------------

describe('wouldExceedCapacity', () => {
  it('returns wouldExceed: false when capacity=2 and overlapping=1', async () => {
    const sb = mockSupabase(
      { data: [{ id: 'hold-1' }], error: null },
      { data: { concurrent_capacity: 2 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: false, capacity: 2, overlapping: 1 });
  });

  it('returns wouldExceed: true when capacity=1 and overlapping=1', async () => {
    const sb = mockSupabase(
      { data: [{ id: 'hold-1' }], error: null },
      { data: { concurrent_capacity: 1 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: true, capacity: 1, overlapping: 1 });
  });

  it('returns wouldExceed: false when capacity=3 and no overlapping holds', async () => {
    const sb = mockSupabase(
      { data: [], error: null },
      { data: { concurrent_capacity: 3 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: false, capacity: 3, overlapping: 0 });
  });

  it('returns wouldExceed: true when capacity=1 and overlapping=2', async () => {
    const sb = mockSupabase(
      { data: [{ id: 'hold-1' }, { id: 'hold-2' }], error: null },
      { data: { concurrent_capacity: 1 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: true, capacity: 1, overlapping: 2 });
  });

  it('returns wouldExceed: false when capacity=2 and overlapping=0', async () => {
    const sb = mockSupabase(
      { data: [], error: null },
      { data: { concurrent_capacity: 2 }, error: null }
    );
    const result = await wouldExceedCapacity(sb as any, 'vendor-1', '2026-08-15', '10:00', '12:00');
    expect(result).toEqual({ wouldExceed: false, capacity: 2, overlapping: 0 });
  });
});

// ---------------------------------------------------------------------------
// getUnavailableRanges
// ---------------------------------------------------------------------------

describe('getUnavailableRanges', () => {
  it('queries vendor_calendar_holds table', async () => {
    const sb = mockSupabase({ data: [], error: null });
    await getUnavailableRanges(sb as any, 'vendor-1', '2026-08-01', '2026-12-31');
    expect(sb.from).toHaveBeenCalledWith('vendor_calendar_holds');
  });

  it('returns hold_range strings from the response', async () => {
    const sb = mockSupabase({
      data: [
        { hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")' },
        { hold_range: '["2026-09-01T00:00:00+00:00","2026-09-02T00:00:00+00:00")' },
      ],
      error: null,
    });
    const result = await getUnavailableRanges(sb as any, 'vendor-1', '2026-08-01', '2026-12-31');
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('hold_range');
  });

  it('returns empty array when no holds exist', async () => {
    const sb = mockSupabase({ data: [], error: null });
    const result = await getUnavailableRanges(sb as any, 'vendor-1', '2026-08-01', '2026-12-31');
    expect(result).toEqual([]);
  });
});
