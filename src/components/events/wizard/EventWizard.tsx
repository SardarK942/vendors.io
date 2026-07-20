'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

export function EventWizard({ coupleName, defaultCity = '' }: EventWizardProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
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
      const { eventId } = (await res.json()) as { eventId: string };
      router.push(`/dashboard/events/${eventId}`);
    } catch {
      toast.error('Could not create your event. Please try again.');
      setSubmitting(false);
    }
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
          Save &amp; exit
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
    </div>
  );
}
