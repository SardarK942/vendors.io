import { describe, it, expect } from 'vitest';
import {
  COUPLE_FEATURES,
  COUPLE_TIPS,
  VENDOR_FEATURES,
  VENDOR_TIPS,
  YEARS_IN_BUSINESS,
  COMMISSION_CATEGORIES,
} from '@/lib/onboarding/welcome-data';
import { VENDOR_CATEGORIES } from '@/lib/utils';

describe('welcome-data', () => {
  it('has 3 features for each role', () => {
    expect(COUPLE_FEATURES).toHaveLength(3);
    expect(VENDOR_FEATURES).toHaveLength(3);
  });

  it('has 3 tips for each role', () => {
    expect(COUPLE_TIPS).toHaveLength(3);
    expect(VENDOR_TIPS).toHaveLength(3);
  });

  it('every feature has id + title + description + icon', () => {
    for (const f of [...COUPLE_FEATURES, ...VENDOR_FEATURES]) {
      expect(f.id).toBeTruthy();
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.icon).toBeDefined();
    }
  });

  it('every tip has number + text', () => {
    for (const t of [...COUPLE_TIPS, ...VENDOR_TIPS]) {
      expect(typeof t.number).toBe('number');
      expect(t.text.length).toBeGreaterThan(0);
    }
  });

  it('YEARS_IN_BUSINESS has 4 buckets', () => {
    expect(YEARS_IN_BUSINESS).toEqual(['0-1', '1-3', '3-10', '10+']);
  });

  it('COMMISSION_CATEGORIES excludes Coming Soon slugs (bridal_wear, decor, venue)', () => {
    expect(COMMISSION_CATEGORIES).not.toContain('bridal_wear');
    expect(COMMISSION_CATEGORIES).not.toContain('decor');
    expect(COMMISSION_CATEGORIES).not.toContain('venue');
  });

  it('COMMISSION_CATEGORIES is a subset of VENDOR_CATEGORIES', () => {
    for (const slug of COMMISSION_CATEGORIES) {
      expect(VENDOR_CATEGORIES).toContain(slug);
    }
  });

  it('COMMISSION_CATEGORIES has 10 entries (13 total minus 3 Coming Soon)', () => {
    expect(COMMISSION_CATEGORIES).toHaveLength(10);
  });
});
