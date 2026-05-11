// TEMP STUB - A3 owns this. Will be overwritten by A3's real implementation on merge.
// A3's version uses @googlemaps/js-api-loader for real Places Autocomplete.
// This stub renders a plain <input> and calls onChange with parsed address pieces
// so A2's VendorProfileForm compiles and works without the Google Maps SDK.
'use client';

export interface PlaceData {
  location_name?: string;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
  google_place_id: string;
}

interface Props {
  value?: Partial<PlaceData>;
  onChange: (place: PlaceData) => void;
  placeholder?: string;
  className?: string;
}

export function GooglePlacesAutocomplete({ value, onChange, placeholder, className }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Stub: treat the raw input as address_line_1 only.
    // A3's real implementation parses structured components from the Places API.
    onChange({
      address_line_1: e.target.value,
      city: '',
      state: '',
      postal_code: '',
      google_place_id: '',
    });
  }

  return (
    <input
      type="text"
      className={className ?? 'w-full rounded border p-2 text-sm'}
      placeholder={placeholder ?? 'Street address (Google Places Autocomplete — install A3 for full feature)'}
      defaultValue={value?.address_line_1 ?? ''}
      onChange={handleChange}
    />
  );
}

export default GooglePlacesAutocomplete;
