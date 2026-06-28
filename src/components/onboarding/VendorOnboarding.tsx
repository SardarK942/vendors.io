'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES } from '@/types';
import { SAMPLE_VENDOR_REQUESTS } from '@/lib/onboarding/sample-vendor-requests';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorOnboarding({ open, onOpenChange }: Props): React.JSX.Element {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [eventTypes, setEventTypes] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  async function submitOnboarding(skipped: boolean) {
    setSubmitting(true);
    try {
      const body = skipped
        ? { skipped: true, data: null }
        : { skipped: false, data: { event_types: eventTypes } };
      await fetch('/api/users/onboarding-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Also persist event types to vendor_profiles.served_event_types
      if (!skipped && eventTypes.length > 0) {
        await fetch('/api/vendor-profile/setup/event-types', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ served_event_types: eventTypes }),
        }).catch(() => {});
      }
    } finally {
      setSubmitting(false);
      onOpenChange(false);
      router.push('/dashboard/profile/setup/basics');
    }
  }

  if (step === 1) {
    const allTypes = [...CULTURAL_EVENT_TYPES, ...GENERAL_EVENT_TYPES];
    const canContinue = eventTypes.length >= 1;
    return (
      <Dialog open={open} onOpenChange={(o) => !o && submitOnboarding(true)}>
        <DialogContent className="max-w-lg">
          <h2 className="text-2xl font-semibold text-ink">What types of events do you serve?</h2>
          <p className="mt-2 text-sm text-ink/70">Pick 1-5. You can change this later.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {allTypes.map((t) => {
              const isSelected = eventTypes.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setEventTypes(eventTypes.filter((c) => c !== t.id));
                    } else if (eventTypes.length < 5) {
                      setEventTypes([...eventTypes, t.id]);
                    }
                  }}
                  className={
                    isSelected
                      ? 'rounded-full bg-ink px-3 py-1 text-sm text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
                      : 'rounded-full border border-ink/20 px-3 py-1 text-sm text-ink hover-pink-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep(2)}
            className="mt-6 w-full rounded-md bg-ink py-3 font-medium text-cream hover:bg-hot-pink disabled:opacity-50"
          >
            Continue →
          </button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && submitOnboarding(false)}>
      <DialogContent className="max-w-lg">
        <h2 className="text-2xl font-semibold text-ink">
          Here’s what customer requests look like:
        </h2>

        <div className="mt-4 space-y-3">
          {SAMPLE_VENDOR_REQUESTS.map((req, i) => (
            <div key={i} className="rounded-md border border-ink/15 bg-cream p-4">
              <p className="text-sm font-medium text-ink">{req.event_type}</p>
              <p className="mt-1 text-xs text-ink/70">
                {req.date} · {req.guest_count} guests · {req.budget_range}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => submitOnboarding(false)}
          disabled={submitting}
          className="mt-6 w-full rounded-md bg-ink py-3 font-medium text-cream hover:bg-hot-pink"
        >
          Set up your profile →
        </button>
      </DialogContent>
    </Dialog>
  );
}
