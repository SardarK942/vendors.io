import { describe, it, expect } from 'vitest';
import { createEventSchema, createBookingSchema } from '@/types';

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
  it('rejects a manual_booked vendor need with no vendor name', () => {
    const bad = {
      ...valid,
      functions: [
        {
          ...valid.functions[0],
          vendor_needs: [{ category: 'mehndi', manual_booked: true, manual_vendor_name: null }],
        },
      ],
    };
    expect(createEventSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects a manual_booked vendor need whose name is whitespace only', () => {
    const bad = {
      ...valid,
      functions: [
        {
          ...valid.functions[0],
          vendor_needs: [{ category: 'mehndi', manual_booked: true, manual_vendor_name: '   ' }],
        },
      ],
    };
    expect(createEventSchema.safeParse(bad).success).toBe(false);
  });
});

describe('createBookingSchema', () => {
  it('accepts optional event_function_id', () => {
    const base = {
      vendor_profile_id: '11111111-1111-4111-8111-111111111111',
      package_id: '22222222-2222-4222-8222-222222222222',
      guest_count: 100,
      couple_full_name: 'A B',
      couple_contact_phone: '555',
      events: [
        {
          sequence: 1,
          event_date: '2026-08-27',
          event_start_time: '2026-08-27T18:00:00Z',
          event_end_time: '2026-08-27T23:00:00Z',
          event_type_label: 'Wedding Reception',
          address_line_1: '123 Main St',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60601',
        },
      ],
    };
    expect(createBookingSchema.safeParse(base).success).toBe(true);
    expect(
      createBookingSchema.safeParse({
        ...base,
        event_function_id: '33333333-3333-4333-8333-333333333333',
      }).success
    ).toBe(true);
    expect(createBookingSchema.safeParse({ ...base, event_function_id: 'nope' }).success).toBe(
      false
    );
  });
});
