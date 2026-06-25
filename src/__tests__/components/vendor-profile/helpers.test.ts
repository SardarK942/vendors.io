import { describe, it, expect } from 'vitest';
import {
  getFeaturedPackage,
  calculateDeposit,
  calculateRemaining,
  formatPrice,
} from '@/components/marketplace/vendor-profile/helpers';

describe('getFeaturedPackage', () => {
  it('returns null for empty array', () => {
    expect(getFeaturedPackage([])).toBeNull();
  });

  it('returns the cheapest package by base_price_cents', () => {
    const packages = [
      { id: 'a', base_price_cents: 250_000 },
      { id: 'b', base_price_cents: 120_000 },
      { id: 'c', base_price_cents: 180_000 },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('b');
  });

  it('treats null base_price_cents as Infinity (deprioritized)', () => {
    const packages = [
      { id: 'a', base_price_cents: 250_000 },
      { id: 'b', base_price_cents: null },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('a');
  });

  it('returns first when all have equal price', () => {
    const packages = [
      { id: 'a', base_price_cents: 100_000 },
      { id: 'b', base_price_cents: 100_000 },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('a');
  });
});

describe('calculateDeposit', () => {
  it('is 5% rounded to nearest cent', () => {
    expect(calculateDeposit(120_000)).toBe(6_000); // $1,200 → $60
    expect(calculateDeposit(180_000)).toBe(9_000); // $1,800 → $90
    expect(calculateDeposit(280_001)).toBe(14_000); // 14_000.05 rounded
  });
});

describe('calculateRemaining', () => {
  it('is total minus deposit', () => {
    expect(calculateRemaining(120_000)).toBe(114_000);
  });
});

describe('formatPrice', () => {
  it('formats cents as USD with no decimals', () => {
    expect(formatPrice(120_000)).toBe('$1,200');
    expect(formatPrice(9_000)).toBe('$90');
    expect(formatPrice(0)).toBe('$0');
  });
});
