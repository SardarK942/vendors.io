/**
 * Minimal RFC-4180-ish CSV serializer for admin cohort exports. A field is
 * quoted only when it contains a comma, double-quote, or newline; inner quotes
 * are doubled. null/undefined render as empty cells. Rows are newline-joined.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  return lines.join('\n');
}
