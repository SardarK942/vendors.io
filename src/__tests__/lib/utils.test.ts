import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  calculatePlatformFee,
  calculateDepositAmount,
  generateSlug,
  getDepositRate,
  getPlatformCutRate,
  calculatePlatformCut,
  calculateVendorPending,
  STRIPE_DEPOSIT_RATE,
  CASH_DEPOSIT_RATE,
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

describe('calculatePlatformFee (deprecated helper — default is now 30%)', () => {
  it('calculates 30% fee by default', () => {
    expect(calculatePlatformFee(10000)).toBe(3000);
    expect(calculatePlatformFee(5000)).toBe(1500);
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
  it('returns 10% for any quote (no cap)', () => {
    expect(calculateDepositAmount(30000)).toBe(3000); // $300 quote -> $30 deposit
    expect(calculateDepositAmount(10000)).toBe(1000); // $100 quote -> $10 deposit
    expect(calculateDepositAmount(100000)).toBe(10000); // $1000 -> $100 (no $50 cap anymore)
    expect(calculateDepositAmount(300000)).toBe(30000); // $3000 wedding -> $300
  });

  it('returns exactly 10% of $500 quote', () => {
    expect(calculateDepositAmount(50000)).toBe(5000);
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

describe('payment-mode helpers', () => {
  it('STRIPE_DEPOSIT_RATE = 0.10', () => {
    expect(STRIPE_DEPOSIT_RATE).toBe(0.1);
  });

  it('CASH_DEPOSIT_RATE = 0.05', () => {
    expect(CASH_DEPOSIT_RATE).toBe(0.05);
  });

  it('getDepositRate returns 0.10 for stripe', () => {
    expect(getDepositRate('stripe')).toBe(0.1);
  });

  it('getDepositRate returns 0.05 for cash', () => {
    expect(getDepositRate('cash')).toBe(0.05);
  });

  it('getPlatformCutRate returns 0.30 for stripe', () => {
    expect(getPlatformCutRate('stripe')).toBe(0.3);
  });

  it('getPlatformCutRate returns 1.0 for cash', () => {
    expect(getPlatformCutRate('cash')).toBe(1.0);
  });

  describe('calculatePlatformCut', () => {
    it('stripe mode: 30% of deposit', () => {
      expect(calculatePlatformCut(30000, 'stripe')).toBe(9000); // 30% of $300
    });

    it('cash mode: 100% of deposit', () => {
      expect(calculatePlatformCut(15000, 'cash')).toBe(15000); // 100% of $150
    });

    it('defaults to stripe mode when no arg', () => {
      expect(calculatePlatformCut(30000)).toBe(9000);
    });
  });

  describe('calculateVendorPending', () => {
    it('stripe mode: 70% of deposit goes to vendor', () => {
      expect(calculateVendorPending(30000, 'stripe')).toBe(21000);
    });

    it('cash mode: 0 (no vendor share)', () => {
      expect(calculateVendorPending(15000, 'cash')).toBe(0);
    });
  });

  describe('end-to-end on $3000 booking', () => {
    it('stripe vendor: $300 deposit → $90 platform / $210 vendor pending', () => {
      const totalCents = 300_000;
      const depositRate = getDepositRate('stripe');
      const deposit = Math.floor(totalCents * depositRate); // 30000
      expect(deposit).toBe(30000);
      expect(calculatePlatformCut(deposit, 'stripe')).toBe(9000);
      expect(calculateVendorPending(deposit, 'stripe')).toBe(21000);
    });

    it('cash vendor: $150 deposit → $150 platform / $0 vendor', () => {
      const totalCents = 300_000;
      const depositRate = getDepositRate('cash');
      const deposit = Math.floor(totalCents * depositRate); // 15000
      expect(deposit).toBe(15000);
      expect(calculatePlatformCut(deposit, 'cash')).toBe(15000);
      expect(calculateVendorPending(deposit, 'cash')).toBe(0);
    });
  });
});
