'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/intl';

interface Hold {
  id: string;
  hold_type: 'booking' | 'vendor_blocked';
  hold_range: string;
  booking_event_id: string | null;
  booking_events?: {
    event_type_label: string;
    bookings: { couple_full_name: string | null };
  } | null;
}

interface Props {
  holds: Hold[];
}

function parseRange(range: string): {
  date: string;
  startTime: string;
  endTime: string;
  fullDay: boolean;
} {
  // Parse '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")'
  const m = range.match(/^\["([^"]+)","([^"]+)"\)$/);
  if (!m) return { date: '?', startTime: '?', endTime: '?', fullDay: false };
  const [, start, end] = m;
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const startTime = start.slice(11, 16);
  const endTime = end.slice(11, 16);
  const fullDay = startTime === '00:00' && endTime === '00:00' && startDate !== endDate;
  return { date: startDate, startTime, endTime, fullDay };
}

export function CalendarHoldsList({ holds }: Props) {
  const [items, setItems] = useState(holds);

  async function unblock(id: string) {
    const res = await fetch(`/api/vendor-calendar/block/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((h) => h.id !== id));
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No upcoming holds.</p>;
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Upcoming (next 90 days)</h2>
      <ul className="space-y-1 text-sm">
        {items.map((h) => {
          const { date, startTime, endTime, fullDay } = parseRange(h.hold_range);
          const label =
            h.hold_type === 'booking'
              ? `${h.booking_events?.event_type_label ?? 'Booking'} for ${h.booking_events?.bookings.couple_full_name ?? '—'}`
              : 'Personal block';
          const timeStr = fullDay ? '(full day)' : `${startTime} – ${endTime}`;
          return (
            <li
              key={h.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span className="tabular-nums">
                <span className="font-medium">{fmtDate(`${date}T12:00:00`)}</span>
                <span className="ml-2 text-muted-foreground">{timeStr}</span>
                <span className="ml-2">— {label}</span>
                <span
                  className={`ml-2 text-xs ${h.hold_type === 'booking' ? 'text-green-600' : 'text-amber-600'}`}
                >
                  [{h.hold_type === 'booking' ? 'Booking' : 'Blocked'}]
                </span>
              </span>
              {h.hold_type === 'vendor_blocked' && (
                <Button variant="ghost" size="sm" onClick={() => unblock(h.id)}>
                  Unblock
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
