import { describe, it, expect, vi, beforeEach } from 'vitest';

// createServiceRoleClient is only the default-arg fallback; tests inject a mock
// client explicitly, but the module imports it at load time.
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}));

const sendCustomer48hFollowupEmailMock = vi.fn().mockResolvedValue(undefined);
const sendVendor48hFollowupEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email/resend', () => ({
  sendCustomer48hFollowupEmail: (...a: unknown[]) => sendCustomer48hFollowupEmailMock(...a),
  sendVendor48hFollowupEmail: (...a: unknown[]) => sendVendor48hFollowupEmailMock(...a),
}));

const getRecentActiveVendorsMock = vi.fn().mockResolvedValue([]);
vi.mock('@/services/vendor.service', () => ({
  getRecentActiveVendors: (...a: unknown[]) => getRecentActiveVendorsMock(...a),
}));

import { runCustomer48hFollowup, runVendor48hFollowup } from '@/lib/cron/followups';

// A thenable/chainable query-builder stand-in: every method returns another chain
// and records itself; awaiting resolves to the configured per-table result.
type Call = { table: string; method: string; args: unknown[] };
function makeSupabase(tableData: Record<string, unknown>) {
  const calls: Call[] = [];
  function chain(table: string): unknown {
    const target = {
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: tableData[table] ?? [], error: null, count: 0 }),
    };
    return new Proxy(target, {
      get(t, prop) {
        if (prop in t) return (t as Record<string | symbol, unknown>)[prop];
        return (...args: unknown[]) => {
          calls.push({ table, method: String(prop), args });
          return chain(table);
        };
      },
    });
  }
  return { from: (table: string) => chain(table), _calls: calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  getRecentActiveVendorsMock.mockResolvedValue([]);
});

describe('runCustomer48hFollowup — batched', () => {
  it('skips couples with a booking, batches the booking check in one .in() query, and prefetches vendors once per distinct category', async () => {
    const candidates = [
      {
        id: 'cA',
        email: 'a@test.com',
        full_name: 'Aisha Khan',
        onboarding_data: { categories: ['catering'], event_date: '2027-01-01', just_browsing: false },
        followup_48h_sent_at: null,
        role: 'couple',
        onboarding_completed_at: '2026-08-20T00:00:00Z',
      },
      {
        id: 'cB',
        email: 'b@test.com',
        full_name: 'Bilal Ahmed',
        onboarding_data: { categories: ['catering'], event_date: '2027-01-01', just_browsing: false },
        followup_48h_sent_at: null,
        role: 'couple',
        onboarding_completed_at: '2026-08-20T00:00:00Z',
      },
      {
        id: 'cC',
        email: 'c@test.com',
        full_name: 'Sara Malik',
        onboarding_data: {}, // no category → fallback vendors
        followup_48h_sent_at: null,
        role: 'couple',
        onboarding_completed_at: '2026-08-20T00:00:00Z',
      },
    ];
    const sb = makeSupabase({
      users: candidates,
      // cB already has a booking → must be skipped.
      bookings: [{ couple_user_id: 'cB' }],
      vendor_profiles: [], // category prefetch results (content irrelevant here)
    });

    await runCustomer48hFollowup(sb as never);

    // Only one batched booking check, keyed by all candidate ids.
    const bookingIns = sb._calls.filter((c) => c.table === 'bookings' && c.method === 'in');
    expect(bookingIns).toHaveLength(1);
    expect(bookingIns[0].args).toEqual(['couple_user_id', ['cA', 'cB', 'cC']]);

    // cA and cC emailed; cB skipped (has a booking).
    expect(sendCustomer48hFollowupEmailMock).toHaveBeenCalledTimes(2);
    const emailedTo = sendCustomer48hFollowupEmailMock.mock.calls.map((c) => c[0]);
    expect(emailedTo).toEqual(['a@test.com', 'c@test.com']);

    // Category prefetch ran once for the single distinct category ('catering'),
    // not once per candidate — one .overlaps() query total.
    const overlaps = sb._calls.filter((c) => c.method === 'overlaps');
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].args).toEqual(['services', ['catering']]);

    // The no-category fallback prefetch ran once (cC needed it).
    expect(getRecentActiveVendorsMock).toHaveBeenCalledTimes(1);

    // followup_48h_sent_at stamped for the two emailed couples.
    const userUpdates = sb._calls.filter((c) => c.table === 'users' && c.method === 'update');
    expect(userUpdates).toHaveLength(2);
  });

  it('does nothing (no booking query) when there are no candidates', async () => {
    const sb = makeSupabase({ users: [] });
    await runCustomer48hFollowup(sb as never);
    expect(sb._calls.some((c) => c.table === 'bookings')).toBe(false);
    expect(sendCustomer48hFollowupEmailMock).not.toHaveBeenCalled();
  });
});

describe('runVendor48hFollowup — batched', () => {
  it('skips vendors with a booking and batches the booking check in one .in() query', async () => {
    const candidates = [
      {
        id: 'vX',
        business_name: 'Studio X',
        user_id: 'uX',
        published_at: '2026-08-20T00:00:00Z',
        followup_48h_sent_at: null,
        users: { email: 'x@test.com' },
      },
      {
        id: 'vY',
        business_name: 'Studio Y',
        user_id: 'uY',
        published_at: '2026-08-20T00:00:00Z',
        followup_48h_sent_at: null,
        users: { email: 'y@test.com' },
      },
    ];
    const sb = makeSupabase({
      vendor_profiles: candidates,
      bookings: [{ vendor_profile_id: 'vY' }], // vY already booked → skip
    });

    await runVendor48hFollowup(sb as never);

    const bookingIns = sb._calls.filter((c) => c.table === 'bookings' && c.method === 'in');
    expect(bookingIns).toHaveLength(1);
    expect(bookingIns[0].args).toEqual(['vendor_profile_id', ['vX', 'vY']]);

    // Only vX emailed.
    expect(sendVendor48hFollowupEmailMock).toHaveBeenCalledTimes(1);
    expect(sendVendor48hFollowupEmailMock).toHaveBeenCalledWith('x@test.com', 'Studio X', 'uX');
  });
});
