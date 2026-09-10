import { describe, it, expect } from 'vitest';
import { resolveStoredEventAddress } from '@/lib/booking/stored-event-address';

const vendorBase = {
  business_name: 'Rose Banquet Hall',
  base_address_line_1: '742 Devon Ave',
  base_city: 'Chicago',
  base_state: 'IL',
  base_postal_code: '60659',
  base_google_place_id: 'place-123',
};

const coupleEvent = {
  address_line_1: '123 Main St',
  city: 'Evanston',
  state: 'IL',
  postal_code: '60201',
  google_place_id: 'place-999',
  location_name: 'The Drake',
  location_overridden: false,
};

describe('resolveStoredEventAddress', () => {
  it('at_vendor: stores the full vendor base address (authoritative)', () => {
    const empty = { ...coupleEvent, address_line_1: '', city: '', state: '', postal_code: '' };
    expect(resolveStoredEventAddress(empty, 'at_vendor', vendorBase)).toMatchObject({
      address_line_1: '742 Devon Ave',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60659',
      google_place_id: 'place-123',
    });
  });

  it('at_vendor: names the venue after the vendor when the couple gave none', () => {
    const empty = { ...coupleEvent, location_name: null };
    expect(resolveStoredEventAddress(empty, 'at_vendor', vendorBase).location_name).toBe(
      'Rose Banquet Hall'
    );
  });

  it('at_vendor but overridden: keeps the couple-entered address', () => {
    const overridden = { ...coupleEvent, location_overridden: true };
    expect(resolveStoredEventAddress(overridden, 'at_vendor', vendorBase).address_line_1).toBe(
      '123 Main St'
    );
  });

  it('couple_provides: always uses the couple-entered address', () => {
    expect(resolveStoredEventAddress(coupleEvent, 'couple_provides', vendorBase)).toMatchObject({
      address_line_1: '123 Main St',
      city: 'Evanston',
    });
  });
});
