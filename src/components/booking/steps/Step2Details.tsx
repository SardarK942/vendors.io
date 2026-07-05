'use client';

import * as React from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { EventTypePicker } from '@/components/ui/EventTypePicker';
import { BUDGET_RANGES, type BudgetRange } from '@/lib/booking/custom-request-validation';
import type { CustomEvent } from '../CustomRequestFlow';

export interface Step2DetailsProps {
  isMultiDay: boolean;
  events: CustomEvent[];
  onEventsChange: (events: CustomEvent[]) => void;
  eventCity: string;
  onEventCityChange: (v: string) => void;
  venueName: string;
  onVenueNameChange: (v: string) => void;
  budgetRange: BudgetRange | null;
  onBudgetRangeChange: (v: BudgetRange | null) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

const BUDGET_LABEL: Record<BudgetRange, string> = {
  lt_5k: 'Under $5k',
  '5k_15k': '$5k–15k',
  '15k_30k': '$15k–30k',
  gt_30k: '$30k+',
  discuss: 'Prefer to discuss',
};

const HINT_CHIPS = [
  'Cultural specifics',
  'Coverage hours',
  'Must-have shots',
  'Dietary needs',
  'Color palette',
];

// Guest count keeps its own local `string` state instead of being driven purely
// by the `events` prop. This is the fix for the legacy leading-"1" bug: with a
// numeric input clamped/derived straight from a coerced number, clearing the
// field and typing e.g. "600" would re-render mid-keystroke off a stale parsed
// value and clamp back to "1...". A local string buffer (synced upward via
// onChange, coerced to a number only at Step 3 submit) lets the user freely
// clear and retype without the field fighting back.
interface GuestCountInputProps {
  id: string;
  initialValue: string;
  onChange: (raw: string) => void;
}

function GuestCountInput({ id, initialValue, onChange }: GuestCountInputProps) {
  const [value, setValue] = React.useState(initialValue);
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => {
        // Allow any digits or empty. Coercion happens at Step 3 submit.
        // Clamp to the server's max(2000) so the client never accepts a
        // value the API will reject.
        const raw = e.target.value.replace(/[^0-9]/g, '');
        const clamped = raw.length && Number(raw) > 2000 ? '2000' : raw;
        setValue(clamped);
        onChange(clamped);
      }}
      className="w-full rounded-md border border-hairline bg-cream px-3 py-2 tabular-nums text-ink focus:border-ink focus:outline-none"
    />
  );
}

export function Step2Details({
  isMultiDay,
  events,
  onEventsChange,
  eventCity,
  onEventCityChange,
  venueName,
  onVenueNameChange,
  budgetRange,
  onBudgetRangeChange,
  description,
  onDescriptionChange,
  onBack,
  onContinue,
}: Step2DetailsProps) {
  function updateEvent(idx: number, patch: Partial<CustomEvent>) {
    const next = events.map((e, i) => (i === idx ? { ...e, ...patch } : e));

    // Defensive: block same-day / backward date at the current index.
    if (patch.date && idx > 0) {
      const prev = next[idx - 1].date;
      if (prev && patch.date <= prev) {
        // Ignore this update — silently no-op so the UI stays consistent.
        return;
      }
    }

    // Ascending-date invariant: if the changed row is a date and later rows have
    // dates <= new date, clear those later dates.
    if (patch.date && isMultiDay) {
      for (let j = idx + 1; j < next.length; j++) {
        if (next[j].date && next[j].date <= patch.date) {
          next[j] = { ...next[j], date: '' };
        }
      }
    }
    onEventsChange(next);
  }

  const canContinue =
    events.every((e) => e.date && e.eventTypeId && e.guestCount.trim()) &&
    eventCity.trim().length > 0 &&
    description.trim().length >= 50;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Step 2 of 3 · {isMultiDay ? 'Multi-day' : 'Single event'}
          {isMultiDay && (
            <span className="ml-2 inline-block rounded-full border border-haldi/40 bg-haldi/15 px-2 py-0.5 text-[10px] tracking-[0.14em] text-ink">
              Days must be in order
            </span>
          )}
        </p>
        <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.014em] text-ink">
          Tell us the details
        </h2>
      </div>

      <div className="space-y-4">
        {events.map((event, idx) => {
          const prevDate = idx > 0 ? events[idx - 1].date : '';
          const minDateMatcher = prevDate
            ? (() => {
                const d = new Date(`${prevDate}T00:00:00`);
                d.setDate(d.getDate() + 1);
                return { before: d };
              })()
            : undefined;
          return (
            <div
              key={event.id}
              data-testid={`event-card-${idx}`}
              className="rounded-lg border border-hairline bg-cream p-5 shadow-[0_1px_2px_rgba(27,25,19,0.04),0_8px_24px_rgba(27,25,19,0.05)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo text-[10px] font-semibold text-cream shadow-[0_1px_2px_rgba(43,46,122,0.25)]">
                    {idx + 1}
                  </span>
                  {isMultiDay ? `Day ${idx + 1}` : 'Event details'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-[268px_1fr]">
                <div data-testid={`date-picker-${idx}`}>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                    Date
                    {isMultiDay && idx > 0 && prevDate && (
                      <span className="ml-2 font-normal text-ink-soft">
                        {' '}
                        — must be after {prevDate}
                      </span>
                    )}
                  </label>
                  <DatePicker
                    selected={event.date}
                    onSelect={(v) => updateEvent(idx, { date: v })}
                    disabled={minDateMatcher}
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                      Event type
                    </label>
                    <EventTypePicker
                      value={event.eventTypeId}
                      onValueChange={(v) => updateEvent(idx, { eventTypeId: v })}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`time-${event.id}`}
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                    >
                      Start time
                    </label>
                    <input
                      id={`time-${event.id}`}
                      type="time"
                      value={event.startTime}
                      onChange={(e) => updateEvent(idx, { startTime: e.target.value })}
                      className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`guests-${event.id}`}
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                    >
                      Guests
                    </label>
                    <GuestCountInput
                      id={`guests-${event.id}`}
                      initialValue={event.guestCount}
                      onChange={(raw) => updateEvent(idx, { guestCount: raw })}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 border-t border-hairline pt-6 md:grid-cols-2">
        <div>
          <label
            htmlFor="event-city"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
          >
            Event city
          </label>
          <input
            id="event-city"
            type="text"
            required
            value={eventCity}
            onChange={(e) => onEventCityChange(e.target.value)}
            placeholder="Houston, TX"
            className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="venue-name"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
          >
            Venue name <span className="text-ink-soft">— optional</span>
          </label>
          <input
            id="venue-name"
            type="text"
            value={venueName}
            onChange={(e) => onVenueNameChange(e.target.value)}
            placeholder="The Post Oak Hotel, or leave blank if not booked"
            className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Budget range{' '}
          <span className="font-normal normal-case tracking-normal text-ink-soft">
            — optional, helps them quote
          </span>
        </p>
        <div role="radiogroup" aria-label="Budget range" className="flex flex-wrap gap-2">
          {BUDGET_RANGES.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={budgetRange === id}
              onClick={() => onBudgetRangeChange(budgetRange === id ? null : id)}
              className={
                budgetRange === id
                  ? 'rounded-full border border-indigo bg-indigo px-4 py-1.5 text-xs font-semibold text-cream shadow-[0_2px_8px_rgba(43,46,122,0.28)]'
                  : 'border-hairline-strong rounded-full border bg-transparent px-4 py-1.5 text-xs text-ink-muted hover:border-ink hover:text-ink'
              }
            >
              {BUDGET_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Tell them more
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {HINT_CHIPS.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-hairline bg-cream px-2.5 py-1 text-[11px] text-ink-muted"
            >
              {chip}
            </span>
          ))}
        </div>
        <textarea
          rows={6}
          minLength={50}
          maxLength={1000}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Tell the vendor what makes your event special — coverage hours, dietary needs, color palette, cultural specifics, anything outside their standard offering…"
          className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-xs tabular-nums text-ink-soft">
          {description.length} / 1000 · minimum 50 characters
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-[background-color,transform] hover:bg-hot-pink active:scale-[0.96] disabled:opacity-50 disabled:hover:bg-ink"
        >
          Review →
        </button>
      </div>
    </div>
  );
}
