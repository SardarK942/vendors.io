'use client';

import * as React from 'react';
import type { EventTypeId } from '@/types';
import type { BudgetRange } from '@/lib/booking/custom-request-validation';
import { Step1Shape } from './steps/Step1Shape';

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
        <div className="text-sm text-ink-muted">
          Step 2 renders here (implemented in Task 6). Current state:{' '}
          {isMultiDay ? 'multi' : 'single'}, {events.length} event(s), vendor {vendorBusinessName}.
        </div>
      )}
      {stepIndex === 2 && (
        <div className="text-sm text-ink-muted">Step 3 renders here (Task 7).</div>
      )}
    </div>
  );
}
