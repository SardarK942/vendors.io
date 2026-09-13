import { describe, it, expect } from 'vitest';
import { summarizeMarketplace, summarizeBookings } from '@/lib/admin/metrics';

describe('summarizeMarketplace', () => {
  const rows = [
    {
      category: 'carts',
      verified: true,
      user_id: 'u1',
      onboarding_complete: true,
      is_active: true,
    },
    {
      category: 'carts',
      verified: false,
      user_id: 'u1',
      onboarding_complete: true,
      is_active: true,
    },
    { category: 'dj', verified: false, user_id: 'u2', onboarding_complete: true, is_active: true },
    // not live — excluded from live metrics but counts toward multi-business
    { category: 'dj', verified: true, user_id: 'u2', onboarding_complete: false, is_active: false },
  ];

  it('counts live vendors (active AND onboarding complete)', () => {
    expect(summarizeMarketplace(rows).liveTotal).toBe(3);
  });

  it('breaks live vendors down by category', () => {
    expect(summarizeMarketplace(rows).byCategory).toEqual({ carts: 2, dj: 1 });
  });

  it('counts verified live vendors', () => {
    expect(summarizeMarketplace(rows).verifiedLive).toBe(1);
  });

  it('counts accounts owning more than one profile', () => {
    // u1 has 2, u2 has 2 → 2 multi-business accounts.
    expect(summarizeMarketplace(rows).multiBusinessAccounts).toBe(2);
  });
});

describe('summarizeBookings', () => {
  const NOW = Date.UTC(2026, 8, 13); // 2026-09-13
  const bookings = [
    {
      status: 'deposit_paid',
      deposit_amount: 5000,
      deposit_paid_at: '2026-09-12T00:00:00.000Z',
      created_at: '2026-09-10T00:00:00.000Z',
    },
    {
      status: 'completed',
      deposit_amount: 2500,
      deposit_paid_at: '2026-09-01T00:00:00.000Z',
      created_at: '2026-08-30T00:00:00.000Z',
    },
    {
      status: 'pending',
      deposit_amount: null,
      deposit_paid_at: null,
      created_at: '2026-09-11T00:00:00.000Z',
    },
  ];

  it('totals bookings and groups by status', () => {
    const s = summarizeBookings(bookings, NOW);
    expect(s.total).toBe(3);
    expect(s.byStatus).toEqual({ deposit_paid: 1, completed: 1, pending: 1 });
  });

  it('sums deposits collected (cents) only for paid bookings', () => {
    expect(summarizeBookings(bookings, NOW).depositsCollectedCents).toBe(7500);
    expect(summarizeBookings(bookings, NOW).paidCount).toBe(2);
  });

  it('counts bookings created in the last 7 days', () => {
    // 2026-09-10 and 2026-09-11 are within 7 days of 2026-09-13; 2026-08-30 is not.
    expect(summarizeBookings(bookings, NOW).last7dCount).toBe(2);
  });
});
