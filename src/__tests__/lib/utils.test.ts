import { describe, it, expect } from 'vitest';
import { formatPrice, calculateDepositAmount, generateSlug, DEPOSIT_RATE } from '@/lib/utils';

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

describe('calculateDepositAmount', () => {
  it('returns DEPOSIT_RATE (5%) for any quote (no cap)', () => {
    expect(calculateDepositAmount(30000)).toBe(1500); // $300 quote -> $15 deposit
    expect(calculateDepositAmount(10000)).toBe(500); // $100 quote -> $5 deposit
    expect(calculateDepositAmount(100000)).toBe(5000); // $1000 -> $50
    expect(calculateDepositAmount(300000)).toBe(15000); // $3000 wedding -> $150
  });

  it('returns exactly 5% of $500 quote', () => {
    expect(calculateDepositAmount(50000)).toBe(2500);
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

describe('DEPOSIT_RATE', () => {
  it('is exactly 0.05', () => {
    expect(DEPOSIT_RATE).toBe(0.05);
  });

  it('computes correct deposit amount for $5000 booking', () => {
    const totalCents = 500_000; // $5000
    const depositCents = Math.round(totalCents * DEPOSIT_RATE);
    expect(depositCents).toBe(25_000); // $250
  });
});
