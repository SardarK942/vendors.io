// Pure wizard state helpers — no React imports. Kept separate from
// EventWizard.tsx so the state-shaping logic (toPayload, allocation pruning,
// function-uid resolution) is independently unit-testable.
//
// Functions are identified by a stable `uid` (assigned once at creation, see
// EventWizard.tsx's `defaultFunctionFor` / StepFunctions.tsx's
// `emptyFunction`) rather than their array index, because back-navigation
// lets the user remove or reorder functions after tasks/allocations already
// reference them. Indices shift; uids don't.

import type { CreateEventInput } from '@/types';

export interface WizardFunction {
  uid: string;
  label: string;
  event_type_id: string | null;
  date: string | null;
  guest_estimate: number | null;
  categories: string[];
  booked: Record<string, { name: string; amountCents: number | null }>;
}

export interface WizardTask {
  title: string;
  due_date: string | null;
  /** Stable function uid, or null for a task not tied to any function. */
  function_uid: string | null;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  name: string;
  celebration_type: string;
  city: string;
  totalBudgetCents: number | null;
  functions: WizardFunction[];
  allocations: Record<string, number>;
  tasks: WizardTask[];
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

/** Union of every category selected across functions, in first-seen order. */
export function allocationCategoriesFor(functions: WizardFunction[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const f of functions) {
    for (const c of f.categories) {
      if (!seen.has(c)) {
        seen.add(c);
        ordered.push(c);
      }
    }
  }
  return ordered;
}

/**
 * Drops allocation entries whose category is no longer selected by any
 * function — e.g. a category was deselected in Step 3 after Step 4 already
 * had a slider value for it.
 */
export function pruneAllocations(
  allocations: Record<string, number>,
  functions: WizardFunction[]
): Record<string, number> {
  const live = new Set(allocationCategoriesFor(functions));
  const result: Record<string, number> = {};
  for (const [category, cents] of Object.entries(allocations)) {
    if (live.has(category)) result[category] = cents;
  }
  return result;
}

/**
 * Resolves a task's stable function_uid to the function's CURRENT array
 * index. Returns null if the uid is null or no longer matches any function
 * (the function was removed via back-navigation) — the task survives,
 * unlinked, rather than pointing at a stale/wrong index.
 */
export function functionIndexForUid(
  functions: WizardFunction[],
  uid: string | null
): number | null {
  if (uid == null) return null;
  const idx = functions.findIndex((f) => f.uid === uid);
  return idx === -1 ? null : idx;
}

export function toPayload(s: WizardState): CreateEventInput {
  const prunedAllocations = pruneAllocations(s.allocations, s.functions);
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
        // Trimmed so a whitespace-only name normalizes to null and fails the
        // schema's manual_booked → non-empty-name requirement, same as an
        // outright-empty name would.
        manual_vendor_name: f.booked[c]?.name.trim() || null,
        manual_amount_cents: f.booked[c]?.amountCents ?? null,
      })),
    })),
    allocations: Object.entries(prunedAllocations).map(([category, planned_cents]) => ({
      category,
      planned_cents,
    })),
    tasks: s.tasks.map((t) => ({
      title: t.title,
      due_date: t.due_date,
      function_index: functionIndexForUid(s.functions, t.function_uid),
    })),
  };
}
