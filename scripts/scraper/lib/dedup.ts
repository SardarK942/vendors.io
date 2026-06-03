import { normalizeInstagramHandle, normalizePhone } from './normalize';

export interface DedupCandidate {
  instagram_handle?: string | null;
  phone?: string | null;
  business_name?: string;
  city?: string | null;
}

/** Returns a stable dedup key for a candidate, or null if no signal present. */
export function dedupKey(c: DedupCandidate): string | null {
  const ig = normalizeInstagramHandle(c.instagram_handle ?? null);
  if (ig) return `ig:${ig}`;
  const phone = normalizePhone(c.phone ?? null);
  if (phone) return `phone:${phone}`;
  if (c.business_name && c.city) {
    return `namecity:${c.business_name.toLowerCase().trim()}|${c.city.toLowerCase().trim()}`;
  }
  return null;
}

/** Two candidates are equal if their dedupKey matches (and both are non-null). */
export function candidatesEqual(a: DedupCandidate, b: DedupCandidate): boolean {
  const keyA = dedupKey(a);
  const keyB = dedupKey(b);
  return keyA !== null && keyA === keyB;
}
