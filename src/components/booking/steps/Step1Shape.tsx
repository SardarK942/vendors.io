'use client';

import * as React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface Step1ShapeProps {
  isMultiDay: boolean;
  dayCount: number;
  onChange: (v: { isMultiDay: boolean; dayCount: number }) => void;
  onContinue: () => void;
  onCancel?: () => void;
}

export function Step1Shape({
  isMultiDay,
  dayCount,
  onChange,
  onContinue,
  onCancel,
}: Step1ShapeProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Step 1 of 3
        </p>
        <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.014em] text-ink">
          What&apos;s the shape of your event?
        </h2>
        <p className="mt-2 text-pretty text-sm text-ink-muted">
          Multi-day events (a mehndi Friday, a wedding Saturday, a walima Sunday) get their own card
          for each day.
        </p>
      </div>

      <RadioGroup
        value={isMultiDay ? 'multi' : 'single'}
        onValueChange={(v) => onChange({ isMultiDay: v === 'multi', dayCount })}
        className="gap-3"
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-cream p-4 transition-colors hover:border-ink">
          <RadioGroupItem value="single" id="shape-single" className="mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-ink">Single event</div>
            <div className="text-xs text-ink-muted">One date, one guest count, one event type.</div>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-cream p-4 transition-colors hover:border-ink">
          <RadioGroupItem value="multi" id="shape-multi" className="mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-ink">Multi-day / multi-event</div>
            <div className="text-xs text-ink-muted">
              Multiple ceremonies across days. Each gets its own type, date, time, and guest count.
            </div>
          </div>
        </label>
      </RadioGroup>

      {isMultiDay && (
        <div>
          <label
            htmlFor="day-count"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
          >
            How many events?
          </label>
          <input
            id="day-count"
            aria-label="How many events?"
            type="number"
            min={2}
            max={7}
            value={dayCount}
            onChange={(e) => {
              const n = Math.max(2, Math.min(7, Number(e.target.value) || 2));
              onChange({ isMultiDay: true, dayCount: n });
            }}
            className="w-24 rounded-md border border-hairline bg-cream px-3 py-2 tabular-nums text-ink focus:border-ink focus:outline-none"
          />
          <p className="mt-1 text-xs text-ink-soft">2 to 7 events.</p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-[background-color,transform] hover:bg-hot-pink active:scale-[0.96]"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
