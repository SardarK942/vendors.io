'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES } from '@/types';
import { VendorCard } from '@/components/marketplace/VendorCard';
import { SavedVendorsProvider } from '@/components/marketplace/SavedVendorsProvider';
import type { Database } from '@/types/database.types';

type VendorProfileRow = Database['public']['Tables']['vendor_profiles']['Row'];

export interface CoupleOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type StepState =
  | { step: 0 }
  | { step: 1; hasEvent: true; date: string; categories: string[] }
  | { step: 2; hasEvent: boolean; categories: string[] };

export function CoupleOnboarding({ open, onOpenChange }: CoupleOnboardingProps): React.JSX.Element {
  const router = useRouter();
  const [state, setState] = React.useState<StepState>({ step: 0 });
  const [vendors, setVendors] = React.useState<VendorProfileRow[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  // Fetch preview vendors when entering Step 2
  React.useEffect(() => {
    if (state.step !== 2) return;
    const params = new URLSearchParams();
    if (state.categories.length > 0) params.set('categories', state.categories.join(','));
    fetch(`/api/users/me/preview-vendors?${params.toString()}`)
      .then((r) => r.json())
      .then((j: { data: VendorProfileRow[] }) => setVendors(j.data ?? []))
      .catch(() => setVendors([]));
  }, [state]);

  async function submitOnboarding(skipped: boolean) {
    setSubmitting(true);
    try {
      const body = skipped
        ? { skipped: true, data: null }
        : {
            skipped: false,
            data: {
              event_date: state.step === 1 ? state.date : null,
              categories: state.step === 1 ? state.categories : [],
              just_browsing: state.step === 0 || (state.step === 2 && !state.hasEvent),
            },
          };
      await fetch('/api/users/onboarding-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } finally {
      setSubmitting(false);
      onOpenChange(false);
      router.push('/vendors');
    }
  }

  // Step 0 — branching choice
  if (state.step === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <h2 className="text-balance text-2xl font-semibold text-ink">
            Are you planning an event?
          </h2>
          <p className="mt-2 text-sm text-ink/70">Tell us so we can show you the right vendors.</p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => setState({ step: 1, hasEvent: true, date: '', categories: [] })}
              className="w-full rounded-md border-2 border-ink p-4 text-left transition-[transform,border-color,color] hover:border-hot-pink hover:text-hot-pink active:scale-[0.98] motion-reduce:active:scale-100"
            >
              <p className="font-medium">Yes, I have an event coming up</p>
              <p className="mt-1 text-xs text-ink/60">We’ll personalize your recommendations.</p>
            </button>
            <button
              type="button"
              onClick={() => setState({ step: 2, hasEvent: false, categories: [] })}
              className="w-full rounded-md border border-ink/30 p-4 text-left transition-[transform,border-color,color] hover:border-hot-pink hover:text-hot-pink active:scale-[0.98] motion-reduce:active:scale-100"
            >
              <p className="font-medium">Just browsing for now</p>
              <p className="mt-1 text-xs text-ink/60">We’ll show you what’s popular.</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 1 — date + categories
  if (state.step === 1) {
    const allTypes = [...CULTURAL_EVENT_TYPES, ...GENERAL_EVENT_TYPES];
    const canContinue = state.date && state.categories.length > 0;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <h2 className="text-balance text-2xl font-semibold text-ink">Tell us about your event</h2>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">Event date</span>
              <input
                type="date"
                value={state.date}
                onChange={(e) => setState({ ...state, date: e.target.value })}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2"
              />
            </label>

            <div>
              <span className="text-sm font-medium text-ink">Categories (max 3)</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {allTypes.map((t) => {
                  const isSelected = state.categories.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setState({
                            ...state,
                            categories: state.categories.filter((c) => c !== t.id),
                          });
                        } else if (state.categories.length < 3) {
                          setState({ ...state, categories: [...state.categories, t.id] });
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
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => setState({ step: 0 })}
              className="text-sm text-ink/70 hover-pink-text"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setState({ step: 2, hasEvent: true, categories: state.categories })}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream transition-[transform,background-color] hover:bg-hot-pink active:scale-[0.96] disabled:opacity-50 motion-reduce:active:scale-100"
            >
              <span className="inline-flex items-center gap-1.5">
                Continue
                <ArrowRight className="size-4 translate-y-[0.5px]" aria-hidden="true" />
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 2 — preview vendors with hearts. ESC / outside-click closes the modal
  // WITHOUT submitting; only the explicit "Start exploring" CTA submits.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <h2 className="text-balance text-2xl font-semibold text-ink">Here’s what we found</h2>
        <p className="mt-2 text-sm text-ink/70">
          Heart your favorites — they’ll be saved to your shortlist.
        </p>

        <SavedVendorsProvider>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {vendors.map((v) => (
              <VendorCard key={v.id} vendor={v} compact />
            ))}
            {vendors.length === 0 && (
              <p className="col-span-3 py-8 text-center text-sm text-ink/50">Loading vendors…</p>
            )}
          </div>
        </SavedVendorsProvider>

        <button
          type="button"
          onClick={() => submitOnboarding(false)}
          disabled={submitting}
          className="mt-6 w-full rounded-md bg-ink py-3 font-medium text-cream transition-[transform,background-color] hover:bg-hot-pink active:scale-[0.96] motion-reduce:active:scale-100"
        >
          <span className="inline-flex items-center gap-1.5">
            Start exploring
            <ArrowRight className="size-4 translate-y-[0.5px]" aria-hidden="true" />
          </span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
