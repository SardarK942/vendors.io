import { describe, it, expect } from 'vitest';
import { formatBookingValidationError } from '@/lib/booking/validation-message';

describe('formatBookingValidationError', () => {
  it('names the failing field with a friendly label', () => {
    const details = {
      formErrors: [],
      fieldErrors: { guest_count: ['Number must be greater than 0'] },
    };
    const msg = formatBookingValidationError(details);
    expect(msg).toMatch(/guest count/i);
    expect(msg).toMatch(/greater than 0/i);
  });

  it('joins multiple field errors', () => {
    const details = {
      formErrors: [],
      fieldErrors: {
        couple_full_name: ['Required'],
        couple_contact_phone: ['Required'],
      },
    };
    const msg = formatBookingValidationError(details);
    expect(msg).toMatch(/your name/i);
    expect(msg).toMatch(/contact phone/i);
  });

  it('falls back to a generic message when details are missing or empty', () => {
    expect(formatBookingValidationError(undefined)).toMatch(/check your details/i);
    expect(formatBookingValidationError({ formErrors: [], fieldErrors: {} })).toMatch(
      /check your details/i
    );
  });
});
