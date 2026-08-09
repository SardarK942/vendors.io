import { describe, it, expect } from 'vitest';
import { parseVendorFilterParams, applyVendorFilters } from '@/lib/vendor-filters';

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
  it('calls .contains("subcategories", [...]) when subcategories present', () => {
    const calls: Array<[string, string, unknown]> = [];
    const fake = {
      eq: () => fake,
      gte: () => fake,
      lte: () => fake,
      contains: (col: string, val: unknown) => {
        calls.push(['contains', col, val]);
        return fake;
      },
    };
    applyVendorFilters(fake as never, { subcategories: ['dessert', 'beverage'] });
    expect(calls).toEqual([['contains', 'subcategories', ['dessert', 'beverage']]]);
  });

  it('does not call .contains for empty array or undefined', () => {
    const calls: string[] = [];
    const fake = {
      eq: () => fake,
      gte: () => fake,
      lte: () => fake,
      contains: () => {
        calls.push('contains');
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
});
