import { describe, it, expect, vi } from 'vitest';
import { DEPOSIT_RATE, calculatePlatformCut, calculateVendorPending } from '@/lib/utils';

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

// ─── Deposit rate — single-mode 5% ───────────────────────────────────────────

describe('Deposit rate — uniform 5% (single-mode)', () => {
  it('deposit = 5% of total for $3000 quote', () => {
    const totalCents = 300_000; // $3000
    const depositAmount = Math.round(totalCents * DEPOSIT_RATE);
    expect(depositAmount).toBe(15000); // $150
  });

  it('platform retains 100% of deposit (cash mode — no Connect transfer)', () => {
    const depositAmount = 15000;
    expect(calculatePlatformCut(depositAmount, 'cash')).toBe(15000);
  });

  it('vendor pending = 0 from deposit (vendor gets paid at event time, not from deposit)', () => {
    const depositAmount = 15000;
    expect(calculateVendorPending(depositAmount, 'cash')).toBe(0);
  });

  it('end-to-end on $3000 quote: $150 deposit → $150 platform / $0 vendor pending', () => {
    const totalCents = 300_000;
    const depositAmount = Math.round(totalCents * DEPOSIT_RATE);
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
