import { describe, it, expect } from 'vitest';
import { validateStateTransition } from '@/services/booking.service';

describe('Booking State Machine', () => {
  // pending transitions
  it('allows pending -> expired', () => {
    expect(validateStateTransition('pending', 'expired')).toBe(true);
  });

  it('allows pending -> couple_cancelled', () => {
    expect(validateStateTransition('pending', 'couple_cancelled')).toBe(true);
  });

  it('allows pending -> accepted', () => {
    expect(validateStateTransition('pending', 'accepted')).toBe(true);
  });

  it('allows pending -> adjusted_quote_sent', () => {
    expect(validateStateTransition('pending', 'adjusted_quote_sent')).toBe(true);
  });

  // accepted transitions (new package flow)
  it('allows accepted -> deposit_paid', () => {
    expect(validateStateTransition('accepted', 'deposit_paid')).toBe(true);
  });

  it('allows accepted -> couple_cancelled', () => {
    expect(validateStateTransition('accepted', 'couple_cancelled')).toBe(true);
  });

  it('allows accepted -> vendor_cancelled', () => {
    expect(validateStateTransition('accepted', 'vendor_cancelled')).toBe(true);
  });

  // deposit_paid transitions (deposit_paid is the confirmed state)
  it('allows deposit_paid -> completed', () => {
    expect(validateStateTransition('deposit_paid', 'completed')).toBe(true);
  });

  it('allows deposit_paid -> couple_cancelled', () => {
    expect(validateStateTransition('deposit_paid', 'couple_cancelled')).toBe(true);
  });

  it('allows deposit_paid -> vendor_cancelled', () => {
    expect(validateStateTransition('deposit_paid', 'vendor_cancelled')).toBe(true);
  });

  it('allows deposit_paid -> cancelled_mutual', () => {
    expect(validateStateTransition('deposit_paid', 'cancelled_mutual')).toBe(true);
  });

  // Invalid transitions
  it('rejects pending -> completed (must go through accepted + deposit)', () => {
    expect(validateStateTransition('pending', 'completed')).toBe(false);
  });

  it('rejects pending -> deposit_paid (must be accepted first)', () => {
    expect(validateStateTransition('pending', 'deposit_paid')).toBe(false);
  });

  it('rejects completed -> pending (no backward transitions)', () => {
    expect(validateStateTransition('completed', 'pending')).toBe(false);
  });

  it('rejects completed -> couple_cancelled (cannot cancel after completion)', () => {
    expect(validateStateTransition('completed', 'couple_cancelled')).toBe(false);
  });

  it('rejects expired -> quoted (terminal state)', () => {
    expect(validateStateTransition('expired', 'quoted')).toBe(false);
  });

  it('rejects couple_cancelled -> pending (terminal state)', () => {
    expect(validateStateTransition('couple_cancelled', 'pending')).toBe(false);
  });

  it('rejects vendor_cancelled -> pending (terminal state)', () => {
    expect(validateStateTransition('vendor_cancelled', 'pending')).toBe(false);
  });

  it('rejects completed -> accepted (terminal state)', () => {
    expect(validateStateTransition('completed', 'accepted')).toBe(false);
  });

  it('rejects accepted -> completed (must pay deposit first)', () => {
    expect(validateStateTransition('accepted', 'completed')).toBe(false);
  });

  // Edge cases
  it('rejects unknown states', () => {
    expect(validateStateTransition('unknown', 'pending')).toBe(false);
  });

  it('rejects self-transition', () => {
    expect(validateStateTransition('pending', 'pending')).toBe(false);
  });

  // Retired states no longer allowed (regression guard)
  it('rejects retired confirmed state', () => {
    expect(validateStateTransition('deposit_paid', 'confirmed')).toBe(false);
  });

  it('rejects retired plain cancelled state', () => {
    expect(validateStateTransition('quoted', 'cancelled')).toBe(false);
  });

  it('rejects retired declined state', () => {
    expect(validateStateTransition('pending', 'declined')).toBe(false);
  });
});
