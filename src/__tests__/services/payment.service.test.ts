import { describe, it, expect, vi } from 'vitest';
import {
  calculateDepositAmount,
  calculatePlatformCut,
  calculateVendorPending,
  getDepositRate,
} from '@/lib/utils';

// Mock external dependencies that payment.service.ts imports at module load time.
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
    refunds: { create: vi.fn() },
    transfers: { create: vi.fn(), createReversal: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
  },
}));
vi.mock('@/lib/stripe/connect', () => ({
  createMinimalAccount: vi.fn(),
  createFullOnboardingLink: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/email/resend', () => ({
  sendDepositConfirmationEmail: vi.fn(),
  sendBookingConfirmedEmail: vi.fn(),
  sendCompletionEmailToVendor: vi.fn(),
  sendReviewRequestEmail: vi.fn(),
  sendCancellationEmail: vi.fn(),
}));
vi.mock('@/services/notifications.service', () => ({
  notifyDepositPaid: vi.fn(),
  notifyBookingConfirmed: vi.fn(),
  notifyBookingCancelled: vi.fn(),
  notifyEventCompleted: vi.fn(),
  notifyBookingCompleted: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { computeRefundPolicy } from '@/services/payment.service';

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

// ─── Cash Vendor — payment mode branching ────────────────────────────────────

describe('Cash vendor — deposit checkout math', () => {
  it('cash vendor: deposit = 5% of total', () => {
    const totalCents = 300_000; // $3000
    const depositAmount = Math.floor(totalCents * getDepositRate('cash'));
    expect(depositAmount).toBe(15000); // $150
  });

  it('cash vendor: platformCut = 100% of deposit (all goes to platform)', () => {
    const depositAmount = 15000;
    expect(calculatePlatformCut(depositAmount, 'cash')).toBe(15000);
  });

  it('cash vendor: vendorPending = 0 (no vendor share)', () => {
    const depositAmount = 15000;
    expect(calculateVendorPending(depositAmount, 'cash')).toBe(0);
  });

  it('cash vendor end-to-end on $3000 quote: $150 deposit → $150 platform / $0 vendor', () => {
    const totalCents = 300_000;
    const depositAmount = Math.floor(totalCents * getDepositRate('cash'));
    const platform = calculatePlatformCut(depositAmount, 'cash');
    const vendor = calculateVendorPending(depositAmount, 'cash');

    expect(depositAmount).toBe(15000);
    expect(platform).toBe(15000);
    expect(vendor).toBe(0);
    expect(platform + vendor).toBe(depositAmount);
  });
});

describe('Cash vendor — cancellation policy (computeRefundPolicy)', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  // <24h cooling off: couple refund 100%, platform 0%, vendor 0%
  it('<24h cooling off: couple gets full refund, platform keeps 0', () => {
    const depositPaidAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const firstEventDate = '2026-09-15'; // >30d out
    const policy = computeRefundPolicy(
      'couple',
      'deposit_paid',
      firstEventDate,
      depositPaidAt,
      'none',
      now,
      'cash'
    );

    expect(policy.coupleRefundPct).toBe(1);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(0);
    expect(policy.clawVendorOtherPending).toBe(false);
  });

  // >30d: couple refund 50%, platform 50%, vendor 0%
  it('>30d couple cancel: 50% refund, platform keeps 50%, vendor keeps 0', () => {
    const depositPaidAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // 2d ago
    const firstEventDate = '2026-09-15'; // >30d out
    const policy = computeRefundPolicy(
      'couple',
      'deposit_paid',
      firstEventDate,
      depositPaidAt,
      'none',
      now,
      'cash'
    );

    expect(policy.coupleRefundPct).toBe(0.5);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(0.5);
    expect(policy.clawVendorOtherPending).toBe(false);
  });

  // ≤30d: couple refund 0%, platform 100%, vendor 0%
  it('≤30d couple cancel: 0% refund, platform keeps 100%, vendor keeps 0', () => {
    const depositPaidAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // 2d ago
    const firstEventDate = '2026-06-20'; // ≤30d out
    const policy = computeRefundPolicy(
      'couple',
      'deposit_paid',
      firstEventDate,
      depositPaidAt,
      'none',
      now,
      'cash'
    );

    expect(policy.coupleRefundPct).toBe(0);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(1);
    expect(policy.clawVendorOtherPending).toBe(false);
  });

  // Vendor cancel: couple refund 100%, platform 0%, vendor 0%
  it('vendor cancel: couple gets full refund, platform keeps 0, no claw', () => {
    const depositPaidAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const firstEventDate = '2026-09-15';
    const policy = computeRefundPolicy(
      'vendor',
      'deposit_paid',
      firstEventDate,
      depositPaidAt,
      'none',
      now,
      'cash'
    );

    expect(policy.coupleRefundPct).toBe(1);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(0);
    expect(policy.clawVendorOtherPending).toBe(false); // cash vendors have no pending to claw
  });
});
