'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getVendorAttribution,
  type Attribution,
  type AttributionRange,
} from '@/services/payment.service';

interface EarningsCardProps {
  vendorProfileId: string;
}

const RANGES: { id: AttributionRange; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function EarningsCard({ vendorProfileId }: EarningsCardProps) {
  const [range, setRange] = useState<AttributionRange>('month');
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
        <p className="text-sm text-ink">You haven&apos;t received any Baazar bookings yet.</p>
        <p className="mt-1 text-xs text-ink/60">
          When customers confirm bookings with you, you&apos;ll see them here.
        </p>
        <a
          href="/vendors"
          className="mt-3 inline-block text-sm font-medium text-hot-pink hover:underline"
        >
          Browse the marketplace →
        </a>
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
            onClick={() => setRange(r.id)}
            className={
              range === r.id
                ? 'rounded-full bg-ink px-3 py-1 text-xs font-medium text-cream'
                : 'rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink hover:bg-ink/5'
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-semibold text-ink">{formatCents(data.totalCents)}</p>
          <p className="text-xs text-ink/60">in confirmed bookings driven by Baazar</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{data.bookingCount}</p>
          <p className="text-xs text-ink/60">bookings confirmed</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{formatCents(data.platformFeeCents)}</p>
          <p className="text-xs text-ink/60">in fees paid to Baazar</p>
        </div>
      </div>

      <div className="mt-4 border-t border-ink/10 pt-4">
        <p className="text-sm text-ink">
          Net to you: <span className="font-semibold">{formatCents(data.netCents)}</span> (95% of
          bookings driven)
        </p>
        <p className="mt-2 text-base text-ink">
          ROI: every $1 paid to Baazar →{' '}
          <span className="font-bold text-hot-pink">${data.roiMultiple}</span> in bookings
        </p>
      </div>

      <p className="mt-4 text-[11px] text-ink/50">
        Based on confirmed booking totals; doesn&apos;t track balance collection.
      </p>
    </div>
  );
}
