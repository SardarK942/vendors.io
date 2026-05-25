import { describe, it, expect } from 'vitest';
import { CATEGORIES_FEATURED, type FeaturedCategory } from '@/lib/vendor-categories/featured';
import { VENDOR_CATEGORIES } from '@/lib/utils';

describe('CATEGORIES_FEATURED', () => {
  it('has exactly 11 entries', () => {
    expect(CATEGORIES_FEATURED).toHaveLength(11);
  });

  it('matches the locked bride-journey order', () => {
    expect(CATEGORIES_FEATURED.map((c) => c.slug)).toEqual([
      'photography',
      'videography',
      'hair_makeup',
      'bridal_wear',
      'mehndi',
      'catering',
      'carts',
      'dj',
      'live_music',
      'decor',
      'venue',
    ]);
  });

  it('marks bridal_wear, decor, and venue as comingSoon: true Day 1', () => {
    const comingSoonSlugs = CATEGORIES_FEATURED.filter((c) => c.comingSoon).map((c) => c.slug);
    expect(comingSoonSlugs).toEqual(['bridal_wear', 'decor', 'venue']);
  });

  it('every slug exists in the canonical VENDOR_CATEGORIES constant', () => {
    for (const c of CATEGORIES_FEATURED) {
      expect(VENDOR_CATEGORIES).toContain(c.slug);
    }
  });

  it('every entry has a non-empty photoUrl and alt text', () => {
    for (const c of CATEGORIES_FEATURED) {
      expect(c.photoUrl).toMatch(/^https?:\/\//);
      expect(c.alt.length).toBeGreaterThan(4);
    }
  });

  it('every entry has a kicker label and display label', () => {
    for (const c of CATEGORIES_FEATURED) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.kicker.length).toBeGreaterThan(0);
    }
  });

  it('exports the FeaturedCategory type', () => {
    const sample: FeaturedCategory = {
      slug: 'photography',
      label: 'Photography',
      kicker: 'Visual',
      photoUrl: 'https://example.com/x.jpg',
      alt: 'A photographer at work',
      comingSoon: false,
    };
    expect(sample.slug).toBe('photography');
  });
});
