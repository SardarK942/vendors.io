import { describe, it, expect } from 'vitest';
import { deriveNeedStatus, committedCentsForNeed, computeRollups } from '@/lib/events/derive';
import type { NeedWithBooking } from '@/lib/events/derive';

const base = {
  id: 'n1',
  event_function_id: 'f1',
  category: 'catering',
  booking_id: null,
  manual_vendor_name: null,
  manual_amount_cents: null,
  manual_booked: false,
  notes: null,
  sort: 0,
  created_at: '',
  updated_at: '',
} satisfies NeedWithBooking;

describe('deriveNeedStatus', () => {
  it('is needed when nothing is linked', () => {
    expect(deriveNeedStatus(base)).toBe('needed');
  });
  it('is booked_baazar when linked booking is active', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'accepted', total_price_cents: 320000 },
    };
    expect(deriveNeedStatus(n)).toBe('booked_baazar');
  });
  it('reverts to needed when linked booking is cancelled', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'vendor_cancelled', total_price_cents: 320000 },
    };
    expect(deriveNeedStatus(n)).toBe('needed');
  });
  it('is booked_manual when manual_booked and no booking', () => {
    const n = {
      ...base,
      manual_booked: true,
      manual_vendor_name: 'Henna by Zara',
      manual_amount_cents: 50000,
    };
    expect(deriveNeedStatus(n)).toBe('booked_manual');
  });
  it('booking wins over manual when both present and active', () => {
    const n = {
      ...base,
      manual_booked: true,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'pending', total_price_cents: 100 },
    };
    expect(deriveNeedStatus(n)).toBe('booked_baazar');
  });
  it('is booked_baazar for a linked pending_quote (custom-request) booking', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'pending_quote', total_price_cents: null },
    };
    expect(deriveNeedStatus(n)).toBe('booked_baazar');
  });
  it('is booked_baazar for a linked couple_countered booking', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'couple_countered', total_price_cents: 320000 },
    };
    expect(deriveNeedStatus(n)).toBe('booked_baazar');
  });
  it('falls back to booked_manual when a linked booking is cancelled but manual_booked is also set', () => {
    const n = {
      ...base,
      manual_booked: true,
      manual_vendor_name: 'Henna by Zara',
      manual_amount_cents: 50000,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'vendor_cancelled', total_price_cents: 320000 },
    };
    expect(deriveNeedStatus(n)).toBe('booked_manual');
  });
});

describe('committedCentsForNeed', () => {
  it('uses booking total when active', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'deposit_paid', total_price_cents: 900000 },
    };
    expect(committedCentsForNeed(n)).toBe(900000);
  });
  it('uses manual amount when manual_booked', () => {
    expect(
      committedCentsForNeed({ ...base, manual_booked: true, manual_amount_cents: 50000 })
    ).toBe(50000);
  });
  it('is 0 for an active pending_quote booking (no price until vendor responds)', () => {
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'pending_quote', total_price_cents: null },
    };
    expect(committedCentsForNeed(n)).toBe(0);
  });
  it('is 0 for needed and for cancelled bookings', () => {
    expect(committedCentsForNeed(base)).toBe(0);
    const n = {
      ...base,
      booking_id: 'b1',
      booking: { id: 'b1', status: 'expired', total_price_cents: 900000 },
    };
    expect(committedCentsForNeed(n)).toBe(0);
  });
});

describe('computeRollups', () => {
  it('sums by function and category and counts booked slots', () => {
    const needs: NeedWithBooking[] = [
      {
        ...base,
        id: 'a',
        event_function_id: 'f1',
        category: 'mehndi',
        manual_booked: true,
        manual_amount_cents: 50000,
      },
      {
        ...base,
        id: 'b',
        event_function_id: 'f1',
        category: 'catering',
        booking_id: 'b1',
        booking: { id: 'b1', status: 'accepted', total_price_cents: 320000 },
      },
      { ...base, id: 'c', event_function_id: 'f1', category: 'decor' },
      {
        ...base,
        id: 'd',
        event_function_id: 'f2',
        category: 'venue',
        booking_id: 'b2',
        booking: { id: 'b2', status: 'deposit_paid', total_price_cents: 900000 },
      },
    ];
    const r = computeRollups(needs);
    expect(r.totalCommittedCents).toBe(1270000);
    expect(r.byFunction).toEqual({ f1: 370000, f2: 900000 });
    expect(r.byCategory).toEqual({ mehndi: 50000, catering: 320000, decor: 0, venue: 900000 });
    expect(r.bookedCountByFunction).toEqual({
      f1: { booked: 2, total: 3 },
      f2: { booked: 1, total: 1 },
    });
  });
});
