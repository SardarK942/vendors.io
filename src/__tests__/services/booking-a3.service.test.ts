/**
 * Phase A3 — Couple-side service tests
 * Tests: createBooking, coupleAcceptAdjusted, coupleDeclineAdjusted
 * Uses in-memory mock Supabase client — no network required.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createBooking,
  coupleAcceptAdjusted,
  coupleDeclineAdjusted,
} from '@/services/booking.service';

// ─── Minimal Supabase mock factory ───────────────────────────────────────────

function makeSupabase(overrides: Record<string, unknown> = {}) {
  const defaults = {
    // packages table
    packages: {
      selectResult: {
        data: {
          id: 'pkg-1',
          name: 'Wedding Day Coverage',
          base_price_cents: 240000,
          events_count: 3,
          is_active: true,
        },
        error: null,
      },
    },
    // package_addons table
    packageAddons: {
      selectResult: { data: [{ id: 'addon-1' }, { id: 'addon-2' }], error: null },
    },
    // bookings table
    bookings: {
      insertResult: {
        data: {
          id: 'booking-1',
          couple_user_id: 'user-couple',
          vendor_profile_id: 'vendor-1',
          package_id: 'pkg-1',
          package_name_snapshot: 'Wedding Day Coverage',
          package_base_price_cents_snapshot: 240000,
          selected_addons: [],
          status: 'pending',
          total_price_cents: 240000,
          expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        },
        error: null,
      },
      selectResult: { data: null, error: null },
      updateResult: { data: null, error: null },
      deleteResult: { data: null, error: null },
    },
    // booking_events table
    bookingEvents: {
      insertResult: { data: [{ id: 'event-1' }], error: null },
    },
    ...overrides,
  };

  // Build a chainable mock
  const buildChain = (tableKey: string, op: string) => {
    const chain: Record<string, unknown> = {};

    if (op === 'select' && tableKey === 'packages') {
      chain.eq = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(defaults.packages.selectResult),
      });
    }

    if (op === 'select' && tableKey === 'package_addons') {
      chain.eq = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue(defaults.packageAddons.selectResult),
      });
    }

    if (op === 'insert' && tableKey === 'bookings') {
      chain.select = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(defaults.bookings.insertResult),
      });
    }

    if (op === 'insert' && tableKey === 'booking_events') {
      chain.select = vi.fn().mockResolvedValue(defaults.bookingEvents.insertResult);
    }

    if (op === 'delete' && tableKey === 'bookings') {
      chain.eq = vi.fn().mockResolvedValue(defaults.bookings.deleteResult);
    }

    // For coupleAcceptAdjusted / coupleDeclineAdjusted — select + update
    if (op === 'select' && tableKey === 'bookings') {
      chain.eq = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(defaults.bookings.selectResult),
      });
    }

    if (op === 'update' && tableKey === 'bookings') {
      chain.eq = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(defaults.bookings.updateResult),
        }),
      });
    }

    return chain;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => ({
      select: vi.fn().mockImplementation(() => buildChain(table, 'select')),
      insert: vi.fn().mockImplementation(() => buildChain(table, 'insert')),
      update: vi.fn().mockImplementation(() => buildChain(table, 'update')),
      delete: vi.fn().mockImplementation(() => buildChain(table, 'delete')),
    })),
  };
}

// ─── createBooking tests ──────────────────────────────────────────────────────

describe('createBooking', () => {
  it('returns 400 when package is not active', async () => {
    const supabase = makeSupabase({
      packages: {
        selectResult: {
          data: {
            id: 'pkg-1',
            name: 'pkg',
            base_price_cents: 10000,
            events_count: 1,
            is_active: false,
          },
          error: null,
        },
      },
    });

    const result = await createBooking(supabase as never, 'user-couple', {
      vendor_profile_id: 'vendor-1',
      package_id: 'pkg-1',
      selected_addons: [],
      guest_count: 100,
      couple_full_name: 'John & Jane',
      couple_contact_phone: '+1234567890',
      events: [
        {
          sequence: 1,
          event_date: '2026-08-15',
          event_start_time: '2026-08-15T16:00:00Z',
          event_end_time: '2026-08-15T22:00:00Z',
          event_type_label: 'Walima',
          address_line_1: '123 Main St',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60601',
          location_overridden: false,
        },
      ],
    });

    expect(result.status).toBe(400);
    expect(result.error).toContain('not available');
  });

  it('returns 400 when package is null (not found)', async () => {
    const supabase = makeSupabase({
      packages: { selectResult: { data: null, error: null } },
    });

    const result = await createBooking(supabase as never, 'user-couple', {
      vendor_profile_id: 'vendor-1',
      package_id: 'pkg-1',
      selected_addons: [],
      guest_count: 100,
      couple_full_name: 'John & Jane',
      couple_contact_phone: '+1234567890',
      events: [
        {
          sequence: 1,
          event_date: '2026-08-15',
          event_start_time: '2026-08-15T16:00:00Z',
          event_end_time: '2026-08-15T22:00:00Z',
          event_type_label: 'Walima',
          address_line_1: '123 Main St',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60601',
          location_overridden: false,
        },
      ],
    });

    expect(result.status).toBe(400);
  });

  it('returns 400 when events exceed package events_count', async () => {
    // Package supports only 1 event, but we pass 3
    const supabase = makeSupabase({
      packages: {
        selectResult: {
          data: {
            id: 'pkg-1',
            name: 'pkg',
            base_price_cents: 10000,
            events_count: 1,
            is_active: true,
          },
          error: null,
        },
      },
    });

    const threeEvents = [1, 2, 3].map((seq) => ({
      sequence: seq,
      event_date: '2026-08-15',
      event_start_time: '2026-08-15T16:00:00Z',
      event_end_time: '2026-08-15T22:00:00Z',
      event_type_label: 'Event',
      address_line_1: '123 Main St',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60601',
      location_overridden: false,
    }));

    const result = await createBooking(supabase as never, 'user-couple', {
      vendor_profile_id: 'vendor-1',
      package_id: 'pkg-1',
      selected_addons: [],
      guest_count: 100,
      couple_full_name: 'John & Jane',
      couple_contact_phone: '+1234567890',
      events: threeEvents,
    });

    expect(result.status).toBe(400);
    expect(result.error).toContain('up to 1 events');
  });

  it('returns 400 when addon does not belong to package', async () => {
    const supabase = makeSupabase({
      packageAddons: {
        // Only 1 valid addon returned, but 2 were requested
        selectResult: { data: [{ id: 'addon-1' }], error: null },
      },
    });

    const result = await createBooking(supabase as never, 'user-couple', {
      vendor_profile_id: 'vendor-1',
      package_id: 'pkg-1',
      selected_addons: [
        { addon_id: 'addon-1', name: 'Drone footage', price_delta_cents: 50000 },
        { addon_id: 'addon-invalid', name: 'Fake addon', price_delta_cents: 10000 },
      ],
      guest_count: 100,
      couple_full_name: 'John & Jane',
      couple_contact_phone: '+1234567890',
      events: [
        {
          sequence: 1,
          event_date: '2026-08-15',
          event_start_time: '2026-08-15T16:00:00Z',
          event_end_time: '2026-08-15T22:00:00Z',
          event_type_label: 'Walima',
          address_line_1: '123 Main St',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60601',
          location_overridden: false,
        },
      ],
    });

    expect(result.status).toBe(400);
    expect(result.error).toContain('add-ons do not belong');
  });

  it('succeeds with valid package, 2 addons, 3 events', async () => {
    const mockBooking = {
      id: 'booking-happy',
      couple_user_id: 'user-couple',
      vendor_profile_id: 'vendor-1',
      package_id: 'pkg-1',
      package_name_snapshot: 'Wedding Day Coverage',
      package_base_price_cents_snapshot: 240000,
      selected_addons: [
        { addon_id: 'addon-1', name: 'Drone', price_delta_cents: 50000 },
        { addon_id: 'addon-2', name: 'Second shooter', price_delta_cents: 30000 },
      ],
      status: 'pending',
      total_price_cents: 320000,
    };
    const mockEvents = [{ id: 'ev-1' }, { id: 'ev-2' }, { id: 'ev-3' }];

    const supabase = makeSupabase({
      packages: {
        selectResult: {
          data: {
            id: 'pkg-1',
            name: 'Wedding Day Coverage',
            base_price_cents: 240000,
            events_count: 3,
            is_active: true,
          },
          error: null,
        },
      },
      packageAddons: {
        selectResult: { data: [{ id: 'addon-1' }, { id: 'addon-2' }], error: null },
      },
      bookings: {
        insertResult: { data: mockBooking, error: null },
        selectResult: { data: null, error: null },
        updateResult: { data: null, error: null },
        deleteResult: { data: null, error: null },
      },
      bookingEvents: {
        insertResult: { data: mockEvents, error: null },
      },
    });

    const threeEvents = [1, 2, 3].map((seq) => ({
      sequence: seq,
      event_date: '2026-08-15',
      event_start_time: '2026-08-15T16:00:00Z',
      event_end_time: '2026-08-15T22:00:00Z',
      event_type_label: seq === 1 ? 'Mehndi' : seq === 2 ? 'Nikah' : 'Walima',
      address_line_1: '123 Main St',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60601',
      location_overridden: false,
    }));

    const result = await createBooking(supabase as never, 'user-couple', {
      vendor_profile_id: 'vendor-1',
      package_id: 'pkg-1',
      selected_addons: [
        { addon_id: 'addon-1', name: 'Drone', price_delta_cents: 50000 },
        { addon_id: 'addon-2', name: 'Second shooter', price_delta_cents: 30000 },
      ],
      guest_count: 150,
      couple_full_name: 'Aisha & Ahmed',
      couple_contact_phone: '+13125551234',
      events: threeEvents,
    });

    expect(result.status).toBe(201);
    expect(result.data?.booking).toBeDefined();
    expect(result.data?.events).toHaveLength(3);
  });
});

// ─── coupleAcceptAdjusted tests ───────────────────────────────────────────────

describe('coupleAcceptAdjusted', () => {
  it('returns 404 when booking not found', async () => {
    const supabase = makeSupabase({
      bookings: {
        selectResult: { data: null, error: null },
        insertResult: { data: null, error: null },
        updateResult: { data: null, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleAcceptAdjusted(supabase as never, 'booking-x', 'user-1');
    expect(result.status).toBe(404);
  });

  it('returns 403 when caller is not the couple', async () => {
    const supabase = makeSupabase({
      bookings: {
        selectResult: {
          data: { id: 'b1', couple_user_id: 'other-user', status: 'adjusted_quote_sent' },
          error: null,
        },
        insertResult: { data: null, error: null },
        updateResult: { data: null, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleAcceptAdjusted(supabase as never, 'b1', 'user-1');
    expect(result.status).toBe(403);
  });

  it('returns 409 when status is not adjusted_quote_sent', async () => {
    const supabase = makeSupabase({
      bookings: {
        selectResult: {
          data: { id: 'b1', couple_user_id: 'user-1', status: 'pending' },
          error: null,
        },
        insertResult: { data: null, error: null },
        updateResult: { data: null, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleAcceptAdjusted(supabase as never, 'b1', 'user-1');
    expect(result.status).toBe(409);
    expect(result.error).toContain('Cannot accept-adjusted');
  });

  it('transitions to accepted when status is adjusted_quote_sent', async () => {
    const updatedBooking = {
      id: 'b1',
      couple_user_id: 'user-1',
      status: 'accepted',
      total_price_cents: 280000,
    };
    const supabase = makeSupabase({
      bookings: {
        selectResult: {
          data: { id: 'b1', couple_user_id: 'user-1', status: 'adjusted_quote_sent' },
          error: null,
        },
        insertResult: { data: null, error: null },
        updateResult: { data: updatedBooking, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleAcceptAdjusted(supabase as never, 'b1', 'user-1');
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
  });
});

// ─── coupleDeclineAdjusted tests ──────────────────────────────────────────────

describe('coupleDeclineAdjusted', () => {
  it('returns 404 when booking not found', async () => {
    const supabase = makeSupabase({
      bookings: {
        selectResult: { data: null, error: null },
        insertResult: { data: null, error: null },
        updateResult: { data: null, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleDeclineAdjusted(supabase as never, 'booking-x', 'user-1');
    expect(result.status).toBe(404);
  });

  it('returns 403 when caller is not the couple', async () => {
    const supabase = makeSupabase({
      bookings: {
        selectResult: {
          data: { id: 'b1', couple_user_id: 'different-user', status: 'adjusted_quote_sent' },
          error: null,
        },
        insertResult: { data: null, error: null },
        updateResult: { data: null, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleDeclineAdjusted(supabase as never, 'b1', 'user-1');
    expect(result.status).toBe(403);
  });

  it('returns 409 when booking is not in adjusted_quote_sent state', async () => {
    const supabase = makeSupabase({
      bookings: {
        selectResult: {
          data: { id: 'b1', couple_user_id: 'user-1', status: 'accepted' },
          error: null,
        },
        insertResult: { data: null, error: null },
        updateResult: { data: null, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleDeclineAdjusted(supabase as never, 'b1', 'user-1');
    expect(result.status).toBe(409);
    expect(result.error).toContain('Cannot decline-adjusted');
  });

  it('transitions to adjusted_quote_declined when valid', async () => {
    const updatedBooking = {
      id: 'b1',
      couple_user_id: 'user-1',
      status: 'adjusted_quote_declined',
    };
    const supabase = makeSupabase({
      bookings: {
        selectResult: {
          data: { id: 'b1', couple_user_id: 'user-1', status: 'adjusted_quote_sent' },
          error: null,
        },
        insertResult: { data: null, error: null },
        updateResult: { data: updatedBooking, error: null },
        deleteResult: { data: null, error: null },
      },
    });

    const result = await coupleDeclineAdjusted(supabase as never, 'b1', 'user-1');
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
  });
});
