'use client';

import * as React from 'react';
import type { EventTypeId } from '@/types';
import type { BudgetRange } from '@/lib/booking/custom-request-validation';
import { Step1Shape } from './steps/Step1Shape';
import { Step2Details } from './steps/Step2Details';
import { Step3Review } from './steps/Step3Review';

export type CustomEvent = {
  id: string;
  date: string;
  startTime: string;
  guestCount: string; // string during edit; coerced on submit
  eventTypeId: EventTypeId;
};

export interface CustomRequestFlowProps {
  vendorSlug: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
  onClose?: () => void;
}

function makeBlankEvent(): CustomEvent {
  return {
    id: crypto.randomUUID(),
    date: '',
    startTime: '',
    guestCount: '50',
    eventTypeId: 'wedding',
  };
}

export function CustomRequestFlow({
  vendorSlug,
  vendorBusinessName,
  vendorResponseSlaHours,
  onClose,
}: CustomRequestFlowProps) {
  const [stepIndex, setStepIndex] = React.useState<0 | 1 | 2>(0);
  const [isMultiDay, setIsMultiDay] = React.useState(false);
  const [dayCount, setDayCount] = React.useState(3);
  const [events, setEvents] = React.useState<CustomEvent[]>([makeBlankEvent()]);
  const [eventCity, setEventCity] = React.useState('');
  const [venueName, setVenueName] = React.useState('');
  const [budgetRange, setBudgetRange] = React.useState<BudgetRange | null>(null);
  const [description, setDescription] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [successBookingId, setSuccessBookingId] = React.useState<string | null>(null);

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings/custom-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vendor_slug: vendorSlug,
          is_multi_day: isMultiDay,
          events: events.map((e) => ({
            date: e.date,
            startTime: e.startTime,
            guestCount: Math.max(1, Number(e.guestCount) || 1),
            eventTypeId: e.eventTypeId,
          })),
          event_city: eventCity.trim() || null,
          venue_name: venueName.trim() || null,
          budget_range: budgetRange,
          description,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSubmitError('We couldn’t send your request — please try again.');
        return;
      }
      setSuccessBookingId(json.booking_id);
    } catch {
      setSubmitError('We couldn’t send your request — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function goToStep2() {
    // Reconcile the events array with the shape decision.
    if (isMultiDay) {
      setEvents((prev) => {
        const target = dayCount;
        if (prev.length === target) return prev;
        if (prev.length < target) {
          return [...prev, ...Array.from({ length: target - prev.length }, makeBlankEvent)];
        }
        return prev.slice(0, target);
      });
    } else {
      setEvents((prev) => (prev.length === 1 ? prev : [prev[0]]));
    }
    setStepIndex(1);
  }

  return (
    <div className="mx-auto max-w-3xl">
      {stepIndex === 0 && (
        <Step1Shape
          isMultiDay={isMultiDay}
          dayCount={dayCount}
          onChange={(v) => {
            setIsMultiDay(v.isMultiDay);
            setDayCount(v.dayCount);
          }}
          onContinue={goToStep2}
          onCancel={onClose}
        />
      )}
      {stepIndex === 1 && (
        <Step2Details
          isMultiDay={isMultiDay}
          events={events}
          onEventsChange={setEvents}
          eventCity={eventCity}
          onEventCityChange={setEventCity}
          venueName={venueName}
          onVenueNameChange={setVenueName}
          budgetRange={budgetRange}
          onBudgetRangeChange={setBudgetRange}
          description={description}
          onDescriptionChange={setDescription}
          onBack={() => setStepIndex(0)}
          onContinue={() => setStepIndex(2)}
        />
      )}
      {stepIndex === 2 && !successBookingId && (
        <Step3Review
          isMultiDay={isMultiDay}
          events={events}
          eventCity={eventCity}
          venueName={venueName}
          budgetRange={budgetRange}
          description={description}
          vendorBusinessName={vendorBusinessName}
          vendorResponseSlaHours={vendorResponseSlaHours}
          onBack={() => setStepIndex(1)}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      )}
      {successBookingId && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-hairline bg-cream p-8 text-ink"
        >
          <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.012em]">
            Request sent.
          </h2>
          <p className="mt-3 text-sm text-ink-muted">
            {vendorBusinessName} will respond
            {vendorResponseSlaHours ? ` within ${vendorResponseSlaHours} hours` : ' soon'} with a
            quote. We&apos;ll send you a notification — check your dashboard inbox.
          </p>
          <div className="mt-6 flex gap-3">
            <a
              href={`/dashboard/bookings/${successBookingId}`}
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream transition-[background-color,transform] hover:bg-hot-pink active:scale-[0.96] motion-reduce:active:scale-100"
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
      )}
    </div>
  );
}
