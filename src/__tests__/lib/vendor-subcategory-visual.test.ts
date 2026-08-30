import { describe, it, expect } from 'vitest';
import { SUBCATEGORIES_BY_CATEGORY } from '@/lib/vendor-subcategories';
import { getSubcategoryIcon } from '@/lib/vendor-subcategory-visual';

describe('getSubcategoryIcon', () => {
  const allSlugs = Object.values(SUBCATEGORIES_BY_CATEGORY).flatMap((subs) =>
    subs.map((s) => s.slug)
  );
  const fallback = getSubcategoryIcon('__does_not_exist__');

  it('returns a renderable component for any input', () => {
    // Lucide icons are forwardRef objects, not plain functions.
    expect(fallback).toBeDefined();
    expect(['function', 'object']).toContain(typeof fallback);
  });

  it('maps every registered subcategory slug to a NON-fallback glyph', () => {
    for (const slug of allSlugs) {
      expect(getSubcategoryIcon(slug)).not.toBe(fallback);
    }
  });

  it('falls back for null / unknown slugs', () => {
    expect(getSubcategoryIcon(null)).toBe(fallback);
    expect(getSubcategoryIcon(undefined)).toBe(fallback);
    expect(getSubcategoryIcon('nonsense')).toBe(fallback);
  });
});
