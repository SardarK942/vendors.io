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
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

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
  disabled?: boolean;
  id?: string;
  /**
   * 'address' (default) restricts predictions to street addresses. 'all' removes
   * the `types` restriction so Google also returns establishments/venues (e.g. a
   * hotel or banquet hall) alongside addresses. Default preserves existing callers.
   */
  mode?: 'address' | 'all';
}

export function GooglePlacesAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  id,
  mode = 'address',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let cleanup: (() => void) | undefined;

    setOptions({ key: apiKey, libraries: ['places'] });

    importLibrary('places').then(() => {
      if (!inputRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
        // 'all' omits the `types` restriction so establishments/venues are
        // returned alongside street addresses.
        ...(mode === 'all' ? {} : { types: ['address'] }),
        componentRestrictions: { country: 'us' },
      });

      const listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;
        const get = (type: string) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (place.address_components as any[]).find((c: any) => c.types.includes(type))?.long_name ??
          '';

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
  }, [onChange, mode]);

  // The legacy Google Maps Autocomplete widget attaches its own listbox
  // (`.pac-container`) and progressively enhances the input with the dynamic
  // ARIA wiring (`aria-expanded`, `aria-controls`, `aria-activedescendant`)
  // once the predictions arrive. We set the static ARIA baseline here so the
  // input is announced as a combobox even before the script loads (or if it
  // fails to load entirely).
  // When no API key is configured the Google widget never loads and no
  // `place_changed` listener fires, so a plain-text onChange is the only way the
  // couple's input reaches the parent. We route that free text into `city` so
  // callers mapping city → event_city keep a working "can continue" gate. When
  // the key IS present we leave onChange off so Google drives the value and we
  // don't emit half-built PlaceData on every keystroke.
  const hasApiKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <input
      id={id}
      ref={inputRef}
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={false}
      aria-haspopup="listbox"
      className={className ?? 'w-full rounded border p-2 text-sm'}
      placeholder={placeholder ?? 'Where will this event take place?'}
      defaultValue={value?.location_name ?? value?.address_line_1 ?? value?.city ?? ''}
      disabled={disabled}
      autoComplete="street-address"
      onChange={
        hasApiKey
          ? undefined
          : (e) =>
              onChange({
                address_line_1: '',
                city: e.target.value,
                state: '',
                postal_code: '',
                google_place_id: '',
              })
      }
    />
  );
}

export default GooglePlacesAutocomplete;
