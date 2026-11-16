'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Sparkles, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countdown } from '@/lib/dashboard/countdown';
import { fmtDate as fmtDateIntl, fmtTime } from '@/lib/intl';
/**
 * Shape of a couple's booked function + its vendor, as built in the couple home
 * loader. (Formerly lived on the retired EventCard flip-card component.)
 */
export interface EventCardData {
  eventId: string;
  bookingId: string;
  eventTypeLabel: string;
  eventDate: string;
  eventStartTime: string; // ISO timestamp
  eventEndTime: string; // ISO timestamp
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  status: string;
  vendor: {
    businessName: string;
    category: string;
    portfolioImage: string | null;
  };
}

interface Props {
  events: EventCardData[];
}

// Statuses that reveal the full venue address (matches EventCard's REVEAL_STATUSES).
const REVEAL_STATUSES = new Set(['deposit_paid', 'completed']);

function statusBadge(status: string): {
  label: string;
  tone: 'confirmed' | 'warn' | 'info' | 'muted';
} {
  if (status === 'deposit_paid' || status === 'completed')
    return { label: 'Confirmed', tone: 'confirmed' };
  if (status === 'pending') return { label: 'Awaiting vendor', tone: 'warn' };
  if (status === 'accepted') return { label: 'Awaiting deposit', tone: 'warn' };
  if (status === 'adjusted_quote_sent') return { label: 'Adjusted quote', tone: 'info' };
  if (status === 'adjusted_quote_declined') return { label: 'Re-quote needed', tone: 'warn' };
  if (status === 'couple_countered') return { label: 'Counter sent', tone: 'info' };
  if (status === 'pending_quote') return { label: 'Quote requested', tone: 'info' };
  return { label: status.replace(/_/g, ' '), tone: 'muted' };
}

function fmtDate(iso: string): string {
  // Noon-anchored so YYYY-MM-DD reads in the viewer's timezone (no UTC drift).
  return fmtDateIntl(`${iso}T12:00:00`, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Tab = 'upcoming' | 'past';

export function CoupleUpcomingSchedule({ events }: Props) {
  const [tab, setTab] = useState<Tab>('upcoming');

  const { upcoming, past } = useMemo(() => {
    const up: EventCardData[] = [];
    const pa: EventCardData[] = [];
    for (const e of events) (countdown(e.eventDate) === 'Past' ? pa : up).push(e);
    return { upcoming: up, past: pa };
  }, [events]);

  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-display text-xl text-ink sm:text-2xl">Upcoming Schedule</h3>
        <div
          className="inline-flex rounded-lg bg-cream-soft p-1"
          role="tablist"
          aria-label="Schedule filter"
        >
          {(['upcoming', 'past'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition-colors',
                tab === t ? 'bg-indigo text-cream shadow-sm' : 'text-ink-soft hover:text-ink'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-cream-soft/40 px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">
            {tab === 'upcoming' ? 'No upcoming functions yet.' : 'No past functions.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((e, i) => (
            <ScheduleCard key={e.eventId} data={e} highlighted={tab === 'upcoming' && i === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleCard({ data, highlighted }: { data: EventCardData; highlighted: boolean }) {
  const sb = statusBadge(data.status);
  const reveal = REVEAL_STATUSES.has(data.status);
  const location = reveal ? `${data.addressLine1}, ${data.city}` : `${data.city}, ${data.state}`;
  const Icon = highlighted ? Sparkles : CalendarDays;

  const dotTone =
    sb.tone === 'confirmed'
      ? 'bg-emerald-400'
      : sb.tone === 'warn'
        ? 'bg-haldi'
        : sb.tone === 'info'
          ? 'bg-indigo'
          : 'bg-ink-muted';

  return (
    <Link
      href={`/dashboard/bookings/${data.bookingId}`}
      className={cn(
        'group relative flex flex-col justify-between rounded-2xl p-5 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
        highlighted
          ? 'bg-indigo text-cream shadow-[0_12px_30px_-18px_rgba(46,61,163,0.9)]'
          : 'border border-hairline bg-cream hover:shadow-[0_8px_24px_-16px_rgba(27,20,20,0.4)]'
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-xl',
            highlighted ? 'bg-cream/15 text-cream' : 'bg-haldi/20'
          )}
        >
          <Icon aria-hidden className={cn('size-4', highlighted ? 'text-cream' : 'text-ink')} />
        </span>
        <ArrowUpRight
          aria-hidden
          className={cn(
            'size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5',
            highlighted ? 'text-cream/80' : 'text-ink-muted'
          )}
        />
      </div>

      <div className="mt-6">
        <p className={cn('font-display text-xl', highlighted ? 'text-cream' : 'text-ink')}>
          {data.eventTypeLabel}
        </p>
        <p className={cn('mt-1 text-sm', highlighted ? 'text-cream/80' : 'text-ink-soft')}>
          {fmtTime(data.eventStartTime)} – {fmtTime(data.eventEndTime)}
        </p>
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-xs',
            highlighted ? 'text-cream/70' : 'text-ink-muted'
          )}
          data-ph-mask=""
        >
          <MapPin aria-hidden className="size-3" />
          <span className="truncate">{location}</span>
        </p>
      </div>

      <div
        className={cn(
          'mt-5 flex items-center gap-2 border-t pt-3 text-xs font-medium',
          highlighted ? 'border-cream/15 text-cream/90' : 'border-hairline text-ink-soft'
        )}
      >
        <span className={cn('size-1.5 rounded-full', dotTone)} />
        {sb.label}
        <span className={cn('ml-auto', highlighted ? 'text-cream/60' : 'text-ink-muted')}>
          {fmtDate(data.eventDate)}
        </span>
      </div>
    </Link>
  );
}
