/**
 * Pure helpers used by VendorCard. Extracted so the card stays presentational
 * and so the threshold/format rules are testable in isolation.
 */

/**
 * Format an ISO YYYY-MM-DD date as a short label for the "Available {date}" pill.
 * Example: '2026-10-17' → 'Oct 17'
 */
export function formatShortDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format the wedding count for the meta row. Returns null when count < 10 —
 * the card omits the segment entirely rather than show "0 weddings" or
 * "3 weddings", which hurt trust more than they help.
 */
export function formatWeddingCount(count: number | null | undefined): string | null {
  if (!count || count < 10) return null;
  // Round down to nearest 10 to avoid implying precision ("100+" / "150+" / etc.)
  const bucketed = Math.floor(count / 10) * 10;
  return `${bucketed}+ weddings`;
}

/**
 * Format cents → "$X,XXX" (no trailing zeros for whole-dollar amounts).
 * Whole-dollar formatter — "$5,000" not "$5,000.00". Differs from formatPrice in src/lib/utils.ts.
 */
export function formatPriceFromCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString('en-US')}`;
}
