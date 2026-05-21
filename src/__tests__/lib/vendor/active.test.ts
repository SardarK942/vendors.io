/**
 * Sub-project I §5 — getActiveVendorProfile tests.
 *
 * Uses an in-memory mock Supabase client. No DB required.
 */
import { describe, it, expect, vi } from 'vitest';
import { getActiveVendorProfile, getActiveVendorProfileId } from '@/lib/vendor/active';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

interface MockState {
  // Vendor_profiles rows for the test user, in creation order
  profiles: Array<{ id: string; user_id: string; created_at: string; business_name?: string }>;
  // users.active_vendor_profile_id value to return
  activeVendorProfileId: string | null;
}

function makeMockSupabase(state: MockState) {
  const lastUpdate: { active_vendor_profile_id?: string | null } = {};

  // Chainable builder for vendor_profiles.select('*').eq().order()
  const vendorProfilesSelectChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnValue(
      Promise.resolve({ data: state.profiles, error: null })
    ),
  };

  // Chainable builder for users.select().eq().single()
  const usersSelectChain = {
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { active_vendor_profile_id: state.activeVendorProfileId },
      error: null,
    }),
  };

  // Chainable builder for users.update().eq()
  const usersUpdateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };

  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === 'vendor_profiles') {
        return {
          select: vi.fn().mockReturnValue(vendorProfilesSelectChain),
        };
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue(usersSelectChain),
          update: vi.fn((payload: Record<string, unknown>) => {
            Object.assign(lastUpdate, payload);
            return usersUpdateChain;
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;

  return { client: mockClient, lastUpdate };
}

describe('getActiveVendorProfile', () => {
  it('returns null + count 0 when user has no vendor_profiles', async () => {
    const { client } = makeMockSupabase({ profiles: [], activeVendorProfileId: null });
    const result = await getActiveVendorProfile(client, 'user-A');
    expect(result.profile).toBeNull();
    expect(result.totalCount).toBe(0);
  });

  it('returns the only profile when user has exactly one (count=1) and active is null', async () => {
    const { client } = makeMockSupabase({
      profiles: [{ id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' }],
      activeVendorProfileId: null,
    });
    const result = await getActiveVendorProfile(client, 'user-A');
    expect(result.profile?.id).toBe('vp-1');
    expect(result.totalCount).toBe(1);
  });

  it('returns the explicit active when active_vendor_profile_id is set and owned', async () => {
    const { client } = makeMockSupabase({
      profiles: [
        { id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' },
        { id: 'vp-2', user_id: 'user-A', created_at: '2026-02-01T00:00:00Z' },
      ],
      activeVendorProfileId: 'vp-2',
    });
    const result = await getActiveVendorProfile(client, 'user-A');
    expect(result.profile?.id).toBe('vp-2');
    expect(result.totalCount).toBe(2);
  });

  it('falls back to first by created_at ASC when count>1 and active is null, AND persists it', async () => {
    const { client, lastUpdate } = makeMockSupabase({
      profiles: [
        { id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' },
        { id: 'vp-2', user_id: 'user-A', created_at: '2026-02-01T00:00:00Z' },
      ],
      activeVendorProfileId: null,
    });
    const result = await getActiveVendorProfile(client, 'user-A');
    expect(result.profile?.id).toBe('vp-1');
    // Persistence: update was issued with the chosen id
    expect(lastUpdate.active_vendor_profile_id).toBe('vp-1');
  });

  it('ownership re-check: stale pointer to a profile not in user list → falls back to first owned profile', async () => {
    const { client } = makeMockSupabase({
      profiles: [{ id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' }],
      // Stale pointer to a profile the user no longer owns
      activeVendorProfileId: 'vp-99',
    });
    const result = await getActiveVendorProfile(client, 'user-A');
    expect(result.profile?.id).toBe('vp-1');
  });
});

describe('getActiveVendorProfileId', () => {
  it('returns the active id without fetching the full row separately', async () => {
    const { client } = makeMockSupabase({
      profiles: [{ id: 'vp-1', user_id: 'user-A', created_at: '2026-01-01T00:00:00Z' }],
      activeVendorProfileId: null,
    });
    const id = await getActiveVendorProfileId(client, 'user-A');
    expect(id).toBe('vp-1');
  });

  it('returns null when user has no vendor_profiles', async () => {
    const { client } = makeMockSupabase({ profiles: [], activeVendorProfileId: null });
    const id = await getActiveVendorProfileId(client, 'user-A');
    expect(id).toBeNull();
  });
});
