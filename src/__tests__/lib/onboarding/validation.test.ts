import { describe, it, expect } from 'vitest';
import {
  basicsSchema,
  locationSchema,
  onlineSchema,
  onlineSchemaFor,
  portfolioSchema,
  publishGateSchema,
  publishGateSchemaFor,
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

  it('accepts a short (non-empty) bio', () => {
    const r = basicsSchema.safeParse({ businessName: 'X', category: 'mehndi', bio: 'short' });
    expect(r.success).toBe(true);
  });

  it('rejects an empty bio (now required)', () => {
    const r = basicsSchema.safeParse({ businessName: 'X', category: 'mehndi', bio: '' });
    expect(r.success).toBe(false);
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
  it('rejects an empty instagram handle (now required)', () => {
    expect(
      onlineSchema.safeParse({ instagramHandle: '', websiteUrl: 'https://x.com' }).success
    ).toBe(false);
  });
  it('rejects an entirely missing instagramHandle key (now required)', () => {
    expect(onlineSchema.safeParse({ websiteUrl: '' }).success).toBe(false);
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
  it('rejects profile with an empty bio (now required)', () => {
    const r = publishGateSchema.safeParse({
      ...completeProfile,
      bio: '',
    });
    expect(r.success).toBe(false);
  });
  it('accepts a complete profile', () => {
    const r = publishGateSchema.safeParse(completeProfile);
    expect(r.success).toBe(true);
  });

  describe('venue variant (Instagram optional)', () => {
    const venueProfile = { ...completeProfile, category: 'venue' };

    it('venue publish gate accepts a null instagram handle', () => {
      const r = publishGateSchemaFor('venue').safeParse({
        ...venueProfile,
        instagram_handle: null,
      });
      expect(r.success).toBe(true);
    });
    it('venue publish gate accepts an empty instagram handle', () => {
      const r = publishGateSchemaFor('venue').safeParse({
        ...venueProfile,
        instagram_handle: '',
      });
      expect(r.success).toBe(true);
    });
    it('venue publish gate still rejects a malformed instagram handle', () => {
      const r = publishGateSchemaFor('venue').safeParse({
        ...venueProfile,
        instagram_handle: 'has spaces!',
      });
      expect(r.success).toBe(false);
    });
    it('non-venue category still requires instagram', () => {
      const r = publishGateSchemaFor('catering').safeParse({
        ...completeProfile,
        instagram_handle: null,
      });
      expect(r.success).toBe(false);
    });
  });
});

describe('onlineSchemaFor (venue step)', () => {
  it('venue online step accepts an empty instagram handle', () => {
    expect(
      onlineSchemaFor('venue').safeParse({ instagramHandle: '', websiteUrl: '' }).success
    ).toBe(true);
  });
  it('venue online step still rejects a malformed handle', () => {
    expect(
      onlineSchemaFor('venue').safeParse({ instagramHandle: 'bad handle', websiteUrl: '' }).success
    ).toBe(false);
  });
  it('non-venue online step still requires instagram', () => {
    expect(
      onlineSchemaFor('photography').safeParse({ instagramHandle: '', websiteUrl: '' }).success
    ).toBe(false);
  });
});
