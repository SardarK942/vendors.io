import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  calculatePlatformFee,
  calculateDepositAmount,
  generateSlug,
} from '@/lib/utils';

describe('formatPrice', () => {
  it('formats cents to USD', () => {
    expect(formatPrice(15000)).toBe('$150.00');
    expect(formatPrice(50)).toBe('$0.50');
    expect(formatPrice(0)).toBe('$0.00');
    expect(formatPrice(100)).toBe('$1.00');
    expect(formatPrice(99999)).toBe('$999.99');
  });

  it('handles large amounts', () => {
    expect(formatPrice(500000)).toBe('$5,000.00');
    expect(formatPrice(1000000)).toBe('$10,000.00');
  });
});

describe('calculatePlatformFee', () => {
  it('calculates 10% fee by default', () => {
    expect(calculatePlatformFee(10000)).toBe(1000);
    expect(calculatePlatformFee(5000)).toBe(500);
  });

  it('calculates custom fee percentage', () => {
    expect(calculatePlatformFee(10000, 5)).toBe(500);
    expect(calculatePlatformFee(10000, 15)).toBe(1500);
  });

  it('rounds to integer cents', () => {
    expect(calculatePlatformFee(1001, 10)).toBe(100);
    expect(calculatePlatformFee(333, 10)).toBe(33);
  });

  it('handles zero', () => {
    expect(calculatePlatformFee(0)).toBe(0);
  });
});

describe('calculateDepositAmount', () => {
  it('returns 10% for quotes under $500', () => {
    expect(calculateDepositAmount(30000)).toBe(3000); // $300 quote -> $30 deposit
    expect(calculateDepositAmount(10000)).toBe(1000); // $100 quote -> $10 deposit
  });

  it('caps at $50 for quotes over $500', () => {
    expect(calculateDepositAmount(100000)).toBe(5000); // $1000 quote -> $50 cap
    expect(calculateDepositAmount(200000)).toBe(5000); // $2000 quote -> $50 cap
  });

  it('returns exactly $50 for $500 quote', () => {
    expect(calculateDepositAmount(50000)).toBe(5000); // $500 quote -> $50 (10% = $50 = cap)
  });
});

describe('generateSlug', () => {
  it('converts business name to slug', () => {
    expect(generateSlug('Mehndi by Priya')).toBe('mehndi-by-priya');
    expect(generateSlug("DJ Raj's Beats")).toBe('dj-raj-s-beats');
    expect(generateSlug('Photo Booth Co.')).toBe('photo-booth-co');
  });

  it('handles special characters', () => {
    expect(generateSlug('Café & More!')).toBe('caf-more');
    expect(generateSlug('  Spaces  Everywhere  ')).toBe('spaces-everywhere');
  });
});
