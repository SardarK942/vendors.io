'use client';

/**
 * Google Places Autocomplete input.
 *
 * Requires: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY environment variable.
 * Without it the input renders as a plain text field (graceful degradation).
 *
 * Uses @googlemaps/js-api-loader to lazily load the Places library.
 */
import { useEffect, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'; // requires: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    // If no API key is set, the autocomplete just won't load — plain input still works.
    if (!apiKey) return;

    let cleanup: (() => void) | undefined;

    setOptions({ key: apiKey, libraries: ['places'] });

    importLibrary('places').then(() => {
      if (!inputRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
      });

      const listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;
        const get = (type: string) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (place.address_components as any[]).find((c: any) => c.types.includes(type))
            ?.long_name ?? '';

        onChange({
          location_name: place.name ?? undefined,
          address_line_1: `${get('street_number')} ${get('route')}`.trim(),
          city: get('locality'),
          state: get('administrative_area_level_1'),
          postal_code: get('postal_code'),
          google_place_id: place.place_id ?? '',
        });
      });

      cleanup = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).google?.maps.event.removeListener(listener);
      };
    });

    return () => cleanup?.();
  }, [onChange]);

  return (
    <input
      ref={inputRef}
      type="text"
      className={className ?? 'w-full rounded border p-2 text-sm'}
      placeholder={placeholder ?? 'Where will this event take place?'}
      defaultValue={value?.address_line_1 ?? ''}
    />
  );
}

// Named + default exports so both import styles work (A2 may import via either)
export default GooglePlacesAutocomplete;
