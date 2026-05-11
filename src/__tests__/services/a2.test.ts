/**
 * A2.13 — Unit tests for:
 * - Package CRUD logic (via mocked Supabase)
 * - acceptBooking state checks
 * - adjustBookingQuote state checks
 * - Safety guard codes (LAST_ACTIVE_PACKAGE, ACTIVE_BOOKINGS_EXIST, INVALID_STATE)
 */
import { describe, it, expect } from 'vitest';
import { deactivatePackage, hardDeletePackage } from '@/services/packages.service';
import { acceptBooking, adjustBookingQuote, validateStateTransition } from '@/services/booking.service';

// ─── deactivatePackage guard ──────────────────────────────────────────────────

describe('A2 — deactivatePackage LAST_ACTIVE_PACKAGE guard', () => {
  it('returns LAST_ACTIVE_PACKAGE when vendor would have 0 active packages', async () => {
    const sb = buildDeactivateSupabase(0);
    const result = await deactivatePackage(sb as never, 'pkg-1', 'vp-1');
    expect(result.error?.code).toBe('LAST_ACTIVE_PACKAGE');
  });

  it('succeeds when vendor has other active packages', async () => {
    const sb = buildDeactivateSupabase(2);
    const result = await deactivatePackage(sb as never, 'pkg-1', 'vp-1');
    expect(result.error).toBeNull();
    expect(result.data).toBeTruthy();
  });
});

// ─── hardDeletePackage guards ─────────────────────────────────────────────────

describe('A2 — hardDeletePackage guards', () => {
  it('returns LAST_ACTIVE_PACKAGE when no other active packages', async () => {
    const sb = buildHardDeleteSupabase({ otherActive: 0, activeBookings: [] });
    const result = await hardDeletePackage(sb as never, 'pkg-1', 'vp-1');
    expect(result.error?.code).toBe('LAST_ACTIVE_PACKAGE');
  });

  it('returns ACTIVE_BOOKINGS_EXIST when pending booking references package', async () => {
    const sb = buildHardDeleteSupabase({ otherActive: 1, activeBookings: [{ id: 'b1' }] });
    const result = await hardDeletePackage(sb as never, 'pkg-1', 'vp-1');
    expect(result.error?.code).toBe('ACTIVE_BOOKINGS_EXIST');
  });

  it('returns ACTIVE_BOOKINGS_EXIST when deposit_paid booking references package', async () => {
    const sb = buildHardDeleteSupabase({ otherActive: 3, activeBookings: [{ id: 'b2' }] });
    const result = await hardDeletePackage(sb as never, 'pkg-1', 'vp-1');
    expect(result.error?.code).toBe('ACTIVE_BOOKINGS_EXIST');
  });

  it('succeeds when other active packages exist and no active bookings', async () => {
    const sb = buildHardDeleteSupabase({ otherActive: 1, activeBookings: [] });
    const result = await hardDeletePackage(sb as never, 'pkg-1', 'vp-1');
    expect(result.error).toBeNull();
    expect(result.data?.deleted).toBe(true);
  });
});

// ─── acceptBooking state machine ──────────────────────────────────────────────

describe('A2 — acceptBooking state machine', () => {
  it('rejects when booking status is not pending', async () => {
    const sb = buildAcceptSupabase({ status: 'adjusted_quote_sent', vendorUserId: 'u-vendor' });
    const result = await acceptBooking(sb as never, 'b-1', 'u-vendor');
    expect(result.error?.code).toBe('INVALID_STATE');
    expect(result.status).toBe(409);
  });

  it('rejects when caller is not the vendor', async () => {
    const sb = buildAcceptSupabase({ status: 'pending', vendorUserId: 'u-other' });
    const result = await acceptBooking(sb as never, 'b-1', 'u-vendor');
    expect(result.error?.code).toBe('FORBIDDEN');
    expect(result.status).toBe(403);
  });

  it('rejects when booking not found', async () => {
    const sb = buildAcceptSupabaseNotFound();
    const result = await acceptBooking(sb as never, 'b-missing', 'u-vendor');
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.status).toBe(404);
  });

  it('succeeds when vendor and status=pending', async () => {
    const sb = buildAcceptSupabase({ status: 'pending', vendorUserId: 'u-vendor' });
    const result = await acceptBooking(sb as never, 'b-1', 'u-vendor');
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('accepted');
  });
});

// ─── adjustBookingQuote state machine ────────────────────────────────────────

describe('A2 — adjustBookingQuote state machine', () => {
  it('rejects when status is deposit_paid (not adjustable)', async () => {
    const sb = buildAdjustSupabase({ status: 'deposit_paid', vendorUserId: 'u-vendor' });
    const result = await adjustBookingQuote(sb as never, 'b-1', 'u-vendor', {
      adjustment_amount_cents: 5000,
      reason: 'travel',
      explanation: null,
    });
    expect(result.error?.code).toBe('INVALID_STATE');
  });

  it('rejects when status is accepted (not adjustable)', async () => {
    const sb = buildAdjustSupabase({ status: 'accepted', vendorUserId: 'u-vendor' });
    const result = await adjustBookingQuote(sb as never, 'b-1', 'u-vendor', {
      adjustment_amount_cents: 5000,
      reason: 'travel',
      explanation: null,
    });
    expect(result.error?.code).toBe('INVALID_STATE');
  });

  it('succeeds from pending status', async () => {
    const sb = buildAdjustSupabase({ status: 'pending', vendorUserId: 'u-vendor' });
    const result = await adjustBookingQuote(sb as never, 'b-1', 'u-vendor', {
      adjustment_amount_cents: 5000,
      reason: 'travel',
      explanation: null,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('adjusted_quote_sent');
    expect(result.data?.negotiation_round_count).toBe(1);
  });

  it('succeeds from adjusted_quote_declined status', async () => {
    const sb = buildAdjustSupabase({
      status: 'adjusted_quote_declined',
      vendorUserId: 'u-vendor',
      negotiationRound: 1,
    });
    const result = await adjustBookingQuote(sb as never, 'b-1', 'u-vendor', {
      adjustment_amount_cents: -3000,
      reason: 'discount',
      explanation: null,
    });
    expect(result.error).toBeUndefined();
    expect(result.data?.negotiation_round_count).toBe(2);
  });
});

// ─── State machine: new status transitions ────────────────────────────────────

describe('A2 — State machine: new statuses', () => {
  it('allows pending -> accepted', () => {
    expect(validateStateTransition('pending', 'accepted')).toBe(true);
  });

  it('allows pending -> adjusted_quote_sent', () => {
    expect(validateStateTransition('pending', 'adjusted_quote_sent')).toBe(true);
  });

  it('allows adjusted_quote_declined -> adjusted_quote_sent (vendor re-quote)', () => {
    expect(validateStateTransition('adjusted_quote_declined', 'adjusted_quote_sent')).toBe(true);
  });
});

// ─── Mock builders ────────────────────────────────────────────────────────────

function buildDeactivateSupabase(otherActiveCount: number) {
  const pkg = { id: 'pkg-1', vendor_profile_id: 'vp-1', is_active: false };
  return {
    from: (table: string) => {
      if (table === 'packages') {
        return {
          select: (_: unknown, _opts?: { count?: string; head?: boolean }) => ({
            eq: () => ({
              eq: () => ({
                neq: () => Promise.resolve({ count: otherActiveCount, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: pkg, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

function buildHardDeleteSupabase({
  otherActive,
  activeBookings,
}: {
  otherActive: number;
  activeBookings: { id: string }[];
}) {
  return {
    from: (table: string) => {
      if (table === 'packages') {
        return {
          select: (_: unknown) => ({
            eq: () => ({
              eq: () => ({
                neq: () => Promise.resolve({ count: otherActive, error: null }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => Promise.resolve({ data: activeBookings, error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

function buildAcceptSupabase({
  status,
  vendorUserId,
}: {
  status: string;
  vendorUserId: string;
}) {
  const booking = {
    id: 'b-1',
    vendor_profile_id: 'vp-1',
    status,
    package_id: 'pkg-1',
    vendor_profiles: { user_id: vendorUserId },
    couple_user_id: 'u-couple',
  };

  const updatedBooking = {
    ...booking,
    status: 'accepted',
    expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    total_price_cents: 100000,
  };

  return {
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: booking, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: updatedBooking, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'packages') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { vendor_notes_template: null }, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

function buildAcceptSupabaseNotFound() {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  };
}

function buildAdjustSupabase({
  status,
  vendorUserId,
  negotiationRound = 0,
}: {
  status: string;
  vendorUserId: string;
  negotiationRound?: number;
}) {
  const booking = {
    id: 'b-1',
    vendor_profile_id: 'vp-1',
    status,
    package_id: 'pkg-1',
    negotiation_round_count: negotiationRound,
    vendor_profiles: { user_id: vendorUserId },
    couple_user_id: 'u-couple',
  };

  const updatedBooking = {
    ...booking,
    status: 'adjusted_quote_sent',
    negotiation_round_count: negotiationRound + 1,
    total_price_cents: 105000,
    expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  };

  return {
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: booking, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: updatedBooking, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'packages') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { vendor_notes_template: null }, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}
