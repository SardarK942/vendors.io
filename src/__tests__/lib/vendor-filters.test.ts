import { describe, it, expect } from 'vitest';
import {
  parseVendorFilterParams,
  applyVendorFilters,
  countPhotoVideoStudios,
} from '@/lib/vendor-filters';
import {
  readFilterState,
  serializeFilterState,
} from '@/components/marketplace/filters/use-filter-state';

describe('parseVendorFilterParams — subcategories', () => {
  it('parses comma-separated subcategories', () => {
    const out = parseVendorFilterParams({ subcategories: 'dessert,beverage' });
    expect(out.subcategories).toEqual(['dessert', 'beverage']);
  });

  it('drops empty entries', () => {
    const out = parseVendorFilterParams({ subcategories: 'dessert,,beverage,' });
    expect(out.subcategories).toEqual(['dessert', 'beverage']);
  });

  it('omits subcategories when absent', () => {
    const out = parseVendorFilterParams({});
    expect(out.subcategories).toBeUndefined();
  });
});

describe('applyVendorFilters — subcategories', () => {
  function fakeQuery(calls: Array<[string, string, unknown]>) {
    const fake: Record<string, unknown> = {};
    for (const m of ['eq', 'gte', 'lte', 'contains', 'overlaps']) {
      fake[m] = (col: string, val: unknown) => {
        calls.push([m, col, val]);
        return fake;
      };
    }
    return fake;
  }

  // "Type" facets match ANY selected (OR / overlaps): Dessert + Beverage means
  // dessert OR beverage carts, not carts that are BOTH.
  it('uses .overlaps for a "type" facet (no category)', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, { subcategories: ['dessert', 'beverage'] });
    expect(calls).toEqual([['overlaps', 'subcategories', ['dessert', 'beverage']]]);
  });

  it('uses .overlaps for a "type" category (carts)', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, {
      category: 'carts',
      subcategories: ['dessert', 'beverage'],
    });
    expect(calls).toContainEqual(['overlaps', 'subcategories', ['dessert', 'beverage']]);
    expect(calls).not.toContainEqual(['contains', 'subcategories', ['dessert', 'beverage']]);
  });

  // "Services offered" facet (hair_makeup) matches ALL selected (AND / contains):
  // Hair + Makeup finds one artist who does both.
  it('uses .contains for a "services offered" facet (hair_makeup)', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, {
      category: 'hair_makeup',
      subcategories: ['hair', 'makeup'],
    });
    expect(calls).toContainEqual(['contains', 'subcategories', ['hair', 'makeup']]);
    expect(calls).not.toContainEqual(['overlaps', 'subcategories', ['hair', 'makeup']]);
  });

  it('does not filter subcategories for empty array or undefined', () => {
    const calls: string[] = [];
    const fake = {
      eq: () => fake,
      gte: () => fake,
      lte: () => fake,
      contains: () => {
        calls.push('contains');
        return fake;
      },
      overlaps: () => {
        calls.push('overlaps');
        return fake;
      },
    };
    applyVendorFilters(fake as never, { subcategories: [] });
    applyVendorFilters(fake as never, {});
    expect(calls).toEqual([]);
  });
});

describe('parseVendorFilterParams — photoVideoCombo', () => {
  it('sets photoVideoCombo when photoVideo=1', () => {
    const out = parseVendorFilterParams({ photoVideo: '1' });
    expect(out.photoVideoCombo).toBe(true);
  });
  it('omits photoVideoCombo otherwise', () => {
    expect(parseVendorFilterParams({}).photoVideoCombo).toBeUndefined();
  });
});

describe('applyVendorFilters — services membership', () => {
  function fakeQuery(calls: Array<[string, string, unknown]>) {
    const fake: Record<string, unknown> = {};
    for (const m of ['eq', 'gte', 'lte', 'contains', 'overlaps']) {
      fake[m] = (col: string, val: unknown) => {
        calls.push([m, col, val]);
        return fake;
      };
    }
    return fake;
  }

  it('filters category via services overlap (not .eq)', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, { category: 'photography' });
    expect(calls).toContainEqual(['overlaps', 'services', ['photography']]);
    expect(calls.some(([m, col]) => m === 'eq' && col === 'category')).toBe(false);
  });

  it('combo filter requires BOTH photography and videography', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, { photoVideoCombo: true });
    expect(calls).toContainEqual(['contains', 'services', ['photography', 'videography']]);
  });

  // "Vendor team can communicate in ANY of these" — OR, so array overlap.
  it('filters languages via overlap (ANY selected language), not superset', () => {
    const calls: Array<[string, string, unknown]> = [];
    applyVendorFilters(fakeQuery(calls) as never, { languages: ['hindi', 'urdu'] });
    expect(calls).toContainEqual(['overlaps', 'languages', ['hindi', 'urdu']]);
    expect(calls.some(([m, col]) => m === 'contains' && col === 'languages')).toBe(false);
  });
});

describe('FilterState — photoVideoCombo round-trip', () => {
  it('serializes and re-reads photoVideoCombo', () => {
    const params = serializeFilterState({
      q: '',
      category: null,
      verified: false,
      respondsIn: 0,
      priceBand: null,
      priceMin: null,
      priceMax: null,
      languages: [],
      years: 0,
      events: [],
      subcategories: [],
      photoVideoCombo: true,
    });
    expect(params.get('photoVideo')).toBe('1');
    expect(readFilterState(params).photoVideoCombo).toBe(true);
  });
});

describe('countPhotoVideoStudios', () => {
  function fakeSupabase(count: number | null, error: unknown = null) {
    const calls: Array<[string, unknown, unknown]> = [];
    // Chainable stub; the final .contains() resolves to the PostgREST shape.
    const chain: Record<string, unknown> = {
      select: (col: string, opts: unknown) => {
        calls.push(['select', col, opts]);
        return chain;
      },
      eq: (col: string, val: unknown) => {
        calls.push(['eq', col, val]);
        return chain;
      },
      contains: (col: string, val: unknown) => {
        calls.push(['contains', col, val]);
        return Promise.resolve({ count, error });
      },
    };
    const supabase = {
      from: (table: string) => {
        calls.push(['from', table, undefined]);
        return chain;
      },
    };
    return { supabase, calls };
  }

  it('queries active dual studios via services contains BOTH', async () => {
    const { supabase, calls } = fakeSupabase(3);
    const n = await countPhotoVideoStudios(supabase as never);
    expect(n).toBe(3);
    expect(calls).toContainEqual(['from', 'vendor_profiles', undefined]);
    expect(calls).toContainEqual(['eq', 'is_active', true]);
    expect(calls).toContainEqual(['eq', 'onboarding_complete', true]);
    expect(calls).toContainEqual(['contains', 'services', ['photography', 'videography']]);
  });

  it('returns 0 when count is null', async () => {
    const { supabase } = fakeSupabase(null);
    expect(await countPhotoVideoStudios(supabase as never)).toBe(0);
  });

  it('throws on query error', async () => {
    const { supabase } = fakeSupabase(null, new Error('boom'));
    await expect(countPhotoVideoStudios(supabase as never)).rejects.toThrow('boom');
  });
});
