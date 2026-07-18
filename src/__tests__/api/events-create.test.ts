import { describe, it, expect } from 'vitest';
import { createEventSchema } from '@/types';

const valid = {
  name: "Mustafa & Ayesha's Wedding",
  celebration_type: 'wedding',
  city: 'Chicago',
  total_budget_cents: 3_000_000,
  functions: [
    {
      label: 'Mehndi',
      event_type_id: 'mehndi',
      date: '2026-08-27',
      guest_estimate: 150,
      vendor_needs: [
        {
          category: 'mehndi',
          manual_vendor_name: 'Henna by Zara',
          manual_amount_cents: 50000,
          manual_booked: true,
        },
        { category: 'decor' },
      ],
    },
  ],
  allocations: [{ category: 'venue', planned_cents: 900000 }],
  tasks: [{ title: 'Book decor for Mehndi', due_date: '2026-08-01', function_index: 0 }],
};

describe('createEventSchema', () => {
  it('accepts a full wizard payload', () => {
    expect(createEventSchema.parse(valid).functions[0].vendor_needs).toHaveLength(2);
  });
  it('requires at least one function', () => {
    expect(createEventSchema.safeParse({ ...valid, functions: [] }).success).toBe(false);
  });
  it('rejects malformed dates', () => {
    const bad = { ...valid, functions: [{ ...valid.functions[0], date: '08/27/2026' }] };
    expect(createEventSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects tasks whose function_index is out of range', () => {
    const bad = { ...valid, tasks: [{ title: 'Orphan task', due_date: null, function_index: 5 }] };
    expect(createEventSchema.safeParse(bad).success).toBe(false);
  });
});
