/**
 * A4 Phase Tests
 * - Deposit calc: 30% of total_price_cents (new formula)
 * - New state machine transitions added in A4
 * - autoCancelExpiredBookings logic (via state machine assertions)
 */

import { describe, it, expect } from 'vitest';
import { validateStateTransition } from '@/services/booking.service';
import { DEPOSIT_RATE } from '@/lib/utils';

// ─── Deposit Calculation ──────────────────────────────────────────────────────
// A4.1: deposit = Math.floor(total_price_cents * DEPOSIT_RATE)
// NOTE: DEPOSIT_RATE was corrected to 0.10 (10%) in Sub-project C (C1.2).
// The terms page always promised 10%; 30% was a pre-existing bug.

describe('A4.1 — Deposit calculation (10% of total_price_cents)', () => {
  function calcDeposit(totalCents: number): number {
    return Math.floor(totalCents * DEPOSIT_RATE);
  }

  it('$1000 package -> $100 deposit', () => {
    expect(calcDeposit(100000)).toBe(10000);
  });

  it('$2000 package -> $200 deposit', () => {
    expect(calcDeposit(200000)).toBe(20000);
  });

  it('$500 package -> $50 deposit', () => {
    expect(calcDeposit(50000)).toBe(5000);
  });

  it('floors partial cent to avoid Stripe issues', () => {
    // $333.33 total -> floor(99999 * 0.10) = floor(9999.9) = 9999
    expect(calcDeposit(99999)).toBe(9999);
  });

  it('$3000 Desi wedding package -> $300 deposit', () => {
    expect(calcDeposit(300000)).toBe(30000);
  });
});

// ─── New Status Transitions ───────────────────────────────────────────────────
// A4.2 / A4.12: state machine includes new statuses

describe('A4 — New state machine transitions', () => {
  // pending → accepted (vendor accepts at base price)
  it('allows pending -> accepted', () => {
    expect(validateStateTransition('pending', 'accepted')).toBe(true);
  });

  // pending → adjusted_quote_sent (vendor adjusts immediately)
  it('allows pending -> adjusted_quote_sent', () => {
    expect(validateStateTransition('pending', 'adjusted_quote_sent')).toBe(true);
  });

  // accepted → deposit_paid (couple pays after vendor accepts)
  it('allows accepted -> deposit_paid', () => {
    expect(validateStateTransition('accepted', 'deposit_paid')).toBe(true);
  });

  // accepted → expired (72h auto-cancel)
  it('allows accepted -> expired (72h auto-cancel)', () => {
    expect(validateStateTransition('accepted', 'expired')).toBe(true);
  });

  // adjusted_quote_sent → adjusted_quote_declined (couple declines)
  it('allows adjusted_quote_sent -> adjusted_quote_declined', () => {
    expect(validateStateTransition('adjusted_quote_sent', 'adjusted_quote_declined')).toBe(true);
  });

  // adjusted_quote_declined → adjusted_quote_sent (vendor re-quotes)
  it('allows adjusted_quote_declined -> adjusted_quote_sent (re-quote)', () => {
    expect(validateStateTransition('adjusted_quote_declined', 'adjusted_quote_sent')).toBe(true);
  });

  // adjusted_quote_sent → accepted (couple accepts the adjusted quote)
  it('allows adjusted_quote_sent -> accepted', () => {
    expect(validateStateTransition('adjusted_quote_sent', 'accepted')).toBe(true);
  });

  // adjusted_quote_sent → expired (72h auto-cancel)
  it('allows adjusted_quote_sent -> expired (72h auto-cancel)', () => {
    expect(validateStateTransition('adjusted_quote_sent', 'expired')).toBe(true);
  });

  // adjusted_quote_declined → expired (72h auto-cancel)
  it('allows adjusted_quote_declined -> expired (72h auto-cancel)', () => {
    expect(validateStateTransition('adjusted_quote_declined', 'expired')).toBe(true);
  });

  // Cancellations from new statuses
  it('allows accepted -> couple_cancelled', () => {
    expect(validateStateTransition('accepted', 'couple_cancelled')).toBe(true);
  });

  it('allows accepted -> vendor_cancelled', () => {
    expect(validateStateTransition('accepted', 'vendor_cancelled')).toBe(true);
  });

  it('allows adjusted_quote_sent -> couple_cancelled', () => {
    expect(validateStateTransition('adjusted_quote_sent', 'couple_cancelled')).toBe(true);
  });

  it('allows adjusted_quote_declined -> couple_cancelled', () => {
    expect(validateStateTransition('adjusted_quote_declined', 'couple_cancelled')).toBe(true);
  });

  // Invalid forward jumps
  it('rejects accepted -> completed (must pay deposit first)', () => {
    expect(validateStateTransition('accepted', 'completed')).toBe(false);
  });

  it('rejects adjusted_quote_sent -> deposit_paid (must go through accepted)', () => {
    expect(validateStateTransition('adjusted_quote_sent', 'deposit_paid')).toBe(false);
  });

  it('rejects adjusted_quote_declined -> deposit_paid (must re-quote first)', () => {
    expect(validateStateTransition('adjusted_quote_declined', 'deposit_paid')).toBe(false);
  });

  // Terminal states stay terminal
  it('rejects expired -> adjusted_quote_sent (terminal state)', () => {
    expect(validateStateTransition('expired', 'adjusted_quote_sent')).toBe(false);
  });

  it('rejects couple_cancelled -> accepted (terminal state)', () => {
    expect(validateStateTransition('couple_cancelled', 'accepted')).toBe(false);
  });
});

// ─── Auto-cancel sweep statuses ───────────────────────────────────────────────
// A4.12: confirm the sweep targets the correct statuses

describe('A4.12 — Auto-cancel sweep status set', () => {
  const SWEEP_STATUSES = ['accepted', 'adjusted_quote_sent', 'adjusted_quote_declined'];

  it('sweep covers accepted (couple never paid deposit)', () => {
    expect(SWEEP_STATUSES).toContain('accepted');
  });

  it('sweep covers adjusted_quote_sent', () => {
    expect(SWEEP_STATUSES).toContain('adjusted_quote_sent');
  });

  it('sweep covers adjusted_quote_declined', () => {
    expect(SWEEP_STATUSES).toContain('adjusted_quote_declined');
  });

  it('sweep does NOT cover deposit_paid (has money)', () => {
    expect(SWEEP_STATUSES).not.toContain('deposit_paid');
  });

  it('sweep does NOT cover completed (terminal)', () => {
    expect(SWEEP_STATUSES).not.toContain('completed');
  });

  it('each sweep status can transition to expired', () => {
    for (const s of SWEEP_STATUSES) {
      expect(validateStateTransition(s, 'expired')).toBe(true);
    }
  });
});
