import { Sparkles } from 'lucide-react';
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
  const metaLine = [dateRange, event.city].filter(Boolean).join(' • ');
  const total = event.total_budget_cents;
  const remaining = total != null ? Math.max(0, total - committedCents) : null;
  const percentCommitted =
    total != null && total > 0 ? Math.min(100, (committedCents / total) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-indigo px-6 py-7 text-cream sm:px-9 sm:py-9">
      {/* Decorative concentric rings (Figma), faint + non-interactive. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 size-96 rounded-full border border-cream/[0.08]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-8 size-64 rounded-full border border-cream/[0.06]"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-6">
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-xl bg-cream/15"
          >
            <Sparkles className="size-5 text-haldi" />
          </span>

          {daysToGo != null ? (
            <div className="text-right">
              <div className="font-display text-5xl leading-none text-haldi sm:text-6xl">
                {daysToGo}
              </div>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-cream/70">
                {daysToGo === 1 ? 'Day to go' : 'Days to go'}
              </p>
            </div>
          ) : hasDatedFunction ? (
            <div className="text-right">
              <div className="font-display text-5xl leading-none text-haldi">✓</div>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-cream/70">
                Celebration complete
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-cream/80">
            Your celebration
          </p>
          <h1 className="mt-2 font-display text-3xl text-cream sm:text-4xl">{event.name}</h1>
          {metaLine && <p className="mt-1.5 text-sm text-cream/70">{metaLine}</p>}
        </div>

        <div className="mt-7">
          {total != null ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cream/80">
                  Budget committed
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-cream">
                  {formatPrice(committedCents)} / {formatPrice(total)}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-cream/15">
                <div
                  className="h-full rounded-full bg-haldi transition-[width] duration-500"
                  style={{ width: `${percentCommitted}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-cream/70">
                <span>{formatPrice(remaining ?? 0)} remaining</span>
                <span>{Math.round(percentCommitted)}% of budget</span>
              </div>
            </>
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
