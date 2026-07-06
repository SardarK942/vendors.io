'use client';

import * as React from 'react';
import { EVENT_TYPES } from '@/types';
import { type BudgetRange } from '@/lib/booking/custom-request-validation';
import type { CustomEvent } from '../CustomRequestFlow';

const BUDGET_LABEL: Record<BudgetRange, string> = {
  lt_5k: 'Under $5k',
  '5k_15k': '$5k–15k',
  '15k_30k': '$15k–30k',
  gt_30k: '$30k+',
  discuss: 'Prefer to discuss',
};

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  EVENT_TYPES.map((e) => [e.id, e.label])
);

export interface Step3ReviewProps {
  isMultiDay: boolean;
  events: CustomEvent[];
  eventCity: string;
  venueName: string;
  budgetRange: BudgetRange | null;
  description: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
  onBack: () => void;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

export function Step3Review(props: Step3ReviewProps) {
  const {
    isMultiDay,
    events,
    eventCity,
    venueName,
    budgetRange,
    description,
    vendorBusinessName,
    onBack,
    onSubmit,
    submitting,
    submitError,
  } = props;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Step 3 of 3
        </p>
        <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.014em] text-ink">
          Review and send
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {vendorBusinessName} will get exactly this. Change anything by going back.
        </p>
      </div>

      {submitError && (
        <div role="alert" className="rounded-md bg-haldi/10 p-3 text-sm text-ink">
          {submitError}
        </div>
      )}

      <div className="space-y-5 rounded-lg border border-hairline bg-cream p-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
            {isMultiDay ? `${events.length}-day event` : 'Single event'}
          </p>
          <div className="space-y-3">
            {events.map((e, i) => (
              <div key={e.id} className="grid grid-cols-4 gap-3 text-sm text-ink">
                <div className="col-span-1 text-ink-muted">
                  {isMultiDay ? `Day ${i + 1}` : 'Event'}
                </div>
                <div>{TYPE_LABEL[e.eventTypeId] ?? e.eventTypeId}</div>
                <div className="tabular-nums">
                  {e.date} {e.startTime && `· ${e.startTime}`}
                </div>
                <div className="tabular-nums">{e.guestCount} guests</div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-hairline pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
            Location
          </p>
          <p className="text-sm text-ink">
            {eventCity}
            {venueName && ` · ${venueName}`}
          </p>
        </div>
        {budgetRange && (
          <div className="border-t border-hairline pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
              Budget
            </p>
            <p className="text-sm text-ink">{BUDGET_LABEL[budgetRange]}</p>
          </div>
        )}
        <div className="border-t border-hairline pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">Notes</p>
          <p className="whitespace-pre-wrap text-pretty text-sm text-ink">{description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          aria-busy={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-[background-color,transform] hover:bg-hot-pink active:scale-[0.96] motion-reduce:active:scale-100 disabled:opacity-60"
        >
          {submitting ? 'Sending request…' : 'Send request'}
        </button>
      </div>
    </div>
  );
}
