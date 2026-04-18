import { describe, it, expect } from 'vitest';
import { validateStateTransition } from '@/services/booking.service';

describe('Booking State Machine', () => {
  // pending transitions
  it('allows pending -> quoted', () => {
    expect(validateStateTransition('pending', 'quoted')).toBe(true);
  });

  it('allows pending -> rejected', () => {
    expect(validateStateTransition('pending', 'rejected')).toBe(true);
  });

  it('allows pending -> expired', () => {
    expect(validateStateTransition('pending', 'expired')).toBe(true);
  });

  it('allows pending -> couple_cancelled', () => {
    expect(validateStateTransition('pending', 'couple_cancelled')).toBe(true);
  });

  // quoted transitions
  it('allows quoted -> deposit_paid', () => {
    expect(validateStateTransition('quoted', 'deposit_paid')).toBe(true);
  });

  it('allows quoted -> couple_cancelled', () => {
    expect(validateStateTransition('quoted', 'couple_cancelled')).toBe(true);
  });

  it('allows quoted -> vendor_cancelled', () => {
    expect(validateStateTransition('quoted', 'vendor_cancelled')).toBe(true);
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
  it('rejects pending -> completed (must go through quoted + deposit)', () => {
    expect(validateStateTransition('pending', 'completed')).toBe(false);
  });

  it('rejects pending -> deposit_paid (must be quoted first)', () => {
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

  it('rejects rejected -> quoted (terminal state)', () => {
    expect(validateStateTransition('rejected', 'quoted')).toBe(false);
  });

  it('rejects quoted -> completed (must pay deposit first)', () => {
    expect(validateStateTransition('quoted', 'completed')).toBe(false);
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
