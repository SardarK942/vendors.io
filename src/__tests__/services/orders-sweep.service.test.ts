import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({ stripe: {} }));

import { sweepStaleCheckoutSnapshots } from '@/services/orders.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

function fakeClient(deleted: { id: string }[]) {
  const calls = { table: '', deleted: false, ltArgs: [] as unknown[] };
  const b = {
    delete: () => {
      calls.deleted = true;
      return b;
    },
    lt: (...a: unknown[]) => {
      calls.ltArgs = a;
      return b;
    },
    select: () => Promise.resolve({ data: deleted, error: null }),
  };
  const client = {
    from: (t: string) => {
      calls.table = t;
      return b;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe('sweepStaleCheckoutSnapshots', () => {
  it('deletes from checkout_snapshots with a ~26h cutoff and returns the count', async () => {
    const { client, calls } = fakeClient([{ id: 'a' }, { id: 'b' }]);
    const before = Date.now();
    const res = await sweepStaleCheckoutSnapshots(client);
    expect(calls.table).toBe('checkout_snapshots');
    expect(calls.deleted).toBe(true);
    expect(calls.ltArgs[0]).toBe('created_at');
    const age = before - new Date(calls.ltArgs[1] as string).getTime();
    const H = 60 * 60 * 1000;
    expect(age).toBeGreaterThanOrEqual(26 * H - 5000);
    expect(age).toBeLessThanOrEqual(26 * H + 5000);
    expect(res.data).toEqual({ swept: 2 });
  });
});
