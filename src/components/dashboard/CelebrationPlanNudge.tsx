'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { EventOption } from '@/components/events/EventFunctionSelect';

interface Props {
  bookingId: string;
  vendorName: string;
  /** The couple's existing events + functions (from getEventOptions). */
  eventOptions: EventOption[];
}

const PLAN_TOOLTIP =
  'A celebration plan keeps everything in one place — your budget, a checklist, and all the ' +
  'vendors you’ve booked across every function. We’ll add this booking to it automatically.';

function fmtDate(d: string | null): string {
  if (!d) return 'date TBD';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Shown on a couple's booking detail page when the booking isn't yet part of an
 * event plan. Encapsulates the "book first, plan after" nudge: start a new plan
 * (deep-links into the wizard carrying this booking) or attach to an existing
 * function right here.
 */
export function CelebrationPlanNudge({ bookingId, vendorName, eventOptions }: Props) {
  const router = useRouter();
  const hasEvents = eventOptions.length > 0;
  const flatFunctions = eventOptions.flatMap((e) =>
    e.functions.map((f) => ({
      ...f,
      eventName: e.eventName,
      showEvent: eventOptions.length > 1,
    }))
  );
  const [selected, setSelected] = useState(flatFunctions[0]?.id ?? '');
  const [attaching, setAttaching] = useState(false);
  const newPlanHref = `/events/new?attachBooking=${bookingId}`;

  async function attach() {
    if (!selected || attaching) return;
    setAttaching(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_function_id: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: null }));
        toast.error(body?.error ?? 'Could not add this booking to your plan.');
        return;
      }
      toast.success('Added to your celebration plan.');
      router.refresh();
    } catch {
      toast.error('Could not add this booking to your plan.');
    } finally {
      setAttaching(false);
    }
  }

  return (
    <section className="rounded-lg border border-indigo/20 bg-indigo/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">
          Your celebration is bigger than one booking.
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="What’s a celebration plan?"
              className="shrink-0 rounded-full p-1 text-indigo/70 hover:text-indigo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
            >
              <Info className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs leading-relaxed">{PLAN_TOOLTIP}</TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/75">
        Keep it all in one place — budget, checklist, and every vendor you’ve booked across your
        mehndi, baraat, and walima.
      </p>

      {hasEvents ? (
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-ink">
            Add <span className="font-semibold">{vendorName}</span> to a function
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-hairline bg-cream p-2 text-sm text-ink"
            >
              {flatFunctions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.showEvent ? `${f.eventName} — ` : ''}
                  {f.label} · {fmtDate(f.date)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={attach} disabled={attaching || !selected}>
              {attaching ? 'Adding…' : 'Add to plan'}
            </Button>
            <Link href={newPlanHref} className="text-sm text-ink underline hover-pink-text">
              or start a new celebration plan →
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button asChild size="lg">
            <Link href={newPlanHref}>Start your celebration plan →</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

export default CelebrationPlanNudge;
