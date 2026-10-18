export interface EarningsSummary {
  heldCents: number;
  heldCount: number;
  transferredCents: number;
  lastTransferredAt: string | null;
  payoutsEnabled: boolean;
}

export type EarningsCardState = 'held_not_ready' | 'in_flight' | 'paid_out' | 'none';

export function deriveEarningsState(s: EarningsSummary): EarningsCardState {
  if (s.heldCents > 0) return s.payoutsEnabled ? 'in_flight' : 'held_not_ready';
  if (s.transferredCents > 0) return 'paid_out';
  return 'none';
}
