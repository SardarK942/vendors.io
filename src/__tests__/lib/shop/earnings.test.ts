import { describe, it, expect } from 'vitest';
import { deriveEarningsState } from '@/lib/shop/earnings';

const base = {
  heldCents: 0,
  heldCount: 0,
  transferredCents: 0,
  lastTransferredAt: null,
  payoutsEnabled: false,
};

describe('deriveEarningsState', () => {
  it('held + not payouts-enabled → held_not_ready', () => {
    expect(deriveEarningsState({ ...base, heldCents: 124000, heldCount: 3 })).toBe(
      'held_not_ready'
    );
  });
  it('held + payouts-enabled → in_flight', () => {
    expect(
      deriveEarningsState({ ...base, heldCents: 124000, heldCount: 3, payoutsEnabled: true })
    ).toBe('in_flight');
  });
  it('nothing held but transfers exist → paid_out', () => {
    expect(
      deriveEarningsState({
        ...base,
        transferredCents: 124000,
        payoutsEnabled: true,
        lastTransferredAt: '2026-03-14T00:00:00Z',
      })
    ).toBe('paid_out');
  });
  it('no sales at all → none', () => {
    expect(deriveEarningsState(base)).toBe('none');
  });
});
