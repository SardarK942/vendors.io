import { describe, it, expect } from 'vitest';
import { validateStateTransition } from '@/services/booking.service';

describe('Booking State Machine', () => {
  // Valid transitions
  it('allows pending -> quoted', () => {
    expect(validateStateTransition('pending', 'quoted')).toBe(true);
  });

  it('allows pending -> expired', () => {
    expect(validateStateTransition('pending', 'expired')).toBe(true);
  });

  it('allows pending -> declined', () => {
    expect(validateStateTransition('pending', 'declined')).toBe(true);
  });

  it('allows quoted -> deposit_paid', () => {
    expect(validateStateTransition('quoted', 'deposit_paid')).toBe(true);
  });

  it('allows quoted -> cancelled', () => {
    expect(validateStateTransition('quoted', 'cancelled')).toBe(true);
  });

  it('allows deposit_paid -> confirmed', () => {
    expect(validateStateTransition('deposit_paid', 'confirmed')).toBe(true);
  });

  it('allows deposit_paid -> declined', () => {
    expect(validateStateTransition('deposit_paid', 'declined')).toBe(true);
  });

  // Invalid transitions
  it('rejects pending -> confirmed (must go through quoted + deposit)', () => {
    expect(validateStateTransition('pending', 'confirmed')).toBe(false);
  });

  it('rejects pending -> deposit_paid (must be quoted first)', () => {
    expect(validateStateTransition('pending', 'deposit_paid')).toBe(false);
  });

  it('rejects confirmed -> pending (no backward transitions)', () => {
    expect(validateStateTransition('confirmed', 'pending')).toBe(false);
  });

  it('rejects expired -> quoted (terminal state)', () => {
    expect(validateStateTransition('expired', 'quoted')).toBe(false);
  });

  it('rejects cancelled -> pending (terminal state)', () => {
    expect(validateStateTransition('cancelled', 'pending')).toBe(false);
  });

  it('rejects declined -> quoted (terminal state)', () => {
    expect(validateStateTransition('declined', 'quoted')).toBe(false);
  });

  it('rejects quoted -> confirmed (must pay deposit first)', () => {
    expect(validateStateTransition('quoted', 'confirmed')).toBe(false);
  });

  // Edge cases
  it('rejects unknown states', () => {
    expect(validateStateTransition('unknown', 'pending')).toBe(false);
  });

  it('rejects self-transition', () => {
    expect(validateStateTransition('pending', 'pending')).toBe(false);
  });
});
