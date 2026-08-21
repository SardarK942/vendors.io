import { describe, it, expect } from 'vitest';
import {
  liveUserIds,
  selectUnconfirmedVendorNudge,
  selectOnboardingNudge24h,
  selectOnboardingNudge7d,
  type NudgeUser,
  type NudgeProfileRef,
} from '@/lib/onboarding/nudge-candidates';

// Fixed "now" for deterministic age math.
const NOW = Date.parse('2026-08-21T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString();

function user(overrides: Partial<NudgeUser> = {}): NudgeUser {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    email: 'v@example.com',
    full_name: 'Vendor',
    role: 'vendor',
    created_at: daysAgo(10),
    confirmed: true,
    confirm_nudge_sent_at: null,
    onboarding_nudge_24h_sent_at: null,
    onboarding_nudge_7d_sent_at: null,
    ...overrides,
  };
}

describe('liveUserIds', () => {
  it('marks a user live if ANY of their profiles is complete', () => {
    const profiles: NudgeProfileRef[] = [
      { user_id: 'u1', onboarding_complete: false },
      { user_id: 'u1', onboarding_complete: true },
      { user_id: 'u2', onboarding_complete: false },
    ];
    const live = liveUserIds(profiles);
    expect(live.has('u1')).toBe(true);
    expect(live.has('u2')).toBe(false);
  });
});

describe('selectUnconfirmedVendorNudge (Segment A)', () => {
  it('includes an unconfirmed vendor ≥24h old with no marker', () => {
    const u = user({ id: 'a1', confirmed: false, created_at: hoursAgo(30) });
    expect(selectUnconfirmedVendorNudge([u], NOW).map((x) => x.id)).toEqual(['a1']);
  });
  it('excludes a confirmed vendor', () => {
    const u = user({ confirmed: true, created_at: hoursAgo(30) });
    expect(selectUnconfirmedVendorNudge([u], NOW)).toHaveLength(0);
  });
  it('excludes a vendor younger than 24h', () => {
    const u = user({ confirmed: false, created_at: hoursAgo(10) });
    expect(selectUnconfirmedVendorNudge([u], NOW)).toHaveLength(0);
  });
  it('excludes one already nudged', () => {
    const u = user({
      confirmed: false,
      created_at: hoursAgo(30),
      confirm_nudge_sent_at: daysAgo(1),
    });
    expect(selectUnconfirmedVendorNudge([u], NOW)).toHaveLength(0);
  });
  it('excludes a non-vendor (couple)', () => {
    const u = user({ role: 'couple', confirmed: false, created_at: hoursAgo(30) });
    expect(selectUnconfirmedVendorNudge([u], NOW)).toHaveLength(0);
  });
  it('caps the batch and preserves order', () => {
    const users = Array.from({ length: 5 }, (_, i) =>
      user({ id: `a${i}`, confirmed: false, created_at: hoursAgo(30 + i) })
    );
    expect(selectUnconfirmedVendorNudge(users, NOW, 3).map((x) => x.id)).toEqual([
      'a0',
      'a1',
      'a2',
    ]);
  });
});

describe('selectOnboardingNudge24h (Segment B, step 1)', () => {
  const live = new Set<string>();
  it('includes a confirmed vendor with NO profile (never started), ≥24h old', () => {
    const u = user({ id: 'b1', created_at: hoursAgo(30) });
    expect(selectOnboardingNudge24h([u], live, NOW).map((x) => x.id)).toEqual(['b1']);
  });
  it('includes a confirmed vendor with an incomplete profile (not in live set)', () => {
    const u = user({ id: 'b2', created_at: hoursAgo(30) });
    expect(selectOnboardingNudge24h([u], new Set(), NOW).map((x) => x.id)).toEqual(['b2']);
  });
  it('excludes a live vendor (has a completed profile)', () => {
    const u = user({ id: 'b3', created_at: hoursAgo(30) });
    expect(selectOnboardingNudge24h([u], new Set(['b3']), NOW)).toHaveLength(0);
  });
  it('excludes an unconfirmed vendor (belongs to Segment A)', () => {
    const u = user({ confirmed: false, created_at: hoursAgo(30) });
    expect(selectOnboardingNudge24h([u], live, NOW)).toHaveLength(0);
  });
  it('excludes a vendor younger than 24h', () => {
    const u = user({ created_at: hoursAgo(10) });
    expect(selectOnboardingNudge24h([u], live, NOW)).toHaveLength(0);
  });
  it('excludes one already stamped 24h', () => {
    const u = user({ created_at: hoursAgo(30), onboarding_nudge_24h_sent_at: daysAgo(1) });
    expect(selectOnboardingNudge24h([u], live, NOW)).toHaveLength(0);
  });
});

describe('selectOnboardingNudge7d (Segment B, step 2)', () => {
  const live = new Set<string>();
  it('includes a vendor whose step-1 was sent ≥6 days ago, still not live', () => {
    const u = user({ id: 'c1', onboarding_nudge_24h_sent_at: daysAgo(6) });
    expect(selectOnboardingNudge7d([u], live, NOW).map((x) => x.id)).toEqual(['c1']);
  });
  it('excludes one whose step-1 was <6 days ago', () => {
    const u = user({ onboarding_nudge_24h_sent_at: daysAgo(3) });
    expect(selectOnboardingNudge7d([u], live, NOW)).toHaveLength(0);
  });
  it('excludes one whose step-1 was never sent', () => {
    const u = user({ onboarding_nudge_24h_sent_at: null });
    expect(selectOnboardingNudge7d([u], live, NOW)).toHaveLength(0);
  });
  it('excludes one already stamped 7d', () => {
    const u = user({
      onboarding_nudge_24h_sent_at: daysAgo(6),
      onboarding_nudge_7d_sent_at: daysAgo(1),
    });
    expect(selectOnboardingNudge7d([u], live, NOW)).toHaveLength(0);
  });
  it('excludes one now live', () => {
    const u = user({ id: 'c5', onboarding_nudge_24h_sent_at: daysAgo(6) });
    expect(selectOnboardingNudge7d([u], new Set(['c5']), NOW)).toHaveLength(0);
  });
  it('excludes an unconfirmed vendor', () => {
    const u = user({ confirmed: false, onboarding_nudge_24h_sent_at: daysAgo(6) });
    expect(selectOnboardingNudge7d([u], live, NOW)).toHaveLength(0);
  });
});
