'use client';

import * as React from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface BookingTrendsChartProps {
  // Real daily booking counts over the trailing window (one entry per day).
  bookings: number[];
  // Sparse axis labels, same length as `bookings`. Only start/mid/end are shown.
  labels: string[];
}

type Series = 'bookings' | 'revenue';

// Fixed drawing surface — the chart scales responsively via width="100%".
const VIEW_W = 600;
const VIEW_H = 220;
const PAD_X = 36;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function buildPath(values: number[]): { line: string; area: string; max: number } {
  const n = values.length;
  const max = Math.max(1, ...values); // guard divide-by-zero on an all-zero series
  const innerW = VIEW_W - PAD_X * 2;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  const pts = values.map((v, i) => {
    const x = PAD_X + i * stepX;
    const y = PAD_TOP + innerH - (v / max) * innerH;
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const baseY = PAD_TOP + innerH;
  const first = pts[0] ?? [PAD_X, baseY];
  const last = pts[pts.length - 1] ?? [VIEW_W - PAD_X, baseY];
  const area = `M ${first[0]} ${baseY} ${line} L ${last[0]} ${baseY} Z`;

  return { line, area, max };
}

export function BookingTrendsChart({ bookings, labels }: BookingTrendsChartProps) {
  const [series, setSeries] = useState<Series>('bookings');

  // Revenue series is a STUB derived from the real booking counts.
  // TODO(backend): revenue series — replace with real daily revenue aggregation.
  const revenue = bookings.map((c) => c * 500);

  const active = series === 'bookings' ? bookings : revenue;
  const { line, area, max } = buildPath(active);

  // Sparse x-axis: first / middle / last label only.
  const midIdx = Math.floor(labels.length / 2);
  const axisLabels = [
    { i: 0, text: labels[0] ?? '' },
    { i: midIdx, text: labels[midIdx] ?? '' },
    { i: labels.length - 1, text: labels[labels.length - 1] ?? '' },
  ];
  const innerW = VIEW_W - PAD_X * 2;
  const stepX = labels.length > 1 ? innerW / (labels.length - 1) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">Booking Trends</h2>
        <div className="inline-flex rounded-full border border-hairline bg-cream-soft p-0.5">
          {(['bookings', 'revenue'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeries(s)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                series === s ? 'bg-indigo text-cream' : 'text-ink-muted hover:text-ink'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        className="h-auto w-full"
        role="img"
        aria-label={`Booking trends — ${series}, peak ${max}`}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--indigo))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="hsl(var(--indigo))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline */}
        <line
          x1={PAD_X}
          y1={VIEW_H - PAD_BOTTOM}
          x2={VIEW_W - PAD_X}
          y2={VIEW_H - PAD_BOTTOM}
          stroke="hsl(var(--hairline))"
          strokeWidth="1"
        />

        <path d={area} fill="url(#trendFill)" />
        <path
          d={line}
          fill="none"
          stroke="hsl(var(--indigo))"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {axisLabels.map(({ i, text }) => (
          <text
            key={i}
            x={PAD_X + i * stepX}
            y={VIEW_H - 8}
            textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
            className="fill-ink-soft text-[10px]"
          >
            {text}
          </text>
        ))}
      </svg>
    </div>
  );
}
