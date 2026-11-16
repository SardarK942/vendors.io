import Link from 'next/link';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';
import { daysUntil } from '@/lib/events/derive';
import { dateRangeLabel } from '@/lib/events/format';
import type { NeedWithBooking } from '@/lib/events/derive';
import type { EventFunctionRow, EventRow, EventTaskRow } from '@/types/database.types';

interface Props {
  event: EventRow;
  functions: EventFunctionRow[];
  needs: NeedWithBooking[];
  tasks: EventTaskRow[];
  committedCents: number;
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
 * Couple home celebration hero (Figma node 34:14708). Cream card with the
 * planning snapshot on the left and a white "days to go / next up" inset on the
 * right. Same inputs as EventSummaryCard — this is the home-screen redesign of
 * that card; EventSummaryCard stays for anywhere else that still uses it.
 */
export function CoupleCelebrationHero({ event, functions, tasks, committedCents }: Props) {
  const dateRange = dateRangeLabel(functions);
  const metaLine = [dateRange, event.city].filter(Boolean).join(' • ');
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

  return (
    <section className="relative overflow-hidden rounded-[20px] bg-cream-soft px-6 py-7 sm:px-9 sm:py-9">
      {/* Decorative concentric ring motif (Figma), kept faint + non-interactive. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full border border-ink/[0.06]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 top-10 size-56 rounded-full border border-ink/[0.05]"
      />

      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-stretch lg:justify-between">
        {/* LEFT — planning snapshot */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
            Your celebration
          </p>
          <h2 className="mt-2 text-balance font-display text-3xl text-ink sm:text-4xl">
            {event.name}
          </h2>
          {metaLine && <p className="mt-1.5 text-sm text-ink-soft">{metaLine}</p>}

          {total != null && (
            <div className="mt-6 max-w-md">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                  Planning progress
                </span>
                <span className="font-mono text-[11px] font-bold tabular-nums tracking-wide text-indigo">
                  {formatPrice(committedCents)} / {formatPrice(total)} committed
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-indigo transition-[width] duration-500"
                  style={{ width: `${percentCommitted}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-auto pt-7">
            <Button asChild variant="primary">
              <Link href={`/dashboard/events/${event.id}`}>
                Open journal
                <ArrowRight aria-hidden className="ml-1.5 size-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* RIGHT — days-to-go + next up inset */}
        <div className="w-full shrink-0 rounded-2xl bg-cream px-6 py-6 shadow-[0_1px_0_rgba(0,0,0,0.04),0_12px_30px_-18px_rgba(27,20,20,0.35)] lg:w-[256px]">
          {daysToGo != null ? (
            <div className="text-right">
              <div className="font-display text-6xl leading-none text-indigo">{daysToGo}</div>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                {daysToGo === 1 ? 'Day to go' : 'Days to go'}
              </p>
            </div>
          ) : hasDatedFunction ? (
            <div className="text-right">
              <div className="font-display text-5xl leading-none text-indigo">✓</div>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                Celebration complete
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Add a date to start the countdown.</p>
          )}

          <div className="mt-5 border-t border-hairline pt-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">
              Next up
            </p>
            {nextTasks.length > 0 ? (
              <ul className="mt-2.5 space-y-2.5">
                {nextTasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm text-ink">
                    <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-indigo" />
                    <span className="min-w-0">{t.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">All caught up.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
