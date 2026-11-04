export type ContractSweepRow = {
  id: string;
  status: string;
  created_at: string;
  last_reminder_at: string | null;
  expires_at: string | null;
  error_permanent: boolean;
  attempt_count: number;
  next_retry_at: string | null;
};

export type SweepActions = {
  reminders: Array<{ id: string; party: 'vendor' | 'couple' }>;
  expiries: string[];
  retries: string[];
};

const DAY_MS = 86_400_000;
export const REMINDER_AGE_DAYS = 7;
export const FALLBACK_EXPIRY_AGE_DAYS = 14;
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Pure selector: decides reminders, expiries and retries for a sweep run.
 * Boundaries are inclusive (age >= 7d, age >= 14d, now >= expires_at /
 * next_retry_at); retries need attempt_count < 5. Permanent failures are
 * never retried. Expiry wins over reminder: a row that qualifies for both
 * is only expired, never reminded.
 */
export function selectSweepActions(rows: ContractSweepRow[], now: Date): SweepActions {
  const nowMs = now.getTime();
  const out: SweepActions = { reminders: [], expiries: [], retries: [] };

  for (const r of rows) {
    if (r.status === 'sent_vendor' || r.status === 'sent_couple') {
      const ageMs = nowMs - Date.parse(r.created_at);
      const expired =
        r.expires_at !== null
          ? nowMs >= Date.parse(r.expires_at)
          : ageMs >= FALLBACK_EXPIRY_AGE_DAYS * DAY_MS;
      if (expired) {
        out.expiries.push(r.id);
      } else if (ageMs >= REMINDER_AGE_DAYS * DAY_MS && r.last_reminder_at === null) {
        out.reminders.push({ id: r.id, party: r.status === 'sent_vendor' ? 'vendor' : 'couple' });
      }
    } else if (
      r.status === 'failed' &&
      r.error_permanent === false &&
      r.attempt_count < MAX_RETRY_ATTEMPTS &&
      r.next_retry_at !== null &&
      nowMs >= Date.parse(r.next_retry_at)
    ) {
      out.retries.push(r.id);
    }
  }
  return out;
}
