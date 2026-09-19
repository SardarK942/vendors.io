import { describe, it, expect } from 'vitest';
import {
  getRequestedDetailFields,
  composeRequestedDetailsText,
} from '@/lib/booking/requested-details';

describe('getRequestedDetailFields', () => {
  it('returns ONLY couple-answerable quantity fields for catering (no vendor attributes)', () => {
    const fields = getRequestedDetailFields('catering');
    const keys = fields.map((f) => f.key);
    // catering: maxGuests optional + durationHours optional → both quantity fields.
    expect(keys).toEqual(['maxGuests', 'durationHours']);
    // The vendor attribute wishlist must NOT leak into the couple form.
    expect(keys).not.toContain('menu');
    expect(keys).not.toContain('staff_included');
    expect(keys).not.toContain('rentals_included');
  });

  it('uses couple-facing "Guest count" label + helper text for food/space categories', () => {
    for (const category of ['catering', 'carts', 'venue']) {
      const cap = getRequestedDetailFields(category).find((f) => f.key === 'maxGuests');
      expect(cap, `capacity field for ${category}`).toBeDefined();
      expect(cap?.label).toBe('Guest count');
      expect(cap?.helperText).toBe('Roughly how many guests will be attending?');
    }
  });

  it('uses "Quantity needed" label + helper text for goods (gifts)', () => {
    const cap = getRequestedDetailFields('gifts').find((f) => f.key === 'maxGuests');
    expect(cap?.label).toBe('Quantity needed');
    expect(cap?.helperText).toBe('Roughly how many do you need?');
    // gifts has no duration for the couple.
    expect(getRequestedDetailFields('gifts').map((f) => f.key)).toEqual(['maxGuests']);
  });

  it('uses "Hours needed" label + helper text for the duration field (photography)', () => {
    const fields = getRequestedDetailFields('photography');
    const keys = fields.map((f) => f.key);
    // photography: maxGuests hidden, durationHours required → duration only.
    expect(keys).toEqual(['durationHours']);
    const dur = fields.find((f) => f.key === 'durationHours');
    expect(dur?.label).toBe('Hours needed');
    expect(dur?.helperText).toBe('Roughly how long do you need them for?');
    // No vendor attributes on the couple form.
    expect(keys).not.toContain('photographers');
    expect(keys).not.toContain('raw_files');
  });

  it('returns an empty list when both quantity fields are hidden (bridal_wear)', () => {
    expect(getRequestedDetailFields('bridal_wear')).toEqual([]);
  });

  it('falls back to the default config for unknown categories (Hours needed only)', () => {
    // Unknown categories resolve to DEFAULT_CONFIG: maxGuests hidden,
    // durationHours optional.
    expect(getRequestedDetailFields('not-a-real-category')).toEqual([
      {
        key: 'durationHours',
        label: 'Hours needed',
        helperText: 'Roughly how long do you need them for?',
        type: 'number',
      },
    ]);
  });
});

describe('composeRequestedDetailsText', () => {
  it('serializes only the filled quantity fields into a labeled block', () => {
    const text = composeRequestedDetailsText('catering', {
      maxGuests: '150',
      durationHours: '6',
    });
    expect(text).toBe(['Requested details —', 'Guest count: 150', 'Hours needed: 6'].join('\n'));
  });

  it('skips empty / whitespace quantity fields', () => {
    const text = composeRequestedDetailsText('catering', {
      maxGuests: '200',
      durationHours: '   ',
    });
    expect(text).toBe(['Requested details —', 'Guest count: 200'].join('\n'));
  });

  it('returns an empty string when nothing is filled', () => {
    expect(composeRequestedDetailsText('catering', {})).toBe('');
    expect(composeRequestedDetailsText('photography', { durationHours: '' })).toBe('');
  });
});
