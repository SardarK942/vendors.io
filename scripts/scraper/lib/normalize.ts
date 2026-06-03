/** Strip non-digits, ensure E.164 US format. Returns null if not a valid 10/11-digit US number. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Lowercase handle, strip leading @, extract from instagram URLs. */
export function normalizeInstagramHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (s.startsWith('instagram.com/')) {
    s = s.slice('instagram.com/'.length);
  }
  s = s.split(/[/?#]/)[0]; // strip path, query, fragment
  s = s.replace(/^@/, '');
  if (!/^[a-z0-9._]+$/.test(s)) return null;
  return s;
}

/** Map Google Places types[] to our vendor_profiles category enum. First match wins. */
const PLACES_TYPE_TO_CATEGORY: Record<string, string> = {
  photographer: 'photography',
  hair_care: 'hair_makeup',
  beauty_salon: 'hair_makeup',
  caterer: 'catering',
  meal_delivery: 'catering',
  restaurant: 'catering',
  food: 'catering',
  florist: 'decor',
  banquet_hall: 'venue',
  wedding_venue: 'venue',
  event_venue: 'venue',
};

export function normalizeCategory(placesTypes: string[]): string | null {
  for (const t of placesTypes) {
    if (PLACES_TYPE_TO_CATEGORY[t]) return PLACES_TYPE_TO_CATEGORY[t];
  }
  return null;
}
