import { describe, it, expect } from 'vitest';
import { calculateDepositAmount, calculatePlatformFee } from '@/lib/utils';

describe('Payment Calculations', () => {
  describe('Deposit Amount', () => {
    const testCases = [
      { quote: 50000, expected: 5000, description: '$500 quote -> $50 deposit (10%)' },
      { quote: 100000, expected: 5000, description: '$1000 quote -> $50 cap' },
      { quote: 20000, expected: 2000, description: '$200 quote -> $20 deposit (10%)' },
      { quote: 150000, expected: 5000, description: '$1500 quote -> $50 cap' },
      { quote: 5000, expected: 500, description: '$50 quote -> $5 deposit (10%)' },
    ];

    testCases.forEach(({ quote, expected, description }) => {
      it(description, () => {
        expect(calculateDepositAmount(quote)).toBe(expected);
      });
    });
  });

  describe('Platform Fee', () => {
    it('calculates 10% platform fee on deposit', () => {
      const deposit = 5000; // $50 deposit
      const fee = calculatePlatformFee(deposit, 10);
      expect(fee).toBe(500); // $5 platform fee
    });

    it('calculates 5% platform fee', () => {
      const deposit = 5000;
      const fee = calculatePlatformFee(deposit, 5);
      expect(fee).toBe(250); // $2.50 platform fee
    });

    it('vendor receives deposit minus fee', () => {
      const deposit = 5000;
      const fee = calculatePlatformFee(deposit, 10);
      const vendorPayout = deposit - fee;
      expect(vendorPayout).toBe(4500); // $45 to vendor
    });
  });

  describe('End-to-End Payment Math', () => {
    it('correctly calculates full flow for $1500 quote', () => {
      const quoteAmount = 150000; // $1500 in cents

      // Step 1: Calculate deposit ($50 cap since 10% = $150 > $50)
      const deposit = calculateDepositAmount(quoteAmount);
      expect(deposit).toBe(5000);

      // Step 2: Calculate platform fee (10% of deposit)
      const fee = calculatePlatformFee(deposit, 10);
      expect(fee).toBe(500);

      // Step 3: Vendor payout
      const vendorPayout = deposit - fee;
      expect(vendorPayout).toBe(4500);

      // Verify: deposit = fee + vendorPayout
      expect(fee + vendorPayout).toBe(deposit);
    });
  });
});
