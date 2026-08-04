import { describe, it, expect } from 'vitest';
import {
  SUBCATEGORIES_BY_CATEGORY,
  SUBCATEGORY_SECTION_LABEL,
  getSubcategoriesForCategory,
  validSubcategorySlugs,
} from '@/lib/vendor-subcategories';

describe('SUBCATEGORIES_BY_CATEGORY', () => {
  it('defines exactly four cart subcategories', () => {
    expect(SUBCATEGORIES_BY_CATEGORY.carts).toHaveLength(4);
  });

  it('cart slugs are snake_case and stable', () => {
    expect(SUBCATEGORIES_BY_CATEGORY.carts.map((s) => s.slug)).toEqual([
      'dessert',
      'beverage',
      'appetizer',
      'favor_gift',
    ]);
  });
});

describe('getSubcategoriesForCategory', () => {
  it('returns the cart subcategories for "carts"', () => {
    expect(getSubcategoriesForCategory('carts')).toHaveLength(4);
  });

  it('returns an empty array for categories without subcategories', () => {
    expect(getSubcategoriesForCategory('photography')).toEqual([]);
    expect(getSubcategoriesForCategory('dj')).toEqual([]);
  });

  it('returns an empty array for null / undefined / unknown', () => {
    expect(getSubcategoriesForCategory(null)).toEqual([]);
    expect(getSubcategoriesForCategory(undefined)).toEqual([]);
    expect(getSubcategoriesForCategory('not_a_real_category')).toEqual([]);
  });
});

describe('validSubcategorySlugs', () => {
  it('returns the four valid cart slugs', () => {
    const valid = validSubcategorySlugs('carts');
    expect(valid.has('dessert')).toBe(true);
    expect(valid.has('beverage')).toBe(true);
    expect(valid.has('appetizer')).toBe(true);
    expect(valid.has('favor_gift')).toBe(true);
    expect(valid.has('chai')).toBe(false);
  });

  it('returns an empty Set for categories without subcategories', () => {
    expect(validSubcategorySlugs('photography').size).toBe(0);
  });
});

describe('SUBCATEGORY_SECTION_LABEL', () => {
  it('labels the carts section as "Cart type"', () => {
    expect(SUBCATEGORY_SECTION_LABEL.carts).toBe('Cart type');
  });
});
