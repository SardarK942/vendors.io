import { describe, it, expect } from 'vitest';
import { calculateDepositAmount, calculatePlatformCut, calculateVendorPending } from '@/lib/utils';

describe('Payment Calculations (deferred Stripe, 30/70 split)', () => {
  describe('Deposit = 10% of quote (no cap)', () => {
    const testCases = [
      { quote: 50000, expected: 5000, description: '$500 quote -> $50 deposit' },
      { quote: 100000, expected: 10000, description: '$1000 quote -> $100 deposit (no $50 cap)' },
      { quote: 20000, expected: 2000, description: '$200 quote -> $20 deposit' },
      { quote: 150000, expected: 15000, description: '$1500 quote -> $150 deposit' },
      { quote: 300000, expected: 30000, description: '$3000 wedding photo -> $300 deposit' },
      { quote: 5000, expected: 500, description: '$50 quote -> $5 deposit' },
    ];

    testCases.forEach(({ quote, expected, description }) => {
      it(description, () => {
        expect(calculateDepositAmount(quote)).toBe(expected);
      });
    });
  });

  describe('Platform cut = 30% of deposit', () => {
    it('30% of $300 deposit -> $90 platform', () => {
      expect(calculatePlatformCut(30000)).toBe(9000);
    });

    it('30% of $50 deposit -> $15 platform', () => {
      expect(calculatePlatformCut(5000)).toBe(1500);
    });

    it('30% of $100 deposit -> $30 platform', () => {
      expect(calculatePlatformCut(10000)).toBe(3000);
    });
  });

  describe('Vendor pending = 70% of deposit (exactly)', () => {
    it('deposit = platform + vendor (no rounding drift) $300', () => {
      const deposit = 30000;
      expect(calculatePlatformCut(deposit) + calculateVendorPending(deposit)).toBe(deposit);
    });

    it('deposit = platform + vendor at $50', () => {
      const deposit = 5000;
      expect(calculatePlatformCut(deposit) + calculateVendorPending(deposit)).toBe(deposit);
    });

    it('deposit = platform + vendor on an awkward $73 deposit', () => {
      const deposit = 7300;
      expect(calculatePlatformCut(deposit) + calculateVendorPending(deposit)).toBe(deposit);
    });

    it('70% of $300 -> $210', () => {
      expect(calculateVendorPending(30000)).toBe(21000);
    });
  });

  describe('End-to-End Payment Math', () => {
    it('correctly calculates full flow for $3000 wedding photo quote', () => {
      const quote = 300000; // $3000
      const deposit = calculateDepositAmount(quote);
      expect(deposit).toBe(30000); // $300

      const platform = calculatePlatformCut(deposit);
      expect(platform).toBe(9000); // $90

      const vendor = calculateVendorPending(deposit);
      expect(vendor).toBe(21000); // $210

      expect(platform + vendor).toBe(deposit);
    });

    it('correctly calculates full flow for $500 mehndi booking', () => {
      const quote = 50000;
      const deposit = calculateDepositAmount(quote);
      const platform = calculatePlatformCut(deposit);
      const vendor = calculateVendorPending(deposit);

      expect(deposit).toBe(5000);
      expect(platform).toBe(1500);
      expect(vendor).toBe(3500);
      expect(platform + vendor).toBe(deposit);
    });
  });
});
