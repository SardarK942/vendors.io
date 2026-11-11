'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { CalendarDays, Search } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { SectionHeading } from '@/components/dashboard/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BookingRow, type BookingRowData } from './BookingRow';
import { BookingsEmptyState } from './BookingsEmptyState';

type TabKey = 'all' | 'upcoming' | 'completed' | 'cancelled';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

// Each tab maps to the app's real booking statuses (same semantics as the
// archive's TAB_STATUSES). "Upcoming" = confirmed (deposit paid).
const TAB_STATUSES: Record<Exclude<TabKey, 'all'>, string[]> = {
  upcoming: ['deposit_paid'],
  completed: ['completed'],
  cancelled: ['couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'expired'],
};

// The statuses that need the vendor to act — matches the canonical needs-reply
// set (booking.service): a new booking request to accept, a quote request to
// price, or a re-quote after the couple declined an adjustment.
const NEEDS_ACTION: string[] = ['pending', 'pending_quote', 'adjusted_quote_declined'];

export function BookingStatusTabs({ rows }: { rows: BookingRowData[] }) {
  const [tab, setTab] = useState<TabKey>('all');
  const [actionOnly, setActionOnly] = useState(false);

  const filtered = useMemo(() => {
    if (actionOnly) return rows.filter((r) => NEEDS_ACTION.includes(r.status));
    if (tab === 'all') return rows;
    return rows.filter((r) => TAB_STATUSES[tab].includes(r.status));
  }, [rows, tab, actionOnly]);

  // How many bookings currently need the vendor to act (accept a request,
  // re-quote a declined adjustment). Drives the Action Required pulse + count.
  const actionableCount = useMemo(
    () => rows.filter((r) => NEEDS_ACTION.includes(r.status)).length,
    [rows]
  );

  return (
    <div className="space-y-6">
      {/* Header: title + subtitle (left), search stub + Action Required (right) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle subtitle="Your bookings and their status.">Bookings</PageTitle>
        <div className="flex items-center gap-2">
          {/* TODO(backend): booking search — styled stub, intentionally inert */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden="true"
            />
            <Input
              disabled
              placeholder="Search bookings…"
              aria-label="Search bookings (coming soon)"
              className="w-full pl-9 sm:w-48"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            aria-pressed={actionOnly}
            onClick={() => setActionOnly((v) => !v)}
            // Pulse while there are pending tasks (and the filter isn't already on).
            className={cn(actionableCount > 0 && !actionOnly && 'pulse-pink-loop')}
          >
            Action Required
            {actionableCount > 0 ? ` (${actionableCount})` : ''}
          </Button>
        </div>
      </div>

      {/* Filter tabs — pill row, right-aligned per Figma */}
      <div className="flex flex-wrap items-center justify-end gap-1">
        {TABS.map(({ key, label }) => {
          const active = !actionOnly && tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setActionOnly(false);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                active ? 'bg-indigo text-cream' : 'text-ink-muted hover:text-ink'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <SectionHeading icon={CalendarDays} title="Recent Bookings" />

      {filtered.length === 0 ? (
        <BookingsEmptyState />
      ) : (
        <div className="space-y-3">
          {filtered.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}
