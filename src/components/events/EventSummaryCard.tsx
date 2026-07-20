import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';
import { fmtDate } from '@/lib/intl';
import { daysUntil, deriveNeedStatus } from '@/lib/events/derive';
import type { NeedWithBooking } from '@/lib/events/derive';
import type { EventFunctionRow, EventRow, EventTaskRow } from '@/types/database.types';

interface EventSummaryCardProps {
  event: EventRow;
  functions: EventFunctionRow[];
  needs: NeedWithBooking[];
  tasks: EventTaskRow[];
  committedCents: number;
}

// Noon-anchor pattern from JournalHero.tsx / EventCard.tsx — avoids the
// off-by-one day UTC drift when a bare YYYY-MM-DD is parsed as midnight UTC.
function fmtShort(dateIso: string): string {
  return fmtDate(`${dateIso}T00:00:00`, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Jun 5, 2027" for a single date, "Jun 5 – Jun 12, 2027" for a span. Mirrors JournalHero. */
function dateRangeLabel(functions: EventFunctionRow[]): string | null {
  const dates = functions
    .map((f) => f.date)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? fmtShort(first) : `${fmtShort(first)} – ${fmtShort(last)}`;
}

function sortTasksByDue(tasks: EventTaskRow[]): EventTaskRow[] {
  return [...tasks].sort((a, b) => {
    if (a.due_date && b.due_date)
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.sort - b.sort;
  });
}

/**
 * Compact dashboard-home version of JournalHero — same days-to-go / budget-bar
 * math, restyled as a light card (not the dark full-bleed hero) so an ink CTA
 * button reads against it. Kicker intentionally skips haldi: PageTitle already
 * spends the page's one haldi accent, and DESIGN.md caps it at 2/page.
 */
export function EventSummaryCard({
  event,
  functions,
  needs,
  tasks,
  committedCents,
}: EventSummaryCardProps) {
  const dateRange = dateRangeLabel(functions);
  const metaLine = [dateRange, event.city].filter(Boolean).join(' · ');
  const total = event.total_budget_cents;
  const percentCommitted =
    total != null && total > 0 ? Math.min(100, (committedCents / total) * 100) : 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = functions
    .filter((f): f is EventFunctionRow & { date: string } => Boolean(f.date))
    .filter((f) => daysUntil(f.date, todayIso) >= 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const daysToGo = upcoming[0] ? daysUntil(upcoming[0].date, todayIso) : null;
  const hasDatedFunction = functions.some((f) => f.date);

  const nextTasks = sortTasksByDue(tasks.filter((t) => !t.completed_at)).slice(0, 2);
  const openSlotCount = needs.filter((n) => deriveNeedStatus(n) === 'needed').length;

  return (
    <div className="rounded-2xl border border-hairline bg-cream-soft/40 px-6 py-7 sm:px-8 sm:py-8">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
        Your celebration
      </p>
      <h2 className="mt-2 text-balance font-display text-3xl text-ink sm:text-4xl">{event.name}</h2>
      {metaLine && <p className="mt-1.5 text-sm text-ink-soft">{metaLine}</p>}

      {total != null && (
        <div className="mt-5 max-w-xs space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-muted/10">
            <div className="h-full rounded-full bg-ink" style={{ width: `${percentCommitted}%` }} />
          </div>
          <p className="text-xs text-ink-soft">
            {formatPrice(committedCents)} committed of {formatPrice(total)}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {daysToGo != null ? (
            <>
              <div className="font-display text-6xl leading-none text-ink sm:text-7xl">
                {daysToGo}
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                {daysToGo === 1 ? 'day to go' : 'days to go'}
              </p>
            </>
          ) : hasDatedFunction ? (
            <>
              <div className="font-display text-6xl leading-none text-ink sm:text-7xl">✓</div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                Celebration complete
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Add a date to start the countdown.</p>
          )}
        </div>

        <div className="w-full sm:max-w-[220px]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">
            Next up
          </p>
          {nextTasks.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {nextTasks.map((t) => (
                <li key={t.id} className="truncate text-sm text-ink">
                  {t.title}
                </li>
              ))}
            </ul>
          ) : openSlotCount > 0 ? (
            <p className="mt-1.5 text-sm text-ink">
              {openSlotCount} open {openSlotCount === 1 ? 'slot' : 'slots'}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-soft">All caught up</p>
          )}
        </div>
      </div>

      <Button asChild variant="primary" className="mt-6">
        <Link href={`/dashboard/events/${event.id}`}>Open journal →</Link>
      </Button>
    </div>
  );
}
