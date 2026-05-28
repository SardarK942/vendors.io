import { describe, expect, it } from 'vitest';
import {
  normalizePhone,
  normalizeInstagramHandle,
  normalizeCategory,
} from '../../../../scripts/scraper/lib/normalize';

describe('normalizePhone', () => {
  it('formats US phones to E.164', () => {
    expect(normalizePhone('(312) 555-1234')).toBe('+13125551234');
    expect(normalizePhone('312.555.1234')).toBe('+13125551234');
    expect(normalizePhone('312-555-1234')).toBe('+13125551234');
    expect(normalizePhone('3125551234')).toBe('+13125551234');
    expect(normalizePhone('+1 312 555 1234')).toBe('+13125551234');
  });

  it('preserves already-E.164 numbers', () => {
    expect(normalizePhone('+13125551234')).toBe('+13125551234');
  });

  it('returns null for unparseable input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('normalizeInstagramHandle', () => {
  it('strips @ prefix', () => {
    expect(normalizeInstagramHandle('@bestchaicart')).toBe('bestchaicart');
  });

  it('extracts handle from instagram URLs', () => {
    expect(normalizeInstagramHandle('https://www.instagram.com/bestchaicart/')).toBe(
      'bestchaicart'
    );
    expect(normalizeInstagramHandle('https://instagram.com/bestchaicart')).toBe('bestchaicart');
    expect(normalizeInstagramHandle('instagram.com/bestchaicart/?utm=share')).toBe('bestchaicart');
  });

  it('lowercases the handle', () => {
    expect(normalizeInstagramHandle('BestChaiCart')).toBe('bestchaicart');
  });

  it('returns null for invalid input', () => {
    expect(normalizeInstagramHandle('')).toBeNull();
    expect(normalizeInstagramHandle('not a handle!!!')).toBeNull();
  });
});

describe('normalizeCategory', () => {
  it('maps common Places API types to our categories', () => {
    expect(normalizeCategory(['hair_care', 'beauty_salon'])).toBe('hair_makeup');
    expect(normalizeCategory(['photographer'])).toBe('photography');
    expect(normalizeCategory(['caterer', 'meal_delivery'])).toBe('catering');
    expect(normalizeCategory(['restaurant', 'food'])).toBe('catering');
    expect(normalizeCategory(['florist'])).toBe('decor');
  });

  it('returns null when no recognized type present', () => {
    expect(normalizeCategory(['unrelated_type'])).toBeNull();
    expect(normalizeCategory([])).toBeNull();
  });
});
