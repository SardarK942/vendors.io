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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
      <div className="rounded-2xl border border-ink/15 bg-cream p-6">
        <p className="text-sm text-ink/60">Loading…</p>
      </div>
    );
  }

  if (data.bookingCount === 0) {
    return (
      <div className="rounded-2xl border border-ink/15 bg-cream p-6 text-center">
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
    <div className="rounded-2xl border border-ink/15 bg-cream p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => void setRange(r.id)}
            className={
              range === r.id
                ? 'rounded-full bg-ink px-3 py-1 text-xs font-medium text-cream transition-[transform,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.96] motion-reduce:active:scale-100'
                : 'rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink transition-[transform,background-color] hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.96] motion-reduce:active:scale-100'
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
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                tabIndex={0}
                className="cursor-help text-xs text-ink/60 underline decoration-dotted underline-offset-2"
              >
                bookings confirmed
              </p>
            </TooltipTrigger>
            <TooltipContent>
              Bookings where the vendor accepted and the deposit cleared.
            </TooltipContent>
          </Tooltip>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {fmtUSD(data.platformFeeCents)}
          </p>
          <p className="text-xs text-ink/60">in fees paid to Baazar</p>
        </div>
      </div>

      <div className="mt-4 rounded-md bg-cream-soft p-4">
        <p className="text-sm text-ink">
          Net to you: <span className="font-semibold tabular-nums">{fmtUSD(data.netCents)}</span>{' '}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="cursor-help underline decoration-dotted underline-offset-2"
              >
                (95% of total bookings)
              </span>
            </TooltipTrigger>
            <TooltipContent>
              You keep 95% of every booking — collected directly from the couple. Baazar&apos;s 5%
              is the deposit couples pay through us.
            </TooltipContent>
          </Tooltip>
        </p>
        <p className="mt-2 text-base text-ink">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="cursor-help underline decoration-dotted underline-offset-2"
              >
                ROI:
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Booking dollars confirmed for every $1 of platform fees paid this period.
            </TooltipContent>
          </Tooltip>{' '}
          every $1 paid to Baazar →{' '}
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
