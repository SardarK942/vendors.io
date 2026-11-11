import { cn } from '@/lib/utils';
import { fmtDate, fmtTime } from '@/lib/intl';
import { SectionCard, SectionHeading } from '@/components/dashboard/kit';
import type { OperationsEvent } from '@/services/booking.service';

interface Props {
  events: OperationsEvent[];
}

function statusLabel(status: string): string {
  if (status === 'deposit_paid') return 'Confirmed';
  if (status === 'completed') return 'Completed';
  return status;
}

export function UpcomingBookingsRail({ events }: Props) {
  return (
    <SectionCard>
      <SectionHeading
        title="Upcoming Bookings"
        actionLabel="View all"
        actionHref="/dashboard/bookings"
      />
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">No upcoming bookings.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((ev) => {
            const dayLabel = fmtDate(`${ev.event_date}T12:00:00`, { day: 'numeric' });
            const monthLabel = fmtDate(`${ev.event_date}T12:00:00`, { month: 'short' });
            const timeStr = `${fmtTime(`${ev.event_date}T${ev.event_start_time}`)} – ${fmtTime(
              `${ev.event_date}T${ev.event_end_time}`
            )}`;
            return (
              <li
                key={ev.id}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-white px-3 py-2.5"
              >
                <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-cream-soft">
                  <span className="text-[10px] font-semibold uppercase text-ink-soft">
                    {monthLabel}
                  </span>
                  <span className="font-display text-base leading-none text-ink">{dayLabel}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {ev.event_type_label || ev.package_label || 'Booking'}
                  </p>
                  <p className="truncate text-xs text-ink-soft">{timeStr}</p>
                  {ev.city ? <p className="truncate text-xs text-ink-soft">{ev.city}</p> : null}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full bg-indigo/10 px-2 py-0.5 text-[10px] font-semibold text-indigo'
                  )}
                >
                  {statusLabel(ev.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
