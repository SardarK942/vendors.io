import { describe, it, expect } from 'vitest';
import {
  computeOnboardingFunnel,
  accountAgeDays,
  unconfirmedVendors,
  abandonedVendors,
} from '@/lib/admin/onboarding-funnel';
import type { NudgeUser } from '@/lib/onboarding/nudge-candidates';

function vendor(overrides: Partial<NudgeUser> = {}): NudgeUser {
  return {
    id: 'u1',
    email: 'v@example.com',
    full_name: 'V',
    role: 'vendor',
    created_at: '2026-09-01T00:00:00.000Z',
    confirmed: true,
    confirm_nudge_sent_at: null,
    onboarding_nudge_24h_sent_at: null,
    onboarding_nudge_7d_sent_at: null,
    ...overrides,
  };
}

describe('computeOnboardingFunnel', () => {
  const vendors = [
    { id: 'v1', confirmed: true }, // confirmed, started, live
    { id: 'v2', confirmed: true }, // confirmed, started, not live
    { id: 'v3', confirmed: true }, // confirmed, not started
    { id: 'v4', confirmed: false }, // never confirmed
  ];
  const started = new Set(['v1', 'v2']);
  const live = new Set(['v1']);

  it('counts each stage narrowing from signups to published', () => {
    const stages = computeOnboardingFunnel(vendors, started, live);
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.count]));
    expect(byKey.signed_up).toBe(4);
    expect(byKey.confirmed).toBe(3);
    expect(byKey.started).toBe(2);
    expect(byKey.published).toBe(1);
  });

  it('expresses each stage as a percentage of signups', () => {
    const stages = computeOnboardingFunnel(vendors, started, live);
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.pct]));
    expect(byKey.signed_up).toBe(100);
    expect(byKey.confirmed).toBe(75);
    expect(byKey.started).toBe(50);
    expect(byKey.published).toBe(25);
  });

  it('returns zeroed stages (no divide-by-zero) when there are no vendors', () => {
    const stages = computeOnboardingFunnel([], new Set(), new Set());
    expect(stages.every((s) => s.count === 0 && s.pct === 0)).toBe(true);
  });
});

describe('accountAgeDays', () => {
  const NOW = Date.UTC(2026, 8, 13); // 2026-09-13

  it('returns whole days since the account was created', () => {
    expect(accountAgeDays('2026-09-03T00:00:00.000Z', NOW)).toBe(10);
  });
});

describe('unconfirmedVendors', () => {
  it('returns vendors who have not confirmed their email, regardless of nudge history', () => {
    const users = [
      vendor({ id: 'a', confirmed: false }),
      vendor({ id: 'b', confirmed: false, confirm_nudge_sent_at: '2026-09-05T00:00:00.000Z' }),
      vendor({ id: 'c', confirmed: true }),
    ];
    expect(unconfirmedVendors(users).map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('excludes non-vendor roles', () => {
    const users = [vendor({ id: 'a', confirmed: false, role: 'couple' })];
    expect(unconfirmedVendors(users)).toEqual([]);
  });
});

describe('abandonedVendors', () => {
  it('returns confirmed vendors with no published profile', () => {
    const users = [
      vendor({ id: 'live', confirmed: true }),
      vendor({ id: 'abandoned', confirmed: true }),
      vendor({ id: 'unconfirmed', confirmed: false }),
    ];
    const live = new Set(['live']);
    expect(abandonedVendors(users, live).map((u) => u.id)).toEqual(['abandoned']);
  });
});
