'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Ban, CalendarPlus, Clock3, Pencil, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/intl';
import { cn } from '@/lib/utils';
import { ManualBookingDialog } from './ManualBookingDialog';

export interface CalendarDay {
  /** 'YYYY-MM-DD' (local calendar date of the hold's start) */
  date: string;
  type: 'booking' | 'vendor_blocked';
  /** vendor_calendar_holds.id — needed to unblock a vendor-blocked day. */
  holdId: string;
  bookingEventId: string | null;
  /** event_type_label for bookings (e.g. "Mehndi"). */
  label: string | null;
  /** couple_full_name for bookings. */
  couple: string | null;
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
  events: CalendarDay[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

type View = 'month' | 'week' | 'day';

interface DayData {
  bookings: { label: string | null; couple: string | null }[];
  blockedHoldId: string | null;
}

export function CalendarMonthGrid({ year, month, monthLabel, todayISO, events }: Props) {
  // Only the month view is functional. Week/Day are stubs.
  const [view, setView] = useState<View>('month');
  const pathname = usePathname();
  const router = useRouter();
  // Which date is mid-mutation (disables its popover actions + shows a spinner).
  const [busyDate, setBusyDate] = useState<string | null>(null);
  // Which day's popover is open (controlled so actions can close it) + which
  // day's "Add booking" dialog is open.
  const [openPopoverDate, setOpenPopoverDate] = useState<string | null>(null);
  const [addBookingDate, setAddBookingDate] = useState<string | null>(null);

  // Local copy of the events so a new booking/block shows instantly (optimistic),
  // then reconciles when router.refresh() delivers fresh props from the server.
  const [localEvents, setLocalEvents] = useState<CalendarDay[]>(events);
  useEffect(() => setLocalEvents(events), [events]);

  // Aggregate holds by calendar date, keeping the info the popover needs.
  const byDate = new Map<string, DayData>();
  for (const ev of localEvents) {
    const entry = byDate.get(ev.date) ?? { bookings: [], blockedHoldId: null };
    if (ev.type === 'booking') entry.bookings.push({ label: ev.label, couple: ev.couple });
    else entry.blockedHoldId = ev.holdId;
    byDate.set(ev.date, entry);
  }

  async function blockDay(date: string) {
    setBusyDate(date);
    try {
      const res = await fetch('/api/vendor-calendar/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'full_day', date }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Could not block this day.' }));
        toast.error(e.error ?? 'Could not block this day.');
        return;
      }
      toast.success('Day blocked.');
      setLocalEvents((prev) => [
        ...prev,
        {
          date,
          type: 'vendor_blocked',
          holdId: `optimistic-${date}-${Date.now()}`,
          bookingEventId: null,
          label: null,
          couple: null,
        },
      ]);
      setOpenPopoverDate(null);
      router.refresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setBusyDate(null);
    }
  }

  async function unblockDay(date: string, holdId: string) {
    setBusyDate(date);
    try {
      const res = await fetch(`/api/vendor-calendar/block/${holdId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not unblock this day.');
        return;
      }
      toast.success('Day unblocked.');
      setLocalEvents((prev) => prev.filter((e) => e.holdId !== holdId));
      setOpenPopoverDate(null);
      router.refresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setBusyDate(null);
    }
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

  const CELL_BOX = 'min-h-[76px] border-b border-r border-hairline p-2 first:border-l';

  const MAX_CHIPS = 2;

  function dayInner(
    cell: { day: number; inMonth: boolean },
    opts: {
      isToday: boolean;
      isBlocked: boolean;
      bookings: { label: string | null; couple: string | null }[];
      muted?: boolean;
    }
  ) {
    const { isToday, isBlocked, bookings, muted } = opts;
    return (
      <>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full text-xs',
              isToday
                ? 'bg-indigo font-semibold text-cream'
                : cell.inMonth && !muted
                  ? 'text-ink'
                  : 'text-ink-soft/50'
            )}
          >
            {cell.day}
          </span>
        </div>
        {cell.inMonth && isBlocked ? (
          <p className="mt-1.5 text-[11px] font-medium text-ink-soft">Blocked</p>
        ) : cell.inMonth && bookings.length > 0 ? (
          <div className={cn('mt-1 space-y-0.5', muted && 'opacity-60')}>
            {bookings.slice(0, MAX_CHIPS).map((b, i) => (
              <div
                key={i}
                title={`${b.label ?? 'Booking'}${b.couple ? ` — ${b.couple}` : ''}`}
                className="truncate rounded bg-indigo px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-cream"
              >
                {b.label ?? 'Booking'}
                {b.couple ? <span className="font-normal text-cream/80"> · {b.couple}</span> : null}
              </div>
            ))}
            {bookings.length > MAX_CHIPS ? (
              <span className="block pl-0.5 text-[10px] font-medium text-indigo">
                +{bookings.length - MAX_CHIPS} more
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

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
          const blockedHoldId = data?.blockedHoldId ?? null;
          const isBlocked = blockedHoldId !== null;
          const bookings = data?.bookings ?? [];
          const bookingCount = bookings.length;
          const isToday = todayISO !== null && cell.iso === todayISO;
          const isPast = todayISO !== null && cell.iso < todayISO;
          const busy = busyDate === cell.iso;

          // Out-of-month filler and past days are non-interactive.
          if (!cell.inMonth || isPast) {
            return (
              <div
                key={cell.iso}
                className={cn(
                  CELL_BOX,
                  !cell.inMonth && 'bg-cream-soft/40',
                  cell.inMonth && isBlocked && 'bg-cream-soft',
                  cell.inMonth &&
                    !isBlocked &&
                    bookingCount > 0 &&
                    'bg-indigo/[0.08] shadow-[inset_3px_0_0_0_#2E3DA3]',
                  cell.inMonth && !isBlocked && bookingCount === 0 && isPast && 'bg-cream-soft/20'
                )}
              >
                {dayInner(cell, { isToday, isBlocked, bookings, muted: isPast })}
              </div>
            );
          }

          return (
            <Popover
              key={cell.iso}
              open={openPopoverDate === cell.iso}
              onOpenChange={(o) => setOpenPopoverDate(o ? cell.iso : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`${fmtDate(`${cell.iso}T12:00:00`, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })} — ${isBlocked ? 'blocked' : bookingCount > 0 ? `${bookingCount} booked` : 'available'}. Edit`}
                  className={cn(
                    'group relative flex w-full flex-col text-left transition-colors',
                    CELL_BOX,
                    'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo',
                    isBlocked
                      ? 'bg-cream-soft hover:bg-cream-soft/80'
                      : bookingCount > 0
                        ? 'bg-indigo/[0.08] shadow-[inset_3px_0_0_0_#2E3DA3] hover:bg-indigo/[0.14]'
                        : 'hover:bg-cream-soft/60'
                  )}
                >
                  <motion.div
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="origin-top-left"
                  >
                    {dayInner(cell, { isToday, isBlocked, bookings })}
                  </motion.div>

                  {/* Hover affordance — a small edit chip in the corner. */}
                  <span className="pointer-events-none absolute bottom-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-ink text-cream opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Pencil className="size-3" aria-hidden="true" />
                  </span>
                </button>
              </PopoverTrigger>

              <PopoverContent align="start" className="w-64 space-y-3 p-3">
                <div>
                  <p className="font-display text-sm font-semibold text-ink">
                    {fmtDate(`${cell.iso}T12:00:00`, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="text-[11px] text-ink-soft">
                    {isBlocked ? 'Blocked' : bookingCount > 0 ? 'Has bookings' : 'Available'}
                  </p>
                </div>

                {isBlocked ? (
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={busy}
                    iconLeading={<Ban className="size-4" aria-hidden="true" />}
                    className="w-full justify-start"
                    onClick={() => void unblockDay(cell.iso, blockedHoldId!)}
                  >
                    Unblock this day
                  </Button>
                ) : bookingCount > 0 ? (
                  <div className="space-y-2">
                    <ul className="space-y-1 text-[13px] text-ink">
                      {bookings.map((b, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo"
                            aria-hidden="true"
                          />
                          <span>
                            {b.label ?? 'Booking'}
                            {b.couple ? <span className="text-ink-soft"> — {b.couple}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      iconLeading={<Plus className="size-4" aria-hidden="true" />}
                      className="w-full justify-start"
                      onClick={() => {
                        setOpenPopoverDate(null);
                        setAddBookingDate(cell.iso);
                      }}
                    >
                      Add another booking
                    </Button>
                    <Button asChild variant="tertiary" className="w-full justify-start text-[13px]">
                      <Link href="/dashboard/bookings">View in bookings →</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      iconLeading={<Plus className="size-4" aria-hidden="true" />}
                      className="w-full justify-start"
                      onClick={() => {
                        setOpenPopoverDate(null);
                        setAddBookingDate(cell.iso);
                      }}
                    >
                      Add booking
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      isLoading={busy}
                      iconLeading={<CalendarPlus className="size-4" aria-hidden="true" />}
                      className="w-full justify-start text-[13px]"
                      onClick={() => void blockDay(cell.iso)}
                    >
                      Block this day
                    </Button>
                    <Button
                      asChild
                      variant="tertiary"
                      iconLeading={<Clock3 className="size-4" aria-hidden="true" />}
                      className="w-full justify-start text-[13px]"
                    >
                      <Link href={`${pathname}?date=${cell.iso}#block-a-date`}>
                        Block specific hours…
                      </Link>
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
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

      <ManualBookingDialog
        date={addBookingDate}
        open={addBookingDate !== null}
        onOpenChange={(o) => {
          if (!o) setAddBookingDate(null);
        }}
        onCreated={(created) => {
          // Show the new booking on the grid immediately…
          setLocalEvents((prev) => [
            ...prev,
            {
              date: created.date,
              type: 'booking',
              holdId: `optimistic-${created.date}-${Date.now()}`,
              bookingEventId: null,
              label: created.label,
              couple: created.couple,
            },
          ]);
          // …then reconcile with server truth.
          router.refresh();
        }}
      />
    </div>
  );
}
