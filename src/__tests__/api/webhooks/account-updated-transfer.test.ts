import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const refreshAccountStatus = vi.fn();
const transferHeldEarnings = vi.fn();
vi.mock('@/services/connect.service', () => ({
  refreshAccountStatus: (...a: unknown[]) => refreshAccountStatus(...a),
}));
vi.mock('@/services/escrow-transfer.service', () => ({
  transferHeldEarnings: (...a: unknown[]) => transferHeldEarnings(...a),
}));

import { handleAccountUpdated } from '@/services/account-updated.service';

function makeDb(row: Record<string, unknown> | null): SupabaseClient<Database> {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
    }),
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  refreshAccountStatus.mockReset();
  transferHeldEarnings.mockReset();
});

describe('handleAccountUpdated', () => {
  it('transfers held earnings for the mapped vendor when payouts_enabled', async () => {
    const db = makeDb({ vendor_profile_id: 'vp_1', payouts_enabled: true });
    await handleAccountUpdated(db, 'acct_1');
    expect(refreshAccountStatus).toHaveBeenCalledWith(db, 'acct_1');
    expect(transferHeldEarnings).toHaveBeenCalledWith(db, 'vp_1');
  });

  it('does not transfer when payouts are not enabled', async () => {
    await handleAccountUpdated(
      makeDb({ vendor_profile_id: 'vp_1', payouts_enabled: false }),
      'acct_1'
    );
    expect(refreshAccountStatus).toHaveBeenCalled();
    expect(transferHeldEarnings).not.toHaveBeenCalled();
  });

  it('does not transfer for an untracked account', async () => {
    await handleAccountUpdated(makeDb(null), 'acct_x');
    expect(transferHeldEarnings).not.toHaveBeenCalled();
  });
});
