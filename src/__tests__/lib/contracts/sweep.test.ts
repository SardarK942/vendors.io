import { describe, it, expect } from 'vitest';
import { selectSweepActions, type ContractSweepRow } from '@/lib/contracts/sweep';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days: number): string => new Date(NOW.getTime() + days * DAY).toISOString();

function row(over: Partial<ContractSweepRow>): ContractSweepRow {
  return {
    id: 'c1',
    status: 'sent_vendor',
    created_at: ago(1),
    last_reminder_at: null,
    expires_at: null,
    error_permanent: false,
    attempt_count: 0,
    next_retry_at: null,
    ...over,
  };
}

describe('selectSweepActions', () => {
  it('selects a day-7 reminder once and not again after last_reminder_at set', () => {
    const first = selectSweepActions([row({ created_at: ago(7), expires_at: ahead(7) })], NOW);
    expect(first.reminders).toEqual([{ id: 'c1', party: 'vendor' }]);
    const again = selectSweepActions(
      [row({ created_at: ago(7), expires_at: ahead(7), last_reminder_at: ago(0) })],
      NOW
    );
    expect(again.reminders).toEqual([]);
  });

  it('does not remind before day 7 and maps party for sent_couple', () => {
    expect(selectSweepActions([row({ created_at: ago(6.9) })], NOW).reminders).toEqual([]);
    const r = selectSweepActions([row({ status: 'sent_couple', created_at: ago(8) })], NOW);
    expect(r.reminders).toEqual([{ id: 'c1', party: 'couple' }]);
  });

  it('selects expiry at/after expires_at', () => {
    expect(selectSweepActions([row({ expires_at: NOW.toISOString() })], NOW).expiries).toEqual([
      'c1',
    ]);
    expect(selectSweepActions([row({ expires_at: ago(1) })], NOW).expiries).toEqual(['c1']);
    expect(selectSweepActions([row({ expires_at: ahead(1) })], NOW).expiries).toEqual([]);
  });

  it('falls back to 14-day age when expires_at is null', () => {
    expect(selectSweepActions([row({ created_at: ago(14) })], NOW).expiries).toEqual(['c1']);
    expect(selectSweepActions([row({ created_at: ago(13) })], NOW).expiries).toEqual([]);
  });

  it('expiry wins over reminder when both qualify', () => {
    const out = selectSweepActions([row({ created_at: ago(15) })], NOW);
    expect(out.expiries).toEqual(['c1']);
    expect(out.reminders).toEqual([]);
  });

  it('selects retry for transient failed within cap, skips permanent, capped and not-yet-due', () => {
    const rows = [
      row({ id: 'ok', status: 'failed', attempt_count: 4, next_retry_at: ago(0.1) }),
      row({ id: 'perm', status: 'failed', error_permanent: true, next_retry_at: ago(1) }),
      row({ id: 'cap', status: 'failed', attempt_count: 5, next_retry_at: ago(1) }),
      row({ id: 'future', status: 'failed', next_retry_at: ahead(1) }),
      row({ id: 'null', status: 'failed', next_retry_at: null }),
    ];
    expect(selectSweepActions(rows, NOW).retries).toEqual(['ok']);
  });

  it('does not touch terminal/other rows', () => {
    const rows = ['completed', 'declined', 'expired', 'voided', 'pending'].map((status) =>
      row({ id: status, status, created_at: ago(30), expires_at: ago(5), next_retry_at: ago(1) })
    );
    expect(selectSweepActions(rows, NOW)).toEqual({ reminders: [], expiries: [], retries: [] });
  });
});
