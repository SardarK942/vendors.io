'use client';

import * as React from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { EventTypePicker } from '@/components/ui/EventTypePicker';
import { customRequestSchema } from '@/lib/booking/custom-request-validation';
import type { EventTypeId } from '@/types';

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

export function CustomRequestForm({
  vendorSlug,
  vendorBusinessName,
  vendorResponseSlaHours,
}: CustomRequestFormProps) {
  const [eventDate, setEventDate] = React.useState('');
  const [guestCount, setGuestCount] = React.useState<number | ''>('');
  const [eventType, setEventType] = React.useState<EventTypeId>('mehndi');
  const [description, setDescription] = React.useState('');
  const [state, setState] = React.useState<FormState>({ kind: 'default' });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.kind === 'submitting' || state.kind === 'success') return;

    const parsed = customRequestSchema.safeParse({
      vendor_slug: vendorSlug,
      event_date: eventDate,
      guest_count: typeof guestCount === 'number' ? guestCount : Number(guestCount),
      event_type: eventType,
      description,
    });

    if (!parsed.success) {
      setState({
        kind: 'error',
        message: parsed.error.issues[0]?.message ?? 'Please complete every field.',
      });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/bookings/custom-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({ kind: 'error', message: "Couldn't send your request — try again." });
        return;
      }
      setState({ kind: 'success', bookingId: json.booking_id });
    } catch {
      setState({ kind: 'error', message: "Couldn't send your request — try again." });
    }
  };

  if (state.kind === 'success') {
    return (
      <div className="rounded-lg border border-hairline bg-cream p-8 text-ink">
        <h2 className="font-display text-2xl font-bold tracking-[-0.012em]">Request sent.</h2>
        <p className="mt-3 text-sm text-ink-muted">
          {vendorBusinessName} will respond
          {vendorResponseSlaHours ? ` within ${vendorResponseSlaHours} hours` : ' soon'} with a
          quote. We&rsquo;ll send you a notification — check your dashboard inbox.
        </p>
        <div className="mt-6 flex gap-3">
          <a
            href={`/dashboard/bookings/${state.bookingId}`}
            className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-ink/90"
          >
            View in dashboard
          </a>
          <a
            href="/vendors"
            className="rounded-md border border-hairline px-4 py-2 text-sm font-semibold text-ink hover:border-ink"
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
          className="rounded-md border border-haldi/40 bg-haldi/10 p-3 text-sm text-ink"
        >
          {state.message}
        </div>
      )}

      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Event date
        </label>
        <DatePicker selected={eventDate} onSelect={setEventDate} />
      </div>

      <div>
        <label
          htmlFor="custom-request-guest-count"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
        >
          Guest count
        </label>
        <input
          id="custom-request-guest-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={2000}
          value={guestCount}
          onChange={(e) => setGuestCount(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={submitting}
          required
          className="w-40 rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Event type
        </label>
        <div className="w-60">
          <EventTypePicker value={eventType} onValueChange={setEventType} disabled={submitting} />
        </div>
      </div>

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
          placeholder="Tell the vendor what makes your event special — guest count breakdown, dietary needs, location, anything outside their standard packages."
          required
          className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-xs text-ink-soft">
          {description.length} / 1000 · minimum 50 characters
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {submitting ? 'Sending request…' : 'Send request'}
      </button>
    </form>
  );
}
