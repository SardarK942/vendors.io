'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EVENT_TYPES, type CreateEventInput } from '@/types';
import { StepBasics } from './StepBasics';
import { StepFunctions } from './StepFunctions';
import { StepVendors } from './StepVendors';
import { StepBudget } from './StepBudget';
import { StepChecklist } from './StepChecklist';

// ─── Wizard state (single source of truth — passed down to every step) ────

export interface WizardFunction {
  label: string;
  event_type_id: string | null;
  date: string | null;
  guest_estimate: number | null;
  categories: string[];
  booked: Record<string, { name: string; amountCents: number | null }>;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  name: string;
  celebration_type: string;
  city: string;
  totalBudgetCents: number | null;
  functions: WizardFunction[];
  allocations: Record<string, number>;
  tasks: { title: string; due_date: string | null; function_index: number | null }[];
}

// Smart per-function-type vendor category defaults, seeded when a function
// enters Step 3 (Vendors) without any categories picked yet.
export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  mehndi: ['mehndi', 'decor', 'catering'],
  sangeet: ['dj', 'decor', 'catering'],
  nikah: ['venue', 'photography'],
  katb_el_kitab: ['venue', 'photography'],
  baraat: ['dj', 'videography'],
  wedding: ['venue', 'photography', 'catering', 'dj'],
  reception: ['venue', 'photography', 'catering', 'dj'],
  walima: ['venue', 'catering', 'photography'],
  laylat_al_henna: ['mehndi', 'decor', 'catering'],
  zaffa: ['dj', 'videography'],
};

function defaultFunctionFor(celebrationType: string): WizardFunction {
  const label = EVENT_TYPES.find((e) => e.id === celebrationType)?.label ?? celebrationType;
  return {
    label,
    event_type_id: celebrationType || null,
    date: null,
    guest_estimate: null,
    categories: DEFAULT_CATEGORIES[celebrationType] ?? [],
    booked: {},
  };
}

export function toPayload(s: WizardState): CreateEventInput {
  return {
    name: s.name.trim(),
    celebration_type: s.celebration_type,
    city: s.city.trim() || null,
    total_budget_cents: s.totalBudgetCents,
    functions: s.functions.map((f) => ({
      label: f.label,
      event_type_id: f.event_type_id,
      date: f.date,
      guest_estimate: f.guest_estimate,
      vendor_needs: f.categories.map((c) => ({
        category: c,
        manual_booked: c in f.booked,
        manual_vendor_name: f.booked[c]?.name ?? null,
        manual_amount_cents: f.booked[c]?.amountCents ?? null,
      })),
    })),
    allocations: Object.entries(s.allocations).map(([category, planned_cents]) => ({
      category,
      planned_cents,
    })),
    tasks: s.tasks,
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
  const allocationCategories = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const f of state.functions) {
      for (const c of f.categories) {
        if (!seen.has(c)) {
          seen.add(c);
          ordered.push(c);
        }
      }
    }
    return ordered;
  }, [state.functions]);

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
