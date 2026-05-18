import { describe, it, expect } from 'vitest';
import { nextIncompleteStep } from '@/lib/onboarding/resume';

const baseProfile = {
  business_name: 'X',
  category: 'mehndi',
  bio: 'a'.repeat(60),
  base_address_line_1: '1',
  base_city: 'C',
  base_state: 'IL',
  base_postal_code: '60601',
  base_google_place_id: 'P',
  base_address_public: false,
  instagram_handle: 'x',
  website_url: null,
  portfolio_images: ['x.jpg'],
  payment_mode: 'stripe' as const,
};

describe('nextIncompleteStep', () => {
  it('returns basics when business_name missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, business_name: null })).toBe('basics');
  });
  it('returns basics when bio missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, bio: null })).toBe('basics');
  });
  it('returns location when address line_1 missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, base_address_line_1: null })).toBe('location');
  });
  it('returns location when city missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, base_city: null })).toBe('location');
  });
  it('returns online when instagram_handle missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, instagram_handle: null })).toBe('online');
  });
  it('returns portfolio when no images', () => {
    expect(nextIncompleteStep({ ...baseProfile, portfolio_images: [] })).toBe('portfolio');
  });
  it('returns review when everything filled', () => {
    expect(nextIncompleteStep(baseProfile)).toBe('review');
  });
  it('returns basics when profile is null', () => {
    expect(nextIncompleteStep(null)).toBe('basics');
  });
  it('returns payment-mode when payment_mode is null and all prior steps complete', () => {
    expect(nextIncompleteStep({ ...baseProfile, payment_mode: null })).toBe('payment-mode');
  });
  it('returns review when payment_mode is cash and all steps complete', () => {
    expect(nextIncompleteStep({ ...baseProfile, payment_mode: 'cash' })).toBe('review');
  });
});
