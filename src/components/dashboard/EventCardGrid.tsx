'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useQueryState, parseAsStringEnum, parseAsString } from 'nuqs';
import { Button } from '@/components/ui/button';
import { EventCard, type EventCardData } from './EventCard';
import { EventCardFilters, type TimeFilter } from './EventCardFilters';
import { countdown } from '@/lib/dashboard/countdown';

interface Props {
  events: EventCardData[];
}

export function EventCardGrid({ events }: Props) {
  const [timeFilter, setTimeFilter] = useQueryState<TimeFilter>(
    'time',
    parseAsStringEnum<TimeFilter>(['upcoming', 'past', 'all'])
      .withDefault('upcoming')
      .withOptions({ clearOnDefault: true })
  );
  const [categoryFilter, setCategoryFilter] = useQueryState(
    'category',
    parseAsString.withDefault('').withOptions({ clearOnDefault: true })
  );

  const filtered = useMemo(() => {
    return events.filter((e) => {
      // Time filter
      const isPast = countdown(e.eventDate) === 'Past';
      if (timeFilter === 'upcoming' && isPast) return false;
      if (timeFilter === 'past' && !isPast) return false;
      // Category filter
      if (categoryFilter && e.vendor.category !== categoryFilter) return false;
      return true;
    });
  }, [events, timeFilter, categoryFilter]);

  if (events.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No upcoming events yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse vendors to start planning your wedding.
        </p>
        <Button asChild className="mt-4">
          <Link href="/vendors">Browse Vendors →</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <EventCardFilters
        timeFilter={timeFilter}
        onTimeChange={setTimeFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No events match the current filter.
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {filtered.map((e) => (
            <EventCard key={e.eventId} data={e} />
          ))}
        </div>
      )}
    </>
  );
}
