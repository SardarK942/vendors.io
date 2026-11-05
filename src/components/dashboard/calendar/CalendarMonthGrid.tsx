'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface CalendarDayEvent {
  /** 'YYYY-MM-DD' (local calendar date of the hold's start) */
  date: string;
  type: 'booking' | 'vendor_blocked';
}

interface Props {
  /** Full year, e.g. 2026 */
  year: number;
  /** Month index 0-11 */
  month: number;
  /** Display label, e.g. "October 2026" */
  monthLabel: string;
  /** 'YYYY-MM-DD' for today if it falls in this month, else null */
  todayISO: string | null;
  events: CalendarDayEvent[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

type View = 'month' | 'week' | 'day';

export function CalendarMonthGrid({ year, month, monthLabel, todayISO, events }: Props) {
  // Only the month view is functional. Week/Day are stubs.
  const [view, setView] = useState<View>('month');

  // Aggregate holds by calendar date.
  const byDate = new Map<string, { booking: number; blocked: boolean }>();
  for (const ev of events) {
    const entry = byDate.get(ev.date) ?? { booking: 0, blocked: false };
    if (ev.type === 'booking') entry.booking += 1;
    else entry.blocked = true;
    byDate.set(ev.date, entry);
  }

  // Build a 6x7 (42-cell) grid starting on the Sunday on/before the 1st.
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { iso: string; day: number; inMonth: boolean }[] = [];
  // Leading days from the previous month.
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevDays - i;
    const d = new Date(year, month - 1, day);
    cells.push({ iso: isoOf(d.getFullYear(), d.getMonth(), day), day, inMonth: false });
  }
  // Current month days.
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: isoOf(year, month, day), day, inMonth: true });
  }
  // Trailing days to complete the final week row.
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month + 1, nextDay);
    cells.push({
      iso: isoOf(d.getFullYear(), d.getMonth(), nextDay),
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }

  const toggleBtn = (value: View, label: string, disabled: boolean) => (
    <button
      key={value}
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setView(value)}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        view === value ? 'bg-indigo text-cream' : 'text-ink-soft',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:text-ink'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-hairline bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">{monthLabel}</h2>
        {/* TODO(backend): week/day views — only Month is functional. */}
        <div className="flex items-center gap-1 rounded-full bg-cream-soft p-1">
          {toggleBtn('month', 'Month', false)}
          {toggleBtn('week', 'Week', true)}
          {toggleBtn('day', 'Day', true)}
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-hairline pb-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-semibold text-ink-soft">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const data = byDate.get(cell.iso);
          const isToday = todayISO !== null && cell.iso === todayISO;
          const isBlocked = data?.blocked ?? false;
          const bookingCount = data?.booking ?? 0;
          return (
            <div
              key={cell.iso}
              className={cn(
                'min-h-[76px] border-b border-r border-hairline p-2 first:border-l',
                !cell.inMonth && 'bg-cream-soft/40',
                isBlocked && cell.inMonth && 'bg-cream-soft'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex size-6 items-center justify-center rounded-full text-xs',
                    isToday
                      ? 'bg-indigo font-semibold text-cream'
                      : cell.inMonth
                        ? 'text-ink'
                        : 'text-ink-soft/50'
                  )}
                >
                  {cell.day}
                </span>
              </div>
              {cell.inMonth && isBlocked ? (
                <p className="mt-1.5 text-[11px] font-medium text-ink-soft">Blocked</p>
              ) : cell.inMonth && bookingCount > 0 ? (
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-indigo" aria-hidden="true" />
                  <span className="text-[11px] text-ink-muted">
                    {bookingCount} event{bookingCount === 1 ? '' : 's'}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-indigo" aria-hidden="true" />
          Booked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-full border border-hairline bg-white"
            aria-hidden="true"
          />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-cream-soft" aria-hidden="true" />
          Blocked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-haldi" aria-hidden="true" />
          Today
        </span>
      </div>
    </div>
  );
}
