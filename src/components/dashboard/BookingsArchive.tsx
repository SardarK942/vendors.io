'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BookingCard } from './BookingCard';
import type { Database } from '@/types/database.types';

type BookingRow = Database['public']['Tables']['bookings']['Row'] & {
  vendor_profiles?: { business_name: string; slug: string; category: string } | null;
};

type TabKey = 'all' | 'active' | 'upcoming' | 'past' | 'cancelled';

const TABS: TabKey[] = ['all', 'active', 'upcoming', 'past', 'cancelled'];
const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  active: 'Active',
  upcoming: 'Upcoming',
  past: 'Past',
  cancelled: 'Cancelled',
};

interface BookingsArchiveProps {
  initialRows: BookingRow[];
  initialNextCursor: string | null;
  counts: Record<TabKey, number>;
  activeTab: TabKey;
}

export function BookingsArchive({
  initialRows,
  initialNextCursor,
  counts,
  activeTab,
}: BookingsArchiveProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<BookingRow[]>(initialRows);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [q, setQ] = useState('');
  const [isPending, startTransition] = useTransition();

  // Client-side filter on top of loaded rows.
  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (r.couple_full_name ?? '').toLowerCase().includes(needle));
  }, [rows, q]);

  const setTab = (tab: TabKey) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (tab === 'all') sp.delete('tab');
    else sp.set('tab', tab);
    startTransition(() => router.push(`?${sp.toString()}`));
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    const res = await fetch(`/api/bookings/list?tab=${activeTab}&cursor=${nextCursor}`);
    const json = (await res.json()) as { rows: BookingRow[]; nextCursor: string | null };
    setRows((prev) => [...prev, ...json.rows]);
    setNextCursor(json.nextCursor);
  };

  if (initialRows.length === 0 && counts.all === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No bookings yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Booking requests from customers will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search customer name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            disabled={isPending}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[tab]}{' '}
            <span className="ml-1 text-xs text-muted-foreground">{counts[tab]}</span>
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">No bookings in this view.</p>
          <Button
            variant="link"
            onClick={() => {
              setQ('');
              setTab('all');
            }}
          >
            Show all
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((b) => (
            <BookingCard key={b.id} booking={b} role="vendor" />
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="text-center">
          <Button variant="outline" onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
