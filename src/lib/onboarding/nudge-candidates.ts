/**
 * Pure candidate-selection logic for the vendor onboarding nudge cron.
 * See docs/superpowers/specs/2026-08-21-vendor-onboarding-nudge-design.md.
 *
 * These functions take plain in-memory arrays (fetched by the cron from Supabase
 * + admin.listUsers) and return who to nudge — no I/O, so they're trivially
 * unit-testable. The cron wires them to the DB and the email senders.
 */

export interface NudgeUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
  /** auth.users.email_confirmed_at IS NOT NULL */
  confirmed: boolean;
  confirm_nudge_sent_at: string | null;
  onboarding_nudge_24h_sent_at: string | null;
  onboarding_nudge_7d_sent_at: string | null;
}

export interface NudgeProfileRef {
  user_id: string;
  onboarding_complete: boolean;
}

const MS_24H = 24 * 3600_000;
const MS_6D = 6 * 86400_000;
export const DEFAULT_BATCH_CAP = 100;

/** A user is "live" if ANY of their vendor profiles is complete. */
export function liveUserIds(profiles: NudgeProfileRef[]): Set<string> {
  const live = new Set<string>();
  for (const p of profiles) {
    if (p.onboarding_complete) live.add(p.user_id);
  }
  return live;
}

const ageMs = (u: NudgeUser, nowMs: number) => nowMs - Date.parse(u.created_at);

/**
 * Segment A — unconfirmed vendors: re-send the confirmation email.
 * role=vendor, not confirmed, ≥24h old, not already re-nudged.
 */
export function selectUnconfirmedVendorNudge(
  users: NudgeUser[],
  nowMs: number,
  cap: number = DEFAULT_BATCH_CAP
): NudgeUser[] {
  return users
    .filter(
      (u) =>
        u.role === 'vendor' &&
        !u.confirmed &&
        u.confirm_nudge_sent_at === null &&
        ageMs(u, nowMs) >= MS_24H
    )
    .slice(0, cap);
}

/**
 * Segment B step 1 — confirmed vendors who never went live: first reminder.
 * role=vendor, confirmed, not live, ≥24h old, step-1 not sent.
 */
export function selectOnboardingNudge24h(
  users: NudgeUser[],
  live: Set<string>,
  nowMs: number,
  cap: number = DEFAULT_BATCH_CAP
): NudgeUser[] {
  return users
    .filter(
      (u) =>
        u.role === 'vendor' &&
        u.confirmed &&
        !live.has(u.id) &&
        u.onboarding_nudge_24h_sent_at === null &&
        ageMs(u, nowMs) >= MS_24H
    )
    .slice(0, cap);
}

/**
 * Segment B step 2 — still not live 6 days after step 1: last call.
 * role=vendor, confirmed, not live, step-1 sent ≥6d ago, step-2 not sent.
 */
export function selectOnboardingNudge7d(
  users: NudgeUser[],
  live: Set<string>,
  nowMs: number,
  cap: number = DEFAULT_BATCH_CAP
): NudgeUser[] {
  return users
    .filter((u) => {
      if (u.role !== 'vendor' || !u.confirmed || live.has(u.id)) return false;
      if (u.onboarding_nudge_7d_sent_at !== null) return false;
      if (u.onboarding_nudge_24h_sent_at === null) return false;
      return nowMs - Date.parse(u.onboarding_nudge_24h_sent_at) >= MS_6D;
    })
    .slice(0, cap);
}
