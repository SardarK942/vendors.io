import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCategoryVendorCounts } from '@/lib/vendor-categories/queries';

function buildSupabase(rows: Array<{ category: string }>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
        })),
      })),
    })),
  } as never;
}

describe('getCategoryVendorCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a record with counts per category', async () => {
    const sb = buildSupabase([
      { category: 'photography' },
      { category: 'photography' },
      { category: 'mehndi' },
      { category: 'carts' },
    ]);
    const result = await getCategoryVendorCounts(sb);
    expect(result.photography).toBe(2);
    expect(result.mehndi).toBe(1);
    expect(result.carts).toBe(1);
  });

  it('returns 0 for featured categories with no vendors', async () => {
    const sb = buildSupabase([{ category: 'photography' }]);
    const result = await getCategoryVendorCounts(sb);
    expect(result.mehndi).toBe(0);
    expect(result.bridal_wear).toBe(0);
    expect(result.venue).toBe(0);
  });

  it('counts photobooth + invitations now that they are featured', async () => {
    const sb = buildSupabase([
      { category: 'photography' },
      { category: 'photobooth' },
      { category: 'invitations' },
    ]);
    const result = await getCategoryVendorCounts(sb);
    expect(result.photography).toBe(1);
    expect(result.photobooth).toBe(1);
    expect(result.invitations).toBe(1);
  });

  it('returns all-zero map when query errors', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
          })),
        })),
      })),
    } as never;
    const result = await getCategoryVendorCounts(sb);
    expect(result.photography).toBe(0);
    expect(result.venue).toBe(0);
  });

  it('returns a key for every featured slug', async () => {
    const sb = buildSupabase([]);
    const result = await getCategoryVendorCounts(sb);
    expect(Object.keys(result).sort()).toEqual(
      [
        'bridal_wear',
        'carts',
        'catering',
        'decor',
        'dj',
        'hair_makeup',
        'invitations',
        'live_music',
        'mehndi',
        'photobooth',
        'photography',
        'venue',
        'videography',
      ].sort()
    );
  });
});
