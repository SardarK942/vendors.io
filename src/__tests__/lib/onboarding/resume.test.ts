import { describe, it, expect, vi } from 'vitest';
import { nextIncompleteStep, getOrCreateWizardProfile } from '@/lib/onboarding/resume';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const baseProfile = {
  business_name: 'X',
  category: 'mehndi',
  bio: 'a'.repeat(60),
  base_address_line_1: '1',
  base_city: 'C',
  base_state: 'IL',
  base_postal_code: '60601',
  base_google_place_id: 'P',
  base_address_public: false,
  base_address_skipped: false,
  instagram_handle: 'x',
  website_url: null,
  languages: ['english'],
  years_in_business: 3,
  response_sla_hours: 24,
  portfolio_images: ['x.jpg'],
};

describe('nextIncompleteStep', () => {
  it('returns basics when business_name missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, business_name: null })).toBe('basics');
  });
  it('returns basics when bio missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, bio: null })).toBe('basics');
  });
  it('returns location when address line_1 missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, base_address_line_1: null })).toBe('location');
  });
  it('returns location when city missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, base_city: null })).toBe('location');
  });
  it('returns online when instagram_handle missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, instagram_handle: null })).toBe('online');
  });
  it('returns details when languages missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, languages: [] })).toBe('details');
  });
  it('returns details when years_in_business missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, years_in_business: null })).toBe('details');
  });
  it('returns details when response_sla_hours missing', () => {
    expect(nextIncompleteStep({ ...baseProfile, response_sla_hours: null })).toBe('details');
  });
  it('returns portfolio when no images', () => {
    expect(nextIncompleteStep({ ...baseProfile, portfolio_images: [] })).toBe('portfolio');
  });
  it('returns review when everything filled', () => {
    expect(nextIncompleteStep(baseProfile)).toBe('review');
  });
  it('returns basics when profile is null', () => {
    expect(nextIncompleteStep(null)).toBe('basics');
  });

  // ─── Address-skip (Bucket A T8 follow-through) ────────────────────────────
  it('does NOT return location when address empty but base_address_skipped=true', () => {
    // Vendor checked "I don't have a fixed address" — all address fields null/empty.
    // Resume must NOT bounce them back to location. With instagram also missing
    // (to isolate just the address-skip check) it should land on 'online'.
    expect(
      nextIncompleteStep({
        ...baseProfile,
        base_address_line_1: null,
        base_city: null,
        base_state: null,
        base_postal_code: null,
        base_google_place_id: null,
        base_address_skipped: true,
        instagram_handle: null, // not yet filled in — gives us a clear next step
      })
    ).toBe('online');
  });

  it('returns location when address empty and base_address_skipped=false', () => {
    // Vendor has NOT skipped and has NOT filled in address — must route to location.
    expect(
      nextIncompleteStep({
        ...baseProfile,
        base_address_line_1: null,
        base_city: null,
        base_state: null,
        base_postal_code: null,
        base_google_place_id: null,
        base_address_skipped: false,
      })
    ).toBe('location');
  });

  it('returns online when address empty and base_address_skipped is undefined (legacy row)', () => {
    // Pre-migration rows lack the column (undefined). Treat same as false → route to location.
    // (This intentionally keeps existing behaviour so legacy partial profiles still get fixed.)
    expect(
      nextIncompleteStep({
        ...baseProfile,
        base_address_line_1: null,
        base_city: null,
        base_state: null,
        base_postal_code: null,
        base_google_place_id: null,
        base_address_skipped: undefined,
      })
    ).toBe('location');
  });

  it('returns review regardless of skip flag when address fields are filled and all other steps complete', () => {
    // When address is present (filled), skip flag is irrelevant — no location bounce either way.
    expect(nextIncompleteStep({ ...baseProfile, base_address_skipped: true })).toBe('review');
    expect(nextIncompleteStep({ ...baseProfile, base_address_skipped: false })).toBe('review');
  });
});

// ─── getOrCreateWizardProfile (Sub-project I §6) ──────────────────────────────

interface WizardMockState {
  /** Profiles owned by the user, in creation order. */
  profiles: Array<{ id: string; onboarding_complete: boolean }>;
  /** Id returned by the next .insert(). */
  newId: string;
}

function makeWizardMockSupabase(state: WizardMockState) {
  const captured = { inserted: false };

  // Each .select() call returns a chain that tracks how many .eq() calls were
  // made before .order() is awaited. If 1 eq → "all profiles for user" (first
  // mode). If 2 eqs → "partials" filter (next mode). The head:true count
  // variant is handled separately.
  function makeSelectChain(opts?: { count?: string; head?: boolean }) {
    let eqCount = 0;
    const chain = {
      eq: vi.fn(() => {
        eqCount++;
        return chain;
      }),
      order: vi.fn(() => {
        if (eqCount === 1) {
          // First-mode lookup: all profiles for the user (any state).
          return Promise.resolve({
            data: state.profiles.map((p) => ({
              id: p.id,
              created_at: '2026-01-01T00:00:00Z',
            })),
            error: null,
          });
        }
        // Two eqs → partials filter (user_id + onboarding_complete=false).
        return Promise.resolve({
          data: state.profiles
            .filter((p) => !p.onboarding_complete)
            .map((p) => ({ id: p.id, created_at: '2026-01-01T00:00:00Z' })),
          error: null,
        });
      }),
    };

    // Count-style chain: select('id', { count: 'exact', head: true }).eq().eq()
    // resolves to { count } awaited promise.
    if (opts?.count === 'exact' && opts?.head === true) {
      const countChain = {
        eq: vi.fn(() => {
          eqCount++;
          if (eqCount === 2) {
            return Promise.resolve({
              data: null,
              count: state.profiles.filter((p) => p.onboarding_complete).length,
              error: null,
            });
          }
          return countChain;
        }),
      };
      return countChain;
    }

    return chain;
  }

  const mockClient = {
    from: vi.fn((_table: string) => {
      return {
        select: vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) =>
          makeSelectChain(opts)
        ),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => {
              captured.inserted = true;
              return Promise.resolve({ data: { id: state.newId }, error: null });
            }),
          })),
        })),
      };
    }),
  } as unknown as SupabaseClient<Database>;

  return { client: mockClient, captured };
}

describe('getOrCreateWizardProfile', () => {
  it('first mode: finds existing profile when user has one', async () => {
    const { client, captured } = makeWizardMockSupabase({
      profiles: [{ id: 'vp-1', onboarding_complete: true }],
      newId: 'should-not-be-used',
    });
    const result = await getOrCreateWizardProfile(client, 'user-A', 'first');
    expect(result.profileId).toBe('vp-1');
    expect(result.isNew).toBe(false);
    expect(captured.inserted).toBe(false);
  });

  it('first mode: creates new profile when user has none', async () => {
    const { client, captured } = makeWizardMockSupabase({
      profiles: [],
      newId: 'vp-fresh',
    });
    const result = await getOrCreateWizardProfile(client, 'user-A', 'first');
    expect(result.profileId).toBe('vp-fresh');
    expect(result.isNew).toBe(true);
    expect(captured.inserted).toBe(true);
  });

  it('next mode: creates new when user has only a complete profile (no partial)', async () => {
    const { client, captured } = makeWizardMockSupabase({
      profiles: [{ id: 'vp-1', onboarding_complete: true }],
      newId: 'vp-2',
    });
    const result = await getOrCreateWizardProfile(client, 'user-A', 'next');
    expect(result.profileId).toBe('vp-2');
    expect(result.isNew).toBe(true);
    expect(captured.inserted).toBe(true);
  });

  it('next mode: resumes the partial second-business attempt', async () => {
    const { client, captured } = makeWizardMockSupabase({
      profiles: [
        { id: 'vp-1', onboarding_complete: true },
        { id: 'vp-2-partial', onboarding_complete: false },
      ],
      newId: 'should-not-be-used',
    });
    const result = await getOrCreateWizardProfile(client, 'user-A', 'next');
    expect(result.profileId).toBe('vp-2-partial');
    expect(result.isNew).toBe(false);
    expect(captured.inserted).toBe(false);
  });

  it('next mode: creates new when user has no complete profile yet (edge case)', async () => {
    // Edge case: user has a single in-progress profile but no completed one.
    // The 'resume partial' branch only fires when at least one complete profile
    // exists (otherwise we don't know if that partial is a first-business attempt).
    const { client, captured } = makeWizardMockSupabase({
      profiles: [{ id: 'vp-1', onboarding_complete: false }],
      newId: 'vp-new',
    });
    const result = await getOrCreateWizardProfile(client, 'user-A', 'next');
    expect(result.profileId).toBe('vp-new');
    expect(result.isNew).toBe(true);
    expect(captured.inserted).toBe(true);
  });
});
