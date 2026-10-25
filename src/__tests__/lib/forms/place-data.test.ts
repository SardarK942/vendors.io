import { describe, it, expect } from 'vitest';
import { extractPlaceData, type GoogleAddressComponent } from '@/lib/forms/place-data';

function c(long: string, short: string, types: string[]): GoogleAddressComponent {
  return { long_name: long, short_name: short, types };
}

describe('extractPlaceData', () => {
  it('maps a standard street address (locality present)', () => {
    const components = [
      c('123', '123', ['street_number']),
      c('Main Street', 'Main St', ['route']),
      c('Chicago', 'Chicago', ['locality', 'political']),
      c('Illinois', 'IL', ['administrative_area_level_1', 'political']),
      c('60601', '60601', ['postal_code']),
    ];
    expect(extractPlaceData(components, 'Some Place', 'place-1')).toEqual({
      location_name: 'Some Place',
      address_line_1: '123 Main Street',
      city: 'Chicago',
      state: 'Illinois',
      postal_code: '60601',
      google_place_id: 'place-1',
    });
  });

  it('falls back to postal_town when locality is absent', () => {
    const components = [
      c('10', '10', ['street_number']),
      c('High Road', 'High Rd', ['route']),
      c('Naperville', 'Naperville', ['postal_town']),
      c('Illinois', 'IL', ['administrative_area_level_1']),
      c('60540', '60540', ['postal_code']),
    ];
    expect(extractPlaceData(components, undefined, 'p').city).toBe('Naperville');
  });

  it('falls back to sublocality / admin_area_level_3 for city', () => {
    const sub = [c('Astoria', 'Astoria', ['sublocality_level_1', 'sublocality'])];
    expect(extractPlaceData(sub, undefined, 'p').city).toBe('Astoria');

    const aal3 = [c('Oak Township', 'Oak Twp', ['administrative_area_level_3'])];
    expect(extractPlaceData(aal3, undefined, 'p').city).toBe('Oak Township');
  });

  it('uses the place name as address_line_1 when there is no street number/route', () => {
    const components = [
      c('Chicago', 'Chicago', ['locality']),
      c('Illinois', 'IL', ['administrative_area_level_1']),
      c('60611', '60611', ['postal_code']),
    ];
    const out = extractPlaceData(components, 'The Drake Hotel', 'p');
    expect(out.address_line_1).toBe('The Drake Hotel');
  });

  it('falls back to premise before the place name', () => {
    const components = [
      c('Building 7', 'Bldg 7', ['premise']),
      c('Chicago', 'Chicago', ['locality']),
      c('Illinois', 'IL', ['administrative_area_level_1']),
      c('60611', '60611', ['postal_code']),
    ];
    expect(extractPlaceData(components, 'Named Place', 'p').address_line_1).toBe('Building 7');
  });

  it('returns empty strings (never throws) for missing components', () => {
    expect(extractPlaceData(undefined, undefined, undefined)).toEqual({
      location_name: undefined,
      address_line_1: '',
      city: '',
      state: '',
      postal_code: '',
      google_place_id: '',
    });
  });
});
