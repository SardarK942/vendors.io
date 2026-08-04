/**
 * Shared Intl formatter helpers — locale + currency + date + relative time.
 *
 * All currency helpers accept cents (the canonical store) and divide internally.
 * Use `fmtUSD` for whole-dollar display (no trailing zeros) and `fmtUSDWithCents`
 * when sub-dollar precision matters. Use `fmtCount` for any rendered integer
 * column. Use `fmtDate` / `fmtDateTime` / `fmtRelative` for date renders so
 * locale + numbering follow the runtime instead of being hardcoded `'en-US'`.
 *
 * NOTE: `src/lib/utils.ts#formatPrice` and
 * `src/components/marketplace/vendor-card-helpers.ts#formatPriceFromCents`
 * both pre-date this helper. Prefer the helpers in this file in new code.
 */

const en = 'en-US';

export const fmtUSD = (cents: number): string =>
  new Intl.NumberFormat(en, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);

export const fmtUSDWithCents = (cents: number): string =>
  new Intl.NumberFormat(en, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);

export const fmtCount = (n: number): string => new Intl.NumberFormat(en).format(n);

export const fmtDate = (
  iso: string | Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string => new Intl.DateTimeFormat(en, opts).format(iso instanceof Date ? iso : new Date(iso));

export const fmtDateTime = (iso: string | Date): string =>
  new Intl.DateTimeFormat(en, { dateStyle: 'medium', timeStyle: 'short' }).format(
    iso instanceof Date ? iso : new Date(iso)
  );

export const fmtTime = (iso: string | Date): string =>
  new Intl.DateTimeFormat(en, { hour: 'numeric', minute: '2-digit' }).format(
    iso instanceof Date ? iso : new Date(iso)
  );

/**
 * Relative time (e.g. "2 hours ago", "yesterday").
 * Pass a past Date / ISO; returns a localized "X ago" / "in X" string.
 */
export const fmtRelative = (iso: string | Date, now: Date = new Date()): string => {
  const target = iso instanceof Date ? iso : new Date(iso);
  const diffSec = Math.round((target.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(en, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 2_592_000) return rtf.format(Math.round(diffSec / 86_400), 'day');
  if (abs < 31_536_000) return rtf.format(Math.round(diffSec / 2_592_000), 'month');
  return rtf.format(Math.round(diffSec / 31_536_000), 'year');
};
