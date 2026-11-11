import * as React from 'react';
import { formatPrice } from '@/lib/utils';

interface RevenueDonutProps {
  totalCents: number;
  platformFeeCents: number;
  netCents: number;
}

// Pure, server-safe SVG donut. Two segments drawn with stroke-dasharray arcs:
//   • Vendor Earnings (95%) — indigo
//   • Platform Fees (5%)    — haldi
// The group is rotated -90° so fraction 0 starts at 12 o'clock. Each segment's
// dashoffset is the negative cumulative start fraction × circumference.
export function RevenueDonut({ totalCents, platformFeeCents, netCents }: RevenueDonutProps) {
  const R = 48;
  const C = 2 * Math.PI * R;

  // Guard divide-by-zero — an empty vendor shows an inert full track.
  const safeTotal = totalCents > 0 ? totalCents : 1;
  const earnFrac = netCents / safeTotal;
  const feesFrac = platformFeeCents / safeTotal;

  const earnLen = earnFrac * C;
  const feesLen = feesFrac * C;

  return (
    <div className="flex flex-col gap-5">
      <div className="relative mx-auto grid size-[180px] place-items-center">
        <svg viewBox="0 0 120 120" className="size-[180px] -rotate-90" aria-hidden="true">
          {/* Track */}
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="hsl(var(--hairline))"
            strokeWidth="14"
          />
          {/* Vendor earnings (95%) */}
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="hsl(var(--indigo))"
            strokeWidth="14"
            strokeLinecap="butt"
            strokeDasharray={`${earnLen} ${C - earnLen}`}
            strokeDashoffset="0"
          />
          {/* Platform fees (5%) */}
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="hsl(var(--haldi))"
            strokeWidth="14"
            strokeLinecap="butt"
            strokeDasharray={`${feesLen} ${C - feesLen}`}
            strokeDashoffset={`${-earnLen}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl leading-none text-ink">
            {formatPrice(totalCents)}
          </span>
          <span className="mt-1 text-[11px] text-ink-soft">Total Value</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        <li className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-ink-muted">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: 'hsl(var(--haldi))' }}
              aria-hidden="true"
            />
            Platform Fees (5%)
          </span>
          <span className="font-medium text-ink">{formatPrice(platformFeeCents)}</span>
        </li>
        <li className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-ink-muted">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: 'hsl(var(--indigo))' }}
              aria-hidden="true"
            />
            Vendor Earnings (95%)
          </span>
          <span className="font-medium text-ink">{formatPrice(netCents)}</span>
        </li>
      </ul>
    </div>
  );
}
