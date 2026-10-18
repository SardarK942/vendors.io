import { it, expect } from 'vitest';
import { getVendorEarningsSummary } from '@/services/earnings.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Row = { status: string; net_vendor_cents: number; transferred_at: string | null };

function makeDb(rows: Row[]) {
  return {
    from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }),
  } as unknown as SupabaseClient<Database>;
}

it('sums held and transferred rows, counts held, picks latest transfer', async () => {
  const db = makeDb([
    { status: 'held', net_vendor_cents: 1000, transferred_at: null },
    { status: 'held', net_vendor_cents: 250, transferred_at: null },
    { status: 'transferred', net_vendor_cents: 4000, transferred_at: '2026-10-01T10:00:00Z' },
    { status: 'transferred', net_vendor_cents: 500, transferred_at: '2026-10-05T10:00:00Z' },
  ]);
  expect(await getVendorEarningsSummary(db, 'v1', true)).toEqual({
    heldCents: 1250,
    heldCount: 2,
    transferredCents: 4500,
    lastTransferredAt: '2026-10-05T10:00:00Z',
    payoutsEnabled: true,
  });
});

it('returns zeros for no rows', async () => {
  expect(await getVendorEarningsSummary(makeDb([]), 'v1', false)).toEqual({
    heldCents: 0,
    heldCount: 0,
    transferredCents: 0,
    lastTransferredAt: null,
    payoutsEnabled: false,
  });
});
