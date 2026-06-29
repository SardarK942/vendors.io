'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQueryState, parseAsStringEnum } from 'nuqs';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import {
  getVendorAttribution,
  type Attribution,
  type AttributionRange,
} from '@/services/payment.attribution';
import { fmtUSD, fmtCount } from '@/lib/intl';

interface EarningsCardProps {
  vendorProfileId: string;
}

const RANGES: { id: AttributionRange; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

export function EarningsCard({ vendorProfileId }: EarningsCardProps) {
  const [range, setRange] = useQueryState<AttributionRange>(
    'range',
    parseAsStringEnum<AttributionRange>(['month', 'quarter', 'year', 'all'])
      .withDefault('month')
      .withOptions({ clearOnDefault: true })
  );
  const [data, setData] = useState<Attribution | null>(null);

  useEffect(() => {
    const supabase = createClient();
    getVendorAttribution(supabase, vendorProfileId, range).then(setData).catch(console.error);
  }, [vendorProfileId, range]);

  if (!data) {
    return (
      <div className="rounded-lg border border-ink/15 bg-cream p-6">
        <p className="text-sm text-ink/60">Loading…</p>
      </div>
    );
  }

  if (data.bookingCount === 0) {
    return (
      <div className="rounded-lg border border-ink/15 bg-cream p-6 text-center">
        <p className="text-sm text-ink">You haven’t received any Baazar bookings yet.</p>
        <p className="mt-1 text-xs text-ink/60">
          When customers confirm bookings with you, you’ll see them here.
        </p>
        <Button asChild variant="outline" className="mt-3">
          <Link href="/vendors">Browse the marketplace →</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ink/15 bg-cream p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => void setRange(r.id)}
            className={
              range === r.id
                ? 'rounded-full bg-ink px-3 py-1 text-xs font-medium text-cream transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
                : 'rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-ink">{fmtUSD(data.totalCents)}</p>
          <p className="text-xs text-ink/60">in confirmed bookings driven by Baazar</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {fmtCount(data.bookingCount)}
          </p>
          <p className="text-xs text-ink/60">bookings confirmed</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {fmtUSD(data.platformFeeCents)}
          </p>
          <p className="text-xs text-ink/60">in fees paid to Baazar</p>
        </div>
      </div>

      <div className="mt-4 border-t border-ink/10 pt-4">
        <p className="text-sm text-ink">
          Net to you: <span className="font-semibold tabular-nums">{fmtUSD(data.netCents)}</span>{' '}
          (95% of bookings driven)
        </p>
        <p className="mt-2 text-base text-ink">
          ROI: every $1 paid to Baazar →{' '}
          <span className="font-bold tabular-nums text-hot-pink">${data.roiMultiple}</span> in
          bookings
        </p>
      </div>

      <p className="mt-4 text-[11px] text-ink/50">
        Based on confirmed booking totals; doesn’t track balance collection.
      </p>
    </div>
  );
}
