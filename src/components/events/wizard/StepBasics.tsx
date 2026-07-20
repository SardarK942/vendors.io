'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EventTypePicker } from '@/components/ui/EventTypePicker';
import type { EventTypeId } from '@/types';

interface StepBasicsProps {
  name: string;
  celebrationType: string;
  city: string;
  hasCoupleName: boolean;
  onChange: (patch: { name?: string; celebration_type?: string; city?: string }) => void;
}

export function StepBasics({
  name,
  celebrationType,
  city,
  hasCoupleName,
  onChange,
}: StepBasicsProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
          Step 1 of 5
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink">Let&apos;s set up your event</h1>
        <p className="mt-1 text-sm text-ink-soft">
          A few basics to get your planning space started.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-name">Event name</Label>
        <Input
          id="event-name"
          value={name}
          placeholder={hasCoupleName ? undefined : "e.g. Priya & Zain's Wedding"}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="celebration-type">Celebration type</Label>
        <EventTypePicker
          id="celebration-type"
          value={celebrationType ? (celebrationType as EventTypeId) : undefined}
          onValueChange={(id) => onChange({ celebration_type: id })}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-city">City (optional)</Label>
        <Input
          id="event-city"
          value={city}
          placeholder="Chicago"
          onChange={(e) => onChange({ city: e.target.value })}
        />
      </div>
    </div>
  );
}
