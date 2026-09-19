import { describe, it, expect } from 'vitest';
import { getPackageAttributes, type AttributeFieldType } from '@/lib/packages/attributes';

const VALID_TYPES: readonly AttributeFieldType[] = ['bool', 'number', 'text'];

describe('getPackageAttributes', () => {
  it('describes photography attributes with the right field types', () => {
    const fields = getPackageAttributes('photography');
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    expect(byKey.photographers.label).toBe('# of photographers');
    expect(byKey.photographers.type).toBe('number');
    expect(byKey.album.label).toBe('Album included');
    expect(byKey.album.type).toBe('bool');
    expect(byKey.turnaround.label).toBe('Turnaround');
    expect(byKey.turnaround.type).toBe('text');
  });

  it('describes catering attributes', () => {
    const keys = getPackageAttributes('catering').map((f) => f.key);
    expect(keys).toEqual(['menu', 'staff_included', 'rentals_included', 'tasting_included']);
  });

  it('describes mehndi attributes', () => {
    const fields = getPackageAttributes('mehndi');
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.num_artists.type).toBe('number');
    expect(byKey.coverage.type).toBe('text');
    expect(byKey.style.type).toBe('text');
  });

  it('returns [] for an unknown category', () => {
    expect(getPackageAttributes('unicorn_rides')).toEqual([]);
  });

  it('returns [] for bridal_wear (deferred)', () => {
    expect(getPackageAttributes('bridal_wear')).toEqual([]);
  });

  it('every returned field has a non-empty key + label and a valid type', () => {
    const categories = [
      'photography',
      'videography',
      'content_creation',
      'dj',
      'photobooth',
      'live_music',
      'catering',
      'hair_makeup',
      'carts',
      'venue',
      'decor',
      'invitations',
      'gifts',
      'mehndi',
      'bridal_wear',
    ];
    for (const c of categories) {
      for (const field of getPackageAttributes(c)) {
        expect(field.key, `key for ${c}`).toBeTruthy();
        expect(field.label, `label for ${c}/${field.key}`).toBeTruthy();
        expect(VALID_TYPES, `type for ${c}/${field.key}`).toContain(field.type);
      }
    }
  });
});
