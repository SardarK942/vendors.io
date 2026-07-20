import type { EventFunctionRow, EventRow } from '@/types/database.types';
import { formatPrice } from '@/lib/utils';
import { dateRangeLabel } from '@/lib/events/format';

interface JournalHeroProps {
  event: EventRow;
  functions: EventFunctionRow[];
  /** Days until the nearest upcoming dated function, or null if none is dated/upcoming. */
  daysToGo: number | null;
  /** Whether at least one function on this event has a date set (even if all are past). */
  hasDatedFunction: boolean;
  committedCents: number;
}

export function JournalHero({
  event,
  functions,
  daysToGo,
  hasDatedFunction,
  committedCents,
}: JournalHeroProps) {
  const dateRange = dateRangeLabel(functions);
  const metaLine = [dateRange, event.city].filter(Boolean).join(' · ');
  const total = event.total_budget_cents;
  const remaining = total != null ? Math.max(0, total - committedCents) : null;
  const percentCommitted =
    total != null && total > 0 ? Math.min(100, (committedCents / total) * 100) : 0;

  return (
    <div className="rounded-2xl bg-ink px-6 py-7 text-cream sm:px-8 sm:py-9">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-haldi">
        Your celebration
      </p>
      <h1 className="mt-2 font-display text-3xl text-cream sm:text-4xl">{event.name}</h1>
      {metaLine && <p className="mt-1.5 text-sm text-cream/70">{metaLine}</p>}

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {daysToGo != null ? (
            <>
              <div className="font-display text-6xl leading-none text-cream sm:text-7xl">
                {daysToGo}
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-cream/60">
                {daysToGo === 1 ? 'day to go' : 'days to go'}
              </p>
            </>
          ) : hasDatedFunction ? (
            <>
              <div className="font-display text-6xl leading-none text-cream sm:text-7xl">✓</div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-cream/60">
                Celebration complete
              </p>
            </>
          ) : (
            <p className="text-sm text-cream/70">
              Add a date to a function to start the countdown.
            </p>
          )}
        </div>

        <div className="w-full sm:max-w-xs">
          {total != null ? (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream/15">
                <div
                  className="h-full rounded-full bg-cream"
                  style={{ width: `${percentCommitted}%` }}
                />
              </div>
              <p className="text-xs text-cream/70">
                {formatPrice(committedCents)} committed of {formatPrice(total)} ·{' '}
                {formatPrice(remaining ?? 0)} remaining
              </p>
            </div>
          ) : (
            <a
              href="#budget-panel"
              className="text-sm font-semibold text-cream underline decoration-cream/40 underline-offset-4 hover:decoration-cream"
            >
              Set a budget →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
