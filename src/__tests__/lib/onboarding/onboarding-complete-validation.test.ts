import { describe, it, expect } from 'vitest';
import { onboardingCompleteSchema } from '@/lib/onboarding/onboarding-complete-validation';

describe('onboardingCompleteSchema', () => {
  it('accepts a skipped session (data: null)', () => {
    const r = onboardingCompleteSchema.safeParse({ skipped: true, data: null });
    expect(r.success).toBe(true);
  });

  it('rejects skipped:true with non-null data', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: true,
      data: { event_date: '2026-10-17', categories: ['photography'] },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid couple submission', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: '2026-10-17', categories: ['photography', 'mehndi'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a couple submission with null event_date (still planning)', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: null, categories: ['photography'] },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a couple submission with malformed event_date', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: '10/17/2026', categories: ['photography'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a couple submission with 0 categories', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { event_date: null, categories: [] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a couple submission with 6 categories', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: {
        event_date: null,
        categories: ['photography', 'mehndi', 'dj', 'catering', 'hair_makeup', 'carts'],
      },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid vendor submission', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { category: 'photography', years_in_business: '3-10' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a vendor submission with invalid years_in_business', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { category: 'photography', years_in_business: 'forever' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a vendor submission with empty category', () => {
    const r = onboardingCompleteSchema.safeParse({
      skipped: false,
      data: { category: '', years_in_business: '3-10' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an entirely malformed body', () => {
    const r = onboardingCompleteSchema.safeParse({ foo: 'bar' });
    expect(r.success).toBe(false);
  });
});
