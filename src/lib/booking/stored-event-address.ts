/**
 * Resolves the address to STORE for a booking event (authoritative, unredacted).
 *
 * For `at_vendor` packages the address inputs are hidden in the UI (the event
 * happens at the vendor's place), so the couple submits empty address fields.
 * The server backfills them from the vendor's base address here — unless the
 * couple explicitly chose a different location for this event.
 *
 * Privacy (hiding a vendor's private base address from the couple until the
 * deposit is paid) is handled separately, on READ, by the booking_events_public
 * view — not here. This function always returns the full, correct address.
 */

interface EventAddressInput {
  address_line_1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  google_place_id?: string | null;
  location_name?: string | null;
  location_overridden?: boolean;
}

interface VendorBase {
  business_name?: string | null;
  base_address_line_1?: string | null;
  base_city?: string | null;
  base_state?: string | null;
  base_postal_code?: string | null;
  base_google_place_id?: string | null;
}

export interface StoredEventAddress {
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
  google_place_id: string | null;
  location_name: string | null;
}

export function resolveStoredEventAddress(
  event: EventAddressInput,
  locationMode: 'couple_provides' | 'at_vendor',
  vendor: VendorBase
): StoredEventAddress {
  const useVendorLocation = locationMode === 'at_vendor' && !event.location_overridden;

  if (useVendorLocation) {
    return {
      address_line_1: vendor.base_address_line_1 ?? '',
      city: vendor.base_city ?? '',
      state: vendor.base_state ?? '',
      postal_code: vendor.base_postal_code ?? '',
      google_place_id: vendor.base_google_place_id ?? null,
      location_name: event.location_name ?? vendor.business_name ?? null,
    };
  }

  return {
    address_line_1: event.address_line_1 ?? '',
    city: event.city ?? '',
    state: event.state ?? '',
    postal_code: event.postal_code ?? '',
    google_place_id: event.google_place_id ?? null,
    location_name: event.location_name ?? null,
  };
}
