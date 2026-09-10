'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { CreatedFunction } from '@/services/events.service';
import { attachBookingToFunction } from '@/lib/events/attach-booking';
import { EVENT_TYPES } from '@/types';
import { StepBasics } from './StepBasics';
import { StepFunctions } from './StepFunctions';
import { StepVendors } from './StepVendors';
import { StepBudget } from './StepBudget';
import { StepChecklist } from './StepChecklist';
import {
  DEFAULT_CATEGORIES,
  allocationCategoriesFor,
  toPayload,
  type WizardFunction,
  type WizardState,
} from './wizard-state';

// ─── Wizard state (single source of truth — passed down to every step) ────
// The state shape itself, plus the pure toPayload/allocation helpers, live in
// ./wizard-state.ts so they're importable without React (unit tests, etc).

export type { WizardFunction, WizardState, WizardTask } from './wizard-state';
export { DEFAULT_CATEGORIES, toPayload } from './wizard-state';

function defaultFunctionFor(celebrationType: string): WizardFunction {
  const label = EVENT_TYPES.find((e) => e.id === celebrationType)?.label ?? celebrationType;
  return {
    uid: crypto.randomUUID(),
    label,
    event_type_id: celebrationType || null,
    date: null,
    guest_estimate: null,
    categories: DEFAULT_CATEGORIES[celebrationType] ?? [],
    booked: {},
  };
}

const STEP_COUNT = 5;

interface EventWizardProps {
  coupleName: string | null;
  defaultCity?: string;
}

function BaazarWordmark() {
  return (
    <span className="font-display text-xl font-medium lowercase tracking-tight text-ink">
      baazar<span className="text-hot-pink">.</span>
    </span>
  );
}

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${STEP_COUNT}`}>
      {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((dot) => (
        <span
          key={dot}
          aria-hidden="true"
          className={
            dot <= step
              ? 'h-1.5 w-1.5 rounded-full bg-indigo'
              : 'h-1.5 w-1.5 rounded-full bg-hairline'
          }
        />
      ))}
    </div>
  );
}

function fmtFnDate(d: string | null): string {
  if (!d) return 'date TBD';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EventWizard({ coupleName, defaultCity = '' }: EventWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // When arriving from "Start your celebration plan →" on a booking, this carries
  // the booking to fold into the new plan once it's created (book-first, plan-after).
  const attachBookingId = searchParams.get('attachBooking');
  const [submitting, setSubmitting] = useState(false);
  // Option C: after creating a multi-function event, ask which function the
  // carried booking belongs to before finishing.
  const [pendingAttach, setPendingAttach] = useState<{
    eventId: string;
    functions: CreatedFunction[];
  } | null>(null);
  const [selectedFn, setSelectedFn] = useState('');
  const [state, setState] = useState<WizardState>(() => ({
    step: 1,
    name: coupleName ? `${coupleName}'s Wedding` : '',
    celebration_type: '',
    city: defaultCity,
    totalBudgetCents: null,
    functions: [],
    allocations: {},
    tasks: [],
  }));

  const canProceedStep1 = state.name.trim().length > 0 && state.celebration_type.length > 0;
  const isLastStep = state.step === 5;

  // Union of every category selected across functions — Step 4's slider set.
  const allocationCategories = useMemo(
    () => allocationCategoriesFor(state.functions),
    [state.functions]
  );

  function goBack() {
    setState((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) as WizardState['step'] }));
  }

  // Shared by "Next" and "Skip for now": guarantees at least one function
  // exists before leaving Step 2 (createEventSchema requires functions.min(1)),
  // and seeds DEFAULT_CATEGORIES for any function still missing categories.
  function goNext() {
    setState((prev) => {
      let functions = prev.functions;
      if (prev.step === 2) {
        if (functions.length === 0) {
          functions = [defaultFunctionFor(prev.celebration_type)];
        } else {
          functions = functions.map((f) =>
            f.categories.length === 0
              ? { ...f, categories: DEFAULT_CATEGORIES[f.event_type_id ?? ''] ?? [] }
              : f
          );
        }
      }
      return { ...prev, functions, step: Math.min(5, prev.step + 1) as WizardState['step'] };
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(state)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: null }));
        toast.error(body?.error ?? 'Could not create your event. Please try again.');
        setSubmitting(false);
        return;
      }
      const { eventId, functions } = (await res.json()) as {
        eventId: string;
        functions: CreatedFunction[];
      };

      // Book-first, plan-after: fold the carried booking into the new plan.
      if (attachBookingId && functions.length > 0) {
        if (functions.length === 1) {
          await attachBookingToFunction(attachBookingId, functions[0].id);
          toast.success(`Added your booking to ${functions[0].label}.`);
          router.push(`/dashboard/events/${eventId}`);
          return;
        }
        // Option C: more than one function — ask which one the booking is for.
        setSelectedFn(functions[0].id);
        setPendingAttach({ eventId, functions });
        setSubmitting(false);
        return;
      }

      router.push(`/dashboard/events/${eventId}`);
    } catch {
      toast.error('Could not create your event. Please try again.');
      setSubmitting(false);
    }
  }

  async function confirmAttach() {
    if (!pendingAttach || !attachBookingId) return;
    setSubmitting(true);
    const ok = await attachBookingToFunction(attachBookingId, selectedFn);
    const fn = pendingAttach.functions.find((f) => f.id === selectedFn);
    if (ok) {
      toast.success(`Added your booking to ${fn?.label ?? 'your plan'}.`);
    } else {
      // The event exists; only the link failed — they can attach it from the plan.
      toast.error('Could not attach the booking — you can add it from your plan.');
    }
    router.push(`/dashboard/events/${pendingAttach.eventId}`);
  }

  function handleSkip() {
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    goNext();
  }

  function handleNextClick() {
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    goNext();
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-4 sm:px-8">
        <BaazarWordmark />
        <ProgressDots step={state.step} />
        <Button
          variant="tertiary"
          size="sm"
          type="button"
          onClick={() => router.push('/dashboard')}
        >
          Exit
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        {state.step === 1 && (
          <StepBasics
            name={state.name}
            celebrationType={state.celebration_type}
            city={state.city}
            hasCoupleName={coupleName != null}
            onChange={(patch) => setState((prev) => ({ ...prev, ...patch }))}
          />
        )}
        {state.step === 2 && (
          <StepFunctions
            celebrationType={state.celebration_type}
            functions={state.functions}
            onChange={(functions) => setState((prev) => ({ ...prev, functions }))}
          />
        )}
        {state.step === 3 && (
          <StepVendors
            functions={state.functions}
            onChange={(functions) => setState((prev) => ({ ...prev, functions }))}
          />
        )}
        {state.step === 4 && (
          <StepBudget
            totalBudgetCents={state.totalBudgetCents}
            allocations={state.allocations}
            categories={allocationCategories}
            onTotalChange={(totalBudgetCents) =>
              setState((prev) => ({ ...prev, totalBudgetCents }))
            }
            onAllocationsChange={(allocations) => setState((prev) => ({ ...prev, allocations }))}
          />
        )}
        {state.step === 5 && (
          <StepChecklist
            functions={state.functions}
            tasks={state.tasks}
            onChange={(tasks) => setState((prev) => ({ ...prev, tasks }))}
          />
        )}
      </main>

      <footer className="border-t border-hairline px-4 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
          <div>
            {state.step > 1 && (
              <Button variant="tertiary" type="button" onClick={goBack}>
                ‹ Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state.step > 1 && (
              <Button variant="tertiary" type="button" onClick={handleSkip} disabled={submitting}>
                Skip for now
              </Button>
            )}
            <Button
              variant="primary"
              type="button"
              onClick={handleNextClick}
              disabled={(state.step === 1 && !canProceedStep1) || submitting}
              isLoading={submitting && isLastStep}
            >
              {isLastStep ? 'Finish setup →' : 'Next'}
            </Button>
          </div>
        </div>
      </footer>

      {/* Option C: which function is the carried booking for? */}
      <Dialog
        open={pendingAttach !== null}
        onOpenChange={(open) => {
          // Dismissing without choosing still finishes — land them on the plan,
          // with the booking unattached (recoverable from the plan's link picker).
          if (!open && pendingAttach) router.push(`/dashboard/events/${pendingAttach.eventId}`);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Which part of your celebration is this booking for?</DialogTitle>
            <DialogDescription>We’ll add it there. You can move it anytime.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" className="grid gap-2">
            {pendingAttach?.functions.map((f) => (
              <label
                key={f.id}
                className={
                  selectedFn === f.id
                    ? 'flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-indigo bg-indigo/5 px-4 py-2.5 text-sm font-semibold text-indigo'
                    : 'flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-hairline px-4 py-2.5 text-sm text-ink hover:border-indigo/50'
                }
              >
                <input
                  type="radio"
                  name="attach-fn"
                  value={f.id}
                  checked={selectedFn === f.id}
                  onChange={() => setSelectedFn(f.id)}
                  className="accent-indigo"
                />
                {f.label} · {fmtFnDate(f.date)}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" onClick={confirmAttach} disabled={submitting || !selectedFn}>
              Add to plan &amp; finish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
