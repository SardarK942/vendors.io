import type { NudgeUser } from '@/lib/onboarding/nudge-candidates';

const DAY_MS = 86_400_000;

export interface FunnelStage {
  key: 'signed_up' | 'confirmed' | 'started' | 'published';
  label: string;
  count: number;
  /** Percentage of the signed-up total, 0–100. */
  pct: number;
}

/**
 * The vendor onboarding funnel, narrowing signed-up → email-confirmed →
 * started a profile → published (went live). Counts and percentages are derived
 * from plain sets so this stays pure and unit-testable; the page fetches the
 * rows (users + auth.listUsers for confirmed, vendor_profiles for started/live).
 */
export function computeOnboardingFunnel(
  vendors: { id: string; confirmed: boolean }[],
  startedUserIds: Set<string>,
  liveUserIds: Set<string>
): FunnelStage[] {
  const signedUp = vendors.length;
  const confirmed = vendors.filter((v) => v.confirmed).length;
  const started = vendors.filter((v) => startedUserIds.has(v.id)).length;
  const published = vendors.filter((v) => liveUserIds.has(v.id)).length;

  const pct = (n: number) => (signedUp ? Math.round((n / signedUp) * 100) : 0);

  return [
    { key: 'signed_up', label: 'Signed up', count: signedUp, pct: pct(signedUp) },
    { key: 'confirmed', label: 'Confirmed email', count: confirmed, pct: pct(confirmed) },
    { key: 'started', label: 'Started profile', count: started, pct: pct(started) },
    { key: 'published', label: 'Published', count: published, pct: pct(published) },
  ];
}

/** Whole days since an ISO timestamp. */
export function accountAgeDays(createdAt: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(createdAt)) / DAY_MS);
}

/**
 * All vendors who haven't confirmed their email — the full follow-up list, NOT
 * the cron's "due for a nudge" subset (which also filters out already-nudged).
 * The confirm-nudge-sent date is surfaced as a column, not a filter.
 */
export function unconfirmedVendors(users: NudgeUser[]): NudgeUser[] {
  return users.filter((u) => u.role === 'vendor' && !u.confirmed);
}

/**
 * Confirmed vendors who never published a profile (abandoned onboarding). Again
 * the full list for follow-up, with nudge-sent dates shown as columns.
 */
export function abandonedVendors(users: NudgeUser[], live: Set<string>): NudgeUser[] {
  return users.filter((u) => u.role === 'vendor' && u.confirmed && !live.has(u.id));
}
