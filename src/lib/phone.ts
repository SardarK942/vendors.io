/**
 * Client-side US phone formatting for form inputs.
 *
 * The booking/contact forms are US (Chicago) focused, so we mask input to the
 * canonical 10-digit US format `(555) 123-4567` as the user types. This keeps a
 * free-text `type="tel"` field from accepting arbitrary junk. Pair with
 * `US_PHONE_PATTERN` on the input for native "complete number required"
 * validation, and `isCompleteUsPhone` for programmatic checks.
 */

/** Regex source for an input `pattern` — matches only a complete `(555) 123-4567`. */
export const US_PHONE_PATTERN = '\\(\\d{3}\\) \\d{3}-\\d{4}';

/** Digits only, dropping a leading US country code (1) and capping at 10. */
export function usPhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * Progressively formats input toward `(555) 123-4567`. Non-digits are ignored,
 * a leading country-code `1` is dropped, and anything past 10 digits is trimmed.
 */
export function formatUsPhoneInput(raw: string): string {
  const digits = usPhoneDigits(raw);
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);
  if (digits.length <= 3) return area;
  if (digits.length <= 6) return `(${area}) ${prefix}`;
  return `(${area}) ${prefix}-${line}`;
}

/** True when `raw` contains a full 10-digit US number. */
export function isCompleteUsPhone(raw: string): boolean {
  return usPhoneDigits(raw).length === 10;
}
