/**
 * Sub-project E §10 — booking-event.service tests.
 *
 * Covers updateVendorNotes: trim, max-length cap, ownership check, db_error path,
 * happy path. Uses in-memory mock Supabase client — no network required.
 */
import { describe, it, expect } from 'vitest';
import { updateVendorNotes } from '@/services/booking-event.service';

interface MockState {
  eventOwnerUserId: string;
  eventExists: boolean;
  findError: { message: string } | null;
  updateError: { message: string } | null;
  lastUpdate: Record<string, unknown> | null;
}

function makeMockSupabase(state: MockState) {
  const captured: { lastUpdate: Record<string, unknown> | null } = { lastUpdate: null };

  const builder = {
    from(table: string) {
      if (table !== 'booking_events') throw new Error(`unexpected table ${table}`);
      return this;
    },
    select(_cols: string) {
      return this;
    },
    eq(_col: string, _val: string) {
      return this;
    },
    update(payload: Record<string, unknown>) {
      captured.lastUpdate = payload;
      return {
        eq: () => Promise.resolve({ error: state.updateError }),
      };
    },
    maybeSingle: async () => {
      if (state.findError) return { data: null, error: state.findError };
      if (!state.eventExists) return { data: null, error: null };
      return {
        data: {
          id: 'ev-1',
          booking_id: 'b-1',
          bookings: {
            vendor_profile_id: 'vp-1',
            vendor_profiles: { user_id: state.eventOwnerUserId },
          },
        },
        error: null,
      };
    },
  };

  return Object.assign(builder, { _captured: captured }) as never;
}

describe('updateVendorNotes', () => {
  it('trims whitespace before saving', async () => {
    const state: MockState = {
      eventOwnerUserId: 'user-A',
      eventExists: true,
      findError: null,
      updateError: null,
      lastUpdate: null,
    };
    const supabase = makeMockSupabase(state) as never;
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-A', '   hello world   ');
    expect(result.error).toBeNull();
    expect((supabase as unknown as { _captured: { lastUpdate: Record<string, unknown> } })._captured.lastUpdate?.vendor_notes).toBe('hello world');
  });

  it('rejects notes longer than 5000 chars', async () => {
    const state: MockState = {
      eventOwnerUserId: 'user-A',
      eventExists: true,
      findError: null,
      updateError: null,
      lastUpdate: null,
    };
    const supabase = makeMockSupabase(state) as never;
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-A', 'x'.repeat(5001));
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('too_long');
  });

  it('rejects when user does not own the booking', async () => {
    const state: MockState = {
      eventOwnerUserId: 'user-A',
      eventExists: true,
      findError: null,
      updateError: null,
      lastUpdate: null,
    };
    const supabase = makeMockSupabase(state) as never;
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-B', 'hi');
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('forbidden');
  });

  it('returns not_found when event does not exist', async () => {
    const state: MockState = {
      eventOwnerUserId: 'user-A',
      eventExists: false,
      findError: null,
      updateError: null,
      lastUpdate: null,
    };
    const supabase = makeMockSupabase(state) as never;
    const result = await updateVendorNotes(supabase, 'missing', 'user-A', 'hi');
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('not_found');
  });

  it('returns db_error when find fails', async () => {
    const state: MockState = {
      eventOwnerUserId: 'user-A',
      eventExists: false,
      findError: { message: 'boom' },
      updateError: null,
      lastUpdate: null,
    };
    const supabase = makeMockSupabase(state) as never;
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-A', 'hi');
    expect(result.error?.code).toBe('db_error');
  });

  it('returns db_error when update fails', async () => {
    const state: MockState = {
      eventOwnerUserId: 'user-A',
      eventExists: true,
      findError: null,
      updateError: { message: 'rls denied' },
      lastUpdate: null,
    };
    const supabase = makeMockSupabase(state) as never;
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-A', 'hi');
    expect(result.error?.code).toBe('db_error');
  });

  it('happy path: saves and returns ok', async () => {
    const state: MockState = {
      eventOwnerUserId: 'user-A',
      eventExists: true,
      findError: null,
      updateError: null,
      lastUpdate: null,
    };
    const supabase = makeMockSupabase(state) as never;
    const result = await updateVendorNotes(supabase, 'ev-1', 'user-A', 'allergic to nuts');
    expect(result.data).toEqual({ ok: true });
    expect(result.error).toBeNull();
    expect((supabase as unknown as { _captured: { lastUpdate: Record<string, unknown> } })._captured.lastUpdate?.vendor_notes).toBe('allergic to nuts');
  });
});
