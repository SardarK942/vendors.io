import { describe, it, expect, vi } from 'vitest';
import { linkBookingToFunction } from '@/services/events.service';

type Row = Record<string, unknown>;
function stubSupabase(fixtures: {
  booking?: Row | null;
  ownedFunction?: Row | null;
  existingNeed?: Row | null;
}) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const client = {
    from(table: string) {
      const chain = {
        _table: table,
        select() {
          return chain;
        },
        update(payload: unknown) {
          calls.push({ table, op: 'update', payload });
          return chain;
        },
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return Promise.resolve({ error: null });
        },
        eq() {
          return chain;
        },
        is() {
          return chain;
        },
        limit() {
          return chain;
        },
        maybeSingle() {
          if (table === 'bookings') return Promise.resolve({ data: fixtures.booking ?? null });
          if (table === 'event_functions')
            return Promise.resolve({ data: fixtures.ownedFunction ?? null });
          if (table === 'event_vendor_needs')
            return Promise.resolve({ data: fixtures.existingNeed ?? null });
          return Promise.resolve({ data: null });
        },
        single() {
          return chain.maybeSingle();
        },
        then(resolve: (v: unknown) => void) {
          resolve({ error: null });
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

const booking = {
  id: 'b1',
  couple_user_id: 'u1',
  vendor_profile_id: 'v1',
  vendor_profiles: { category: 'catering' },
};
const fn = { id: 'f1', event_id: 'e1' };

describe('linkBookingToFunction', () => {
  it('fills an existing empty slot of the same category', async () => {
    const { client, calls } = stubSupabase({
      booking,
      ownedFunction: fn,
      existingNeed: { id: 'n1' },
    });
    const res = await linkBookingToFunction(client, 'u1', {
      bookingId: 'b1',
      eventFunctionId: 'f1',
    });
    expect(res.ok).toBe(true);
    expect(calls.some((c) => c.table === 'bookings' && c.op === 'update')).toBe(true);
    const needUpdate = calls.find((c) => c.table === 'event_vendor_needs' && c.op === 'update');
    expect(needUpdate?.payload).toMatchObject({
      booking_id: 'b1',
      manual_booked: false,
      manual_vendor_name: null,
      manual_amount_cents: null,
    });
  });
  it('creates a new slot when none exists', async () => {
    const { client, calls } = stubSupabase({ booking, ownedFunction: fn, existingNeed: null });
    const res = await linkBookingToFunction(client, 'u1', {
      bookingId: 'b1',
      eventFunctionId: 'f1',
    });
    expect(res.ok).toBe(true);
    const insert = calls.find((c) => c.table === 'event_vendor_needs' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({
      event_function_id: 'f1',
      category: 'catering',
      booking_id: 'b1',
    });
  });
  it('refuses when the booking belongs to someone else', async () => {
    const { client } = stubSupabase({
      booking: { ...booking, couple_user_id: 'other' },
      ownedFunction: fn,
    });
    const res = await linkBookingToFunction(client, 'u1', {
      bookingId: 'b1',
      eventFunctionId: 'f1',
    });
    expect(res.ok).toBe(false);
  });
});
