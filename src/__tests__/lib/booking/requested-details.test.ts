import { describe, it, expect } from 'vitest';
import {
  getRequestedDetailFields,
  composeRequestedDetailsText,
} from '@/lib/booking/requested-details';

describe('getRequestedDetailFields', () => {
  it('includes the non-hidden capacity field + attributes for catering', () => {
    const fields = getRequestedDetailFields('catering');
    const keys = fields.map((f) => f.key);
    // catering: maxGuests optional ("Guests"), durationHours optional, + attrs
    expect(keys).toContain('maxGuests');
    expect(keys).toContain('durationHours');
    expect(keys).toContain('menu');
    expect(fields.find((f) => f.key === 'maxGuests')?.label).toBe('Guests');
  });

  it('omits hidden capacity/duration fields (photography)', () => {
    const keys = getRequestedDetailFields('photography').map((f) => f.key);
    expect(keys).not.toContain('maxGuests'); // hidden
    expect(keys).toContain('durationHours'); // required (not hidden)
    expect(keys).toContain('photographers');
  });

  it('returns an empty list when every field is hidden and no attributes (bridal_wear)', () => {
    // bridal_wear: maxGuests hidden, durationHours hidden, no attribute fields.
    expect(getRequestedDetailFields('bridal_wear')).toEqual([]);
  });

  it('falls back to the default config for unknown categories (durationHours only)', () => {
    // Unknown categories resolve to DEFAULT_CONFIG: maxGuests hidden,
    // durationHours optional ("Hours"), no attributes.
    expect(getRequestedDetailFields('not-a-real-category')).toEqual([
      { key: 'durationHours', label: 'Hours', type: 'number' },
    ]);
  });
});

describe('composeRequestedDetailsText', () => {
  it('serializes only filled fields into a labeled block', () => {
    const text = composeRequestedDetailsText('videography', {
      maxGuests: '', // hidden anyway
      videographers: '2',
      drone: 'yes',
      raw_footage: '', // unchecked bool → skipped
      highlight_film: '  ', // whitespace → skipped
      turnaround: '6 weeks',
    });
    expect(text).toBe(
      ['Requested details —', '# of videographers: 2', 'Drone: yes', 'Turnaround: 6 weeks'].join(
        '\n'
      )
    );
  });

  it('returns an empty string when nothing is filled', () => {
    expect(composeRequestedDetailsText('catering', {})).toBe('');
    expect(composeRequestedDetailsText('catering', { staff_included: '', menu: '  ' })).toBe('');
  });
});
