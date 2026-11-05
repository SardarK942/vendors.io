import { Clock, Hourglass, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/dashboard/kit';
import { CapacityField } from '@/components/dashboard/CapacityField';

interface Props {
  capacity: number;
}

export function AvailabilityPanel({ capacity }: Props) {
  return (
    <SectionCard>
      <h2 className="font-display text-lg text-ink">Your Availability</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Set your working hours and buffer time between events.
      </p>

      <div className="mt-4 space-y-3">
        {/* STUB: Working Hours — static display, Edit is inert. */}
        {/* TODO(backend): working hours */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo/10">
              <Clock className="size-4 text-indigo" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Working Hours</p>
              <p className="text-xs text-ink-soft">9:00 AM – 10:00 PM</p>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </div>

        {/* STUB: Buffer Time — static display, Edit is inert. */}
        {/* TODO(backend): buffer time */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo/10">
              <Hourglass className="size-4 text-indigo" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Buffer Time</p>
              <p className="text-xs text-ink-soft">30 minutes</p>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </div>

        {/* REAL: Concurrent Capacity — functional control (CapacityField). */}
        <div className="rounded-xl border border-hairline bg-white px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo/10">
              <Users className="size-4 text-indigo" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-ink">Concurrent Capacity</p>
          </div>
          <div className="mt-1">
            <CapacityField initial={capacity} />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
