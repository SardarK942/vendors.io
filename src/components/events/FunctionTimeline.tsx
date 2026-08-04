import type { EventFunctionRow } from '@/types/database.types';
import { daysUntil } from '@/lib/events/derive';
import { cn } from '@/lib/utils';

interface FunctionTimelineProps {
  functions: EventFunctionRow[];
  bookedCounts: Record<string, { booked: number; total: number }>;
  todayIso: string;
}

function fmtKicker(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

export function FunctionTimeline({ functions, bookedCounts, todayIso }: FunctionTimelineProps) {
  if (functions.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-cream-soft/40 px-5 py-4 text-sm text-ink-soft">
        No functions added yet.
      </div>
    );
  }

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {functions.map((fn) => {
        const counts = bookedCounts[fn.id] ?? { booked: 0, total: 0 };
        const percent = counts.total > 0 ? (counts.booked / counts.total) * 100 : 0;
        const isPast = fn.date != null && daysUntil(fn.date, todayIso) < 0;
        const detailLine = [
          fn.guest_estimate != null ? `${fn.guest_estimate} guests` : null,
          fn.venue_name,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <div
            key={fn.id}
            className={cn(
              'w-56 shrink-0 rounded-xl border border-hairline bg-cream p-4',
              isPast && 'opacity-60'
            )}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
              {fn.date ? fmtKicker(fn.date) : 'DATE TBD'}
            </p>
            <p className="mt-1.5 truncate font-display text-lg text-ink">{fn.label}</p>
            <p className="mt-0.5 min-h-[1.1em] truncate text-xs text-ink-soft">
              {detailLine || 'Details TBD'}
            </p>

            {counts.total > 0 ? (
              <div className="mt-3 space-y-1">
                <div className="h-1 w-full overflow-hidden rounded-full bg-ink-muted/10">
                  <div className="h-full rounded-full bg-indigo" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-[11px] text-ink-soft">
                  {counts.booked}/{counts.total} booked
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-ink-soft">No vendor slots yet</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
