'use client';

import * as React from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { EventTypePicker } from '@/components/ui/EventTypePicker';
import { TimeInput } from '@/components/ui/TimeInput';
import { BUDGET_RANGES, type BudgetRange } from '@/lib/booking/custom-request-validation';
import { EventFunctionSelect, type EventOption } from '@/components/events/EventFunctionSelect';
import type { RequestedDetailField } from '@/lib/booking/requested-details';
import { getRequestGuidance } from '@/lib/booking/request-guidance';
import {
  GooglePlacesAutocomplete,
  type PlaceData,
} from '@/components/forms/GooglePlacesAutocomplete';
import type { CustomEvent } from '../CustomRequestFlow';

export interface Step2DetailsProps {
  isMultiDay: boolean;
  events: CustomEvent[];
  onEventsChange: (events: CustomEvent[]) => void;
  eventCity: string;
  onEventCityChange: (v: string) => void;
  venueName: string;
  onVenueNameChange: (v: string) => void;
  eventAddress: string;
  onEventAddressChange: (v: string) => void;
  eventGooglePlaceId: string;
  onEventGooglePlaceIdChange: (v: string) => void;
  // Vendor category drives the free-text guidance (placeholder + faint bullets).
  vendorCategory: string;
  budgetRange: BudgetRange | null;
  onBudgetRangeChange: (v: BudgetRange | null) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  // Category-aware optional wishlist ("What you're looking for"). Defaults to an
  // empty list so callers without a category simply render no extra section.
  requestedDetailFields?: RequestedDetailField[];
  requestedDetails?: Record<string, string>;
  onRequestedDetailChange?: (key: string, value: string) => void;
  eventOptions: EventOption[];
  eventFunctionId: string | null;
  onEventFunctionIdChange: (v: string | null) => void;
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
  eventAddress,
  onEventAddressChange,
  eventGooglePlaceId,
  onEventGooglePlaceIdChange,
  vendorCategory,
  budgetRange,
  onBudgetRangeChange,
  description,
  onDescriptionChange,
  requestedDetailFields = [],
  requestedDetails = {},
  onRequestedDetailChange,
  eventOptions,
  eventFunctionId,
  onEventFunctionIdChange,
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

  // Map a Google Places selection onto the flow's location state. `location_name`
  // is only present for establishments/venues (mode="all"); street addresses omit
  // it. `event_city` drives the "can continue" gate, so it's always set from the
  // selection (in the no-key fallback the component routes free text into `city`).
  function handlePlaceSelect(place: PlaceData) {
    if (place.location_name) onVenueNameChange(place.location_name);
    onEventCityChange(place.city);
    const composed = [
      place.address_line_1,
      place.city,
      `${place.state} ${place.postal_code}`.trim(),
    ]
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(', ');
    onEventAddressChange(composed);
    onEventGooglePlaceIdChange(place.google_place_id);
  }

  const guidance = getRequestGuidance(vendorCategory);

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
                    <TimeInput
                      id={`time-${event.id}`}
                      value={event.startTime}
                      onChange={(v) => updateEvent(idx, { startTime: v })}
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

      <div className="border-t border-hairline pt-6">
        <label
          htmlFor="event-location"
          className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
        >
          Where&apos;s the event?
        </label>
        <GooglePlacesAutocomplete
          id="event-location"
          mode="all"
          value={{
            location_name: venueName || undefined,
            address_line_1: eventAddress || undefined,
            city: eventCity || undefined,
            google_place_id: eventGooglePlaceId || undefined,
          }}
          onChange={handlePlaceSelect}
          placeholder="Search a venue or address"
          className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-xs text-ink-soft">
          Search a venue, or enter the home/property address
        </p>
      </div>

      <EventFunctionSelect
        options={eventOptions}
        value={eventFunctionId}
        onChange={onEventFunctionIdChange}
      />

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

      {requestedDetailFields.length > 0 && (
        <div className="border-t border-hairline pt-6">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
            A few quick details{' '}
            <span className="font-normal normal-case tracking-normal text-ink-soft">
              — all optional, helps them quote
            </span>
          </p>
          <p className="mb-3 text-xs text-ink-soft">
            Rough numbers are fine — leave anything blank if you&apos;re not sure.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {requestedDetailFields.map((field) => {
              const inputId = `req-detail-${field.key}`;
              const helpId = `req-detail-help-${field.key}`;
              const value = requestedDetails[field.key] ?? '';
              return (
                <div key={field.key}>
                  <label
                    htmlFor={inputId}
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                  >
                    {field.label}
                  </label>
                  <input
                    id={inputId}
                    type={field.type === 'number' ? 'number' : 'text'}
                    inputMode={field.type === 'number' ? 'numeric' : undefined}
                    min={field.type === 'number' ? 0 : undefined}
                    value={value}
                    aria-describedby={field.helperText ? helpId : undefined}
                    onChange={(e) => onRequestedDetailChange?.(field.key, e.target.value)}
                    className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
                  />
                  {field.helperText && (
                    <p id={helpId} className="mt-1 text-xs text-ink-soft">
                      {field.helperText}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Tell us what you&apos;re looking for
        </p>
        {guidance.bullets.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {guidance.bullets.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-hairline bg-cream px-2.5 py-1 text-[11px] text-ink-muted"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        <textarea
          rows={6}
          minLength={50}
          maxLength={1000}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={guidance.placeholder}
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
