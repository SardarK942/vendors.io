// src/__tests__/components/forms/GooglePlacesAutocomplete.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GooglePlacesAutocomplete,
  type PlaceData,
} from '@/components/forms/GooglePlacesAutocomplete';

// Mock the Google loader so `importLibrary('places')` never resolves — the
// Autocomplete widget is therefore never attached and `place_changed` never
// fires. This mirrors "the key is present but the user typed free text without
// clicking a prediction" (the exact CI/prod scenario the free-text fallback
// fixes). The real Google prediction-select path (and the selectedRef swallow
// that protects structured PlaceData) can't be exercised in jsdom — that is
// covered by the e2e spec + manual QA.
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(() => new Promise<void>(() => {})),
}));

const ORIGINAL_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = ORIGINAL_KEY;
});

describe('GooglePlacesAutocomplete free-text fallback', () => {
  it("mode='all' with an API key present: typing emits free text into `city`", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    const user = userEvent.setup();
    const onChange = vi.fn<(p: PlaceData) => void>();

    render(
      <GooglePlacesAutocomplete mode="all" onChange={onChange} placeholder="Search a venue" />
    );

    const input = screen.getByPlaceholderText(/search a venue/i);
    await user.type(input, 'Houston, TX');

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.city).toBe('Houston, TX');
    expect(last.google_place_id).toBe('');
    expect(last.address_line_1).toBe('');
  });

  it('no API key (graceful degradation): typing emits free text into `city`', async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const user = userEvent.setup();
    const onChange = vi.fn<(p: PlaceData) => void>();

    render(<GooglePlacesAutocomplete onChange={onChange} placeholder="Where" />);

    const input = screen.getByPlaceholderText(/where/i);
    await user.type(input, 'Chicago');

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0].city).toBe('Chicago');
  });
});
