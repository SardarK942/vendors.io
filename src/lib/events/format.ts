// Shared date-formatting helpers for the customer-events UI. Extracted from
// three near-identical copies (JournalHero.tsx, EventSummaryCard.tsx,
// dashboard/events/page.tsx) — final-review fix bundle, finding g. Behavior
// is unchanged; this is the single source of truth going forward.
import { fmtDate } from '@/lib/intl';

// Noon-anchor pattern — avoids the off-by-one day UTC drift when a bare
// YYYY-MM-DD is parsed as midnight UTC.
export function fmtShort(dateIso: string): string {
  return fmtDate(`${dateIso}T00:00:00`, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Jun 5, 2027" for a single date, "Jun 5 – Jun 12, 2027" for a span. */
export function dateRangeLabel(functions: { date: string | null }[]): string | null {
  const dates = functions
    .map((f) => f.date)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? fmtShort(first) : `${fmtShort(first)} – ${fmtShort(last)}`;
}
