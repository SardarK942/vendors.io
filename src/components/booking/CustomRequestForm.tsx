'use client';

import * as React from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { EventTypePicker } from '@/components/ui/EventTypePicker';
import type { EventTypeId } from '@/types';

type CustomEvent = {
  id: string;
  date: string;
  startTime: string;
  guestCount: number;
  eventTypeId: EventTypeId;
};

type FormState =
  | { kind: 'default' }
  | { kind: 'submitting' }
  | { kind: 'success'; bookingId: string }
  | { kind: 'error'; message: string };

export interface CustomRequestFormProps {
  vendorSlug: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
}

function makeBlankEvent(): CustomEvent {
  return {
    id: crypto.randomUUID(),
    date: '',
    startTime: '',
    guestCount: 50,
    eventTypeId: 'wedding',
  };
}

export function CustomRequestForm({
  vendorSlug,
  vendorBusinessName,
  vendorResponseSlaHours,
}: CustomRequestFormProps) {
  const [events, setEvents] = React.useState<CustomEvent[]>([makeBlankEvent()]);
  const [description, setDescription] = React.useState('');
  const [state, setState] = React.useState<FormState>({ kind: 'default' });

  function updateEvent(id: string, patch: Partial<CustomEvent>) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addEvent() {
    setEvents((prev) => [...prev, makeBlankEvent()]);
  }

  function removeEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.kind === 'submitting' || state.kind === 'success') return;

    if (description.trim().length < 50) {
      setState({ kind: 'error', message: 'Please describe your event (at least 50 characters).' });
      return;
    }

    const primaryEvent = events[0];
    if (!primaryEvent?.date) {
      setState({ kind: 'error', message: 'Please select a date for your event.' });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/bookings/custom-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vendor_slug: vendorSlug,
          events: events.map(({ date, startTime, guestCount, eventTypeId }) => ({
            date,
            startTime,
            guestCount,
            eventTypeId,
          })),
          description,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({ kind: 'error', message: 'We couldn’t send your request — please try again.' });
        return;
      }
      setState({ kind: 'success', bookingId: json.booking_id });
    } catch {
      setState({ kind: 'error', message: 'We couldn’t send your request — please try again.' });
    }
  };

  if (state.kind === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-hairline bg-cream p-8 text-ink"
      >
        <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.012em]">
          Request sent.
        </h2>
        <p className="mt-3 text-pretty text-sm text-ink-muted">
          {vendorBusinessName} will respond
          {vendorResponseSlaHours ? ` within ${vendorResponseSlaHours} hours` : ' soon'} with a
          quote. We&rsquo;ll send you a notification — check your dashboard inbox.
        </p>
        <div className="mt-6 flex gap-3">
          <a
            href={`/dashboard/bookings/${state.bookingId}`}
            className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream transition-[transform,background-color] hover:bg-ink/90 active:scale-[0.96] motion-reduce:active:scale-100"
          >
            View in dashboard
          </a>
          <a
            href="/vendors"
            className="rounded-md border border-hairline px-4 py-2 text-sm font-semibold text-ink transition-[transform,border-color] hover:border-ink active:scale-[0.96] motion-reduce:active:scale-100"
          >
            Browse other vendors
          </a>
        </div>
      </div>
    );
  }

  const submitting = state.kind === 'submitting';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state.kind === 'error' && (
        <div
          role="alert"
          aria-live="assertive"
          className="text-pretty rounded-md bg-haldi/10 p-3 text-sm text-ink shadow-[0_1px_2px_rgba(180,140,40,0.10),0_4px_12px_rgba(180,140,40,0.06)]"
        >
          {state.message}
        </div>
      )}

      <fieldset>
        <legend className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Events
        </legend>

        {events.map((event) => (
          <div key={event.id} className="mb-3 rounded-md border border-ink/15 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div role="group" aria-labelledby={`date-label-${event.id}`}>
                <span
                  id={`date-label-${event.id}`}
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                >
                  Date
                </span>
                <DatePicker
                  selected={event.date}
                  onSelect={(v) => updateEvent(event.id, { date: v })}
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
                  onChange={(e) => updateEvent(event.id, { startTime: e.target.value })}
                  disabled={submitting}
                  className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                />
              </div>

              <div>
                <label
                  htmlFor={`guests-${event.id}`}
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                >
                  Guests
                </label>
                <input
                  id={`guests-${event.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={2000}
                  value={event.guestCount}
                  onChange={(e) =>
                    updateEvent(event.id, { guestCount: Number(e.target.value) || 1 })
                  }
                  disabled={submitting}
                  className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                />
              </div>

              <div role="group" aria-labelledby={`event-type-label-${event.id}`}>
                <span
                  id={`event-type-label-${event.id}`}
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                >
                  Event type
                </span>
                <EventTypePicker
                  value={event.eventTypeId}
                  onValueChange={(v) => updateEvent(event.id, { eventTypeId: v })}
                  disabled={submitting}
                />
              </div>
            </div>

            {events.length > 1 && (
              <button
                type="button"
                onClick={() => removeEvent(event.id)}
                disabled={submitting}
                className="relative mt-2 rounded px-2 py-1 text-xs text-ink-muted transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50"
              >
                Remove this event
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addEvent}
          disabled={submitting}
          className="relative rounded px-2 py-1 text-sm font-medium text-ink transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-hot-pink focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50"
        >
          + Add another event
        </button>
      </fieldset>

      <div>
        <label
          htmlFor="custom-request-description"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
        >
          What do you need?
        </label>
        <textarea
          id="custom-request-description"
          rows={6}
          minLength={50}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          placeholder="Tell the vendor what makes your event special — guest count breakdown, dietary needs, location, anything outside their standard packages…"
          required
          autoComplete="off"
          className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        />
        <p className="mt-1 text-xs tabular-nums text-ink-soft" aria-live="polite">
          {description.length} / 1000 · minimum 50 characters
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-[transform,background-color] hover:bg-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.96] motion-reduce:active:scale-100 disabled:opacity-60"
      >
        {submitting && (
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path
              d="M22 12a10 10 0 0 1-10 10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {submitting ? 'Sending request…' : 'Send request'}
      </button>
    </form>
  );
}
