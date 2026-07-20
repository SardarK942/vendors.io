import { describe, it, expect } from 'vitest';
import { createEventSchema } from '@/types';
import {
  toPayload,
  functionIndexForUid,
  pruneAllocations,
} from '@/components/events/wizard/wizard-state';
import type { WizardFunction, WizardState } from '@/components/events/wizard/wizard-state';

function fn(
  overrides: Partial<WizardFunction> & Pick<WizardFunction, 'uid' | 'label'>
): WizardFunction {
  return {
    event_type_id: null,
    date: null,
    guest_estimate: null,
    categories: [],
    booked: {},
    ...overrides,
  };
}

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    step: 5,
    name: "Amara's Wedding",
    celebration_type: 'wedding',
    city: 'Houston',
    totalBudgetCents: 500000,
    functions: [],
    allocations: {},
    tasks: [],
    ...overrides,
  };
}

describe('toPayload', () => {
  it('produces a payload that parses against createEventSchema for a full wizard state', () => {
    const state = baseState({
      functions: [
        fn({
          uid: 'f1',
          label: 'Mehndi',
          event_type_id: 'mehndi',
          date: '2026-08-01',
          guest_estimate: 80,
          categories: ['mehndi', 'catering'],
          booked: { catering: { name: 'Spice Route', amountCents: 120000 } },
        }),
        fn({
          uid: 'f2',
          label: 'Wedding',
          event_type_id: 'wedding',
          date: '2026-08-03',
          guest_estimate: 200,
          categories: ['venue', 'photography'],
          booked: {},
        }),
      ],
      allocations: { mehndi: 100000, catering: 150000, venue: 200000, photography: 50000 },
      tasks: [
        { title: 'Book venue for Wedding', due_date: null, function_uid: 'f2' },
        { title: 'Order outfits', due_date: '2026-07-20', function_uid: null },
      ],
    });

    const payload = toPayload(state);
    const parsed = createEventSchema.parse(payload);

    expect(parsed.functions).toHaveLength(2);
    expect(parsed.tasks[0]?.function_index).toBe(1);
    expect(parsed.tasks[1]?.function_index).toBeNull();
    expect(parsed.allocations).toHaveLength(4);
  });

  it('sets function_index to null (not stale) when the linked function is removed', () => {
    const stateWithFunction = baseState({
      functions: [
        fn({ uid: 'f1', label: 'Mehndi', categories: ['mehndi'] }),
        fn({ uid: 'f2', label: 'Wedding', categories: ['venue'] }),
      ],
      tasks: [{ title: 'Book mehndi artist', due_date: null, function_uid: 'f1' }],
    });

    // Simulate back-navigation removal of the function the task pointed at.
    const afterRemoval: WizardState = {
      ...stateWithFunction,
      functions: stateWithFunction.functions.filter((f) => f.uid !== 'f1'),
    };

    const payload = toPayload(afterRemoval);
    const parsed = createEventSchema.parse(payload);

    expect(payload.functions).toHaveLength(1);
    expect(parsed.tasks[0]?.function_index).toBeNull();
  });

  it("keeps a task pointing at a middle function's NEW index after an earlier function is removed", () => {
    const state = baseState({
      functions: [
        fn({ uid: 'f1', label: 'Mehndi', categories: ['mehndi'] }),
        fn({ uid: 'f2', label: 'Sangeet', categories: ['dj'] }),
        fn({ uid: 'f3', label: 'Wedding', categories: ['venue'] }),
      ],
      tasks: [{ title: 'Book DJ for Sangeet', due_date: null, function_uid: 'f2' }],
    });

    // Remove the FIRST function (f1) — f2 (the linked one) shifts from index 1 to index 0.
    const afterRemoval: WizardState = {
      ...state,
      functions: state.functions.filter((f) => f.uid !== 'f1'),
    };

    const payload = toPayload(afterRemoval);
    const parsed = createEventSchema.parse(payload);

    // f2 is now at index 0 (was 1), f3 is now at index 1 (was 2).
    expect(payload.functions[0]?.label).toBe('Sangeet');
    expect(parsed.tasks[0]?.function_index).toBe(0);
  });

  it('prunes allocation entries whose category is no longer selected by any function', () => {
    const state = baseState({
      functions: [fn({ uid: 'f1', label: 'Wedding', categories: ['venue'] })],
      // 'catering' was allocated while a now-removed/edited function still had it selected.
      allocations: { venue: 300000, catering: 200000 },
    });

    const payload = toPayload(state);
    const parsed = createEventSchema.parse(payload);

    expect(payload.allocations).toEqual([{ category: 'venue', planned_cents: 300000 }]);
    expect(parsed.allocations.map((a) => a.category)).toEqual(['venue']);
  });
});

describe('functionIndexForUid', () => {
  it('returns null for a null uid', () => {
    expect(functionIndexForUid([fn({ uid: 'f1', label: 'A' })], null)).toBeNull();
  });

  it('returns null when the uid is not found among functions', () => {
    expect(functionIndexForUid([fn({ uid: 'f1', label: 'A' })], 'missing')).toBeNull();
  });

  it('returns the current index of the matching function', () => {
    const functions = [fn({ uid: 'f1', label: 'A' }), fn({ uid: 'f2', label: 'B' })];
    expect(functionIndexForUid(functions, 'f2')).toBe(1);
  });
});

describe('pruneAllocations', () => {
  it("drops categories not present in any function's selected categories", () => {
    const functions = [fn({ uid: 'f1', label: 'A', categories: ['venue', 'dj'] })];
    const result = pruneAllocations({ venue: 100, dj: 200, catering: 300 }, functions);
    expect(result).toEqual({ venue: 100, dj: 200 });
  });

  it('keeps everything when all allocation categories are still selected', () => {
    const functions = [fn({ uid: 'f1', label: 'A', categories: ['venue'] })];
    const result = pruneAllocations({ venue: 100 }, functions);
    expect(result).toEqual({ venue: 100 });
  });
});
