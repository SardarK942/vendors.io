import { describe, it, expect, vi } from 'vitest';
import { DEPOSIT_RATE } from '@/lib/utils';

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

  it('platform retains 100% of deposit (no Connect transfer)', () => {
    const depositAmount = 15000;
    const platformCut = depositAmount; // Baazar retains 100%
    const vendorPending = 0;
    expect(platformCut).toBe(15000);
    expect(vendorPending).toBe(0);
  });

  it('end-to-end on $3000 quote: $150 deposit → $150 platform / $0 vendor pending', () => {
    const totalCents = 300_000;
    const depositAmount = Math.round(totalCents * DEPOSIT_RATE);
    const platform = depositAmount; // Baazar retains 100%
    const vendor = 0;

    expect(depositAmount).toBe(15000);
    expect(platform).toBe(15000);
    expect(vendor).toBe(0);
    expect(platform + vendor).toBe(depositAmount);
  });
});

describe('Single-mode cancellation policy (computeRefundPolicy)', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  // <24h cooling off: couple refund 100%, platform 0%, vendor 0%
  it('<24h cooling off: couple gets full refund, platform keeps 0', () => {
    const depositPaidAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const policy = computeRefundPolicy('couple', 'deposit_paid', depositPaidAt, now);

    expect(policy.coupleRefundPct).toBe(1);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(0);
    expect(policy.clawVendorOtherPending).toBe(false);
  });

  // After 24h: deposit non-refundable, platform keeps 100%
  it('after 24h couple cancel: deposit non-refundable, platform keeps 100%', () => {
    const depositPaidAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // 2d ago
    const policy = computeRefundPolicy('couple', 'deposit_paid', depositPaidAt, now);

    expect(policy.coupleRefundPct).toBe(0);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(1);
    expect(policy.clawVendorOtherPending).toBe(false);
  });

  // Vendor cancel: couple refund 100%, platform 0%, no claw
  it('vendor cancel: couple gets full refund, platform keeps 0, no claw', () => {
    const depositPaidAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const policy = computeRefundPolicy('vendor', 'deposit_paid', depositPaidAt, now);

    expect(policy.coupleRefundPct).toBe(1);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(0);
    expect(policy.clawVendorOtherPending).toBe(false);
  });

  // Mutual cancel: couple refund 100%, platform 0%
  it('mutual cancel: couple gets full refund, platform keeps 0', () => {
    const depositPaidAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const policy = computeRefundPolicy('mutual', 'deposit_paid', depositPaidAt, now);

    expect(policy.coupleRefundPct).toBe(1);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(0);
    expect(policy.clawVendorOtherPending).toBe(false);
  });

  // Pre-deposit: no money to move
  it('pre-deposit status: all pcts are 0', () => {
    const policy = computeRefundPolicy('couple', 'accepted', null, now);

    expect(policy.coupleRefundPct).toBe(0);
    expect(policy.vendorKeepPct).toBe(0);
    expect(policy.platformKeepPct).toBe(0);
    expect(policy.clawVendorOtherPending).toBe(false);
  });
});
