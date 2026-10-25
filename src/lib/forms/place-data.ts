/**
 * Maps a Google Places `address_components` array onto our flat PlaceData shape.
 *
 * Google does not put a given value under a single, predictable component type:
 * the city can arrive as `locality`, `postal_town`, a `sublocality`, an
 * `administrative_area_level_3`, or a `neighborhood` depending on how the place
 * is registered; a venue/building selection may carry no `street_number` at all.
 * The booking service requires all four of street/city/state/ZIP to be present,
 * so reading each from a single type silently drops valid selections. This
 * resolver walks an ordered fallback chain per field and returns the first
 * non-empty match, so a real Google pick reliably fills every field.
 */

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface PlaceData {
  location_name?: string;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
  google_place_id: string;
}

// Ordered fallbacks: the first type that yields a non-empty value wins.
const CITY_TYPES = [
  'locality',
  'postal_town',
  'sublocality_level_1',
  'sublocality',
  'administrative_area_level_3',
  'neighborhood',
];

export function extractPlaceData(
  components: GoogleAddressComponent[] | undefined | null,
  name: string | undefined,
  placeId: string | undefined
): PlaceData {
  const list = components ?? [];

  // Returns the first component matching any of `types`. `useShort` picks
  // short_name (e.g. "IL") falling back to long_name; otherwise long_name.
  const first = (types: string[], useShort = false): string => {
    for (const type of types) {
      const match = list.find((c) => c.types.includes(type));
      if (match) {
        const value = useShort ? match.short_name || match.long_name : match.long_name;
        if (value) return value;
      }
    }
    return '';
  };

  const streetNumber = first(['street_number']);
  const route = first(['route']);
  const street = `${streetNumber} ${route}`.trim();
  // A venue/building pick often has no street_number/route — fall back to the
  // premise component, then the place's own name, so address_line_1 is non-empty.
  const addressLine1 = street || first(['premise']) || name || '';

  return {
    location_name: name || undefined,
    address_line_1: addressLine1,
    city: first(CITY_TYPES),
    // State kept as the full long_name ("Illinois") to match the format already
    // stored for vendor base addresses and shown in the UI.
    state: first(['administrative_area_level_1']),
    postal_code: first(['postal_code']),
    google_place_id: placeId ?? '',
  };
}
