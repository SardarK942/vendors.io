import { describe, it, expect } from 'vitest';
import {
  basicsSchema,
  locationSchema,
  onlineSchema,
  portfolioSchema,
  paymentModeSchema,
  publishGateSchema,
} from '@/lib/onboarding/validation';

describe('basicsSchema', () => {
  it('accepts valid input', () => {
    const r = basicsSchema.safeParse({
      businessName: 'Henna Art Chicago',
      category: 'mehndi',
      bio: 'We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years of bridal experience.',
    });
    expect(r.success).toBe(true);
  });

  it('accepts bio < 50 chars (min constraint removed in T5)', () => {
    const r = basicsSchema.safeParse({ businessName: 'X', category: 'mehndi', bio: 'short' });
    expect(r.success).toBe(true);
  });

  it('rejects bio > 500 chars', () => {
    const r = basicsSchema.safeParse({
      businessName: 'X',
      category: 'mehndi',
      bio: 'a'.repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe('locationSchema', () => {
  it('accepts complete address', () => {
    expect(
      locationSchema.safeParse({
        baseAddressLine1: '123 Main',
        baseCity: 'Chicago',
        baseState: 'IL',
        basePostalCode: '60601',
        baseGooglePlaceId: 'ChIJxxx',
        baseAddressPublic: false,
      }).success
    ).toBe(true);
  });
  it('accepts missing line_1 (optional)', () => {
    expect(
      locationSchema.safeParse({
        baseAddressLine1: '',
        baseCity: 'Chicago',
        baseState: 'IL',
        basePostalCode: '60601',
        baseGooglePlaceId: 'ChIJxxx',
        baseAddressPublic: false,
      }).success
    ).toBe(true);
  });
});

describe('onlineSchema', () => {
  it('accepts instagram only', () => {
    expect(onlineSchema.safeParse({ instagramHandle: 'hennaart', websiteUrl: '' }).success).toBe(
      true
    );
  });
  it('rejects missing instagram', () => {
    expect(
      onlineSchema.safeParse({ instagramHandle: '', websiteUrl: 'https://x.com' }).success
    ).toBe(false);
  });
  it('strips leading @ from instagram', () => {
    const r = onlineSchema.parse({ instagramHandle: '@hennaart', websiteUrl: '' });
    expect(r.instagramHandle).toBe('hennaart');
  });
});

describe('portfolioSchema', () => {
  it('accepts 1 image', () => {
    expect(portfolioSchema.safeParse({ portfolioImages: ['https://utfs.io/a.jpg'] }).success).toBe(
      true
    );
  });
  it('rejects 0 images', () => {
    expect(portfolioSchema.safeParse({ portfolioImages: [] }).success).toBe(false);
  });
});

describe('paymentModeSchema', () => {
  it('accepts stripe', () => {
    expect(paymentModeSchema.safeParse({ paymentMode: 'stripe' }).success).toBe(true);
  });
  it('accepts cash', () => {
    expect(paymentModeSchema.safeParse({ paymentMode: 'cash' }).success).toBe(true);
  });
  it('rejects unknown mode', () => {
    expect(paymentModeSchema.safeParse({ paymentMode: 'bank' }).success).toBe(false);
  });
});

describe('publishGateSchema (server-side guard)', () => {
  const completeProfile = {
    business_name: 'X',
    category: 'mehndi',
    bio: 'a'.repeat(60),
    base_address_line_1: '1',
    base_city: 'C',
    base_state: 'IL',
    base_postal_code: '1',
    base_google_place_id: 'P',
    base_address_public: false,
    instagram_handle: 'x',
    website_url: null,
    portfolio_images: ['x.jpg'],
    languages: ['english'],
    years_in_business: 3,
    response_sla_hours: 24,
  };

  it('rejects profile missing instagram', () => {
    const r = publishGateSchema.safeParse({
      ...completeProfile,
      instagram_handle: null,
    });
    expect(r.success).toBe(false);
  });
  it('accepts a complete profile', () => {
    const r = publishGateSchema.safeParse(completeProfile);
    expect(r.success).toBe(true);
  });
});
